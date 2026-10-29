import { boundsOf, FOLDED, foldedHost, hostOf } from "./attached_notes.js"
import { fly } from "./flight.js"
import { titleOf } from "./graph_walk.js"
import { workflowNotes } from "./workflow_notes.js"
import { nodeSelector, styleSheet, vueNodes } from "./vue_nodes.js"
import { english } from "./words.js"

export function foldedGroups(graph) {
  const groups = new Map()
  for (const note of graph?._nodes ?? []) {
    const host = foldedHost(note)
    if (!host) continue
    if (!groups.has(host)) groups.set(host, [])
    groups.get(host).push(note)
  }
  return groups
}

export function installFoldedNotes(app, { enabled, say = english, changed = () => {} }) {
  const canvas = app.canvas
  const proto = Object.getPrototypeOf(canvas)
  const sheet = styleSheet()
  const buttons = new Map()
  let dialog = null
  let dialogGraph = null
  let dialogNotes = []
  let cancelFlight = null
  let lastGraph = null
  let lastWorkflow = null
  const hidden = (node) => enabled() && Boolean(foldedHost(node))
  const tracker = () => app.extensionManager.workflow?.activeWorkflow?.changeTracker

  const setFolded = (note, value) => {
    if (!note?.graph || note.graph.getNodeById(note.id) !== note || (value && !hostOf(note))) return
    tracker()?.captureCanvasState?.()
    note.graph.beforeChange?.()
    try {
      note.properties ??= {}
      if (value) note.properties[FOLDED] = true
      else delete note.properties[FOLDED]
      if (value) canvas.deselectNode?.(note)
    } finally {
      note.graph.afterChange?.()
      changed()
      sync()
    }
  }

  const close = () => {
    dialog?.close()
    dialog?.remove()
    dialog = null
    dialogNotes = []
  }

  const reveal = (note) => {
    if (note?.properties?.[FOLDED]) setFolded(note, false)
  }

  const open = (host, notes) => {
    close()
    dialogGraph = canvas.graph
    dialogNotes = notes
    dialog = document.createElement("dialog")
    dialog.className = "breeze-folded-dialog"
    const heading = document.createElement("h2")
    heading.textContent = say("foldedNotesTitle", { node: titleOf(host) })
    dialog.setAttribute("aria-label", heading.textContent)
    dialog.append(heading, button(say("connectClose"), close))
    const entries = workflowNotes(canvas.graph).filter((entry) => notes.includes(entry.node))
    for (const entry of entries) {
      const article = document.createElement("article")
      article.className = "breeze-note-article"
      const title = document.createElement("h3")
      title.textContent = entry.title
      const body = document.createElement("div")
      body.className = "breeze-note-body"
      const render = app.extensionManager.renderMarkdownToHtml
      if (entry.markdown && typeof render === "function") {
        body.innerHTML = render(entry.text)
        for (const link of body.querySelectorAll("a")) {
          link.target = "_blank"
          link.rel = "noopener noreferrer"
        }
      } else {
        body.classList.add("breeze-note-plain")
        body.textContent = entry.text
      }
      article.append(title, body, button(say("noteUnfold"), () => {
        close()
        reveal(entry.node)
        canvas.selectNodes?.([entry.node])
        cancelFlight?.()
        cancelFlight = fly(canvas, [boundsOf(entry.node)])
      }))
      dialog.append(article)
    }
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close() })
    dialog.addEventListener("keydown", (event) => event.stopPropagation())
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return
      const rect = dialog.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
    })
    document.body.append(dialog)
    dialog.showModal()
  }

  function sync() {
    const workflow = app.extensionManager.workflow?.activeWorkflow
    if (lastGraph !== canvas.graph || lastWorkflow !== workflow) {
      close()
      cancelFlight?.()
      cancelFlight = null
      lastGraph = canvas.graph
      lastWorkflow = workflow
    }
    const groups = enabled() ? foldedGroups(canvas.graph) : new Map()
    const selectors = [...groups.values()].flat().map((note) => nodeSelector(note.id))
    sheet(selectors.length ? selectors.join(",") + " { display: none !important; pointer-events: none !important; }" : "")
    if (dialog && (canvas.graph !== dialogGraph || !enabled() || dialogNotes.some((note) => !hidden(note) || note.graph?.getNodeById(note.id) !== note))) close()
    for (const [host, control] of buttons) {
      if (groups.has(host)) continue
      control.remove()
      buttons.delete(host)
    }
    const viewport = canvas.canvas.getBoundingClientRect()
    for (const [host, notes] of groups) {
      let control = buttons.get(host)
      if (!control) {
        control = button("", () => open(host, foldedGroups(canvas.graph).get(host) ?? []))
        control.className = "breeze-note-badge"
        control.dataset.nodeId = host.id
        control.addEventListener("pointerdown", (event) => event.stopPropagation())
        document.body.append(control)
        buttons.set(host, control)
      }
      const label = say("foldedNotesCount", { n: notes.length })
      const text = String.fromCharCode(0x24d8) + (notes.length > 1 ? " " + notes.length : "")
      if (control.textContent !== text) control.textContent = text
      control.title = label
      control.setAttribute("aria-label", label)
      const rect = vueNodes() ? document.querySelector(nodeSelector(host.id))?.getBoundingClientRect() : null
      const [x, y, width] = boundsOf(host)
      const scale = canvas.ds.scale
      const right = rect ? rect.right : viewport.left + (x + width + canvas.ds.offset[0]) * scale
      const top = (rect ? rect.top : viewport.top + (y + canvas.ds.offset[1]) * scale) - 24 * scale
      control.style.left = right - 2 * scale + "px"
      control.style.top = top + "px"
      control.style.transform = "translateX(-100%) scale(" + scale + ")"
      control.hidden = false
      const box = control.getBoundingClientRect()
      control.hidden = box.left < viewport.left || box.top < viewport.top || box.right > viewport.right || box.bottom > viewport.bottom
      if (!control.hidden) {
        const hit = document.elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2).find((element) => element !== control)
        control.hidden = hit !== canvas.canvas && !hit?.closest?.(nodeSelector(host.id))
      }
    }
  }

  const draw = proto.draw
  proto.draw = function (...args) {
    const result = draw.apply(this, args)
    if (this === canvas) sync()
    return result
  }
  const visible = proto.computeVisibleNodes
  proto.computeVisibleNodes = function (...args) {
    const nodes = visible.apply(this, args)
    if (this === canvas) {
      for (let i = nodes.length - 1; i >= 0; i--) if (hidden(nodes[i])) nodes.splice(i, 1)
    }
    return nodes
  }
  const isVisible = proto.isNodeVisible
  if (isVisible) proto.isNodeVisible = function (node, ...args) {
    return this === canvas && hidden(node) ? false : isVisible.call(this, node, ...args)
  }
  const inRect = proto._getItemsInRect
  if (inRect) proto._getItemsInRect = function (...args) {
    const items = inRect.apply(this, args)
    if (this === canvas) for (const item of items) if (hidden(item)) items.delete(item)
    return items
  }

  return {
    reveal,
    hidden,
    menu: (note) => enabled() && hostOf(note)
      ? [null, { content: say(hidden(note) ? "noteUnfold" : "noteFold"), callback: () => setFolded(note, !hidden(note)) }]
      : [],
  }
}

function button(text, action) {
  const control = document.createElement("button")
  control.type = "button"
  control.className = "breeze-panel-button"
  control.textContent = text
  control.addEventListener("click", (event) => { event.stopPropagation(); action() })
  return control
}

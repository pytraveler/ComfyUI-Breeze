import { boundsOf } from "./attached_notes.js"
import { fly } from "./flight.js"
import { titleOf } from "./graph_walk.js"
import { changesOf, referenceOf, rememberReference, restoreChange } from "./workflow_changes.js"
import { workflowNotes } from "./workflow_notes.js"
import { nodeSelector, styleSheet, vueNodes } from "./vue_nodes.js"
import { english } from "./words.js"

export function installWorkflowPanels(app, { say = english, changed = () => {}, revealNote = () => {} } = {}) {
  const manager = app.extensionManager
  if (!manager?.registerSidebarTab) return null
  let cancelFlight = null
  let highlighted = []
  let notesPanel = null
  let changesPanel = null
  let timer = null
  let baselineMode = "saved"
  let lastWorkflow = null
  const noteFolds = new WeakMap()
  const sheet = styleSheet()
  const tracker = () => manager.workflow?.activeWorkflow?.changeTracker

  const navigate = async (entry) => {
    const { node, path } = entry
    if (!node?.graph || node.graph.getNodeById(node.id) !== node) return
    cancelFlight?.()
    if (app.canvas.graph !== node.graph) {
      app.canvas.setGraph(app.rootGraph)
      for (const parent of path) app.canvas.openSubgraph(parent.subgraph, parent)
    }
    if (app.canvas.graph !== node.graph) return
    revealNote(node)
    app.canvas.selectNodes?.([node])
    cancelFlight = fly(app.canvas, [boundsOf(node)])
  }

  const mutate = (action) => {
    tracker()?.captureCanvasState?.()
    try {
      action()
    } finally {
      changed()
      if (changesPanel) changesPanel.signature = null
      refresh()
    }
  }

  const clearMarks = () => {
    for (const element of highlighted) element.classList.remove("breeze-changed-field")
    highlighted = []
    sheet("")
  }

  const markFields = (rows) => {
    clearMarks()
    const rules = []
    for (const row of rows) {
      if (row.kind !== "widget" || row.node.graph !== app.canvas.graph) continue
      const widget = row.node.widgets?.[row.index]
      if (vueNodes() && widget?.name) {
        rules.push(nodeSelector(row.node.id) + " [aria-label=" + JSON.stringify(widget.name) + "] { outline: 2px solid #e8ae46 !important; outline-offset: 1px; }")
      }
      const element = widget?.element ?? widget?.inputEl
      if (element?.classList) {
        element.classList.add("breeze-changed-field")
        highlighted.push(element)
      }
    }
    sheet(rules.join("\n"))
  }

  const start = () => {
    timer ??= setInterval(refresh, 700)
    refresh()
  }

  const stopIfClosed = () => {
    if (notesPanel || changesPanel) return
    clearInterval(timer)
    timer = null
    clearMarks()
  }

  const renderNotes = (container) => {
    changesPanel = null
    clearMarks()
    app.canvas.setDirty?.(true, false)
    const panel = makePanel(container, say("readmeTitle"))
    const search = element("input", "breeze-panel-search")
    search.type = "search"
    search.placeholder = say("notesSearch")
    search.setAttribute("aria-label", say("notesSearch"))
    panel.header.append(search)
    panel.search = search
    panel.searchFolds = new Map()
    search.addEventListener("input", () => { panel.searchFolds.clear(); panel.signature = null; refresh() })
    const actions = element("div", "breeze-note-actions")
    for (const [open, key] of [[false, "notesCollapseAll"], [true, "notesExpandAll"]]) {
      actions.append(button(say(key), () => {
        for (const entry of panel.entries ?? []) foldsOf(panel).set(noteKey(entry), !open)
        panel.signature = null
        refresh()
      }))
    }
    panel.header.append(actions)
    notesPanel = panel
    start()
  }

  const renderChanges = (container) => {
    notesPanel = null
    const panel = makePanel(container, say("changesTitle"))
    const mode = element("select", "breeze-panel-search")
    mode.setAttribute("aria-label", say("compareWith"))
    for (const [value, key] of [["saved", "compareSaved"], ["reference", "compareReference"]]) {
      const option = element("option", "", say(key))
      option.value = value
      mode.append(option)
    }
    mode.value = baselineMode
    mode.addEventListener("change", () => { baselineMode = mode.value; panel.signature = null; refresh() })
    panel.mode = mode
    const reference = element("div", "breeze-reference")
    const name = element("input", "breeze-panel-search")
    name.type = "text"
    name.value = referenceOf(app.rootGraph)?.name ?? ""
    name.placeholder = say("referenceName")
    name.setAttribute("aria-label", say("referenceName"))
    reference.append(name, button(say("rememberReference"), () => {
      if (!app.rootGraph || !name.value.trim()) { name.focus(); return }
      mutate(() => rememberReference(app.rootGraph, name.value))
      baselineMode = "reference"
      mode.value = baselineMode
      panel.signature = null
      refresh()
    }))
    panel.referenceName = name
    panel.header.append(mode, reference, element("p", "breeze-panel-hint", say("referenceHint")))
    changesPanel = panel
    start()
  }

  function refresh() {
    const workflow = manager.workflow?.activeWorkflow
    if (workflow !== lastWorkflow) {
      cancelFlight?.()
      cancelFlight = null
      lastWorkflow = workflow
      if (notesPanel) {
        notesPanel.signature = null
        notesPanel.searchFolds.clear()
      }
      if (!referenceOf(app.rootGraph)) baselineMode = "saved"
      if (changesPanel) {
        changesPanel.signature = null
        changesPanel.mode.value = baselineMode
        changesPanel.referenceName.value = referenceOf(app.rootGraph)?.name ?? ""
      }
      clearMarks()
    }
    if (notesPanel?.root.isConnected) updateNotes(notesPanel)
    if (changesPanel?.root.isConnected) updateChanges(changesPanel)
  }

  function updateNotes(panel) {
    const entries = workflowNotes(app.rootGraph, panel.search.value)
    if (entries.some((entry, index) => entry.node !== panel.entries?.[index]?.node)) panel.signature = null
    panel.entries = entries
    const signature = JSON.stringify([say("notesEmpty"), entries.map(({ node, title, text, location }) => [node.id, title, text, location])])
    if (signature === panel.signature) return
    panel.signature = signature
    const fragment = document.createDocumentFragment()
    const folds = foldsOf(panel)
    if (!entries.length) fragment.append(element("p", "breeze-panel-empty", say(panel.search.value ? "notesNoMatch" : "notesEmpty")))
    for (const entry of entries) {
      const article = element("details", "breeze-note-article")
      article.open = !folds.get(noteKey(entry))
      article.addEventListener("toggle", () => {
        if (article.isConnected) folds.set(noteKey(entry), !article.open)
      })
      const heading = element("summary", "breeze-note-heading", entry.title)
      article.append(heading)
      article.append(button(say("connectShow"), () => navigate(entry), "breeze-node-link breeze-note-locate"))
      if (entry.location) article.append(element("p", "breeze-panel-hint", entry.location))
      const body = element("div", "breeze-note-body")
      if (entry.markdown && typeof manager.renderMarkdownToHtml === "function") {
        body.innerHTML = manager.renderMarkdownToHtml(entry.text)
        for (const link of body.querySelectorAll("a")) {
          link.target = "_blank"
          link.rel = "noopener noreferrer"
        }
      } else {
        body.classList.add("breeze-note-plain")
        body.textContent = entry.text
      }
      article.append(body)
      fragment.append(article)
    }
    panel.body.replaceChildren(fragment)
  }

  function foldsOf(panel) {
    if (panel.search.value.trim()) return panel.searchFolds
    const owner = manager.workflow?.activeWorkflow ?? app.rootGraph
    if (!noteFolds.has(owner)) noteFolds.set(owner, new Map())
    return noteFolds.get(owner)
  }

  function updateChanges(panel) {
    const reference = referenceOf(app.rootGraph)
    const baseline = baselineMode === "reference" ? reference?.state : tracker()?.initialState
    const rows = changesOf(app.rootGraph, baseline)
    if (rows.some((row, index) => row.node !== panel.rows?.[index]?.node)) panel.signature = null
    panel.rows = rows
    markFields(rows)
    const signature = JSON.stringify([baselineMode, reference?.name, Boolean(baseline), say("changesEmpty"), rows.map(({ node, path, ...row }) => ({ ...row, graph: row.graph?.id, path: path.map((node) => node.id) }))])
    if (signature === panel.signature) return
    panel.signature = signature
    const fragment = document.createDocumentFragment()
    if (baselineMode === "reference" && reference) fragment.append(element("p", "breeze-panel-hint", say("referenceUsing", { name: reference.name })))
    if (!baseline) fragment.append(element("p", "breeze-panel-empty", say(baselineMode === "reference" ? "referenceMissing" : "savedMissing")))
    else if (!rows.length) fragment.append(element("p", "breeze-panel-empty", say("changesEmpty")))
    for (const row of rows) {
      const article = element("article", "breeze-change-article")
      const heading = element("h3")
      const title = row.title ? row.title + (row.id ? " #" + row.id : "") : say("changedLinks")
      heading.append(row.node ? button(title, () => navigate(row), "breeze-node-link") : element("span", "", title))
      article.append(heading)
      if (row.path.length) article.append(element("p", "breeze-panel-hint", row.path.map(titleOf).join(" / ")))
      if (["widget", "field", "property"].includes(row.kind)) {
        article.append(element("strong", "breeze-field-label", row.kind === "field" ? say("field_" + row.field) : row.label))
        const values = element("dl", "breeze-change-values")
        values.append(element("dt", "", say("before")), element("dd", "breeze-value-before", shown(row.before, say)))
        values.append(element("dt", "", say("after")), element("dd", "breeze-value-after", shown(row.after, say)))
        article.append(values)
        if (row.editable) article.append(button(say("restoreField"), () => mutate(() => restoreChange(row, app.canvas))))
      } else article.append(element("p", "breeze-panel-hint", say("change_" + row.kind)))
      fragment.append(article)
    }
    panel.body.replaceChildren(fragment)
    app.canvas.setDirty?.(true, false)
  }

  const proto = Object.getPrototypeOf(app.canvas)
  const drawNode = proto.drawNode
  proto.drawNode = function (node, ctx) {
    const result = drawNode.apply(this, arguments)
    if (this !== app.canvas || !changesPanel?.root.isConnected || this.low_quality || node.flags?.collapsed || vueNodes()) return result
    const rows = changesPanel.rows?.filter((row) => row.node === node && row.kind === "widget") ?? []
    if (!rows.length) return result
    ctx.save()
    ctx.fillStyle = "#e8ae46"
    for (const row of rows) {
      const widget = node.widgets?.[row.index]
      if (typeof widget?.y !== "number" || widget.hidden || (node.isWidgetRowVisible && !node.isWidgetRowVisible(widget))) continue
      ctx.fillRect(7, widget.y + 2, 3, Math.max(4, (widget.height ?? 20) - 4))
    }
    ctx.restore()
    return result
  }

  manager.registerSidebarTab({ id: "breeze-readme", title: say("readmeTitle"), tooltip: say("readmeTitle"), icon: "pi pi-book", type: "custom", render: renderNotes,
    destroy: () => { notesPanel = null; stopIfClosed() } })
  manager.registerSidebarTab({ id: "breeze-changes", title: say("changesTitle"), tooltip: say("changesTitle"), icon: "pi pi-history", type: "custom", render: renderChanges,
    destroy: () => { changesPanel = null; clearMarks(); app.canvas.setDirty?.(true, false); stopIfClosed() } })
  return { refresh }
}

function element(tag, className = "", text = null) {
  const item = document.createElement(tag)
  if (className) item.className = className
  if (text != null) item.textContent = text
  return item
}

function button(text, action, className = "breeze-panel-button") {
  const item = element("button", className, text)
  item.type = "button"
  item.addEventListener("click", action)
  return item
}

function makePanel(container, title) {
  container.classList.add("breeze-panel-container")
  const root = element("section", "breeze-workflow-panel")
  const header = element("header", "breeze-panel-header")
  header.append(element("h2", "", title))
  const body = element("div", "breeze-panel-body")
  root.append(header, body)
  container.replaceChildren(root)
  return { root, header, body, signature: null, rows: [] }
}

function shown(value, say) {
  if (value === undefined) return say("notSet")
  if (typeof value === "string") return value || say("emptyValue")
  return JSON.stringify(value)
}

function noteKey({ node, path }) {
  return JSON.stringify([...path.map((parent) => parent.id), node.id])
}

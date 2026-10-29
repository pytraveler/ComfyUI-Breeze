import { boundsOf } from "./attached_notes.js"
import { fly } from "./flight.js"
import { titleOf } from "./graph_walk.js"
import { connectCandidates, connectionCandidates, connectionSource, finishMovedConnection, slotTitle, sourceExists } from "./quick_connect.js"
import { english } from "./words.js"
import { colourOf } from "./wire_hover.js"

export function installQuickConnect(app, { enabled = () => true, say = english, flash = () => null } = {}) {
  const canvas = app.canvas
  const connector = canvas?.linkConnector
  if (!connector?.dropOnNothing || !connector.dragNewFromOutput || !connector.events?.dispatch) return null
  const original = connector.dropOnNothing
  let close = null

  connector.dropOnNothing = function(event) {
    if (!enabled() || canvas.read_only) return original.call(this, event)
    const source = connectionSource(canvas.graph, this.renderLinks)
    if (!source) return original.call(this, event)
    close?.()
    this.reset()
    canvas.setDirty(true, true)
    open(source, event)
  }

  function open(source, event) {
    const workflow = app.extensionManager.workflow?.activeWorkflow
    const previousFocus = document.activeElement
    const initialView = { offset: [...canvas.ds.offset], scale: canvas.ds.scale }
    const multiple = source.side === "outputs"
    let previewed = false
    let cancelFlight = null
    let cancelFlash = null
    let cleaned = false
    const dialog = element("dialog", "breeze-connect")
    dialog.setAttribute("aria-label", say("connectTitle"))
    const header = element("header", "breeze-connect-header")
    header.append(element("strong", "", say("connectTitle")))
    const add = button(say("connectAdd"), () => nativeSearch(source, event))
    add.classList.add("breeze-connect-add")
    const dismiss = button(say("connectClose"), () => dismissDialog())
    dismiss.classList.add("breeze-connect-close")
    header.append(add, dismiss)
    const typeName = (slot) => String(slot.type ?? "*").split(",").map((type) => type.trim() === "*" ? say("connectAny") : type.trim()).join(", ")
    const portName = (slot) => slotTitle(slot) === "*" ? say("connectAny") : slotTitle(slot)
    const endpoint = element("p", "breeze-connect-source", titleOf(source.node) + " #" + source.node.id + " / " + portName(source.slot) + " / " + typeName(source.slot))
    const search = element("input", "breeze-connect-search")
    search.type = "search"
    search.placeholder = say("connectSearch")
    search.setAttribute("aria-label", say("connectSearch"))
    const options = element("div", "breeze-connect-options")
    const occupied = checkbox(say("connectOccupied"))
    occupied.input.checked = source.side === "inputs" && source.inputLink != null
    options.append(occupied.label)
    const list = element("div", "breeze-connect-list")
    list.setAttribute("aria-label", say("connectTargets"))
    const status = element("p", "breeze-connect-status")
    status.setAttribute("role", "status")
    const footer = element("footer", "breeze-connect-footer")
    const apply = button("", () => commit([...selected.values()]))
    apply.classList.add("breeze-connect-apply")
    footer.append(apply)
    footer.hidden = !multiple
    dialog.append(header, endpoint, search, options, list, status, footer)
    const selected = new Map()
    let rows = []
    let pendingReplacement = null
    let cancelTimer = null

    const valid = () => source.graph === canvas.graph && sourceExists(source)
      && workflow === app.extensionManager.workflow?.activeWorkflow && enabled() && !canvas.read_only

    const updateApply = () => {
      const replaced = [...selected.values()].filter((row) => row.current).length
      apply.textContent = say(replaced ? "connectApplyReplace" : "connectApply", { n: selected.size, r: replaced })
      apply.disabled = !selected.size
    }

    const commit = (chosen) => {
      if (!valid()) { dismissDialog(); return }
      const tracker = workflow?.changeTracker
      tracker?.captureCanvasState?.()
      tracker?.beforeChange?.()
      let result
      try {
        result = connectCandidates(source, chosen)
      } finally {
        tracker?.afterChange?.()
        canvas.setDirty(true, true)
      }
      if (!result.failed) { dismissDialog(); return }
      selected.clear()
      render()
      status.textContent = say("connectFailed", { n: result.connected, f: result.failed })
    }

    const render = () => {
      rows = connectionCandidates(source, { query: search.value, occupied: occupied.input.checked })
      list.replaceChildren()
      pendingReplacement = null
      status.textContent = ""
      for (const row of rows) {
        const entry = element("div", "breeze-connect-row")
        entry.dataset.nodeId = String(row.node.id)
        entry.dataset.slot = row.slot.name
        const target = button("", () => {
          if (multiple) {
            if (selected.has(row.slot)) selected.delete(row.slot)
            else selected.set(row.slot, row)
            target.setAttribute("aria-pressed", String(selected.has(row.slot)))
            updateApply()
          } else if (row.current && pendingReplacement !== row) {
            pendingReplacement = row
            status.textContent = say("connectReplaceHint")
            target.focus()
            target.querySelector(".breeze-connect-state").textContent = say("connectReplace")
          } else commit([row])
        })
        target.classList.add("breeze-connect-target")
        target.disabled = row.connected
        if (multiple) target.setAttribute("aria-pressed", String(selected.has(row.slot)))
        target.append(element("span", "breeze-connect-node", row.title + " #" + row.node.id))
        target.append(element("span", "breeze-connect-port", portName(row.slot) + " / " + typeName(row.slot)))
        if (row.groups) target.append(element("span", "breeze-connect-group", row.groups))
        const state = row.connected ? say("connectAlready") : row.current
          ? say("connectUsed", { node: source.graph.getNodeById(row.current.origin_id)?.title ?? "#" + row.current.origin_id }) : say("connectFree")
        target.append(element("span", "breeze-connect-state", state))
        const locate = button(say("connectShow"), () => {
          if (!valid() || source.graph.getNodeById(row.node.id) !== row.node) { dismissDialog(); return }
          previewed = true
          cancelFlight?.()
          cancelFlash?.()
          dialog.style.left = "8px"
          const [x, y, width, height] = boundsOf(row.node)
          const room = (dialog.getBoundingClientRect().width + 24) / canvas.ds.scale
          cancelFlight = fly(canvas, [[x - room, y, width + room, height]], () => {
            if (!valid() || source.graph.getNodeById(row.node.id) !== row.node) return
            cancelFlash = flash([boundsOf(row.node)], colourOf(canvas, { type: row.output.type }), source.graph)
          })
        })
        locate.classList.add("breeze-connect-locate")
        entry.append(target, locate)
        list.append(entry)
      }
      if (!rows.length) list.append(element("p", "breeze-connect-empty", say("connectEmpty")))
      updateApply()
    }

    search.addEventListener("input", render)
    occupied.input.addEventListener("change", () => { selected.clear(); render() })
    dialog.addEventListener("keydown", (key) => {
      key.stopPropagation()
      if (key.key === "Escape") { key.preventDefault(); dismissDialog() }
      if (key.key === "ArrowDown" || key.key === "ArrowUp") {
        key.preventDefault()
        const buttons = [...list.querySelectorAll(".breeze-connect-target:not(:disabled)")]
        const index = buttons.indexOf(document.activeElement)
        const next = index < 0 ? (key.key === "ArrowDown" ? 0 : buttons.length - 1)
          : (index + (key.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length
        buttons[next]?.focus()
      }
      if (key.key === "Enter" && key.target === search) {
        key.preventDefault()
        list.querySelector(".breeze-connect-target:not(:disabled)")?.click()
      }
    })
    dialog.addEventListener("click", (click) => {
      if (click.target !== dialog) return
      const rect = dialog.getBoundingClientRect()
      if (click.clientX < rect.left || click.clientX > rect.right || click.clientY < rect.top || click.clientY > rect.bottom) dismissDialog()
    })
    function cleanup() {
      if (cleaned) return
      cleaned = true
      clearInterval(cancelTimer)
      cancelFlight?.()
      cancelFlight = null
      cancelFlash?.()
      cancelFlash = null
      if (previewed && source.graph === canvas.graph && workflow === app.extensionManager.workflow?.activeWorkflow) {
        canvas.ds.offset[0] = initialView.offset[0]
        canvas.ds.offset[1] = initialView.offset[1]
        canvas.ds.scale = initialView.scale
        canvas.setDirty(true, true)
      }
      dialog.remove()
      if (close === dismissDialog) close = null
      previousFocus?.focus?.({ preventScroll: true })
    }
    function dismissDialog() {
      dialog.close()
      cleanup()
    }
    dialog.addEventListener("cancel", (cancel) => { cancel.preventDefault(); dismissDialog() })
    dialog.addEventListener("close", cleanup, { once: true })
    close = dismissDialog
    document.body.append(dialog)
    render()
    dialog.showModal()
    const rect = dialog.getBoundingClientRect()
    dialog.style.left = Math.max(8, Math.min(event.clientX, innerWidth - rect.width - 8)) + "px"
    const top = Math.max(8, Math.min(event.clientY, innerHeight - rect.height - 8))
    dialog.style.top = top + "px"
    dialog.style.maxHeight = Math.max(120, innerHeight - top - 8) + "px"
    search.focus()
    cancelTimer = setInterval(() => { if (!valid()) dismissDialog() }, 250)
  }

  function nativeSearch(source, event) {
    if (!sourceExists(source) || source.graph !== canvas.graph) { close?.(); return }
    close?.()
    if (source.side === "outputs") connector.dragNewFromOutput(source.graph, source.node, source.slot, source.reroute)
    else connector.dragNewFromInput(source.graph, source.node, source.slot, source.reroute)
    if (source.moving && source.side === "outputs") {
      const moved = (created) => { if (created.detail) finishMovedConnection(source) }
      connector.events.addEventListener("link-created", moved, { once: true })
      connector.events.addEventListener("reset", () => connector.events.removeEventListener("link-created", moved), { once: true })
    }
    const action = app.extensionManager.setting?.get?.(event.shiftKey ? "Comfy.LinkRelease.ActionShift" : "Comfy.LinkRelease.Action")
    original.call(connector, event)
    if (action === "no action") canvas.emitEvent?.({ subType: "empty-double-click", originalEvent: event })
  }

  return { close: () => close?.() }
}

function element(tag, className = "", text = "") {
  const item = document.createElement(tag)
  item.className = className
  item.textContent = text
  return item
}

function button(text, action) {
  const item = element("button", "", text)
  item.type = "button"
  item.addEventListener("click", action)
  return item
}

function checkbox(text) {
  const label = element("label")
  const input = element("input")
  input.type = "checkbox"
  label.append(input, document.createTextNode(text))
  return { label, input }
}

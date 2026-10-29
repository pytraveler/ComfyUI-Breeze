import { isNote } from "./cards.js"
import { titleOf } from "./graph_walk.js"
import { nodeSelector, outlined, styleSheet, vueNodes } from "./vue_nodes.js"
import { english } from "./words.js"

export const PROPERTY = "breeze_note"
export const MARK = "breeze_paste"
export const FOLDED = "breeze_note_folded"

const PICKING = "breeze-picking"
const TIP = "breeze-wire-tip breeze-note-tip"
const TIP_OFFSET = 16
const TIP_MARGIN = 8

const VUE_NODE = ".lg-node[data-node-id]"
const TYPING = "input, textarea, select, [contenteditable]"

const HUSH_MS = 500

const LINE_PX = 1.5
const DASH_PX = 6
const GAP_PX = 4
const END_PX = 3
const FRAME_PX = 6
const LINE_ALPHA = 0.7

export function installAttachedNotes(canvas, { enabled, say = english, changed = () => {} }) {
  const proto = Object.getPrototypeOf(canvas)
  const { draw, drawFrontCanvas, _processDraggedItems: dropped, _deserializeItems: paste } = proto
  const sheet = styleSheet()
  let states = new WeakMap()
  let tracking = false
  let picking = null
  let drag = null
  let pending = null
  let preview = null
  let hushUntil = 0
  let pointer = null
  let tip = null

  const keep = () => {
    const on = enabled()
    if (on && !tracking) states = new WeakMap()
    tracking = on
    if (on) follow(canvas.graph, states)
    return on
  }

  const settle = () => {
    if (pending) {
      const { note, start } = pending
      pending = null
      if (note.pos[0] !== start[0] || note.pos[1] !== start[1]) note.pos = [start[0], start[1]]
      states.delete(note)
      keep()
      changed(note)
      return
    }
    keep()
  }

  proto.draw = function (...args) {
    if (this === canvas) keep()
    return draw.apply(this, args)
  }

  proto.drawFrontCanvas = function (...args) {
    const result = drawFrontCanvas.apply(this, args)
    if (this === canvas && enabled()) paint(this, preview)
    return result
  }

  if (typeof dropped === "function") {
    proto._processDraggedItems = function (...args) {
      const result = dropped.apply(this, args)
      if (this === canvas) settle()
      return result
    }
  }

  if (typeof paste === "function") {
    proto._deserializeItems = function (items, ...rest) {
      if (this !== canvas) return paste.call(this, items, ...rest)
      const marked = markPaste(items)
      if (marked === items) return paste.call(this, items, ...rest)
      const own = Object.hasOwn(this, "selectItems")
      const select = this.selectItems
      let done = false
      this.selectItems = function (chosen, ...more) {
        if (!done) {
          done = true
          relinkPasted(chosen)
        }
        return select.call(this, chosen, ...more)
      }
      let result
      try {
        result = paste.call(this, marked, ...rest)
      } finally {
        if (own) this.selectItems = select
        else delete this.selectItems
        if (!done) relinkPasted(result?.created)
      }
      return result
    }
  }

  const at = (event) => canvas.convertEventToCanvasOffset?.(event) ?? null

  const nodes = () => (canvas.visible_nodes?.length ? canvas.visible_nodes : canvas.graph?._nodes ?? [])

  const alive = (note) => Boolean(canvas.graph) && note.graph === canvas.graph && canvas.graph.getNodeById?.(note.id) === note

  const show = (next) => {
    const same = next?.note === preview?.note && next?.target === preview?.target
    preview = next?.target ? next : null
    if (same) return
    const colour = globalThis.LiteGraph?.NODE_SELECTED_TITLE_COLOR ?? "#fff"
    sheet(preview && vueNodes() ? outlined([nodeSelector(preview.target.id)], colour, { dashed: true }).join("\n") : "")
    canvas.setDirty?.(true, false)
  }

  const place = () => {
    if (!tip || tip.hidden || !pointer) return
    const width = tip.offsetWidth
    const height = tip.offsetHeight
    const left = Math.min(pointer[0] + TIP_OFFSET, innerWidth - width - TIP_MARGIN)
    const top = pointer[1] + TIP_OFFSET + height > innerHeight - TIP_MARGIN ? pointer[1] - TIP_OFFSET - height : pointer[1] + TIP_OFFSET
    tip.style.left = Math.max(TIP_MARGIN, left) + "px"
    tip.style.top = Math.max(TIP_MARGIN, top) + "px"
  }

  const stopPicking = () => {
    if (!picking) return
    picking = null
    document.body.classList.remove(PICKING)
    if (tip) tip.hidden = true
    show(null)
  }

  const pick = (note) => {
    stopPicking()
    drag = null
    picking = { note }
    document.body.classList.add(PICKING)
    tip ??= document.body.appendChild(Object.assign(document.createElement("div"), { className: TIP }))
    tip.textContent = say("notePick")
    tip.hidden = false
    place()
  }

  const release = (note) => {
    detach(note)
    states.delete(note)
    changed(note)
  }

  const grabbed = (event) => {
    const graph = canvas.graph
    const target = event.target
    if (!graph || target?.closest?.(TYPING)) return null
    let node = null
    if (vueNodes()) {
      const element = target?.closest?.(VUE_NODE)
      node = element ? graph.getNodeById?.(element.dataset.nodeId) : null
    } else if (target === canvas.canvas) {
      const spot = at(event)
      node = spot ? topAt(nodes(), spot) : null
    }
    return node && isNote(node) && !foldedHost(node) ? node : null
  }

  const aimed = (note, event, titleOnly) => {
    const spot = at(event)
    return spot ? targetAt(nodes(), spot, note, titleOnly) : null
  }

  const down = (event) => {
    hushUntil = 0
    if (picking) {
      if (event.button === 1) return
      hush(event)
      hushUntil = performance.now() + HUSH_MS
      const { note } = picking
      const target = event.button === 0 && alive(note) ? aimed(note, event, false) : null
      stopPicking()
      if (!target) return
      attach(note, target)
      states.delete(note)
      changed(note)
      return
    }
    drag = null
    if (event.button !== 0 || !enabled()) return
    const note = grabbed(event)
    if (note) drag = { note, start: [note.pos[0], note.pos[1]] }
  }

  const move = (event) => {
    pointer = [event.clientX, event.clientY]
    if (picking) {
      if (!alive(picking.note)) return stopPicking()
      show({ note: picking.note, target: aimed(picking.note, event, false) })
      place()
      return
    }
    if (!drag) return
    if (!event.buttons) {
      drag = null
      show(null)
      return
    }
    show(event.shiftKey ? { note: drag.note, target: aimed(drag.note, event, true) } : null)
  }

  const up = (event) => {
    if (performance.now() < hushUntil) return hush(event)
    if (!drag) return
    const { note, start } = drag
    drag = null
    show(null)
    if (!event.shiftKey || !enabled() || !alive(note)) return
    if (note.pos[0] === start[0] && note.pos[1] === start[1]) return
    const selected = [...(canvas.selectedItems ?? [])]
    if (selected.some((item) => item !== note)) return
    const target = aimed(note, event, true)
    if (!target) return
    attach(note, target)
    pending = { note, start }
    setTimeout(settle, 0)
  }

  const quiet = (event) => {
    if (performance.now() < hushUntil) hush(event)
  }

  const key = (event) => {
    if (picking && event.type === "keydown" && event.key === "Escape") {
      hush(event)
      stopPicking()
      return
    }
    if (drag && event.key === "Shift" && pointer) {
      const spot = { clientX: pointer[0], clientY: pointer[1] }
      show(event.type === "keydown" ? { note: drag.note, target: aimed(drag.note, spot, true) } : null)
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("pointerdown", down, true)
    window.addEventListener("pointermove", move, true)
    window.addEventListener("pointerup", up, true)
    window.addEventListener("mouseup", settle, true)
    for (const type of ["click", "dblclick", "contextmenu"]) window.addEventListener(type, quiet, true)
    window.addEventListener("keydown", key, true)
    window.addEventListener("keyup", key, true)
  }

  return {
    menu: (node) => (enabled() ? noteMenu(node, { say, pick, detach: release }) : []),
    pick,
    picking: () => picking?.note ?? null,
  }
}

function hush(event) {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

export function hostOf(note) {
  const id = note?.properties?.[PROPERTY]?.node
  if (id == null || !isNote(note)) return null
  const host = note.graph?.getNodeById?.(id)
  return host && host !== note && !isNote(host) ? host : null
}

export function foldedHost(note) {
  return note?.properties?.[FOLDED] === true ? hostOf(note) : null
}

export function attach(note, host) {
  note.properties ??= {}
  note.properties[PROPERTY] = { node: host.id }
}

export function detach(note) {
  if (note?.properties) delete note.properties[PROPERTY]
}

export function follow(graph, states) {
  let moved = 0
  for (const note of graph?._nodes ?? []) {
    const host = hostOf(note)
    if (!host) continue
    const [nx, ny] = note.pos
    const [hx, hy] = host.pos
    const last = states.get(note)
    if (last?.host === host && last.nx === nx && last.ny === ny && (last.hx !== hx || last.hy !== hy)) {
      note.pos = [nx + hx - last.hx, ny + hy - last.hy]
      moved++
    }
    states.set(note, { host, hx, hy, nx: note.pos[0], ny: note.pos[1] })
  }
  return moved
}

export function markPaste(items) {
  const listed = items?.nodes
  if (!Array.isArray(listed) || !listed.some((node) => node?.properties?.[PROPERTY])) return items
  let copy
  try {
    copy = structuredClone(items)
  } catch {
    return items
  }
  const ids = new Set(copy.nodes.map((node) => String(node?.id)))
  const hosts = new Set()
  for (const node of copy.nodes) {
    const link = node?.properties?.[PROPERTY]
    if (!link) continue
    const host = String(link.node)
    if (ids.has(host) && host !== String(node.id)) hosts.add(host)
    else delete node.properties[PROPERTY]
  }
  for (const node of copy.nodes) {
    if (!node || typeof node !== "object") continue
    if (hosts.has(String(node.id)) || node.properties?.[PROPERTY]) node.properties = { ...node.properties, [MARK]: node.id }
  }
  return copy
}

export function relinkPasted(items) {
  const marked = (items ?? []).filter((item) => item?.properties && Object.hasOwn(item.properties, MARK))
  const byOld = new Map(marked.map((node) => [String(node.properties[MARK]), node]))
  for (const node of marked) delete node.properties[MARK]
  for (const node of marked) {
    const link = node.properties[PROPERTY]
    if (!link) continue
    const host = byOld.get(String(link.node))
    if (host && host !== node) node.properties[PROPERTY] = { node: host.id }
    else delete node.properties[PROPERTY]
  }
}

export function boundsOf(node) {
  const rect = node.boundingRect
  if (rect && rect[2] > 0) return [rect[0], rect[1], rect[2], rect[3]]
  const title = globalThis.LiteGraph?.NODE_TITLE_HEIGHT ?? 30
  return [node.pos[0], node.pos[1] - title, node.size[0], node.size[1] + title]
}

function inside([left, top, width, height], [x, y]) {
  return x >= left && x <= left + width && y >= top && y <= top + height
}

function topAt(nodes, spot) {
  for (let index = nodes.length - 1; index >= 0; index--) {
    if (nodes[index] && inside(boundsOf(nodes[index]), spot)) return nodes[index]
  }
  return null
}

export function targetAt(nodes, spot, note, titleOnly = false) {
  const title = globalThis.LiteGraph?.NODE_TITLE_HEIGHT ?? 30
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index]
    if (!node || node === note || isNote(node)) continue
    const [left, top, width, height] = boundsOf(node)
    if (inside([left, top, width, titleOnly ? Math.min(title, height) : height], spot)) return node
  }
  return null
}

export function joint(a, b) {
  if (a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]) return null
  const [ax, ay] = [a[0] + a[2] / 2, a[1] + a[3] / 2]
  const [bx, by] = [b[0] + b[2] / 2, b[1] + b[3] / 2]
  return [edge(a, bx - ax, by - ay), edge(b, ax - bx, ay - by)]
}

function edge([x, y, width, height], dx, dy) {
  const along = Math.min(dx ? width / 2 / Math.abs(dx) : Infinity, dy ? height / 2 / Math.abs(dy) : Infinity)
  return [x + width / 2 + dx * along, y + height / 2 + dy * along]
}

function paint(canvas, preview) {
  const { ctx, ds, graph } = canvas
  if (!ctx || !ds?.toCanvasContext || !graph) return
  const pairs = []
  for (const note of graph._nodes ?? []) {
    if (note === preview?.note) continue
    if (foldedHost(note)) continue
    const host = hostOf(note)
    if (host && (note.selected || host.selected)) pairs.push([note, host])
  }
  if (preview) pairs.push([preview.note, preview.target])
  if (!pairs.length) return
  const scale = ds.scale || 1
  const colour = globalThis.LiteGraph?.NODE_SELECTED_TITLE_COLOR ?? "#fff"
  ctx.save()
  ds.toCanvasContext(ctx)
  ctx.globalAlpha = LINE_ALPHA
  ctx.strokeStyle = colour
  ctx.fillStyle = colour
  ctx.lineWidth = LINE_PX / scale
  ctx.setLineDash([DASH_PX / scale, GAP_PX / scale])
  for (const [note, host] of pairs) {
    const ends = joint(boundsOf(note), boundsOf(host))
    if (!ends) continue
    ctx.beginPath()
    ctx.moveTo(...ends[0])
    ctx.lineTo(...ends[1])
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(...ends[1], END_PX / scale, 0, 2 * Math.PI)
    ctx.fill()
  }
  if (preview && !vueNodes()) {
    const [x, y, width, height] = boundsOf(preview.target)
    const gap = FRAME_PX / scale
    ctx.strokeRect(x - gap, y - gap, width + 2 * gap, height + 2 * gap)
  }
  ctx.restore()
}

export function noteMenu(node, { say = english, pick = () => {}, detach: free = () => {} } = {}) {
  if (!node || !isNote(node)) return []
  const host = hostOf(node)
  if (!host) return [null, { content: say("noteAttach"), callback: () => pick(node) }]
  return [
    null,
    { content: say("noteDetach", { node: titleOf(host) }), callback: () => free(node) },
    { content: say("noteAttachAnother"), callback: () => pick(node) },
  ]
}

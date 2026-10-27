import { titleOf } from "./graph_walk.js"
import { cut, fitting, plain, wrap } from "./input_values.js"
import { vueNodes } from "./vue_nodes.js"
import { english } from "./words.js"

export const PROPERTY = "breeze_card"

const NOTES = new Set(["Note", "MarkdownNote"])

const MODEL_FILE = /\.(safetensors|sft|ckpt|pt|pth|bin|gguf|onnx)$/i
const SEED = /seed/i
const BARE = /^value$/i
const WIDTH = /^width$/i
const HEIGHT = /^height$/i
const CONTROLS = new Set(["control_after_generate", "control_before_generate"])

const PREVIEW = "$$canvas-image-preview"

const RANKS = { model: 0, prompt: 1, size: 2, seed: 3, other: 4 }

const TITLE_LINES = 3
const LINE = 1.15
const VALUE_RATIO = 6 / 7
const PAD_PX = 3
const SMALLEST_PX = 8

const FULL_SCALE = 0.25
const FAR_SCALE = 0.1
const FAR_SHARE = 0.7
const VALUE_ALPHA = 0.85
const BREAKS = "_-/\\.:"

const LONG = 400
const NOTE_LONG = 2000
const TAIL = 3

const HALO_PX = 3

const FALLBACK = "sans-serif"

const TIMES = String.fromCharCode(0xd7)
const DOT = String.fromCharCode(0xb7)
const CHECK = String.fromCharCode(0x2713)
const BLANK = String.fromCharCode(0x2003)

const NO_TITLE = 1
const TRANSPARENT_TITLE = 2

const VUE_NODE = ".lg-node[data-node-id]"
const VUE_CARD = "breeze-card"
const VUE_STEPS = 16

const GROUND = "#222"

export function installCards(canvas, { enabled, size, count }) {
  const proto = Object.getPrototypeOf(canvas)
  const { draw, drawNode, drawFrontCanvas } = proto
  const vue = { shown: false, keys: new WeakMap(), measure: null }
  const laid = new WeakMap()

  proto.draw = function (...args) {
    if (this === canvas) {
      const on = enabled() && vueNodes() && Boolean(this.low_quality)
      if (on || vue.shown) vue.shown = syncVue(this, vue, on, size(), count())
    }
    return draw.apply(this, args)
  }

  proto.drawFrontCanvas = function (...args) {
    const result = drawFrontCanvas.apply(this, args)
    if (this === canvas && this.low_quality && enabled()) paintGroups(this, sizesOf(size(), this.ds.scale))
    return result
  }

  proto.drawNode = function (node, ctx) {
    const result = drawNode.apply(this, arguments)
    if (this === canvas && this.low_quality && !vueNodes() && carded(node) && enabled()) {
      paintCanvas(this, node, ctx, cardOf(node, count()), sizesOf(size(), this.ds.scale), laid)
    }
    return result
  }
}

export function carded(node) {
  if (!node || node.flags?.collapsed || node.type === "Reroute") return false
  const mode = node.title_mode ?? node.constructor?.title_mode
  return mode !== NO_TITLE && mode !== TRANSPARENT_TITLE
}

export function cardOf(node, limit = 2) {
  if (isNote(node)) return noteCard(node)
  const title = titleOf(node)
  const rows = choices(node)
  const pinned = pinnedOf(node)
  const mine = rows.filter((row) => row.names.some((name) => pinned.includes(name)))
  const chosen = mine.length
    ? mine
    : rows.filter((row) => !inTitle(title, row.bare)).sort((a, b) => a.rank - b.rank || a.order - b.order).slice(0, limit)
  return { title, values: chosen.map((row) => row.text) }
}

export function choices(node) {
  const widgets = (node?.widgets ?? []).filter((widget) => eligible(node, widget))
  const width = widgets.find((widget) => WIDTH.test(widget.name) && typeof widget.value === "number")
  const height = widgets.find((widget) => HEIGHT.test(widget.name) && typeof widget.value === "number")
  const paired = Boolean(width && height)
  const rows = []
  for (const [order, widget] of widgets.entries()) {
    if (paired && widget === height) continue
    if (paired && widget === width) {
      rows.push({
        names: [width.name, height.name],
        label: labelOf(width) + " " + TIMES + " " + labelOf(height),
        text: plain(width.value) + " " + TIMES + " " + plain(height.value),
        bare: null,
        rank: RANKS.size,
        order,
      })
      continue
    }
    const shown = describe(widget)
    if (shown) rows.push({ names: [widget.name], label: labelOf(widget), ...shown, order })
  }
  return rows
}

function eligible(node, widget) {
  const name = widget?.name
  if (typeof name !== "string" || !name || name.startsWith("$$") || CONTROLS.has(name)) return false
  if (widget.hidden || widget.options?.hidden || widget.type === "button") return false
  if (widget.connectionSuppressed === true) return false
  if ((widget.element || widget.component) && !multiline(widget)) return false
  return !(node.inputs ?? []).some((input) => input?.widget?.name === name && input.link != null)
}

function describe(widget) {
  const { value, name } = widget
  if (typeof value === "string") {
    const text = value.slice(0, LONG).trim()
    if (!text) return null
    if (MODEL_FILE.test(text)) {
      const stem = stemOf(text)
      return { text: stem, bare: stem, rank: RANKS.model }
    }
    if (multiline(widget)) return { text: plain(text), bare: null, rank: RANKS.prompt }
    const bare = plain(text, true)
    return { text: bare, bare, rank: RANKS.other }
  }
  if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
    const bare = plain(value)
    const rank = typeof value === "number" && SEED.test(name) ? RANKS.seed : RANKS.other
    return { text: BARE.test(name) ? bare : labelOf(widget) + " " + bare, bare, rank }
  }
  return null
}

function multiline(widget) {
  if (widget.type === "customtext" || widget.options?.multiline === true) return true
  return typeof HTMLTextAreaElement !== "undefined" && widget.element instanceof HTMLTextAreaElement
}

function labelOf(widget) {
  return widget.label || widget.name
}

export function stemOf(path) {
  return path.split(/[\\/]/).pop().replace(MODEL_FILE, "")
}

function inTitle(title, bare) {
  return Boolean(bare) && title.toLowerCase().includes(bare.toLowerCase())
}

export function pinnedOf(node) {
  const list = node?.properties?.[PROPERTY]
  return Array.isArray(list) ? list.filter((name) => typeof name === "string") : []
}

export function isNote(node) {
  if (NOTES.has(node?.type) || NOTES.has(node?.comfyClass)) return true
  const widgets = node?.widgets ?? []
  return !node?.inputs?.length && !node?.outputs?.length && widgets.length > 0
    && widgets.every((widget) => typeof widget.value === "string")
}

function noteCard(node) {
  const title = (node.title ?? "").trim()
  const stock = [node.type, node.comfyClass, node.constructor?.title].filter(Boolean).map(squeezed)
  const text = (node.widgets ?? []).find((widget) => typeof widget.value === "string")?.value
  const lines = noteLines(text?.slice(0, NOTE_LONG))
  if (title && !stock.includes(squeezed(title))) return { title, values: [], text: lines.join("\n") }
  return { title: lines[0] || titleOf(node), values: [], text: lines.slice(1).join("\n") }
}

function squeezed(text) {
  return String(text).replace(/\s+/g, "").toLowerCase()
}

export function firstLine(text) {
  return noteLines(text)[0] ?? ""
}

export function noteLines(text) {
  const lines = []
  for (const raw of String(text ?? "").split("\n")) {
    if (/^\s*\|[\s|:-]*$/.test(raw)) continue
    let line = cells(raw)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]*>/g, "")
    let before
    do {
      before = line
      line = line.replace(/^\s*(?:#{1,6}\s*|>\s*|[-*+]\s+|\d+[.)]\s+)/, "")
    } while (line !== before)
    line = line.replace(/\*+|__|`/g, "").trim()
    if (line && !/^[-_=\s]+$/.test(line)) lines.push(line)
  }
  return lines
}

function cells(line) {
  if (!/^\s*\|/.test(line)) return line
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim()).filter(Boolean).join(" " + DOT + " ")
}

export function layoutCard(measure, card, { width, height, title, value, pad, smallest }) {
  const room = width - 2 * pad
  const tall = height - pad
  const size = Math.min(title, tall / LINE)
  if (room <= 0 || size < smallest) return null
  const small = Math.min(value, size)
  const line = size * LINE
  const step = small * LINE
  const values = []
  let left = tall - line - (card.values.length ? pad : 0)
  for (const text of card.values) {
    if (left < step) break
    const shown = cut((each) => measure(each, "normal", small), text, room)
    if (!shown) continue
    values.push(shown)
    left -= step
  }
  const rows = Math.min(TITLE_LINES, 1 + Math.max(0, Math.floor(left / line)))
  const lines = titleLines((each) => measure(each, "bold", size), card.title, room, rows)
  if (card.text) {
    const below = Math.floor((tall - lines.length * line - pad) / step)
    values.push(...wrap((each) => measure(each, "normal", small), card.text, room, below))
  }
  return { size, small, title: lines, values }
}

export function titleLines(measure, text, width, rows) {
  const lines = []
  let rest = String(text ?? "").replace(/\s+/g, " ").trim()
  const words = rest.includes(" ")
  while (rest) {
    if (lines.length >= rows - 1 || measure(rest) <= width) {
      lines.push(cut(measure, rest, width))
      break
    }
    const size = fitting(measure, rest, width)
    const at = breakAt(rest, size)
    if (at) {
      lines.push(rest.slice(0, at).trimEnd())
      rest = rest.slice(at).trimStart()
    } else if (words) {
      const end = rest.indexOf(" ") > 0 ? rest.indexOf(" ") : rest.length
      lines.push(cut(measure, rest.slice(0, end), width))
      rest = rest.slice(end).trimStart()
    } else {
      const pieces = chunks(measure, rest, width)
      if (pieces.length > rows - lines.length || pieces.at(-1).length < TAIL) lines.push(cut(measure, rest, width))
      else lines.push(...pieces)
      break
    }
  }
  return lines
}

function chunks(measure, text, width) {
  const pieces = []
  let rest = text
  while (measure(rest) > width) {
    const size = fitting(measure, rest, width)
    pieces.push(rest.slice(0, size))
    rest = rest.slice(size)
  }
  return [...pieces, rest]
}

function breakAt(text, size) {
  for (let i = size; i > 0; i--) {
    if (text[i] === " " || BREAKS.includes(text[i - 1])) return i
  }
  return 0
}

export function sizesOf(px, scale = 1) {
  const share = shrink(scale)
  return { title: px * share, value: Math.round(px * VALUE_RATIO) * share }
}

export function shrink(scale) {
  if (!(scale < FULL_SCALE)) return 1
  const far = Math.min(1, Math.log(FULL_SCALE / scale) / Math.log(FULL_SCALE / FAR_SCALE))
  return 1 - (1 - FAR_SHARE) * far
}

function kept(widget) {
  return widget?.name === PREVIEW || widget?.options?.hideOnZoom === false
}

function previewTop(node) {
  for (const widget of node.widgets ?? []) {
    if (kept(widget) && typeof widget.y === "number" && widget.y > 0) return widget.y
  }
  return null
}

function fontOf(weight, size) {
  return weight + " " + size + "px " + (globalThis.LiteGraph?.NODE_FONT ?? "Inter") + ", " + FALLBACK
}

function measurer(ctx) {
  let set = ""
  return (text, weight, size) => {
    const font = fontOf(weight, size)
    if (font !== set) {
      ctx.font = font
      set = font
    }
    return ctx.measureText(text).width
  }
}

function paintCanvas(canvas, node, ctx, card, sizes, laid) {
  const graph = globalThis.LiteGraph ?? {}
  const scale = canvas.ds?.scale ?? 1
  const top = graph.NODE_TITLE_HEIGHT ?? 30
  const [width, height] = node.renderingSize ?? node.size
  const bottom = previewTop(node) ?? height
  const box = [0, -top, width, bottom + top]
  const pad = PAD_PX / scale
  const key = JSON.stringify([card, width, box[3], scale, sizes.title])
  const cached = laid.get(node)
  const layout = cached?.key === key ? cached.layout : layoutCard(measurer(ctx), card, {
    width, height: box[3], title: sizes.title / scale, value: sizes.value / scale, pad, smallest: SMALLEST_PX / scale,
  })
  if (cached?.key !== key) laid.set(node, { key, layout })
  const alpha = canvas.getNodeModeAlpha?.(node) ?? 1
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.rect(...box)
  ctx.clip()
  ctx.fillStyle = node.renderingBgColor ?? graph.NODE_DEFAULT_BGCOLOR ?? "#353535"
  ctx.fillRect(...box)
  const band = layout ? 2 * pad + layout.title.length * layout.size * LINE : top
  ctx.fillStyle = node.renderingColor ?? graph.NODE_DEFAULT_COLOR ?? "#333"
  ctx.fillRect(0, -top, width, Math.max(top, band))
  if (layout) {
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillStyle = graph.NODE_SELECTED_TITLE_COLOR ?? "#fff"
    ctx.font = fontOf("bold", layout.size)
    let y = -top + pad
    for (const text of layout.title) {
      ctx.fillText(text, pad, y + layout.size * LINE / 2)
      y += layout.size * LINE
    }
    y += pad
    ctx.globalAlpha = alpha * VALUE_ALPHA
    ctx.fillStyle = graph.WIDGET_TEXT_COLOR ?? "#ddd"
    ctx.font = fontOf("normal", layout.small)
    for (const text of layout.values) {
      ctx.fillText(text, pad, y + layout.small * LINE / 2)
      y += layout.small * LINE
    }
  }
  ctx.restore()
}

function paintGroups(canvas, sizes) {
  const groups = canvas.graph?.groups ?? []
  if (!groups.length || !canvas.ctx || !canvas.ds?.toCanvasContext) return
  const { ctx, ds } = canvas
  const size = sizes.title / ds.scale
  const pad = PAD_PX / ds.scale
  const seen = canvas.visible_area
  ctx.save()
  ds.toCanvasContext(ctx)
  ctx.font = fontOf("bold", size)
  ctx.textAlign = "left"
  ctx.textBaseline = "bottom"
  ctx.lineJoin = "round"
  ctx.lineWidth = HALO_PX / ds.scale
  ctx.strokeStyle = canvas.clear_background_color || GROUND
  const measure = (text) => ctx.measureText(text).width
  for (const group of groups) {
    const [x, y, width] = group.boundingRect ?? [...group.pos, ...group.size]
    const top = y - pad - size * LINE
    if (seen && (x > seen[0] + seen[2] || x + width < seen[0] || top > seen[1] + seen[3] || y < seen[1])) continue
    const text = cut(measure, String(group.title ?? "").trim(), width - 2 * pad)
    if (!text) continue
    ctx.fillStyle = group._titleTextColor || globalThis.LiteGraph?.NODE_SELECTED_TITLE_COLOR || "#fff"
    ctx.strokeText(text, x + pad, y - pad)
    ctx.fillText(text, x + pad, y - pad)
  }
  ctx.restore()
}

function syncVue(canvas, vue, on, px, limit) {
  const graph = canvas.graph
  if (!on || !graph) {
    for (const card of document.querySelectorAll("." + VUE_CARD)) card.remove()
    return false
  }
  const scale = quantized(canvas.ds?.scale ?? 1)
  const sizes = sizesOf(px, scale)
  const pad = PAD_PX / scale
  vue.measure ??= measurer(document.createElement("canvas").getContext("2d"))
  const changed = []
  for (const element of document.querySelectorAll(VUE_NODE)) {
    const node = graph.getNodeById?.(element.dataset.nodeId)
    const existing = element.querySelector(":scope > ." + VUE_CARD)
    if (!node || !carded(node)) {
      if (existing) changed.push({ element, existing, look: null })
      continue
    }
    const card = cardOf(node, limit)
    const look = {
      width: element.offsetWidth,
      height: element.offsetHeight,
      scale,
      sizes,
      colour: faded(node.renderingColor, canvas.getNodeModeAlpha?.(node) ?? 1, canvas.clear_background_color),
      background: faded(node.renderingBgColor, canvas.getNodeModeAlpha?.(node) ?? 1, canvas.clear_background_color),
    }
    const key = JSON.stringify([card, look])
    if (!existing || vue.keys.get(existing) !== key) changed.push({ element, existing, card, look, key })
  }
  for (const { element, existing, card, look, key } of changed) {
    if (!look) {
      existing.remove()
      continue
    }
    const layout = layoutCard(vue.measure, card, {
      width: look.width, height: look.height, title: sizes.title / scale, value: sizes.value / scale,
      pad, smallest: SMALLEST_PX / scale,
    })
    const shown = existing ?? element.appendChild(document.createElement("div"))
    shown.className = VUE_CARD
    shown.setAttribute("aria-hidden", "true")
    fillVue(shown, layout, look, pad)
    vue.keys.set(shown, key)
  }
  return true
}

export function faded(colour, alpha, ground = GROUND) {
  if (!colour || alpha >= 1) return colour ?? ""
  return "color-mix(in srgb, " + colour + " " + Math.round(alpha * 100) + "%, " + (ground || GROUND) + ")"
}

function quantized(scale) {
  return 2 ** (Math.round(Math.log2(scale) * VUE_STEPS) / VUE_STEPS)
}

function fillVue(shown, layout, look, pad) {
  const graph = globalThis.LiteGraph ?? {}
  shown.style.background = look.background ?? ""
  if (!layout) {
    shown.replaceChildren()
    return
  }
  const band = document.createElement("div")
  band.className = VUE_CARD + "-band"
  band.style.background = look.colour ?? ""
  band.style.padding = pad + "px"
  band.style.color = graph.NODE_SELECTED_TITLE_COLOR ?? "#fff"
  band.style.fontSize = layout.size + "px"
  band.append(...layout.title.map(lineOf))
  const values = document.createElement("div")
  values.className = VUE_CARD + "-values"
  values.style.padding = "0 " + pad + "px " + pad + "px"
  values.style.fontSize = layout.small + "px"
  values.style.color = graph.WIDGET_TEXT_COLOR ?? "#ddd"
  values.append(...layout.values.map(lineOf))
  shown.replaceChildren(band, values)
}

function lineOf(text) {
  const line = document.createElement("div")
  line.textContent = text
  return line
}

export function cardMenu(node, { say = english, changed = () => {} } = {}) {
  if (!node || !carded(node) || isNote(node)) return []
  const rows = choices(node)
  if (!rows.length) return []
  const pinned = pinnedOf(node).filter((name) => rows.some((row) => row.names.includes(name)))
  const mark = (on, text) => (on ? CHECK : BLANK) + " " + text
  const pin = (names) => {
    node.properties ??= {}
    if (names.length) node.properties[PROPERTY] = names
    else delete node.properties[PROPERTY]
    changed(node)
  }
  const options = [{ content: mark(!pinned.length, say("cardAuto")), callback: () => pin([]) }, null]
  for (const row of rows) {
    const on = row.names.some((name) => pinned.includes(name))
    options.push({
      content: mark(on, row.label),
      callback: () => pin(on ? pinned.filter((name) => !row.names.includes(name)) : [...pinned, row.names[0]]),
    })
  }
  return [null, { content: say("cardMenu"), has_submenu: true, submenu: { options } }]
}

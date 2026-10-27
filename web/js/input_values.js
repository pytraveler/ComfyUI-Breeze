import { moves } from "./forecast.js"
import { titleOf, valueSource } from "./graph_walk.js"
import { rule, styleSheet, vueNodes } from "./vue_nodes.js"

const MARGIN = 15
const LABEL_LEFT = 2 * MARGIN + 5
const GAP = 8
const BASELINE = 0.7

const ARROW = String.fromCharCode(0x2190)
const ELLIPSIS = String.fromCharCode(0x2026)

const FALLBACK = "sans-serif"

const HEAD = 4

const TALL = 2
const BOX_FONT = "ui-monospace, Consolas, monospace"
const BOX_FONT_PX = 11
const BOX_LINE = 1.4
const BOX_PAD = 6

const QUOTED = 60
const PRECISION = 6

const PLAIN = new Set(["INT", "FLOAT", "STRING", "BOOLEAN"])

const LOOKS = {
  current: { alpha: 0.8, secondary: false, italic: false },
  unsure: { alpha: 0.6, secondary: true, italic: false },
  stale: { alpha: 0.5, secondary: true, italic: true },
}

const VUE_LOOKS = {
  current: "opacity: 0.85;",
  unsure: "opacity: 0.55;",
  stale: "opacity: 0.5; font-style: italic;",
}

const VUE_SLOT = "flex: 1 1 auto; min-width: 0;"

const VUE_VALUE = [
  "flex: 1 1 0",
  "min-width: 0",
  "contain: inline-size",
  "padding-left: 8px",
  "overflow: hidden",
  "text-overflow: ellipsis",
  "white-space: nowrap",
  "text-align: right",
  "pointer-events: none",
].join("; ") + ";"

export function installInputValues(canvas, { enabled, feed, load, root, workflow, before, redraw }) {
  const proto = Object.getPrototypeOf(canvas)
  const { draw, drawNode } = proto
  const state = { shown: null, version: -1, workflow: undefined, ticket: 0 }
  const sheet = styleSheet()

  const refetch = () => {
    const mine = ++state.ticket
    const same = feed.result()?.same ?? null
    load().then((outputs) => {
      if (mine !== state.ticket) return
      state.shown = { outputs, same }
      redraw()
    }, () => {})
  }

  const valueOf = (graph, link, widget) => incoming(graph, link, {
    outputs: state.shown?.outputs, same: state.shown?.same, root: graph === root(), before: before(),
    bare: widget?.type === "combo",
  })

  proto.draw = function (...args) {
    if (this === canvas) {
      const on = enabled()
      if (on) {
        feed.poll()
        const id = workflow()
        if (id !== state.workflow) state.shown = null
        if (id !== state.workflow || feed.version() !== state.version) {
          state.workflow = id
          state.version = feed.version()
          refetch()
        }
      }
      sheet(on && vueNodes() ? vueStyle(vueRows(this.graph, valueOf)) : "")
    }
    return draw.apply(this, args)
  }

  proto.drawNode = function (node, ctx) {
    const result = drawNode.apply(this, arguments)
    if (this === canvas && !this.low_quality && !node.flags?.collapsed && enabled() && !vueNodes()) {
      const rows = []
      for (const { widget, link } of connectedRows(this.graph, node)) {
        if (widget.connectionSuppressed !== true) continue
        const shown = valueOf(this.graph, link, widget)
        if (shown) rows.push({ widget, shown })
      }
      if (rows.length) paint(this, node, ctx, rows)
    }
    return result
  }
}

export function connectedRows(graph, node) {
  const rows = []
  for (const [index, input] of (node?.inputs ?? []).entries()) {
    if (!input?.widget || input.link == null) continue
    const widget = node.widgets?.find((each) => each.name === input.widget.name)
    const link = graph?.getLink?.(input.link)
    if (widget && link) rows.push({ widget, index, link })
  }
  return rows
}

export function incoming(graph, link, { outputs = null, same = null, root = true, before = false, bare = false } = {}) {
  const source = valueSource(graph, link)
  if (!source) return null
  const from = titleOf(source.node)
  const look = moves(source.node, before) ? "stale" : "current"
  if ("widget" in source) return { value: plain(source.widget, bare), from, look, body: textOf(source.widget) }
  const own = ownValue(source.node, source.slot)
  const entry = root && outputs && Object.hasOwn(outputs, source.id) ? outputs[source.id] : null
  const type = source.node.comfyClass ?? source.node.type
  const ours = entry && !(entry.type && type && entry.type !== type)
  const found = ours ? entry.outputs?.[source.slot] : null
  const text = found == null ? null : bare ? unquoted(String(found)) : String(found)
  const body = text == null ? null : textOf(entry.texts?.[source.slot])
  const kept = same && Object.hasOwn(same, source.id) ? same[source.id] : null
  if (text != null && kept === true) return { value: text, from, look: "current", body }
  if (own !== undefined) return { value: plain(own, bare), from, look, body: textOf(own) }
  if (text == null) return { value: null, from, look: "unsure", body: null }
  return { value: text, from, look: kept === false ? "stale" : "unsure", body }
}

function textOf(value) {
  return typeof value === "string" ? value : null
}

function unquoted(text) {
  return /^"[^"]*"$/.test(text) ? text.slice(1, -1) : text
}

function ownValue(node, slot) {
  const outputs = node.outputs ?? []
  const type = outputs[slot]?.type
  if (outputs.length !== 1 || !PLAIN.has(type)) return undefined
  const inputs = node.inputs ?? []
  const settings = (node.widgets ?? []).filter((widget) => inputs.some((input) => input.widget?.name === widget.name))
  if (settings.length !== 1) return undefined
  const input = inputs.find((each) => each.widget?.name === settings[0].name)
  if (input.link != null || input.type !== type) return undefined
  return settings[0].value
}

export function plain(value, bare = false) {
  if (value == null) return null
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(PRECISION)))
  }
  if (typeof value !== "string") return String(value)
  const flat = value.split(/\s+/).filter(Boolean).join(" ")
  const head = flat.length <= QUOTED ? flat : flat.slice(0, QUOTED) + "..."
  return bare ? head : '"' + head + '"'
}

export function rowText({ value, from }) {
  return value == null ? ARROW + " " + from : value + " " + ARROW + " " + from
}

export function fitRow(measure, { value, from }, room) {
  const tail = ARROW + " " + from
  const whole = rowText({ value, from })
  if (value == null || measure(whole) <= room) return cut(measure, whole, room)
  const head = cut(measure, value, room - measure(" " + tail))
  return head.length > HEAD ? head + " " + tail : cut(measure, whole, room)
}

export function wrap(measure, text, width, rows) {
  if (rows < 1) return []
  const lines = []
  const paragraphs = text.split("\n")
  for (const [i, paragraph] of paragraphs.entries()) {
    let rest = paragraph.trimEnd()
    if (!rest) lines.push("")
    while (rest && lines.length <= rows) {
      let size = cut(measure, rest, width) === rest ? rest.length : fitting(measure, rest, width)
      const space = rest.lastIndexOf(" ", size)
      if (size < rest.length && space > 0) size = space
      lines.push(rest.slice(0, size))
      rest = rest.slice(size).trimStart()
    }
    if (lines.length > rows || (lines.length === rows && i < paragraphs.length - 1)) {
      lines.length = rows
      lines[rows - 1] = cut(measure, lines[rows - 1] + ELLIPSIS, width) || ELLIPSIS
      break
    }
  }
  return lines
}

export function fitting(measure, text, width) {
  let low = 1
  let high = text.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (measure(text.slice(0, middle)) <= width) low = middle
    else high = middle - 1
  }
  return low
}

export function cut(measure, text, room) {
  if (measure(text) <= room) return text
  let low = 0
  let high = text.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (measure(text.slice(0, middle) + ELLIPSIS) <= room) low = middle
    else high = middle - 1
  }
  return low ? text.slice(0, low).trimEnd() + ELLIPSIS : ""
}

function paint(canvas, node, ctx, rows) {
  const graph = globalThis.LiteGraph ?? {}
  const width = node.renderingSize?.[0] ?? node.size?.[0] ?? 0
  const labels = canvas.inner_text_font
  const font = labels + ", " + FALLBACK
  const alpha = canvas.getNodeModeAlpha?.(node) ?? 1
  const measure = (text) => ctx.measureText(text).width
  ctx.save()
  ctx.textAlign = "right"
  ctx.textBaseline = "alphabetic"
  const secondary = graph.WIDGET_SECONDARY_TEXT_COLOR ?? "#999"
  for (const { widget, shown } of rows) {
    if (typeof widget.y !== "number" || (node.isWidgetRowVisible && !node.isWidgetRowVisible(widget))) continue
    const look = LOOKS[shown.look]
    const height = typeof widget.height === "number" ? widget.height : (graph.NODE_WIDGET_HEIGHT ?? 20)
    const full = widget.width || width
    const right = full - 2 * MARGIN
    const baseline = widget.y + height * BASELINE
    const label = widget.label || widget.name
    const unlabelled = widget.element instanceof HTMLElement
    ctx.font = unlabelled ? font : labels
    const left = LABEL_LEFT + measure(label) + GAP
    if (unlabelled) {
      ctx.globalAlpha = alpha * 0.5
      ctx.fillStyle = secondary
      ctx.textAlign = "left"
      ctx.fillText(cut(measure, label, right - LABEL_LEFT), LABEL_LEFT, baseline)
      ctx.textAlign = "right"
    }
    const box = shown.body != null && typeof widget.computedHeight === "number" && widget.computedHeight > TALL * height
    ctx.font = look.italic ? "italic " + font : font
    const text = fitRow(measure, box ? { value: null, from: shown.from } : shown, right - left)
    ctx.globalAlpha = alpha * look.alpha
    ctx.fillStyle = look.secondary ? secondary : (graph.WIDGET_TEXT_COLOR ?? "#ddd")
    if (text) ctx.fillText(text, right, baseline)
    if (box) paintBox(ctx, shown.body, look, [MARGIN, widget.y + height, full - 2 * MARGIN, widget.computedHeight - height])
  }
  ctx.restore()
}

function paintBox(ctx, body, look, [x, y, width, height]) {
  const size = BOX_FONT_PX
  const line = size * BOX_LINE
  const rows = Math.floor((height - 2 * BOX_PAD) / line)
  if (rows < 1) return
  ctx.font = (look.italic ? "italic " : "") + size + "px " + BOX_FONT
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  const lines = wrap((text) => ctx.measureText(text).width, body, width - 2 * BOX_PAD, rows)
  lines.forEach((text, i) => ctx.fillText(text, x + BOX_PAD, y + BOX_PAD + i * line))
  ctx.textAlign = "right"
  ctx.textBaseline = "alphabetic"
}

function vueRows(graph, valueOf) {
  const rows = []
  for (const node of graph?.nodes ?? []) {
    for (const { widget, index, link } of connectedRows(graph, node)) {
      const shown = valueOf(graph, link, widget)
      if (shown) rows.push({ key: node.id + "-in-" + index, text: rowText(shown), look: shown.look })
    }
  }
  return rows
}

export function vueStyle(rows) {
  if (!rows.length) return ""
  const slots = rows.map(({ key }) => ".lg-slot--input[aria-label]:has([data-slot-key=" + JSON.stringify(key) + "])")
  const rules = [rule(slots, VUE_SLOT), rule(slots.map((slot) => slot + "::after"), VUE_VALUE)]
  rows.forEach((row, i) => {
    rules.push(rule([slots[i] + "::after"], "content: " + JSON.stringify(row.text) + "; " + VUE_LOOKS[row.look]))
  })
  return rules.join(" ")
}

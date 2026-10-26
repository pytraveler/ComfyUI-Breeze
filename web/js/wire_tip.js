import { linkEnds } from "./graph_walk.js"
import { colourOf } from "./wire_hover.js"
import { english } from "./words.js"

const OFFSET = 16

const MARGIN = 8

const MAX_WIRES = 4
const MAX_TARGETS = 6

export function installWireTip(canvas, { enabled, load, valueOf, say = english, avoid = () => null }) {
  let ticket = 0
  let tip = null

  const away = () => {
    ticket++
    if (tip) tip.hidden = true
  }

  const rest = async (links, at) => {
    const mine = ++ticket
    const outputs = await load().catch(() => null)
    if (mine !== ticket) return
    tip ??= createTip()
    fill(tip, canvas, links, (link) => valueOf(link, outputs), say)
    place(tip, at, avoid())
  }

  return { wanted: enabled, rest, away }
}

function createTip() {
  const tip = document.createElement("div")
  tip.className = "breeze-wire-tip"
  tip.hidden = true
  document.body.append(tip)
  return tip
}

function fill(tip, canvas, links, valueOf, say) {
  const graph = canvas.graph
  const wires = new Map()
  for (const link of links) {
    const key = link.origin_id + ":" + link.origin_slot
    const wire = wires.get(key)
    if (wire) wire.targets.push(link)
    else wires.set(key, { link, targets: [link] })
  }
  const blocks = []
  for (const { link, targets } of [...wires.values()].slice(0, MAX_WIRES)) {
    blocks.push(wireBlock(canvas, graph, link, targets, valueOf(link), say))
  }
  if (wires.size > MAX_WIRES) blocks.push(line("bwt-more", say("more", { n: wires.size - MAX_WIRES })))
  tip.replaceChildren(...blocks)
}

function wireBlock(canvas, graph, link, targets, value, say) {
  const ends = linkEnds(graph, link, say)
  const block = document.createElement("div")
  block.className = "bwt-wire"

  const type = line("bwt-type", ends.type)
  const dot = document.createElement("span")
  dot.className = "bwt-dot"
  dot.style.background = colourOf(canvas, link)
  type.prepend(dot)
  block.append(type, endLine(ends.from, ""))

  for (const target of targets.slice(0, MAX_TARGETS)) {
    block.append(endLine(linkEnds(graph, target, say).to, "\u2192 "))
  }
  if (targets.length > MAX_TARGETS) {
    block.append(line("bwt-end", "\u2192 " + say("more", { n: targets.length - MAX_TARGETS })))
  }
  if (value) {
    const row = line("bwt-value", value.text)
    const label = document.createElement("span")
    label.className = "bwt-label"
    label.textContent = value.label + "  "
    row.prepend(label)
    block.append(row)
  }
  return block
}

function endLine(end, lead) {
  const row = line("bwt-end", lead + end.title)
  if (end.id != null) row.append(span("bwt-id", " #" + end.id))
  if (end.slot) row.append(span("bwt-slot", "  " + end.slot))
  return row
}

function line(name, text) {
  const row = document.createElement("div")
  row.className = name
  row.textContent = text
  return row
}

function span(name, text) {
  const part = document.createElement("span")
  part.className = name
  part.textContent = text
  return part
}

function place(tip, at, avoid) {
  tip.hidden = false
  const { offsetWidth: width, offsetHeight: height } = tip
  const right = at.clientX + OFFSET
  const left = at.clientX - OFFSET - width
  const below = at.clientY + OFFSET
  const above = at.clientY - OFFSET - height
  const spots = [[right, below], [left, below], [right, above], [left, above]]
  if (avoid) {
    spots.splice(1, 0, [right, Math.max(below, avoid.bottom + OFFSET / 2)])
    spots.push([right, Math.min(above, avoid.top - OFFSET / 2 - height)])
  }
  const fits = ([x, y]) => x >= MARGIN && y >= MARGIN
    && x + width + MARGIN <= window.innerWidth && y + height + MARGIN <= window.innerHeight
  const clear = ([x, y]) => !avoid || x >= avoid.right || x + width <= avoid.left
    || y >= avoid.bottom || y + height <= avoid.top
  const [x, y] = spots.find((spot) => fits(spot) && clear(spot)) ?? spots.find(fits) ?? spots[0]
  tip.style.left = Math.max(MARGIN, x) + "px"
  tip.style.top = Math.max(MARGIN, y) + "px"
}

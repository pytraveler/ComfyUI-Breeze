import { fly } from "./flight.js"
import { drawGlow } from "./glow.js"
import { colourOf, linksAt } from "./wire_hover.js"

const STEPS = { 1: [0, -1], 2: [0, 1], 3: [-1, 0], 4: [1, 0] }
const LEFT = 3
const RIGHT = 4
const CENTER = 5

const STRAIGHT = 0
const LINEAR = 1

const STRAIGHT_JUT = 10
const LINEAR_JUT = 15

const REROUTE_REACH = 80

const SPACING = 8

const GAP_PX = 10
const LENGTH_PX = 16
const HALF_PX = 8

const ON_PX = 12

const HIT_PX = 13

const KEEP_PX = GAP_PX + LENGTH_PX + 4

const FLASH_MS = 1600
const FLASH_GLOW = 18

const PAD = 4
const OUTLINE_PX = 2

export function installWireArrows(canvas, { enabled, flown = () => {}, routeOf = () => null }) {
  const element = canvas.canvas
  const proto = Object.getPrototypeOf(canvas)
  const { drawFrontCanvas } = proto
  let shown = null
  let hot = null
  let cursor = ""
  let held = null
  let stop = null
  let probe = null
  let flash = null

  const current = () => {
    if (!shown || canvas.graph !== shown.graph || !enabled()) return []
    const links = [...shown.ids].map((id) => shown.graph.getLink(id)).filter(Boolean)
    return arrowsAround(shown.graph, links, shown.point, canvas.ds.scale,
      canvas.links_render_mode, (link) => colourOf(canvas, link), routeOf)
  }

  const heat = (arrow) => {
    const key = arrow?.key ?? null
    if (key === hot) return
    if (key && !hot) {
      cursor = element.style.cursor
      element.style.cursor = "pointer"
    }
    if (!key) element.style.cursor = cursor
    hot = key
    canvas.setDirty(true, false)
  }

  const clear = () => {
    if (!shown) return
    heat(null)
    shown = null
    canvas.setDirty(true, false)
  }

  const under = (event) => {
    const arrows = current()
    if (!arrows.length) return null
    return arrowAt(arrows, canvas.convertEventToCanvasOffset(event), canvas.ds.scale)
  }

  const halt = () => {
    stop?.()
    stop = null
  }

  proto.drawFrontCanvas = function (...args) {
    const result = drawFrontCanvas.apply(this, args)
    if (this !== canvas) return result
    if (flash) {
      const going = this.graph === flash.graph && paintFlash(this, flash)
      if (going) requestAnimationFrame(() => this.setDirty(true, false))
      else flash = null
    }
    if (shown) {
      if (this.graph === shown.graph) paint(this, current(), hot)
      else clear()
    }
    return result
  }

  element.addEventListener("pointermove", (event) => {
    if (!shown) return
    if (event.buttons) {
      clear()
      return
    }
    const arrow = under(event)
    heat(arrow)
    if (arrow) return
    probe ??= document.createElement("canvas").getContext("2d")
    if (!linksAt(canvas, probe, event, shown.ids).length) clear()
  })
  element.addEventListener("pointerleave", clear)
  element.addEventListener("wheel", halt, { passive: true })

  window.addEventListener("pointerdown", (event) => {
    if (event.target !== element) return
    halt()
    const arrow = event.button === 0 ? under(event) : null
    if (!arrow) {
      clear()
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    held = event.pointerId
    clear()
    flown()
    const graph = canvas.graph
    stop = fly(canvas, arrow.goals, () => {
      flash = { graph, rects: arrow.goals, colour: arrow.colour, start: performance.now() }
      canvas.setDirty(true, false)
    })
  }, true)
  window.addEventListener("pointerup", (event) => {
    if (event.pointerId !== held) return
    held = null
    event.preventDefault()
    event.stopImmediatePropagation()
  }, true)

  const rest = (links, at) => {
    const point = canvas.convertEventToCanvasOffset(at)
    if (shown && canvas.graph === shown.graph) {
      const off = Math.hypot(point[0] - shown.point[0], point[1] - shown.point[1])
      if (hot || off <= grown(KEEP_PX, canvas.ds.scale)) return
    }
    shown = { graph: canvas.graph, ids: new Set(links.map((link) => link.id)), point }
    canvas.setDirty(true, false)
  }

  const area = () => {
    const arrows = current()
    if (!arrows.length) return null
    const box = element.getBoundingClientRect()
    const corners = arrows.flatMap((arrow) => [arrow.tip, arrow.left, arrow.right])
      .map((corner) => canvas.convertOffsetToCanvas(corner))
    const xs = corners.map(([x]) => box.left + x)
    const ys = corners.map(([, y]) => box.top + y)
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
  }

  return { wanted: enabled, rest, away: () => {}, area }
}

export function arrowsAround(graph, links, point, scale, mode, colour, routeOf = () => null) {
  for (const link of [...links].reverse()) {
    const from = sourceEnd(graph, link)
    const to = targetEnd(graph, link)
    if (!from || !to) continue
    const line = measure(trace(graph, link, from, to, mode, routeOf(link)))
    const on = nearest(line, point)
    if (on.distance > grown(ON_PX, scale)) continue
    const siblings = links.filter((other) => other.origin_id === link.origin_id
      && other.origin_slot === link.origin_slot)
    const goals = {
      source: [from.rect],
      target: siblings.map((other) => targetEnd(graph, other)?.rect).filter(Boolean),
    }
    const arrows = []
    for (const [key, sign] of [["source", -1], ["target", 1]]) {
      const near = on.along + sign * grown(GAP_PX, scale)
      const far = on.along + sign * grown(GAP_PX + LENGTH_PX, scale)
      if (far < 0 || far > line.length || !goals[key].length) continue
      const shape = triangle(pointAt(line, near), pointAt(line, far), grown(HALF_PX, scale))
      arrows.push({ key, colour: colour(link), goals: goals[key], ...shape })
    }
    return arrows
  }
  return []
}

function grown(px, scale) {
  return px / Math.min(1, scale)
}

export function wireLine(graph, link, mode, route = null) {
  const from = sourceEnd(graph, link)
  const to = targetEnd(graph, link)
  return from && to ? trace(graph, link, from, to, mode, route) : null
}

function trace(graph, link, from, to, mode, route = null) {
  if (route) {
    const line = [route[0].a]
    for (const piece of route) line.push(...stretch(piece.a, piece.b, mode, piece).slice(1))
    return line
  }
  const reroutes = reroutesOf(graph, link)
  const ends = [from.at, ...reroutes.map((reroute) => reroute.pos), to.at]
  const line = [ends[0]]
  let lead = null
  for (let i = 0; i + 1 < ends.length; i++) {
    const last = i + 2 === ends.length
    const reroute = reroutes[i]
    const piece = stretch(ends[i], ends[i + 1], mode, {
      startDir: i === 0 ? from.dir : CENTER,
      endDir: last ? to.dir : CENTER,
      startControl: lead,
      endControl: last ? null : reroute.controlPoint,
    })
    line.push(...piece.slice(1))
    if (!last) {
      const reach = Math.min(REROUTE_REACH, distance(reroute.pos, ends[i + 2]) * 0.25)
      lead = [reach * reroute.cos, reach * reroute.sin]
    }
  }
  return line
}

/** The reroutes ``link`` passes, from its output to its input. */
function reroutesOf(graph, link) {
  if (link.parentId == null) return []
  return graph.reroutes?.get(link.parentId)?.getReroutes?.() ?? []
}

function stretch(a, b, mode, { startDir, endDir, startControl, endControl }) {
  if (mode === LINEAR) return [a, jut(a, startDir, LINEAR_JUT), jut(b, endDir, LINEAR_JUT), b]
  if (mode === STRAIGHT) {
    const outA = jut(a, startDir, STRAIGHT_JUT)
    const outB = jut(b, endDir, STRAIGHT_JUT)
    const middle = (outA[0] + outB[0]) / 2
    return [a, outA, [middle, outA[1]], [middle, outB[1]], outB, b]
  }
  const reach = distance(a, b) * 0.25
  const c1 = startControl ? [a[0] + startControl[0], a[1] + startControl[1]] : jut(a, startDir, reach)
  const c2 = endControl ? [b[0] + endControl[0], b[1] + endControl[1]] : jut(b, endDir, reach)
  return curve(a, c1, c2, b)
}

function jut(point, direction, length) {
  const step = STEPS[direction]
  return step ? [point[0] + step[0] * length, point[1] + step[1] * length] : point
}

function curve(a, c1, c2, b) {
  const rough = distance(a, c1) + distance(c1, c2) + distance(c2, b)
  const count = Math.min(1000, Math.max(8, Math.ceil(rough / SPACING)))
  const points = []
  for (let i = 0; i <= count; i++) {
    const t = i / count
    const u = 1 - t
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
    points.push([
      w[0] * a[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * b[0],
      w[0] * a[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * b[1],
    ])
  }
  return points
}

function measure(points) {
  const lengths = [0]
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]))
  return { points, lengths, length: lengths.at(-1) }
}

function nearest(line, point) {
  const { points, lengths } = line
  let best = { along: 0, distance: distance(points[0], point) }
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]
    const dx = points[i][0] - ax
    const dy = points[i][1] - ay
    const span = dx * dx + dy * dy
    const t = span ? Math.min(1, Math.max(0, ((point[0] - ax) * dx + (point[1] - ay) * dy) / span)) : 0
    const off = Math.hypot(ax + dx * t - point[0], ay + dy * t - point[1])
    if (off < best.distance) best = { along: lengths[i - 1] + t * (lengths[i] - lengths[i - 1]), distance: off }
  }
  return best
}

function pointAt(line, along) {
  const { points, lengths } = line
  for (let i = 1; i < points.length; i++) {
    if (lengths[i] < along) continue
    const span = lengths[i] - lengths[i - 1]
    const t = span ? (along - lengths[i - 1]) / span : 0
    return [
      points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
      points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
    ]
  }
  return points.at(-1)
}

function triangle(base, tip, half) {
  const length = distance(base, tip) || 1
  const nx = -(tip[1] - base[1]) / length
  const ny = (tip[0] - base[0]) / length
  return {
    tip,
    left: [base[0] + nx * half, base[1] + ny * half],
    right: [base[0] - nx * half, base[1] - ny * half],
    middle: [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2],
  }
}

function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

function sourceEnd(graph, link) {
  const node = graph.getNodeById(link.origin_id)
  const slot = node?.outputs?.[link.origin_slot]
  if (slot) return { at: node.getOutputPos(link.origin_slot), dir: slot.dir || RIGHT, rect: node.boundingRect }
  const io = graph.inputNode
  const own = io && io.id === link.origin_id ? io.slots?.[link.origin_slot] : null
  return own ? { at: own.pos, dir: RIGHT, rect: io.boundingRect } : null
}

function targetEnd(graph, link) {
  const node = graph.getNodeById(link.target_id)
  const slot = node?.inputs?.[link.target_slot]
  if (slot) return { at: node.getInputPos(link.target_slot), dir: slot.dir || LEFT, rect: node.boundingRect }
  const io = graph.outputNode
  const own = io && io.id === link.target_id ? io.slots?.[link.target_slot] : null
  return own ? { at: own.pos, dir: LEFT, rect: io.boundingRect } : null
}

export function arrowAt(arrows, point, scale) {
  let found = null
  let closest = grown(HIT_PX, scale)
  for (const arrow of arrows) {
    const off = distance(point, arrow.middle)
    if (off > closest) continue
    found = arrow
    closest = off
  }
  return found
}

function paint(canvas, arrows, hot) {
  if (!arrows.length) return
  const { ctx, ds } = canvas
  ctx.save()
  ds.toCanvasContext(ctx)
  ctx.globalAlpha = 1
  ctx.lineJoin = "round"
  for (const arrow of arrows) {
    const lit = arrow.key === hot
    ctx.beginPath()
    ctx.moveTo(arrow.tip[0], arrow.tip[1])
    ctx.lineTo(arrow.left[0], arrow.left[1])
    ctx.lineTo(arrow.right[0], arrow.right[1])
    ctx.closePath()
    ctx.fillStyle = arrow.colour
    ctx.fill()
    ctx.lineWidth = grown(lit ? 2 : 1, ds.scale)
    ctx.strokeStyle = lit ? "#fff" : "rgba(0, 0, 0, 0.6)"
    ctx.stroke()
  }
  ctx.restore()
}

export function flashAlpha(t) {
  if (!(t > 0) || t >= 1) return 0
  const rise = Math.min(1, t / 0.08)
  const beat = 0.5 - 0.5 * Math.cos(4 * Math.PI * t)
  return rise * (0.3 + 0.7 * beat) * Math.sqrt(1 - t)
}

function paintFlash(canvas, flash) {
  const t = (performance.now() - flash.start) / FLASH_MS
  if (t >= 1) return false
  const alpha = flashAlpha(t)
  const { ctx, ds } = canvas
  const corner = (globalThis.LiteGraph?.ROUND_RADIUS ?? 8) + PAD
  ctx.save()
  ds.toCanvasContext(ctx)
  for (const [x, y, width, height] of flash.rects) {
    const ring = [x - PAD, y - PAD, width + 2 * PAD, height + 2 * PAD]
    drawGlow(ctx, ring, { radius: FLASH_GLOW, corner, colour: flash.colour, scale: ds.scale, alpha })
    ctx.beginPath()
    ctx.globalAlpha = alpha
    ctx.lineWidth = OUTLINE_PX / Math.min(1, ds.scale)
    ctx.strokeStyle = flash.colour
    ctx.roundRect(...ring, corner)
    ctx.stroke()
  }
  ctx.restore()
  return true
}

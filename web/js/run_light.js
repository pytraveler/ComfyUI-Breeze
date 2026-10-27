import { isSetter, readersOf } from "./set_get.js"
import { measure, pointAt, wireLine } from "./wire_arrows.js"
import { colourOf } from "./wire_hover.js"

const FINISHED = "finished"

const HIDDEN = -1

const PACE_PX = 450
const QUICKEST_MS = 700
const LONGEST_MS = 2000

const TAIL_PX = 140
const TAIL_SHARE = 0.6

const CORE_PX = 3
const HALO = 2.6
const HALO_ALPHA = 0.6
const HEAD_PX = 9
const HEAD = 1.3
const WHITE_SHARE = 0.7

const WIRE_ALPHA = 0.35
const FADE_MS = 300

const HOPS = 64

const KEPT = 100

export function installRunLight(canvas, {
  enabled, speed, repeats = () => 1, root, workflow, queued = () => undefined, listen,
  routeOf = () => null, alpha = () => 1,
}) {
  const watch = runWatch()
  let pulses = []

  const timeOf = (graph, link) => {
    const line = wireLine(graph, link, canvas.links_render_mode, graph === canvas.graph ? routeOf(link) : null)
    return travelTime(line ? measure(line).length : 0, canvas.ds?.scale ?? 1, speed())
  }

  const add = (more) => {
    if (!more.length) return
    const count = repeats()
    const fresh = new Set(more.map((pulse) => pulse.link))
    pulses = pulses.filter((pulse) => !fresh.has(pulse.link))
    for (const pulse of more) pulses.push({ ...pulse, repeats: count })
    canvas.setDirty?.(true, false)
  }

  listen("execution_start", (event) => watch.start(event?.detail?.prompt_id))
  listen("progress_state", (event) => {
    const detail = event?.detail
    const done = watch.progress(detail)
    if (!done.length || !enabled() || !sameWorkflow(queued(detail.prompt_id), workflow())) return
    const now = performance.now()
    const graph = root()
    add(done.flatMap((id) => plan(graph, id, timeOf, now)))
  })

  const before = canvas.onRender
  canvas.onRender = function (...args) {
    before?.apply(this, args)
    if (!pulses.length) return
    if (!enabled()) {
      pulses = []
      return
    }
    pulses = paint(canvas, pulses, performance.now(), routeOf, alpha)
    if (pulses.length) requestAnimationFrame(() => canvas.setDirty(true, false))
  }

  return {
    enabled,
    run(graph, links) {
      if (enabled() && graph) add(follow(graph, links ?? [], timeOf, performance.now()))
    },
  }
}

export function watchQueue(api) {
  const kept = new Map()
  const queue = api?.queuePrompt
  if (typeof queue !== "function") return () => undefined
  api.queuePrompt = async function (number, data, ...rest) {
    const result = await queue.call(this, number, data, ...rest)
    const id = result?.prompt_id
    if (id != null) {
      kept.set(id, data?.workflow?.id ?? "")
      if (kept.size > KEPT) kept.delete(kept.keys().next().value)
    }
    return result
  }
  return (id) => kept.get(id)
}

export function sameWorkflow(from, open) {
  return from === undefined || from === open
}

export function runWatch() {
  let prompt = null
  let seen = new Set()
  return {
    start(id) {
      prompt = id ?? null
      seen = new Set()
    },
    progress(detail) {
      const nodes = detail?.nodes
      if (!nodes || typeof nodes !== "object") return []
      const joined = detail.prompt_id !== prompt
      if (joined) {
        prompt = detail.prompt_id
        seen = new Set()
      }
      const done = []
      for (const [id, node] of Object.entries(nodes)) {
        if (node?.state !== FINISHED || seen.has(id)) continue
        seen.add(id)
        done.push(id)
      }
      return joined ? [] : done
    },
  }
}

export function plan(root, id, timeOf, now) {
  const chain = resolve(root, id)
  const pulses = []
  if (!chain) return pulses
  const seen = new Set()
  let slots = null
  for (let level = chain.length - 1; level >= 0; level--) {
    const { graph, node } = chain[level]
    const links = outputLinks(graph, node, slots)
    flow(graph, links, now, timeOf, pulses, seen, 0)
    const out = graph.outputNode?.id
    slots = new Set(links.filter((link) => out != null && link.target_id === out).map((link) => link.target_slot))
    if (!slots.size) break
  }
  return pulses
}

export function follow(graph, links, timeOf, now) {
  const pulses = []
  flow(graph, links, now, timeOf, pulses, new Set(), 0)
  return pulses
}

function resolve(root, id) {
  const chain = []
  let graph = root
  for (const part of String(id).split(":")) {
    const node = graph?.getNodeById?.(part)
    if (!node) return null
    chain.push({ graph, node })
    graph = node.subgraph
  }
  return chain
}

function outputLinks(graph, node, slots) {
  const found = []
  for (const [slot, output] of (node.outputs ?? []).entries()) {
    if (slots && !slots.has(slot)) continue
    for (const id of output?.links ?? []) {
      const link = graph.getLink?.(id)
      if (link) found.push(link)
    }
  }
  return found
}

function flow(graph, links, start, timeOf, pulses, seen, hops) {
  if (hops > HOPS) return
  for (const link of links) {
    if (seen.has(link)) continue
    seen.add(link)
    const duration = timeOf(graph, link)
    pulses.push({ graph, link, start, duration })
    const target = graph.getNodeById?.(link.target_id)
    if (target?.isSubgraphNode?.()) {
      const inner = target.subgraph
      const ids = inner?.inputNode?.slots?.[link.target_slot]?.linkIds ?? []
      const next = ids.map((each) => inner.getLink?.(each)).filter(Boolean)
      flow(inner, next, start + duration, timeOf, pulses, seen, hops + 1)
    } else if (target?.isVirtualNode) {
      flow(graph, onward(graph, target, link.target_slot), start + duration, timeOf, pulses, seen, hops + 1)
    }
  }
}

function onward(graph, node, slot) {
  if (!isSetter(node)) return outputLinks(graph, node, null)
  const outputs = [{ node, slot }, ...readersOf(graph, node, slot)]
  return outputs.flatMap((output) => outputLinks(graph, output.node, new Set([output.slot])))
}

export function travelTime(length, scale, share) {
  const ms = Math.min(LONGEST_MS, Math.max(QUICKEST_MS, (1000 * length * scale) / PACE_PX))
  return ms / (share > 0 ? share : 1)
}

export function heads(pulse, now, length, tail) {
  const found = []
  for (let k = 0; k < (pulse.repeats ?? 1); k++) {
    const head = ((now - pulse.start - k * pulse.duration) / pulse.duration) * length
    if (head < 0) break
    if (head - tail < length) found.push(head)
  }
  return found
}

export function wireGlow(pulse, now, length, tail) {
  const begun = now - pulse.start
  const end = pulse.duration * ((pulse.repeats ?? 1) + (length > 0 ? tail / length : 0))
  if (begun < 0 || begun >= end) return 0
  return Math.min(1, begun / FADE_MS, (end - begun) / FADE_MS)
}

export function stretchOf(line, from, to) {
  const { points, lengths } = line
  const found = [pointAt(line, from)]
  for (let i = 0; i < points.length; i++) {
    if (lengths[i] > from && lengths[i] < to) found.push(points[i])
  }
  found.push(pointAt(line, to))
  return found
}

export function rgbOf(colour) {
  const text = typeof colour === "string" ? colour.trim() : ""
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])[0-9a-f]?$/i.exec(text)
  if (short) return short.slice(1, 4).map((digit) => parseInt(digit + digit, 16))
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(?:[0-9a-f]{2})?$/i.exec(text)
  if (long) return long.slice(1, 4).map((pair) => parseInt(pair, 16))
  return [255, 255, 255]
}

function paint(canvas, pulses, now, routeOf, alpha) {
  const { ctx, ds, graph } = canvas
  const mode = canvas.links_render_mode
  const width = Math.max(canvas.connections_width || 3, CORE_PX / ds.scale)
  const radius = Math.max(width * HALO * HEAD, HEAD_PX / ds.scale)
  const tail = TAIL_PX / ds.scale
  const kept = []
  const drawn = []
  for (const pulse of pulses) {
    const begun = now - pulse.start
    if (begun >= pulse.duration * ((pulse.repeats ?? 1) + TAIL_SHARE)) continue
    const link = pulse.link
    if (begun < 0 || pulse.graph !== graph || mode === HIDDEN || !canvas.renderedPaths?.has(link)) {
      kept.push(pulse)
      continue
    }
    if (graph.getLink(link.id) !== link) continue
    const route = wireLine(graph, link, mode, routeOf(link))
    const line = route && measure(route)
    if (!line?.length) continue
    const length = Math.min(tail, line.length * TAIL_SHARE)
    const glow = wireGlow(pulse, now, line.length, length)
    const found = heads(pulse, now, line.length, length)
    if (!glow && !found.length) continue
    kept.push(pulse)
    drawn.push({ line, length, glow, found, link })
  }
  if (!drawn.length) return kept
  ctx.save()
  ds.toCanvasContext(ctx)
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  const base = canvas.editor_alpha ?? 1
  for (const { line, glow, link } of drawn) {
    ctx.globalAlpha = base * alpha([link.id]) * glow * WIRE_ALPHA
    trace(ctx, line.points)
    ctx.strokeStyle = rgba(rgbOf(colourOf(canvas, link)), 1)
    ctx.lineWidth = width * HALO
    ctx.stroke()
  }
  for (const { line, length, found, link } of drawn) {
    ctx.globalAlpha = base * alpha([link.id])
    const rgb = rgbOf(colourOf(canvas, link))
    for (const head of found) comet(ctx, line, head, length, rgb, width, radius)
  }
  ctx.restore()
  return kept
}

function trace(ctx, points) {
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (const point of points.slice(1)) ctx.lineTo(point[0], point[1])
}

function comet(ctx, line, head, length, rgb, width, radius) {
  const white = rgb.map((part) => Math.round(part + (255 - part) * WHITE_SHARE))
  const back = head - length
  const from = Math.max(0, back)
  const to = Math.min(line.length, head)
  if (to > from) {
    const points = stretchOf(line, from, to)
    const a = points[0]
    const b = points.at(-1)
    if (a[0] !== b[0] || a[1] !== b[1]) {
      const near = (from - back) / length
      const far = (to - back) / length
      for (const [colour, wide, share] of [[rgb, width * HALO, HALO_ALPHA], [white, width, 1]]) {
        const gradient = ctx.createLinearGradient(a[0], a[1], b[0], b[1])
        gradient.addColorStop(0, rgba(colour, share * near))
        gradient.addColorStop(1, rgba(colour, share * far))
        trace(ctx, points)
        ctx.strokeStyle = gradient
        ctx.lineWidth = wide
        ctx.stroke()
      }
    }
  }
  if (head > line.length) return
  const [x, y] = pointAt(line, head)
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius)
  glow.addColorStop(0, rgba([255, 255, 255], 1))
  glow.addColorStop(0.3, rgba(white, 0.9))
  glow.addColorStop(0.6, rgba(rgb, 0.4))
  glow.addColorStop(1, rgba(rgb, 0))
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, 2 * Math.PI)
  ctx.fillStyle = glow
  ctx.fill()
}

function rgba([r, g, b], a) {
  return "rgba(" + r + ", " + g + ", " + b + ", " + Math.round(Math.min(1, Math.max(0, a)) * 1000) / 1000 + ")"
}

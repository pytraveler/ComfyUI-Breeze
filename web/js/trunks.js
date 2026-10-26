import { colourOf } from "./wire_hover.js"

const LEFT = 3
const RIGHT = 4
const CENTER = 5

const HIDDEN = -1
const NO_MARKER = 0

const AHEAD = 160

const BAND = 160
const BAND_SHARE = 0.3

const REACH_MIN = 60
const REACH_MAX = 400
const REACH_SHARE = 1 / 3

const TRUNK_MIN = 60

const REROUTE_REACH = 80

const DOT = 0.9
const RING = 1.2

const MARGIN = 20

export function installTrunks(canvas, { enabled, alpha = () => 1 }) {
  const proto = Object.getPrototypeOf(canvas)
  const { drawConnections, _renderAllLinkSegments: renderAll } = proto
  let frame = null
  let last = null
  const routeOf = (link) => (link && last && canvas.graph === last.graph && last.routes.get(link.id)) || null
  if (typeof drawConnections !== "function" || typeof renderAll !== "function") return { routeOf }

  const flush = (ctx) => {
    if (frame?.pending.length) drawHeld(canvas, ctx, frame, renderAll)
  }

  proto.drawConnections = function (ctx, ...rest) {
    if (this !== canvas) return drawConnections.call(this, ctx, ...rest)
    frame = this.graph && this.links_render_mode !== HIDDEN && enabled() ? begin(this.graph, alpha, ctx) : null
    try {
      const result = drawConnections.call(this, ctx, ...rest)
      if (frame) {
        ctx.save()
        ctx.globalAlpha = this.editor_alpha ?? 1
        flush(ctx)
        ctx.restore()
        dots(this, ctx, frame)
      }
      return result
    } finally {
      last = frame
      frame = null
    }
  }

  proto._renderAllLinkSegments = function (ctx, link, startPos, endPos, visibleReroutes, renderedSegments, now,
    startDir, endDir, disabled = false, atBadge = false) {
    if (!frame || this !== canvas || !link || disabled || atBadge || !frame.fanned.has(link.id)) {
      return renderAll.apply(this, arguments)
    }
    frame.pending.push({ args: [...arguments], link, end: endPos, start: startPos,
      startDir: startDir || RIGHT, endDir: endDir || LEFT })
  }

  const held = Object.getOwnPropertyDescriptor(canvas, "_visibleReroutes")
  if (held && "value" in held && held.configurable) {
    let value = held.value
    Object.defineProperty(canvas, "_visibleReroutes", {
      configurable: true,
      enumerable: held.enumerable,
      get() {
        if (frame) flush(frame.ctx)
        return value
      },
      set(next) {
        value = next
      },
    })
  }

  return { routeOf }
}

export function splits(source, targets) {
  const ahead = targets.filter(({ at }) => at[0] - source[0] >= AHEAD)
    .sort((a, b) => a.at[0] - b.at[0])
  const columns = []
  for (const target of ahead) {
    const column = columns.at(-1)
    const width = column ? Math.max(BAND, (column.left - source[0]) * BAND_SHARE) : 0
    if (column && target.at[0] - column.left <= width) column.members.push(target)
    else columns.push({ left: target.at[0], members: [target] })
  }
  return columns.filter(({ members }) => members.length > 1).map(({ left, members }) => {
    const ys = members.map(({ at }) => at[1]).sort((a, b) => a - b)
    const half = Math.floor(ys.length / 2)
    const middle = ys.length % 2 ? ys[half] : (ys[half - 1] + ys[half]) / 2
    const spread = Math.max(middle - ys[0], ys.at(-1) - middle)
    const reach = Math.min(REACH_MAX, Math.max(REACH_MIN, spread * REACH_SHARE))
    return {
      split: [Math.max(left - reach, source[0] + TRUNK_MIN), middle],
      ids: members.map(({ id }) => id),
    }
  })
}

export function route(source, split, target, startDir = RIGHT, endDir = LEFT) {
  return [
    { a: source, b: split, startDir, endDir: CENTER, startControl: null, endControl: [-reach(source, split), 0] },
    { a: split, b: target, startDir: CENTER, endDir, startControl: [reach(split, target), 0], endControl: null },
  ]
}

function reach(a, b) {
  return Math.min(REROUTE_REACH, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.25)
}

function begin(graph, alpha, ctx) {
  const tied = tiedLinks(graph)
  const outputs = new Map()
  for (const link of graph.links?.values?.() ?? []) {
    if (!link || link.parentId != null || link._dragging || tied.has(link.id)) continue
    const key = keyOf(link)
    const list = outputs.get(key)
    if (list) list.push(link.id)
    else outputs.set(key, [link.id])
  }
  const fanned = new Set()
  for (const ids of outputs.values()) if (ids.length > 1) for (const id of ids) fanned.add(id)
  return { graph, alpha, ctx, fanned, pending: [], trunks: [], routes: new Map() }
}

function tiedLinks(graph) {
  const ties = graph.extra?.zipTies
  const found = new Set()
  for (const tie of Array.isArray(ties) ? ties : []) {
    for (const key of Array.isArray(tie?.links) ? tie.links : []) {
      if (typeof key === "number") found.add(key)
    }
  }
  return found
}

function keyOf(link) {
  return link.origin_id + ":" + link.origin_slot
}

function drawHeld(canvas, ctx, frame, renderAll) {
  const held = frame.pending
  frame.pending = []
  const byOutput = new Map()
  for (const call of held) {
    const key = keyOf(call.link)
    const list = byOutput.get(key)
    if (list) list.push(call)
    else byOutput.set(key, [call])
  }
  const trunkOf = new Map()
  for (const calls of byOutput.values()) {
    const [{ start, startDir }] = calls
    if (calls.length < 2 || startDir !== RIGHT) continue
    const targets = calls.filter((call) => call.endDir === LEFT).map((call) => ({ id: call.link.id, at: call.end }))
    for (const { split, ids } of splits(start, targets)) {
      const trunk = { start: [start[0], start[1]], split, ids: new Set(ids), path: null, shown: false, colour: null }
      frame.trunks.push(trunk)
      for (const id of ids) trunkOf.set(id, trunk)
    }
  }
  for (const call of held) {
    const trunk = trunkOf.get(call.link.id)
    if (trunk) drawOnTrunk(canvas, ctx, frame, trunk, call.link, call.end, call.endDir)
    else renderAll.apply(canvas, call.args)
  }
}

function drawOnTrunk(canvas, ctx, frame, trunk, link, end, endDir) {
  if (!onScreen(canvas, [trunk.start, trunk.split, end])) return
  const [stem, branch] = route(trunk.start, trunk.split, end, RIGHT, endDir)
  if (!trunk.shown) drawStem(canvas, ctx, frame, trunk, link, stem)
  canvas.renderLink(ctx, branch.a, branch.b, link, false, 0, null, branch.startDir, branch.endDir,
    { startControl: branch.startControl })
  if (trunk.path && typeof Path2D === "function" && link.path instanceof Path2D) {
    const path = new Path2D(trunk.path)
    path.addPath(link.path)
    link.path = path
  }
  canvas.renderedPaths?.add(link)
  frame.routes.set(link.id, [stem, branch])
}

function drawStem(canvas, ctx, frame, trunk, link, stem) {
  const lead = leadOf(canvas, frame, trunk, link)
  const kept = { path: lead.path, pos: lead._pos ? [lead._pos[0], lead._pos[1]] : null, angle: lead._centreAngle }
  const marker = canvas.linkMarkerShape
  canvas.linkMarkerShape = NO_MARKER
  try {
    canvas.renderLink(ctx, stem.a, stem.b, lead, false, 0, null, stem.startDir, stem.endDir,
      { endControl: stem.endControl })
  } finally {
    canvas.linkMarkerShape = marker
  }
  trunk.path = lead.path !== kept.path ? lead.path : null
  trunk.shown = true
  trunk.colour = canvas.highlighted_links?.[lead.id] ? "#fff" : colourOf(canvas, lead)
  lead.path = kept.path
  if (kept.pos) {
    lead._pos[0] = kept.pos[0]
    lead._pos[1] = kept.pos[1]
  }
  lead._centreAngle = kept.angle
}

function leadOf(canvas, frame, trunk, link) {
  const ids = [...trunk.ids]
  const highlighted = ids.find((id) => canvas.highlighted_links?.[id])
  const lit = frame.alpha([link.id]) < 1 ? ids.find((id) => frame.alpha([id]) >= 1) : undefined
  const id = highlighted ?? lit
  return (id != null && frame.graph.getLink(id)) || link
}

function onScreen(canvas, points) {
  const area = canvas.visible_area
  if (!area) return true
  const [x, y, width, height] = area
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  return Math.max(...xs) >= x - MARGIN && Math.min(...xs) <= x + width + MARGIN
    && Math.max(...ys) >= y - MARGIN && Math.min(...ys) <= y + height + MARGIN
}

function dots(canvas, ctx, frame) {
  const radius = DOT * (canvas.connections_width || 3)
  ctx.save()
  for (const trunk of frame.trunks) {
    if (!trunk.shown) continue
    const [x, y] = trunk.split
    ctx.globalAlpha = (canvas.editor_alpha ?? 1) * frame.alpha(trunk.ids)
    ctx.beginPath()
    ctx.arc(x, y, radius + RING, 0, 2 * Math.PI)
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)"
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, 2 * Math.PI)
    ctx.fillStyle = trunk.colour
    ctx.fill()
  }
  ctx.restore()
}

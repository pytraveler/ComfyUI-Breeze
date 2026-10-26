import { drawGlow } from "./glow.js"
import { lineage, roleOf, sameLineage, selectedNodeIds } from "./graph_walk.js"

const BOX = 1

const PAD = 4

const OUTLINE_PX = 2

const LINK_FLOOR = 0.06

export function installLineage(canvas, { enabled, fade, colors, glow = () => 0 }) {
  const proto = Object.getPrototypeOf(canvas)
  const state = { lineage: null, graph: null, fade: 0, colors: {}, glow: 0, faded: new Map() }
  const { draw, renderLink, drawNode } = proto

  proto.draw = function (...args) {
    if (this === canvas) {
      state.colors = colors()
      state.glow = glow()
      if (update(this, state, enabled(), fade())) {
        this.dirty_bgcanvas = true
        this.dirty_canvas = true
      }
    }
    return draw.apply(this, args)
  }

  proto.renderLink = function (ctx, a, b, link) {
    const found = state.lineage
    if (this !== canvas || !found || !link || lit(found, link, arguments[9])) {
      return renderLink.apply(this, arguments)
    }
    const alpha = ctx.globalAlpha
    ctx.globalAlpha = alpha * dimmed(state)
    try {
      return renderLink.apply(this, arguments)
    } finally {
      ctx.globalAlpha = alpha
    }
  }

  proto.drawNode = function (node, ctx) {
    const result = drawNode.apply(this, arguments)
    const found = state.lineage
    if (this === canvas && found && !globalThis.LiteGraph?.vueNodesMode) {
      paint(this, node, ctx, found, state)
    }
    return result
  }

  const alpha = (ids) => {
    const found = state.lineage
    if (!found) return 1
    for (const id of ids) if (found.links.has(id)) return 1
    return dimmed(state)
  }
  return { alpha }
}

function dimmed(state) {
  return Math.max(LINK_FLOOR, 1 - state.fade)
}

function update(canvas, state, on, fade) {
  const graph = canvas.graph ?? null
  const ids = on && graph ? selectedNodeIds(graph, canvas.selectedItems) : null
  const next = ids?.size ? lineage(graph.links.values(), ids) : null
  const changed = state.graph !== graph || state.fade !== fade
    || !sameLineage(state.lineage, next)
  state.graph = graph
  state.fade = fade
  state.lineage = next
  if (changed) fadeWidgets(state)
  return changed
}

function lit(found, link, options) {
  const reroute = options?.reroute
  if (!reroute?.linkIds) return found.links.has(link.id)
  for (const id of reroute.linkIds) if (found.links.has(id)) return true
  return false
}

function paint(canvas, node, ctx, found, { fade, colors, glow }) {
  if (found.selected.has(node.id)) return
  const role = roleOf(found, node.id)
  if (!role && fade <= 0) return
  const [x, y, width, height] = node.boundingRect
  const left = x - node.pos[0]
  const top = y - node.pos[1]
  const radius = node.renderingShape === BOX ? 0 : (globalThis.LiteGraph?.ROUND_RADIUS ?? 8)
  ctx.save()
  if (role) {
    const ring = [left - PAD, top - PAD, width + 2 * PAD, height + 2 * PAD]
    drawGlow(ctx, ring, { radius: glow, corner: radius + PAD, colour: colors[role], scale: canvas.ds.scale })
    ctx.beginPath()
    ctx.globalAlpha = 1
    ctx.lineWidth = OUTLINE_PX / Math.min(1, canvas.ds.scale)
    ctx.strokeStyle = colors[role]
    ctx.roundRect(...ring, radius + PAD)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.globalAlpha = fade
    ctx.fillStyle = canvas.clear_background_color || "#222"
    ctx.roundRect(left, top, width, height, radius)
    ctx.fill()
  }
  ctx.restore()
}

function fadeWidgets(state) {
  const found = state.lineage
  const keep = new Set()
  for (const node of found ? state.graph?.nodes ?? [] : []) {
    if (found.selected.has(node.id) || roleOf(found, node.id)) continue
    for (const widget of node.widgets ?? []) {
      const element = widget.element
      if (!(element instanceof HTMLElement)) continue
      keep.add(element)
      if (!state.faded.has(element)) state.faded.set(element, element.style.opacity)
      element.style.opacity = String(dimmed(state))
    }
  }
  for (const [element, opacity] of state.faded) {
    if (keep.has(element)) continue
    element.style.opacity = opacity
    state.faded.delete(element)
  }
}

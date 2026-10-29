import { drawGlow } from "./glow.js"
import { lineage, roleOf, sameLineage, selectedNodeIds } from "./graph_walk.js"
import { matchesVirtual, virtualPairs, virtualRole, wiring } from "./set_get.js"
import { nodeSelector, outlined, rule, styleSheet, vueNodes } from "./vue_nodes.js"

const BOX = 1

const PAD = 4

const OUTLINE_PX = 2

const LINK_FLOOR = 0.06

const ROLES = ["up", "down", "both"]

export function installLineage(canvas, { enabled, fade, colors, glow = () => 0 }) {
  const proto = Object.getPrototypeOf(canvas)
  const state = {
    lineage: null, graph: null, fade: 0, colors: {}, glow: 0, vue: false, faded: new Map(),
    sheet: styleSheet(), styled: null,
    pairs: [],
  }
  const { draw, renderLink, drawNode } = proto

  proto.draw = function (...args) {
    if (this === canvas) {
      state.colors = colors()
      state.glow = glow()
      const changed = update(this, state, enabled(), fade(), vueNodes())
      if (changed) {
        this.dirty_bgcanvas = true
        this.dirty_canvas = true
      }
      restyle(state, changed)
    }
    return draw.apply(this, args)
  }

  proto.renderLink = function (ctx, a, b, link) {
    const found = state.lineage
    if (this !== canvas || !found || (link && lit(found, link, arguments[9]))) {
      return renderLink.apply(this, arguments)
    }
    if (!link) {
      const pairs = state.pairs.filter((pair) => matchesVirtual(pair, a, b))
      if (!pairs.length) return renderLink.apply(this, arguments)
      if (pairs.some((pair) => virtualRole(found, pair.key))) return
    }
    const alpha = ctx.globalAlpha
    ctx.globalAlpha = alpha * dimmed(state)
    try {
      return renderLink.apply(this, arguments)
    } finally {
      ctx.globalAlpha = alpha
    }
  }

  const onRender = canvas.onRender
  canvas.onRender = function (...args) {
    onRender?.apply(this, args)
    if (state.lineage && this === canvas) paintVirtual(this, state)
  }

  proto.drawNode = function (node, ctx) {
    const result = drawNode.apply(this, arguments)
    const found = state.lineage
    if (this === canvas && found && !state.vue) {
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

function paintVirtual(canvas, state) {
  const { ctx, ds } = canvas
  if (!ctx || !ds?.toCanvasContext || canvas.links_render_mode === -1) return
  ctx.save()
  ds.toCanvasContext(ctx)
  const scale = ds.scale || 1
  ctx.lineWidth = 1.5 / scale
  ctx.setLineDash([6 / scale, 5 / scale])
  ctx.globalAlpha = 0.85
  for (const pair of state.pairs) {
    const role = virtualRole(state.lineage, pair.key)
    if (!role) continue
    const { setter, getter, input, output } = pair
    const a = setter.getConnectionPos?.(Boolean(!setter.outputs?.[input]), input)
    const b = getter.getConnectionPos?.(false, output)
    if (!a || !b) continue
    const start = [setter.boundingRect[0] + setter.boundingRect[2], a[1]]
    const end = [getter.boundingRect[0], b[1]]
    const bend = Math.max(40, Math.abs(end[0] - start[0]) * 0.4)
    ctx.strokeStyle = state.colors[role]
    ctx.beginPath()
    ctx.moveTo(...start)
    ctx.bezierCurveTo(start[0] + bend, start[1], end[0] - bend, end[1], ...end)
    ctx.stroke()
  }
  ctx.restore()
}

function update(canvas, state, on, fade, vue) {
  const graph = canvas.graph ?? null
  const ids = on && graph ? selectedNodeIds(graph, canvas.selectedItems) : null
  const wires = ids?.size ? wiring(graph) : null
  const next = wires ? lineage(graph.links.values(), ids, wires) : null
  state.pairs = wires ? virtualPairs(graph, wires.edges) : []
  const changed = state.graph !== graph || state.fade !== fade || state.vue !== vue
    || !sameLineage(state.lineage, next)
  state.graph = graph
  state.fade = fade
  state.vue = vue
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

function restyle(state, changed) {
  const key = state.vue ? JSON.stringify([state.colors, state.glow, state.graph?.nodes?.length ?? 0]) : null
  if (!changed && key === state.styled) return
  state.styled = key
  state.sheet(state.vue ? vueStyle(state.lineage, state.graph?.nodes ?? [], state) : "")
}

export function vueStyle(found, nodes, { fade, colors, glow }) {
  if (!found) return ""
  const lit = { up: [], down: [], both: [] }
  const faded = []
  for (const node of nodes) {
    if (found.selected.has(node.id)) continue
    const role = roleOf(found, node.id)
    if (role) lit[role].push(nodeSelector(node.id))
    else if (fade > 0) faded.push(nodeSelector(node.id))
  }
  const rules = ROLES.flatMap((role) => outlined(lit[role], colors[role], { glow }))
  if (faded.length) rules.push(rule(faded, "opacity: " + dimmed({ fade }) + " !important;"))
  return rules.join(" ")
}

function fadeWidgets(state) {
  const found = state.vue ? null : state.lineage
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

import { drawGlow } from "./glow.js"
import { duration, onCanvas, summaryLines } from "./forecast.js"
import { nodeSelector, outlined, rule, styleSheet, vueNodes } from "./vue_nodes.js"
import { english } from "./words.js"

export const RUN_BUTTON = '[data-testid="queue-button"]'

export const COLOURS = { cached: "#4fcf73", run: "#ff8a3d", always: "#ffd23f", maybe: "#ff8a3d" }

const BOX = 1

const PAD = 4

const OUTLINE_PX = 2

const FONT_PX = 11
const DOT_PX = 3.5
const GAP_PX = 5

const SCALE_FLOOR = 0.5

const UNIT_STEP = 10

const TAG_BACKGROUND = "rgba(20, 20, 20, 0.85)"

const TIP_GAP = 8
const MARGIN = 8

const SETTLE_STEP_MS = 150
const SETTLE_TRIES = 10

export function installForecast(canvas, { mode, glow = () => 0, say = english, isRoot, build, send, feed, redraw }) {
  const proto = Object.getPrototypeOf(canvas)
  const { draw, drawNode } = proto
  const state = { hover: null, button: null, pressed: null, ticket: 0, result: null, tags: null }
  const frame = { shown: null, outline: false, glow: 0, unit: 1 }
  const adopted = new WeakSet()
  const sheet = styleSheet()
  let styled = null
  let tip = null

  const foundFor = (node) => frame.shown?.get(String(node.id)) ?? null

  const adopt = (node) => {
    if (adopted.has(node) || !Array.isArray(node.badges)) return
    adopted.add(node)
    const badge = {
      get height() {
        return foundFor(node) ? tagHeight(frame.unit) : 0
      },
      getWidth: (ctx) => {
        const found = foundFor(node)
        return found ? tagWidth(ctx, tagText(found, say), frame.unit) : 0
      },
      draw: (ctx, x, y) => {
        const found = foundFor(node)
        if (found) tag(ctx, found.state, tagText(found, say), x, y, frame.unit)
      },
    }
    node.badges.push(() => badge)
  }

  proto.draw = function (...args) {
    if (this === canvas) {
      feed.poll()
      const result = mode() === "always" ? feed.result() : null
      if (result !== state.result) {
        state.result = result
        state.tags = result ? onCanvas(result.nodes) : null
      }
      frame.shown = isRoot() ? state.hover ?? state.tags : null
      frame.outline = Boolean(state.hover)
      frame.glow = glow()
      frame.unit = 1 / Math.min(1, Math.max(SCALE_FLOOR, this.ds.scale))
      const look = vueNodes() ? { ...frame, unit: Math.round(frame.unit * UNIT_STEP) / UNIT_STEP } : null
      if (!sameLook(look, styled)) {
        styled = look
        sheet(look ? vueStyle(look.shown, look, say) : "")
      }
    }
    return draw.apply(this, args)
  }

  proto.drawNode = function (node, ctx) {
    if (this === canvas) adopt(node)
    const result = drawNode.apply(this, arguments)
    const found = this === canvas && !vueNodes() ? foundFor(node) : null
    if (found) paint(this, node, ctx, found, frame, say)
    return result
  }

  const enter = async (button) => {
    if (mode() === "off") return
    const mine = ++state.ticket
    state.button = button
    const request = await build().catch(() => null)
    const result = request ? await send(request).catch(() => null) : null
    if (mine !== state.ticket) return
    state.hover = result?.nodes ? onCanvas(result.nodes) : null
    tip ??= createTip()
    fillTip(tip, say("forecastTitle"), summaryLines(result, say))
    placeTip(tip, button.getBoundingClientRect())
    redraw()
    let tries = 0
    const again = () => {
      if (mine !== state.ticket || tip.hidden) return
      placeTip(tip, button.getBoundingClientRect())
      if (++tries < SETTLE_TRIES) setTimeout(again, SETTLE_STEP_MS)
    }
    setTimeout(again, SETTLE_STEP_MS)
  }

  const leave = () => {
    state.ticket++
    state.button = null
    if (tip) tip.hidden = true
    if (!state.hover) return
    state.hover = null
    redraw()
  }

  document.addEventListener("pointerover", (event) => {
    const button = event.target?.closest?.(RUN_BUTTON)
    if (button && button !== state.button && button !== state.pressed) enter(button)
  })
  document.addEventListener("pointerout", (event) => {
    const button = state.button ?? state.pressed
    if (!button || button.contains(event.relatedTarget)) return
    state.pressed = null
    leave()
  })
  document.addEventListener("pointerdown", (event) => {
    if (!state.button?.contains(event.target)) return
    state.pressed = state.button
    leave()
  }, true)

  return { showing: () => Boolean(state.hover) }
}

function paint(canvas, node, ctx, found, { outline, glow, unit }, say) {
  const [x, y, width, height] = node.boundingRect
  const left = x - node.pos[0]
  const top = y - node.pos[1]
  const radius = node.renderingShape === BOX ? 0 : (globalThis.LiteGraph?.ROUND_RADIUS ?? 8)
  const colour = COLOURS[found.state]
  ctx.save()
  if (outline) {
    const ring = [left - PAD, top - PAD, width + 2 * PAD, height + 2 * PAD]
    drawGlow(ctx, ring, { radius: glow, corner: radius + PAD, colour, scale: canvas.ds.scale })
    ctx.beginPath()
    ctx.globalAlpha = 1
    ctx.lineWidth = OUTLINE_PX / Math.min(1, canvas.ds.scale)
    ctx.strokeStyle = colour
    if (found.state === "maybe") ctx.setLineDash([6 * unit, 4 * unit])
    ctx.roundRect(...ring, radius + PAD)
    ctx.stroke()
    ctx.setLineDash([])
  }
  if (canvas.low_quality) {
    const text = tagText(found, say)
    const bottom = top - (outline ? PAD : 0) - GAP_PX * unit
    tag(ctx, found.state, text, left + width - tagWidth(ctx, text, unit), bottom - tagHeight(unit), unit)
  }
  ctx.restore()
}

function sameLook(a, b) {
  if (!a || !b) return a === b
  return a.shown === b.shown && a.outline === b.outline && a.glow === b.glow && a.unit === b.unit
}

export function vueStyle(shown, { outline = false, glow = 0, unit = 1 } = {}, say = english) {
  if (!shown?.size) return ""
  const rules = []
  if (outline) {
    const states = new Map()
    for (const [id, found] of shown) {
      const selectors = states.get(found.state) ?? []
      selectors.push(nodeSelector(id))
      states.set(found.state, selectors)
    }
    for (const [state, selectors] of states) {
      rules.push(...outlined(selectors, COLOURS[state], { glow, dashed: state === "maybe" }))
    }
  }
  for (const [id, found] of shown) {
    rules.push(rule([nodeSelector(id) + "::after"], tagStyle(found.state, tagText(found, say), unit, outline)))
  }
  return rules.join(" ")
}

function tagStyle(state, text, unit, outline) {
  const colour = COLOURS[state]
  const height = tagHeight(unit)
  const pad = 5 * unit
  const dot = DOT_PX * unit
  const centre = text ? px(pad + dot) : "50%"
  const mark = state === "maybe"
    ? [px(dot - 0.75 * unit - 0.5), px(dot - 0.75 * unit), px(dot + 0.75 * unit), px(dot + 0.75 * unit + 0.5)]
    : [null, null, px(dot), px(dot + 0.5)]
  const stops = (mark[0] ? ["transparent " + mark[0], colour + " " + mark[1]] : [])
    .concat([colour + " " + mark[2], "transparent " + mark[3]])
  return [
    "content: " + JSON.stringify(text),
    "position: absolute",
    "right: 0",
    "bottom: calc(100% + " + px(GAP_PX * unit + (outline ? PAD : 0)) + ")",
    "box-sizing: border-box",
    "height: " + px(height),
    "min-width: " + px(height),
    "padding: 0 " + px(text ? pad : 0) + " 0 " + px(text ? pad + 2 * dot + 4 * unit : 0),
    "border-radius: " + px(height / 2),
    "background: radial-gradient(circle at " + centre + " 50%, " + stops.join(", ") + "), " + TAG_BACKGROUND,
    "color: " + colour,
    "font: " + px(FONT_PX * unit) + "/" + px(height) + " system-ui, sans-serif",
    "white-space: nowrap",
    "pointer-events: none",
  ].join("; ") + ";"
}

function px(value) {
  return Math.round(value * 100) / 100 + "px"
}

function tagText(found, say) {
  return found.computed && found.timed ? duration(found.seconds, say) : ""
}

function tagHeight(unit) {
  return (FONT_PX + 6) * unit
}

function tagWidth(ctx, text, unit) {
  if (!text) return tagHeight(unit)
  const font = ctx.font
  ctx.font = FONT_PX * unit + "px system-ui, sans-serif"
  const width = ctx.measureText(text).width
  ctx.font = font
  return 10 * unit + 2 * DOT_PX * unit + 4 * unit + width
}

function tag(ctx, state, text, left, top, unit) {
  const colour = COLOURS[state]
  const height = tagHeight(unit)
  const width = tagWidth(ctx, text, unit)
  const pad = 5 * unit
  const dot = DOT_PX * unit
  ctx.save()
  ctx.font = FONT_PX * unit + "px system-ui, sans-serif"
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.fillStyle = TAG_BACKGROUND
  ctx.roundRect(left, top, width, height, height / 2)
  ctx.fill()
  const cx = text ? left + pad + dot : left + width / 2
  const cy = top + height / 2
  ctx.beginPath()
  ctx.arc(cx, cy, dot, 0, 2 * Math.PI)
  if (state === "maybe") {
    ctx.lineWidth = 1.5 * unit
    ctx.strokeStyle = colour
    ctx.stroke()
  } else {
    ctx.fillStyle = colour
    ctx.fill()
  }
  if (text) {
    ctx.fillStyle = colour
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(text, cx + dot + 4 * unit, cy)
  }
  ctx.restore()
}

function createTip() {
  const tip = document.createElement("div")
  tip.className = "breeze-wire-tip breeze-forecast-tip"
  tip.hidden = true
  document.body.append(tip)
  return tip
}

function fillTip(tip, title, lines) {
  const rows = [row("bwt-type", title)]
  for (const line of lines) {
    const item = row("bft-line", line.text)
    if (line.state) item.prepend(dot(line.state))
    rows.push(item)
  }
  tip.replaceChildren(...rows)
}

function row(name, text) {
  const item = document.createElement("div")
  item.className = name
  item.textContent = text
  return item
}

function dot(state) {
  const item = document.createElement("span")
  item.className = "bwt-dot"
  if (state === "maybe") item.style.border = "2px solid " + COLOURS[state]
  else item.style.background = COLOURS[state]
  return item
}

function placeTip(tip, rect) {
  tip.hidden = false
  const { offsetWidth: width, offsetHeight: height } = tip
  const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN))
  let below = rect.bottom + TIP_GAP
  for (const other of document.querySelectorAll('[role="tooltip"]')) {
    const box = other.getBoundingClientRect()
    if (!box.width || box.right <= left || box.left >= left + width || box.top > below + height) continue
    below = Math.max(below, box.bottom + TIP_GAP)
  }
  const top = below + height + MARGIN <= window.innerHeight ? below : rect.top - TIP_GAP - height
  tip.style.left = left + "px"
  tip.style.top = Math.max(MARGIN, top) + "px"
}

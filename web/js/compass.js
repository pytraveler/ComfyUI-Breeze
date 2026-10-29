import { around, fly } from "./flight.js"
import { english } from "./words.js"

const ARROW_PX = 20
const HALF_PX = 8
const NOTCH = 0.6
const EDGE_PX = 12

const LABEL_PX = 20
const LABEL_PAD_PX = 7
const LABEL_GAP_PX = 6
const FONT = "12px system-ui, sans-serif"
const TITLE_CHARS = 28

const SEEN_PX = 24
const LINK_SHARE = 0.25
const CLASH_PX = 6
const HIT_PX = 4

const DIM = 0.7
const NEUTRAL = "#d8d8d8"

const SCAN_SAMPLES = 7
const SCAN_STEP_PX = 8
const SCAN_RUN_PX = 24
const SCAN_SHARE = 0.4
const SCAN_MS = 1000

const NOTE_MS = 500
const NOTE_NAMES = 12
const NOTE_GAP_PX = 8
const NOTE_MARGIN_PX = 8
const TIMES = String.fromCharCode(0xd7)

const PASS = '[data-node-id], .dom-widget, .breeze-wire-tip, [role="tooltip"]'

export function installCompass(canvas, { mode, note = () => true, say = english, hidden: hiddenNode = () => false }) {
  const element = canvas.canvas
  const proto = Object.getPrototypeOf(canvas)
  const { drawFrontCanvas } = proto
  let shown = []
  let dim = false
  let pointer = null
  let hot = -1
  let cursor = ""
  let held = null
  let stop = null
  let probe = null
  let area = { at: -Infinity, key: "", rect: null }
  let retry = 0
  let tip = null
  let timer = 0

  const unnote = () => {
    clearTimeout(timer)
    timer = 0
    if (tip) tip.hidden = true
  }

  const renote = () => {
    unnote()
    if (hot < 0 || !note()) return
    const index = hot
    timer = setTimeout(() => {
      timer = 0
      const arrow = shown[index]
      if (hot !== index || !arrow || !note()) return
      tip ??= createNote()
      fillNote(tip, noteOf(arrow.cluster), say)
      placeNote(tip, element.getBoundingClientRect(), arrow.box)
    }, NOTE_MS)
  }

  const width = (text) => {
    probe ??= document.createElement("canvas").getContext("2d")
    probe.font = FONT
    return probe.measureText(text).width
  }

  const clear = () => {
    const box = element.getBoundingClientRect()
    const size = canvas.ds.getViewportSize?.() ?? [element.clientWidth, element.clientHeight]
    const key = [box.left, box.top, ...size].join()
    const now = performance.now()
    if (area.key === key && now - area.at < SCAN_MS) return area.rect
    const open = (x, y) => {
      const hit = document.elementFromPoint(box.left + x, box.top + y)
      return hit === element || Boolean(hit?.closest?.(PASS))
    }
    area = { at: now, key, rect: clearArea(size, open) }
    return area.rect
  }

  const later = () => {
    if (retry) return
    retry = setTimeout(() => {
      retry = 0
      canvas.setDirty(true, false)
    }, SCAN_MS)
  }

  const survey = () => {
    const current = mode()
    const nodes = (canvas.graph?.nodes ?? []).filter((node) => !hiddenNode(node))
    if (current === "off" || stop || !nodes.length) return []
    const open = clear()
    const safe = inset(open, EDGE_PX)
    if (safe[2] < 4 * ARROW_PX || safe[3] < 4 * ARROW_PX) {
      later()
      return []
    }
    const { offset, scale } = canvas.ds
    const view = canvasRect(open, offset, scale)
    const items = nodes.map((node) => ({ rect: [...node.boundingRect], title: node.getTitle?.() ?? node.title ?? "" }))
    const hidden = items.filter((item) => !seenIn(item.rect, view, SEEN_PX / scale))
    if (!hidden.length || (current !== "always" && hidden.length < items.length)) return []
    dim = hidden.length < items.length
    const groups = (canvas.graph.groups ?? []).map((group) => ({
      rect: [...group.boundingRect], title: group.title ?? "", colour: group.color ?? null,
    }))
    const found = gather(hidden, groups, view, LINK_SHARE * Math.min(view[2], view[3]))
    return layout(found, { offset, scale }, safe, width)
  }

  const hover = (index) => {
    if (index === hot) return false
    if (index >= 0 && hot < 0) {
      cursor = element.style.cursor
      element.style.cursor = "pointer"
    }
    if (index < 0) element.style.cursor = cursor
    hot = index
    renote()
    return true
  }

  const heat = (index) => {
    if (hover(index)) canvas.setDirty(true, false)
  }

  const local = (event) => {
    const box = element.getBoundingClientRect()
    return [event.clientX - box.left, event.clientY - box.top]
  }

  const halt = () => {
    stop?.()
    stop = null
  }

  proto.drawFrontCanvas = function (...args) {
    const result = drawFrontCanvas.apply(this, args)
    if (this !== canvas) return result
    shown = survey()
    const lit = pointer ? arrowAt(shown, pointer) : null
    hover(lit ? shown.indexOf(lit) : -1)
    paint(this.ctx, shown, lit, dim)
    return result
  }

  element.addEventListener("pointermove", (event) => {
    pointer = event.buttons ? null : local(event)
    const arrow = pointer ? arrowAt(shown, pointer) : null
    heat(arrow ? shown.indexOf(arrow) : -1)
  })
  element.addEventListener("pointerleave", () => {
    pointer = null
    heat(-1)
  })
  element.addEventListener("wheel", () => {
    halt()
    renote()
  }, { passive: true })

  window.addEventListener("pointerdown", (event) => {
    if (event.target !== element) return
    halt()
    const arrow = event.button === 0 ? arrowAt(shown, local(event)) : null
    if (!arrow) return
    event.preventDefault()
    event.stopImmediatePropagation()
    held = event.pointerId
    pointer = null
    heat(-1)
    stop = fly(canvas, arrow.cluster.goals, () => {
      stop = null
      canvas.setDirty(true, false)
    })
  }, true)
  window.addEventListener("pointerup", (event) => {
    if (event.pointerId !== held) return
    held = null
    event.preventDefault()
    event.stopImmediatePropagation()
  }, true)
}

export function clearArea([width, height], open) {
  const side = (at, most) => {
    let depth = -1
    for (let i = 1; i <= SCAN_SAMPLES; i++) {
      const along = i / (SCAN_SAMPLES + 1)
      let start = 0
      for (let d = 0; d <= most; d += SCAN_STEP_PX) {
        if (!open(...at(along, d))) start = d + SCAN_STEP_PX
        else if (d - start >= SCAN_RUN_PX) break
      }
      if (start <= most) depth = Math.max(depth, start)
    }
    return depth < 0 ? most : depth
  }
  const across = Math.floor(width * SCAN_SHARE)
  const down = Math.floor(height * SCAN_SHARE)
  const left = side((f, d) => [d, f * height], across)
  const right = side((f, d) => [width - 1 - d, f * height], across)
  const top = side((f, d) => [f * width, d], down)
  const bottom = side((f, d) => [f * width, height - 1 - d], down)
  return [left, top, Math.max(0, width - left - right), Math.max(0, height - top - bottom)]
}

export function inset([x, y, width, height], by) {
  return [x + by, y + by, Math.max(0, width - 2 * by), Math.max(0, height - 2 * by)]
}

export function canvasRect([x, y, width, height], offset, scale) {
  return [x / scale - offset[0], y / scale - offset[1], width / scale, height / scale]
}

export function seenIn(rect, view, least) {
  const across = Math.min(rect[0] + rect[2], view[0] + view[2]) - Math.max(rect[0], view[0])
  const down = Math.min(rect[1] + rect[3], view[1] + view[3]) - Math.max(rect[1], view[1])
  return across > 0 && down > 0 && across >= Math.min(least, rect[2]) && down >= Math.min(least, rect[3])
}

export function gather(items, groups, view, link) {
  const grouped = new Map()
  const loose = []
  for (const item of items) {
    const group = innermost(item.rect, groups)
    if (!group) loose.push(item)
    else if (grouped.has(group)) grouped.get(group).push(item)
    else grouped.set(group, [item])
  }
  const found = []
  for (const [group, members] of grouped) {
    const goals = overlaps(group.rect, view) ? members.map((item) => item.rect) : [group.rect]
    found.push(cluster(members, [group.title], group.colour, goals, true))
  }
  for (const members of linked(loose, link)) {
    const titles = members.length === 1 ? [members[0].title] : []
    found.push(cluster(members, titles, null, members.map((item) => item.rect), false))
  }
  return found
}

function cluster(members, titles, colour, goals, group) {
  const named = titles.filter(Boolean)
  const order = [...members].sort((a, b) => a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0])
  return {
    count: members.length, titles: named, loose: named.length ? 0 : members.length,
    colour, goals, rects: members.map((item) => item.rect),
    sections: [{ title: group ? titles[0] ?? "" : "", group, colour, names: order.map((item) => item.title) }],
  }
}

function innermost(rect, groups) {
  const at = middle(rect)
  let found = null
  for (const group of groups) {
    if (!inside(at, group.rect)) continue
    if (!found || group.rect[2] * group.rect[3] < found.rect[2] * found.rect[3]) found = group
  }
  return found
}

function linked(items, link) {
  const seen = new Set()
  const all = []
  for (const first of items) {
    if (seen.has(first)) continue
    seen.add(first)
    const members = [first]
    for (let i = 0; i < members.length; i++) {
      for (const other of items) {
        if (seen.has(other) || gap(members[i].rect, other.rect) > link) continue
        seen.add(other)
        members.push(other)
      }
    }
    all.push(members)
  }
  return all
}

function gap(a, b) {
  const across = Math.max(0, b[0] - (a[0] + a[2]), a[0] - (b[0] + b[2]))
  const down = Math.max(0, b[1] - (a[1] + a[3]), a[1] - (b[1] + b[3]))
  return Math.hypot(across, down)
}

function overlaps(a, b) {
  return a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1]
}

function inside([x, y], rect) {
  return x >= rect[0] && x <= rect[0] + rect[2] && y >= rect[1] && y <= rect[1] + rect[3]
}

function middle([x, y, width, height]) {
  return [x + width / 2, y + height / 2]
}

export function layout(clusters, view, safe, width) {
  let arrows = clusters.map((each) => aim(each, view, safe, width))
  for (;;) {
    const pair = clash(arrows)
    if (!pair) return arrows
    const joined = aim(join(pair[0].cluster, pair[1].cluster), view, safe, width)
    arrows = [...arrows.filter((arrow) => !pair.includes(arrow)), joined]
  }
}

function clash(arrows) {
  for (let i = 0; i < arrows.length; i++) {
    for (let j = i + 1; j < arrows.length; j++) {
      if (overlaps(inset(arrows[i].box, -CLASH_PX / 2), inset(arrows[j].box, -CLASH_PX / 2))) return [arrows[i], arrows[j]]
    }
  }
  return null
}

function join(a, b) {
  return {
    count: a.count + b.count,
    titles: [...new Set([...a.titles, ...b.titles])],
    loose: a.loose + b.loose,
    colour: a.colour === b.colour ? a.colour : null,
    goals: [...a.goals, ...b.goals],
    rects: [...a.rects, ...b.rects],
    sections: [...(a.sections ?? []), ...(b.sections ?? [])],
  }
}

export function aim(cluster, { offset, scale }, safe, width) {
  const screen = ([x, y]) => [(x + offset[0]) * scale, (y + offset[1]) * scale]
  const centre = middle(safe)
  let goal = screen(middle(around(cluster.goals)))
  if (inside(goal, safe)) goal = nearest(centre, cluster.rects.map((rect) => screen(middle(rect))))
  const length = Math.hypot(goal[0] - centre[0], goal[1] - centre[1])
  const [dx, dy] = length < 1 ? [0, -1] : [(goal[0] - centre[0]) / length, (goal[1] - centre[1]) / length]
  const reach = Math.min(
    dx > 0 ? (safe[0] + safe[2] - centre[0]) / dx : dx < 0 ? (safe[0] - centre[0]) / dx : Infinity,
    dy > 0 ? (safe[1] + safe[3] - centre[1]) / dy : dy < 0 ? (safe[1] - centre[1]) / dy : Infinity,
  )
  const tip = [centre[0] + dx * reach, centre[1] + dy * reach]
  const base = [tip[0] - dx * ARROW_PX, tip[1] - dy * ARROW_PX]
  const left = [base[0] - dy * HALF_PX, base[1] + dx * HALF_PX]
  const right = [base[0] + dy * HALF_PX, base[1] - dx * HALF_PX]
  const notch = [tip[0] - dx * ARROW_PX * NOTCH, tip[1] - dy * ARROW_PX * NOTCH]
  const text = labelOf(cluster)
  const size = [width(text) + 2 * LABEL_PAD_PX, LABEL_PX]
  const back = LABEL_GAP_PX + Math.abs(dx) * size[0] / 2 + Math.abs(dy) * size[1] / 2
  const label = within([base[0] - dx * back - size[0] / 2, base[1] - dy * back - size[1] / 2, ...size], safe)
  const box = around([[...tip, 0, 0], [...left, 0, 0], [...right, 0, 0], label])
  return { cluster, tip, left, right, notch, label, text, box, colour: cluster.colour || NEUTRAL }
}

function nearest(point, points) {
  let found = points[0]
  for (const each of points) {
    if (Math.hypot(each[0] - point[0], each[1] - point[1]) < Math.hypot(found[0] - point[0], found[1] - point[1])) found = each
  }
  return found
}

function within([x, y, width, height], safe) {
  return [
    Math.max(safe[0], Math.min(x, safe[0] + safe[2] - width)),
    Math.max(safe[1], Math.min(y, safe[1] + safe[3] - height)),
    width,
    height,
  ]
}

export function labelOf({ titles, count, loose }) {
  const names = shorten(titles.join(", "), TITLE_CHARS)
  if (!names) return String(count)
  if (loose) return names + " +" + loose
  return titles.length === 1 && count > 1 ? names + " \u00b7 " + count : names
}

function shorten(text, most) {
  return text.length > most ? text.slice(0, most - 1).replace(/[\s,]+$/, "") + "\u2026" : text
}

export function noteOf(cluster, most = NOTE_NAMES) {
  const sections = cluster.sections ?? []
  const headed = sections.length > 1 || sections.some((section) => section.group)
  const found = []
  let left = most
  let more = 0
  for (const section of sections) {
    const names = counted(section.names)
    const shown = names.slice(0, Math.max(0, left))
    left -= shown.length
    more += names.slice(shown.length).reduce((sum, name) => sum + name.count, 0)
    if (!shown.length) continue
    found.push({
      title: headed ? section.title : null, group: section.group, colour: section.colour,
      names: shown.map(({ name, count }) => (count > 1 ? name + " " + TIMES + count : name)),
    })
  }
  return { sections: found, more }
}

function counted(names) {
  const found = new Map()
  for (const name of names) found.set(name, (found.get(name) ?? 0) + 1)
  return [...found].map(([name, count]) => ({ name, count }))
}

function createNote() {
  const note = document.createElement("div")
  note.className = "breeze-wire-tip breeze-compass-tip"
  note.hidden = true
  document.body.append(note)
  return note
}

function fillNote(note, { sections, more }, say) {
  const rows = []
  for (const section of sections) {
    if (section.title != null) {
      const title = row("bwt-type", section.title || say(section.group ? "compassGroup" : "compassLoose"))
      if (section.colour) {
        const dot = document.createElement("span")
        dot.className = "bwt-dot"
        dot.style.background = section.colour
        title.prepend(dot)
      }
      rows.push(title)
    }
    for (const name of section.names) rows.push(row("bct-name", name))
  }
  if (more) rows.push(row("bwt-more", say("more", { n: more })))
  note.replaceChildren(...rows)
}

function row(name, text) {
  const item = document.createElement("div")
  item.className = name
  item.textContent = text
  return item
}

function placeNote(note, frame, [x, y, width, height]) {
  note.hidden = false
  const { offsetWidth: w, offsetHeight: h } = note
  const left = frame.left + x
  const top = frame.top + y
  const middle = [left + width / 2, top + height / 2]
  const centre = [frame.left + frame.width / 2, frame.top + frame.height / 2]
  const spots = [
    [middle[0] - w / 2, top + height + NOTE_GAP_PX],
    [middle[0] - w / 2, top - NOTE_GAP_PX - h],
    [left - NOTE_GAP_PX - w, middle[1] - h / 2],
    [left + width + NOTE_GAP_PX, middle[1] - h / 2],
  ]
  const distance = ([sx, sy]) => Math.hypot(sx + w / 2 - centre[0], sy + h / 2 - centre[1])
  const fits = ([sx, sy]) => sx >= NOTE_MARGIN_PX && sy >= NOTE_MARGIN_PX
    && sx + w + NOTE_MARGIN_PX <= window.innerWidth && sy + h + NOTE_MARGIN_PX <= window.innerHeight
  const [sx, sy] = [...spots].sort((a, b) => distance(a) - distance(b)).find(fits) ?? spots[0]
  note.style.left = Math.max(NOTE_MARGIN_PX, Math.min(sx, window.innerWidth - w - NOTE_MARGIN_PX)) + "px"
  note.style.top = Math.max(NOTE_MARGIN_PX, Math.min(sy, window.innerHeight - h - NOTE_MARGIN_PX)) + "px"
}

export function arrowAt(arrows, point) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    if (inside(point, inset(arrows[i].box, -HIT_PX))) return arrows[i]
  }
  return null
}

function paint(ctx, arrows, lit, dim) {
  if (!arrows.length) return
  ctx.save()
  ctx.font = FONT
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.lineJoin = "round"
  for (const arrow of arrows) {
    const hot = arrow === lit
    ctx.globalAlpha = dim && !hot ? DIM : 1
    ctx.beginPath()
    ctx.moveTo(...arrow.tip)
    ctx.lineTo(...arrow.left)
    ctx.lineTo(...arrow.notch)
    ctx.lineTo(...arrow.right)
    ctx.closePath()
    ctx.fillStyle = arrow.colour
    ctx.fill()
    ctx.lineWidth = hot ? 2 : 1
    ctx.strokeStyle = hot ? "#fff" : "rgba(0, 0, 0, 0.6)"
    ctx.stroke()
    const [x, y, width, height] = arrow.label
    ctx.beginPath()
    ctx.roundRect(x, y, width, height, height / 2)
    ctx.fillStyle = "rgba(20, 20, 20, 0.85)"
    ctx.fill()
    if (hot) {
      ctx.lineWidth = 1
      ctx.strokeStyle = arrow.colour
      ctx.stroke()
    }
    ctx.fillStyle = hot ? "#fff" : "#ddd"
    ctx.fillText(arrow.text, x + width / 2, y + height / 2 + 0.5)
  }
  ctx.restore()
}

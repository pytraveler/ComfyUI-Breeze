const MARGIN_PX = 48

const MIN_MS = 800
const MAX_MS = 2000
const MS_PER_PX = 0.35

export function fly(canvas, rects, landed = () => {}) {
  const ds = canvas.ds
  const size = ds.getViewportSize?.() ?? [canvas.canvas.clientWidth, canvas.canvas.clientHeight]
  const from = viewOf(ds.offset, ds.scale, size)
  const to = framing(from, around(rects), size, ds.min_scale)
  const time = flightTime(from, to)
  const start = performance.now()
  let frame = 0
  const step = (now) => {
    const t = Math.min(1, (now - start) / time)
    const view = viewAt(from, to, t)
    const offset = offsetFor(view, size)
    ds.offset[0] = offset[0]
    ds.offset[1] = offset[1]
    ds.scale = view.scale
    canvas.setDirty(true, true)
    frame = t < 1 ? requestAnimationFrame(step) : 0
    if (t >= 1) landed()
  }
  frame = requestAnimationFrame(step)
  return () => cancelAnimationFrame(frame)
}

export function around(rects) {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const [x, y, width, height] of rects) {
    left = Math.min(left, x)
    top = Math.min(top, y)
    right = Math.max(right, x + width)
    bottom = Math.max(bottom, y + height)
  }
  return [left, top, right - left, bottom - top]
}

export function viewOf(offset, scale, size) {
  return {
    center: [size[0] / (2 * scale) - offset[0], size[1] / (2 * scale) - offset[1]],
    scale,
  }
}

export function offsetFor(view, size) {
  return [size[0] / (2 * view.scale) - view.center[0], size[1] / (2 * view.scale) - view.center[1]]
}

export function framing(view, bounds, size, least = 0) {
  const [x, y, width, height] = bounds
  const room = [Math.max(1, size[0] - 2 * MARGIN_PX), Math.max(1, size[1] - 2 * MARGIN_PX)]
  const fits = Math.min(room[0] / Math.max(1, width), room[1] / Math.max(1, height))
  return {
    center: [x + width / 2, y + height / 2],
    scale: Math.max(least || 0, Math.min(view.scale, fits)),
  }
}

export function flightTime(from, to) {
  const scale = Math.min(from.scale, to.scale)
  const travel = Math.hypot(to.center[0] - from.center[0], to.center[1] - from.center[1]) * scale
  return Math.min(MAX_MS, MIN_MS + travel * MS_PER_PX)
}

export function viewAt(from, to, t) {
  const e = ease(Math.min(1, Math.max(0, t)))
  return {
    center: [
      from.center[0] + (to.center[0] - from.center[0]) * e,
      from.center[1] + (to.center[1] - from.center[1]) * e,
    ],
    scale: from.scale * (to.scale / from.scale) ** e,
  }
}

export function ease(t) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
}

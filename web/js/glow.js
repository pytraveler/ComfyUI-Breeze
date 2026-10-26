const RING_PX = 2
const MAX_RINGS = 16

const STRENGTH = 0.6

export function glowRings(radius, scale) {
  if (!(radius > 0) || !(scale > 0)) return []
  const count = Math.max(1, Math.min(MAX_RINGS, Math.round((radius * scale) / RING_PX)))
  const width = radius / count
  return Array.from({ length: count }, (_, i) => {
    const fall = 1 - (i + 0.5) / count
    return { out: width * (i + 0.5), width, alpha: STRENGTH * fall ** 1.5 }
  })
}

export function drawGlow(ctx, rect, { radius, corner, colour, scale, alpha = 1 }) {
  const rings = glowRings(radius, scale)
  if (!rings.length || !(alpha > 0)) return
  const [x, y, width, height] = rect
  ctx.save()
  ctx.strokeStyle = colour
  for (const ring of rings) {
    ctx.globalAlpha = alpha * ring.alpha
    ctx.lineWidth = ring.width
    ctx.beginPath()
    ctx.roundRect(x - ring.out, y - ring.out, width + 2 * ring.out, height + 2 * ring.out, corner + ring.out)
    ctx.stroke()
  }
  ctx.restore()
}

import assert from "node:assert/strict"
import { test } from "node:test"

import { around, ease, flightTime, framing, offsetFor, viewAt, viewOf } from "../../web/js/flight.js"

const SCREEN = [1600, 900]

function near(a, b) {
  return Math.abs(a - b) < 1e-6
}

test("a view and the canvas offset that shows it are the same thing", () => {
  const view = viewOf([-300, 120], 1.5, SCREEN)
  assert.ok(near(view.center[0], 1600 / 3 + 300))
  assert.ok(near(view.center[1], 300 - 120))
  const offset = offsetFor(view, SCREEN)
  assert.ok(near(offset[0], -300) && near(offset[1], 120), String(offset))
})

test("what fits on screen is flown to at the scale the view already has", () => {
  const view = { center: [0, 0], scale: 1 }
  const landing = framing(view, [5000, 2000, 300, 200], SCREEN)
  assert.deepEqual(landing.center, [5150, 2100])
  assert.equal(landing.scale, 1)
})

test("what does not fit is zoomed out to, with room around it, and never zoomed in to", () => {
  const wide = framing({ center: [0, 0], scale: 1 }, [0, 0, 3000, 400], SCREEN)
  assert.ok(wide.scale < 1)
  const shown = 3000 * wide.scale
  assert.ok(shown < SCREEN[0] - 40 && shown > SCREEN[0] * 0.8, String(shown))
  const small = framing({ center: [0, 0], scale: 0.3 }, [0, 0, 100, 100], SCREEN)
  assert.equal(small.scale, 0.3)
})

test("a flight zooms out no further than the canvas lets it", () => {
  const huge = framing({ center: [0, 0], scale: 1 }, [0, 0, 1e6, 1e6], SCREEN, 0.1)
  assert.equal(huge.scale, 0.1)
})

test("the frame around several rectangles holds every one of them", () => {
  assert.deepEqual(around([[0, 0, 100, 50], [400, -20, 50, 50], [10, 300, 10, 10]]), [0, -20, 450, 330])
  assert.deepEqual(around([[7, 8, 9, 10]]), [7, 8, 9, 10])
})

test("a flight takes longer the further it goes, within bounds", () => {
  const from = { center: [0, 0], scale: 1 }
  const short = flightTime(from, { center: [10, 0], scale: 1 })
  const long = flightTime(from, { center: [3000, 0], scale: 1 })
  const huge = flightTime(from, { center: [1e6, 0], scale: 1 })
  assert.ok(short >= 800 && short < long && long < huge, [short, long, huge].join(" "))
  assert.equal(huge, 2000)
})

test("a flight starts where the view is and ends where it was sent", () => {
  const from = { center: [100, 200], scale: 1 }
  const to = { center: [900, -400], scale: 0.25 }
  assert.deepEqual(viewAt(from, to, 0), from)
  const end = viewAt(from, to, 1)
  assert.ok(near(end.center[0], 900) && near(end.center[1], -400) && near(end.scale, 0.25))
  const half = viewAt(from, to, 0.5)
  assert.ok(near(half.center[0], 500) && near(half.center[1], -100))
  assert.ok(near(half.scale, 0.5), "the zoom is even: halfway is the geometric mean")
  assert.deepEqual(viewAt(from, to, 2), viewAt(from, to, 1))
})

test("the easing leaves and lands slowly and never turns back", () => {
  assert.equal(ease(0), 0)
  assert.equal(ease(1), 1)
  assert.equal(ease(0.5), 0.5)
  assert.ok(ease(0.1) < 0.1 && ease(0.9) > 0.9)
  for (let t = 0; t < 1; t += 0.05) assert.ok(ease(t + 0.05) >= ease(t), String(t))
})

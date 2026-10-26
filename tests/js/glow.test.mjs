import assert from "node:assert/strict"
import { test } from "node:test"

import { glowRings } from "../../web/js/glow.js"

test("no radius is no glow", () => {
  assert.deepEqual(glowRings(0, 1), [])
  assert.deepEqual(glowRings(-5, 1), [])
  assert.deepEqual(glowRings(Number.NaN, 1), [])
})

test("the rings fill the radius edge to edge and fade outwards", () => {
  for (const [radius, scale] of [[14, 1], [14, 0.3], [40, 2], [2, 0.1]]) {
    const rings = glowRings(radius, scale)
    assert.ok(rings.length >= 1, String([radius, scale]))
    const outer = rings.at(-1)
    assert.ok(Math.abs(outer.out + outer.width / 2 - radius) < 1e-9)
    assert.ok(Math.abs(rings[0].out - rings[0].width / 2) < 1e-9, "the first ring starts at the edge")
    for (let i = 1; i < rings.length; i++) assert.ok(rings[i].alpha < rings[i - 1].alpha)
    assert.ok(rings[0].alpha <= 0.6 && outer.alpha > 0)
  }
})

test("the rings stay about two screen pixels wide, and few however wide the glow", () => {
  assert.equal(glowRings(14, 1).length, 7)
  assert.equal(glowRings(14, 2).length, 14)
  assert.ok(glowRings(40, 4).length <= 16)
})

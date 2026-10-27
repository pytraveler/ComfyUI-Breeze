import assert from "node:assert/strict"
import { test } from "node:test"

import { COLOURS, vueStyle } from "../../web/js/forecast_view.js"

function shown() {
  return new Map([
    ["70", { state: "run", seconds: 18.85, computed: 1, untimed: 0, timed: true }],
    ["65", { state: "cached", seconds: 0, computed: 0, untimed: 0, timed: false }],
    ["67", { state: "maybe", seconds: 0, computed: 0, untimed: 0, timed: false }],
  ])
}

function rulesFor(css, id) {
  return css.split("}").filter((rule) => rule.includes('[data-node-id="' + id + '"]'))
}

test("no forecast leaves the nodes as Nodes 2.0 draws them", () => {
  assert.equal(vueStyle(null), "")
  assert.equal(vueStyle(new Map()), "")
})

test("while the pointer is on Run each node is outlined in the colour of what happens to it", () => {
  const css = vueStyle(shown(), { outline: true, glow: 16, unit: 1 })
  assert.match(rulesFor(css, 70).join("}"), new RegExp("outline: 2px solid " + COLOURS.run))
  assert.match(rulesFor(css, 65).join("}"), new RegExp("drop-shadow\\(0 0 8px " + COLOURS.cached + "\\)"))
  assert.match(rulesFor(css, 67).join("}"), /outline: 2px dashed/)
})

test("tags alone, without outlines, when the forecast is always on", () => {
  const css = vueStyle(shown(), { outline: false, glow: 16, unit: 1 })
  assert.ok(!css.includes("outline"), css)
  assert.ok(!css.includes("drop-shadow"), css)
  assert.equal(rulesFor(css, 70).length, 1)
})

test("a tag stands over the node with the time it took, or as a lone dot", () => {
  const css = vueStyle(shown(), { outline: false, unit: 1 })
  const timed = rulesFor(css, 70).join("}")
  assert.match(timed, /::after \{ content: "19 s";/)
  assert.match(timed, /bottom: calc\(100% \+ 5px\)/)
  assert.match(timed, new RegExp("color: " + COLOURS.run))
  const lone = rulesFor(css, 65).join("}")
  assert.match(lone, /content: "";/)
  assert.match(lone, /circle at 50% 50%/)
})

test("a tag keeps its size on screen as the view zooms out", () => {
  const near = rulesFor(vueStyle(shown(), { unit: 1 }), 70).join("}")
  const far = rulesFor(vueStyle(shown(), { unit: 2 }), 70).join("}")
  assert.match(near, /height: 17px/)
  assert.match(far, /height: 34px/)
  assert.match(far, /font: 22px\/34px/)
})

test("the tag of a node a lazy input may not ask for has a ring for a dot", () => {
  const ring = rulesFor(vueStyle(shown(), { unit: 1 }), 67).join("}")
  assert.match(ring, /radial-gradient\(circle at 50% 50%, transparent [\d.]+px, #ff8a3d [\d.]+px, #ff8a3d [\d.]+px, transparent/)
})

import assert from "node:assert/strict"
import { test } from "node:test"

import { lineage } from "../../web/js/graph_walk.js"
import { vueStyle } from "../../web/js/lineage.js"

const COLORS = { up: "#4cb3ff", down: "#ffb340", both: "#c38bff" }

function link(id, origin, target) {
  return { id, origin_id: origin, origin_slot: 0, target_id: target, target_slot: 0 }
}

const LINKS = [link(10, 1, 2), link(11, 2, 3), link(12, 3, 4)]
const NODES = [1, 2, 3, 4, 5].map((id) => ({ id }))

function rulesFor(css, id) {
  return css.split("}").filter((rule) => rule.includes('[data-node-id="' + id + '"]'))
}

test("nothing selected leaves the nodes as Nodes 2.0 draws them", () => {
  assert.equal(vueStyle(null, NODES, { fade: 0.6, colors: COLORS, glow: 16 }), "")
})

test("what feeds the selection and what it feeds are outlined and glow in their colours", () => {
  const css = vueStyle(lineage(LINKS, new Set([2])), NODES, { fade: 0.6, colors: COLORS, glow: 16 })
  const up = rulesFor(css, 1).join("}")
  assert.match(up, /outline: 2px solid #4cb3ff/)
  assert.match(up, /drop-shadow\(0 0 8px #4cb3ff\) !important/)
  const down = rulesFor(css, 4).join("}")
  assert.match(down, /outline: 2px solid #ffb340/)
  assert.match(down, /drop-shadow\(0 0 8px #ffb340\)/)
  assert.deepEqual(rulesFor(css, 2), [], "the frontend outlines the selected node itself")
})

test("the outline steps out past the ring of a node with an error", () => {
  const css = vueStyle(lineage(LINKS, new Set([2])), NODES, { fade: 0.6, colors: COLORS, glow: 16 })
  assert.ok(rulesFor(css, 1).some((rule) => rule.includes(".ring-4") && rule.includes("outline-offset: 7px")), css)
})

test("the rest of the graph fades, and stays as it is with no fade", () => {
  const found = lineage(LINKS, new Set([2]))
  const faded = rulesFor(vueStyle(found, NODES, { fade: 0.6, colors: COLORS, glow: 16 }), 5).join("}")
  assert.match(faded, /opacity: 0.4 !important/)
  assert.deepEqual(rulesFor(vueStyle(found, NODES, { fade: 0, colors: COLORS, glow: 16 }), 5), [])
})

test("no glow keeps the node's own shadow and only outlines it", () => {
  const css = vueStyle(lineage(LINKS, new Set([2])), NODES, { fade: 0.6, colors: COLORS, glow: 0 })
  assert.ok(!css.includes("drop-shadow"), css)
  assert.match(rulesFor(css, 1).join("}"), /outline: 2px solid #4cb3ff/)
})

test("a node between two selected ones takes the third colour", () => {
  const css = vueStyle(lineage(LINKS, new Set([1, 4])), NODES, { fade: 0.6, colors: COLORS, glow: 16 })
  assert.match(rulesFor(css, 2).join("}"), /outline: 2px solid #c38bff/)
  assert.match(rulesFor(css, 3).join("}"), /drop-shadow\(0 0 8px #c38bff\)/)
})

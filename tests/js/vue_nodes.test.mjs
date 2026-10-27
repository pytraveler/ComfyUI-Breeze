import assert from "node:assert/strict"
import { test } from "node:test"

import { nodeSelector, outlined, rule } from "../../web/js/vue_nodes.js"

test("a node is found by its id, quoted so that any id is safe", () => {
  assert.equal(nodeSelector(12), '.lg-node[data-node-id="12"]')
  assert.equal(nodeSelector('a"b'), '.lg-node[data-node-id="a\\"b"]')
})

test("one rule covers every selector it is given", () => {
  assert.equal(rule(["a", "b"], "color: red;"), "a, b { color: red; }")
})

test("an outline sits on the body of the node, out past the ring of an error", () => {
  const rules = outlined([nodeSelector(1)], "#4cb3ff")
  assert.equal(rules.length, 2, "no glow asked for, none given")
  assert.match(rules[0], /node-inner-wrapper"\] \{ outline: 2px solid #4cb3ff; outline-offset: 3px; \}/)
  assert.match(rules[1], /\.ring-4 \{ outline-offset: 7px; \}/)
})

test("a glow replaces the node's own shadow, and a dashed outline is dashed", () => {
  const rules = outlined([nodeSelector(1)], "#ff8a3d", { glow: 16, dashed: true })
  assert.match(rules[0], /outline: 2px dashed #ff8a3d/)
  assert.equal(rules[2], '.lg-node[data-node-id="1"] { filter: drop-shadow(0 0 8px #ff8a3d) !important; }')
})

test("nothing to outline gives no rules", () => {
  assert.deepEqual(outlined([], "#fff", { glow: 16 }), [])
})

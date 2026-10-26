import assert from "node:assert/strict"
import { test } from "node:test"

import { linksOf } from "../../web/js/wire_hover.js"

function graph(links) {
  const map = new Map(links.map((item) => [item.id, item]))
  return { getLink: (id) => map.get(id) }
}

test("a link segment stands for the link itself", () => {
  const link = { id: 7, origin_id: 1, origin_slot: 0, target_id: 2, target_slot: 0 }
  assert.deepEqual(linksOf(graph([link]), link), [link])
})

test("a reroute stands for every link through it, though it answers origin_id as well", () => {
  const a = { id: 7, origin_id: 1, origin_slot: 0, target_id: 2, target_slot: 0 }
  const b = { id: 8, origin_id: 1, origin_slot: 0, target_id: 3, target_slot: 0 }
  const reroute = { id: 1, origin_id: 1, origin_slot: 0, linkIds: new Set([7, 8, 99]) }
  assert.deepEqual(linksOf(graph([a, b]), reroute), [a, b])
})

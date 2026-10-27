import assert from "node:assert/strict"
import { test } from "node:test"

import { feedOf, isGetter, isSetter, readOf, readersOf, wiring } from "../../web/js/set_get.js"

function pair(id, type, name, { inputs = [null], outputs = 1, ...extra } = {}) {
  return {
    id, type, widgets: [{ value: name }], inputs: inputs.map((link) => ({ link })),
    outputs: Array.from({ length: outputs }, () => ({ links: [] })), ...extra,
  }
}

function graphOf(nodes, links = []) {
  const map = new Map(links.map((link) => [link.id, link]))
  return { _nodes: nodes, getLink: (id) => map.get(id) }
}

test("the Set and Get nodes of KJNodes, Easy-Use and darkilNodes are told apart from the rest", () => {
  for (const type of ["SetNode", "easy setNode", "darkilMultiSetNode"]) assert.ok(isSetter({ type }), type)
  for (const type of ["GetNode", "easy getNode", "darkilMultiGetNode", "darkilMultiGetAIONode"]) assert.ok(isGetter({ type }), type)
  assert.ok(!isSetter({ type: "GetNode" }) && !isGetter({ type: "Reroute" }) && !isSetter(null))
})

test("a Get node reads the first Set node of its pack with its name", () => {
  const set = pair(1, "SetNode", "model")
  const twin = pair(2, "SetNode", "model")
  const easy = pair(3, "easy setNode", "model", { outputs: 0 })
  const get = pair(4, "GetNode", "model", { inputs: [] })
  const easyGet = pair(5, "easy getNode", "model", { inputs: [] })
  const other = pair(6, "GetNode", "vae", { inputs: [] })
  const blank = pair(7, "GetNode", "", { inputs: [] })
  const graph = graphOf([set, twin, easy, get, easyGet, other, blank])
  assert.deepEqual(readOf(graph, get, 0), { node: set, slot: 0 })
  assert.equal(readOf(graph, get, 1), null)
  assert.deepEqual(readOf(graph, easyGet, 0), { node: easy, slot: 0 })
  assert.equal(readOf(graph, other, 0), null)
  assert.equal(readOf(graph, blank, 0), null)
  assert.equal(readOf(graph, set, 0), null)
  assert.deepEqual(readersOf(graph, set, 0), [{ node: get, slot: 0 }])
  assert.deepEqual(readersOf(graph, twin, 0), [])
  assert.deepEqual(readersOf(graph, easy, 0), [{ node: easyGet, slot: 0 }])
  assert.deepEqual(readersOf(graph, get, 0), [])
})

test("a Multi Get reads each input of its group in turn, and a Multi Get AIO the inputs it lists", () => {
  const multi = pair(1, "darkilMultiSetNode", "loaders", { inputs: [null, null, null], outputs: 3 })
  const kj = pair(2, "SetNode", "seed")
  const get = pair(3, "darkilMultiGetNode", "loaders,local", { inputs: [], outputs: 2 })
  const fromKj = pair(4, "darkilMultiGetNode", "seed", { inputs: [], outputs: 1 })
  const aio = pair(5, "darkilMultiGetAIONode", 2, {
    inputs: [], outputs: 2, slotInfo: [{ groupName: "seed", inputIdx: 0 }, { groupName: "loaders", inputIdx: 1 }],
  })
  const kjGet = pair(6, "GetNode", "loaders", { inputs: [] })
  const graph = graphOf([multi, kj, get, fromKj, aio, kjGet])
  assert.deepEqual(readOf(graph, get, 1), { node: multi, slot: 1 })
  assert.deepEqual(readOf(graph, fromKj, 0), { node: kj, slot: 0 })
  assert.deepEqual(readOf(graph, aio, 0), { node: kj, slot: 0 })
  assert.deepEqual(readOf(graph, aio, 1), { node: multi, slot: 1 })
  assert.equal(readOf(graph, kjGet, 0), null, "a KJNodes Get node knows only KJNodes Set nodes")
  assert.deepEqual(readersOf(graph, multi, 1), [{ node: get, slot: 1 }, { node: aio, slot: 1 }])
  assert.deepEqual(readersOf(graph, multi, 0), [{ node: get, slot: 0 }])
  assert.deepEqual(readersOf(graph, kj, 0), [{ node: fromKj, slot: 0 }, { node: aio, slot: 0 }])
})

test("the wiring splits Set and Get nodes into slots, each Set input going on to its own output and to its readers", () => {
  const multi = pair(1, "darkilMultiSetNode", "loaders", { inputs: [null, null], outputs: 2 })
  const easy = pair(2, "easy setNode", "clip", { outputs: 0 })
  const get = pair("3", "darkilMultiGetNode", "loaders", { inputs: [], outputs: 2 })
  const lost = pair(4, "GetNode", "lost", { inputs: [] })
  const { split, edges } = wiring(graphOf([multi, easy, get, lost, { id: 5, type: "KSampler" }]))
  assert.deepEqual([...split], [1, 2, "3", 4])
  assert.deepEqual(edges, [
    { from: [1, 0], to: [1, 0] },
    { from: [1, 1], to: [1, 1] },
    { from: [1, 0], to: ["3", 0] },
    { from: [1, 1], to: ["3", 1] },
  ])
  assert.deepEqual(wiring(null), { split: new Set(), edges: [] })
})

test("the link that feeds an output of a Set or Get node is the one into the Set input behind it", () => {
  const into = { id: 9, origin_id: 8, origin_slot: 0, target_id: 1, target_slot: 1 }
  const set = pair(1, "darkilMultiSetNode", "loaders", { inputs: [null, 9], outputs: 2 })
  const get = pair(2, "darkilMultiGetNode", "loaders", { inputs: [], outputs: 2 })
  const graph = graphOf([set, get, pair(3, "GetNode", "lost", { inputs: [] })], [into])
  assert.equal(feedOf(graph, get, 1), into)
  assert.equal(feedOf(graph, get, 0), null)
  assert.equal(feedOf(graph, set, 1), into)
  assert.equal(feedOf(graph, graph._nodes[2], 0), null)
  assert.equal(feedOf(graph, { id: 5, type: "KSampler", inputs: [{ link: 9 }] }, 0), null)
})

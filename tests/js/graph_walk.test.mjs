import assert from "node:assert/strict"
import { test } from "node:test"

import {
  lineage, linkEnds, roleOf, sameLineage, selectedNodeIds, valueSource,
} from "../../web/js/graph_walk.js"
import { edgeKey, virtualRole, wiring } from "../../web/js/set_get.js"
import { speaker } from "../../web/js/words.js"

function link(id, origin, originSlot, target, targetSlot, type = "IMAGE") {
  return { id, origin_id: origin, origin_slot: originSlot, target_id: target, target_slot: targetSlot, type }
}

function graph(nodes, links, extra = {}) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const map = new Map(links.map((item) => [item.id, item]))
  return {
    links: map,
    getNodeById: (id) => byId.get(id) ?? null,
    getLink: (id) => map.get(id),
    ...extra,
  }
}

function chain() {
  const links = [
    link(10, 1, 0, 2, 0), link(11, 2, 0, 3, 0, "LATENT"), link(12, 3, 0, 4, 0, "LATENT"),
    link(13, 4, 0, 5, 0), link(14, 6, 0, 3, 1, "INT"), link(15, 4, 0, 7, 0),
  ]
  const nodes = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, title: "Node " + id }))
  return graph(nodes, links)
}

test("a selected node lights up what feeds it and what it feeds, and nothing beside", () => {
  const found = lineage(chain().links.values(), new Set([3]))
  assert.deepEqual([...found.upstream].sort(), [1, 2, 6])
  assert.deepEqual([...found.downstream].sort(), [4, 5, 7])
  assert.deepEqual([...found.links].sort(), [10, 11, 12, 13, 14, 15])
  assert.deepEqual([...found.selected], [3])
})

test("a sibling branch off an upstream node is not part of the lineage", () => {
  const found = lineage(chain().links.values(), new Set([5]))
  assert.deepEqual([...found.upstream].sort(), [1, 2, 3, 4, 6])
  assert.deepEqual([...found.downstream], [])
  assert.equal(found.links.has(15), false, "Decode -> Preview feeds nothing selected")
})

test("selected nodes are in neither set, and a node between two of them is both", () => {
  const found = lineage(chain().links.values(), new Set([2, 4]))
  assert.equal(found.upstream.has(2) || found.downstream.has(2), false)
  assert.equal(found.upstream.has(4) || found.downstream.has(4), false)
  assert.equal(roleOf(found, 3), "both")
  assert.equal(roleOf(found, 1), "up")
  assert.equal(roleOf(found, 5), "down")
  assert.equal(roleOf(found, 99), null)
})

test("a cycle ends the walk instead of looping", () => {
  const links = [link(1, 1, 0, 2, 0), link(2, 2, 0, 1, 0)]
  const found = lineage(links, new Set([1]))
  assert.deepEqual([...found.upstream], [2])
  assert.deepEqual([...found.downstream], [2])
})

test("only nodes of the graph count as selected, not groups or reroutes sharing an id", () => {
  const g = chain()
  const node = g.getNodeById(3)
  const group = { id: 4, title: "a group" }
  assert.deepEqual([...selectedNodeIds(g, [node, group, null])], [3])
})

test("two lineages are the same when they light up the same things", () => {
  const g = chain()
  const a = lineage(g.links.values(), new Set([3]))
  const b = lineage(g.links.values(), new Set([3]))
  const c = lineage(g.links.values(), new Set([4]))
  assert.equal(sameLineage(a, b), true)
  assert.equal(sameLineage(a, c), false)
  assert.equal(sameLineage(null, null), true)
  assert.equal(sameLineage(a, null), false)
})

test("the ends of a link name the node, its id and the slot as the canvas shows it", () => {
  const nodes = [
    { id: 1, title: "VAE Decode", outputs: [{ name: "IMAGE" }] },
    { id: 2, getTitle: () => "Save", inputs: [{ name: "images", label: "pictures" }] },
  ]
  const ends = linkEnds(graph(nodes, []), link(5, 1, 0, 2, 0))
  assert.deepEqual(ends, {
    type: "IMAGE",
    from: { title: "VAE Decode", id: 1, slot: "IMAGE" },
    to: { title: "Save", id: 2, slot: "pictures" },
  })
})

test("inside a subgraph an end can be the subgraph's own input", () => {
  const io = { id: -10, slots: [{ name: "image" }] }
  const nodes = [{ id: 3, title: "Blur", inputs: [{ name: "image" }] }]
  const ends = linkEnds(graph(nodes, [], { inputNode: io }), link(1, -10, 0, 3, 0))
  assert.deepEqual(ends.from, { title: "Subgraph input", id: null, slot: "image" })
})

test("an end that is not a node is named in the words given", () => {
  const say = speaker(() => ({ subgraphInput: "entree", missingNode: "absent" }))
  const io = { id: -10, slots: [{ name: "image" }] }
  const ends = linkEnds(graph([], [], { inputNode: io }), link(1, -10, 0, 3, 0), say)
  assert.equal(ends.from.title, "entree")
  assert.deepEqual(ends.to, { title: "absent", id: 3, slot: null })
})

test("a value comes from the node the link leaves, under its own id", () => {
  const source = valueSource(chain(), link(12, 3, 0, 4, 0))
  assert.equal(source.id, "3")
  assert.equal(source.slot, 0)
})

test("a frontend reroute is followed back to the node feeding it", () => {
  const reroute = { id: 8, isVirtualNode: true, getInputLink: () => link(20, 4, 0, 8, 0) }
  const g = graph([{ id: 4 }, reroute], [])
  assert.deepEqual(valueSource(g, link(21, 8, 0, 5, 0)), { id: "4", slot: 0, node: g.getNodeById(4) })
})

test("a Primitive is a value of its own", () => {
  const primitive = { id: 9, isVirtualNode: true, getInputLink: () => null, widgets: [{ value: 1024 }] }
  const g = graph([primitive], [])
  assert.equal(valueSource(g, link(22, 9, 0, 3, 2)).widget, 1024)
})

test("a link out of a subgraph node is followed in to the node behind that output", () => {
  const inner = graph([{ id: 5 }], [link(30, 5, 1, -20, 0)], {
    outputNode: { slots: [{ linkIds: [30] }] },
  })
  const outer = { id: 12, isSubgraphNode: () => true, subgraph: inner }
  const g = graph([outer], [])
  const source = valueSource(g, link(31, 12, 0, 4, 0))
  assert.equal(source.id, "12:5")
  assert.equal(source.slot, 1)
})

test("a chain that ends nowhere gives no source", () => {
  const loose = { id: 8, isVirtualNode: true, getInputLink: () => null }
  assert.equal(valueSource(graph([loose], []), link(1, 8, 0, 3, 0)), null)
  assert.equal(valueSource(graph([], []), link(1, 99, 0, 3, 0)), null)
})

function hidden() {
  const nobody = () => { throw new Error("no setter") }
  const nodes = [
    { id: 1, title: "Load Model" },
    { id: 2, title: "Load CLIP" },
    {
      id: 3, type: "darkilMultiSetNode", widgets: [{ value: "loaders" }], isVirtualNode: true,
      inputs: [{ link: 10 }, { link: 11 }, { link: null }], outputs: [{ links: [] }, { links: [16] }, { links: [] }],
    },
    { id: 4, type: "darkilMultiGetNode", widgets: [{ value: "loaders" }], isVirtualNode: true, getInputLink: nobody, outputs: [{}, {}] },
    { id: 5, type: "GetNode", widgets: [{ value: "lost" }], isVirtualNode: true, getInputLink: nobody, outputs: [{}] },
    { id: 6, title: "Sampler" },
    { id: 7, title: "Encode" },
  ]
  const links = [
    link(10, 1, 0, 3, 0, "MODEL"), link(11, 2, 0, 3, 1, "CLIP"), link(12, 4, 0, 6, 0, "MODEL"),
    link(13, 4, 1, 7, 0, "CLIP"), link(14, 5, 0, 6, 1, "LATENT"), link(15, 7, 0, 6, 2, "CONDITIONING"),
    link(16, 3, 1, 7, 1, "CLIP"),
  ]
  return graph(nodes, links, { _nodes: nodes })
}

test("a selection goes through Set and Get nodes slot by slot, as the wires they stand in for", () => {
  const g = hidden()
  const encode = lineage(g.links.values(), new Set([7]), wiring(g))
  assert.deepEqual([...encode.upstream].sort(), [2, 3, 4])
  assert.deepEqual([...encode.downstream].sort(), [6])
  assert.deepEqual([...encode.links].sort(), [11, 13, 15, 16])
  assert.equal(virtualRole(encode, edgeKey(3, 1, 4, 1)), "up")
  assert.equal(virtualRole(encode, edgeKey(3, 0, 4, 0)), null)
  const model = lineage(g.links.values(), new Set([1]), wiring(g))
  assert.deepEqual([...model.downstream].sort(), [3, 4, 6])
  assert.deepEqual([...model.links].sort(), [10, 12])
  assert.equal(virtualRole(model, edgeKey(3, 0, 4, 0)), "down")
  assert.equal(virtualRole(model, edgeKey(3, 1, 4, 1)), null)
  const both = lineage(g.links.values(), new Set([1, 6]), wiring(g))
  assert.equal(virtualRole(both, edgeKey(3, 0, 4, 0)), "both")
  const set = lineage(g.links.values(), new Set([3]), wiring(g))
  assert.deepEqual([...set.upstream].sort(), [1, 2])
  assert.deepEqual([...set.downstream].sort(), [4, 6, 7])
  assert.equal(set.links.has(null), false)
  const plain = lineage(g.links.values(), new Set([7]))
  assert.deepEqual([...plain.upstream].sort(), [1, 2, 3, 4], "without the wiring a Set node is one node like any other")
})

test("a value through a Get node comes from what feeds that input of its Set node, and a Get node without one gives none", () => {
  const g = hidden()
  assert.equal(valueSource(g, g.getLink(12)).node.title, "Load Model")
  assert.equal(valueSource(g, g.getLink(13)).node.title, "Load CLIP")
  assert.equal(valueSource(g, g.getLink(16)).id, "2")
  assert.equal(valueSource(g, g.getLink(14)), null)
})

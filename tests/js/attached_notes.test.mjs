import assert from "node:assert/strict"
import { test } from "node:test"

import {
  MARK, PROPERTY, attach, detach, follow, hostOf, installAttachedNotes, joint, markPaste, noteMenu, relinkPasted, targetAt,
} from "../../web/js/attached_notes.js"

function graphOf(...nodes) {
  const graph = { _nodes: nodes, getNodeById: (id) => nodes.find((node) => String(node.id) === String(id)) ?? null }
  for (const node of nodes) node.graph = graph
  return graph
}

function note(id, pos, extra = {}) {
  return { id, type: "Note", title: "Note", inputs: [], outputs: [], widgets: [{ value: "remember" }], properties: {}, pos, size: [200, 100], ...extra }
}

function sampler(id, pos, extra = {}) {
  return { id, type: "KSampler", title: "KSampler", inputs: [{}], outputs: [{}], widgets: [], properties: {}, pos, size: [300, 200], ...extra }
}

test("a note knows its node only while that node is in its graph and is not a note itself", () => {
  const host = sampler(1, [0, 0])
  const memo = note(2, [400, 0])
  const other = note(3, [0, 400])
  graphOf(host, memo, other)
  assert.equal(hostOf(memo), null)
  attach(memo, host)
  assert.deepEqual(memo.properties[PROPERTY], { node: 1 })
  assert.equal(hostOf(memo), host)
  attach(memo, other)
  assert.equal(hostOf(memo), null)
  memo.properties[PROPERTY] = { node: 99 }
  assert.equal(hostOf(memo), null)
  attach(host, memo)
  assert.equal(hostOf(host), null)
  detach(memo)
  assert.equal(PROPERTY in memo.properties, false)
})

test("a note follows its node when only the node moved, and keeps a new place when the note moved", () => {
  const host = sampler(1, [0, 0])
  const memo = note(2, [400, 50])
  const graph = graphOf(host, memo)
  attach(memo, host)
  const states = new WeakMap()
  assert.equal(follow(graph, states), 0)
  host.pos = [100, 20]
  assert.equal(follow(graph, states), 1)
  assert.deepEqual(memo.pos, [500, 70])
  memo.pos = [520, 300]
  assert.equal(follow(graph, states), 0)
  host.pos = [110, 20]
  follow(graph, states)
  assert.deepEqual(memo.pos, [530, 300])
  host.pos = [210, 120]
  memo.pos = [630, 400]
  assert.equal(follow(graph, states), 0)
  assert.deepEqual(memo.pos, [630, 400])
})

test("a note with no node, or a node gone, stays where it is", () => {
  const host = sampler(1, [0, 0])
  const memo = note(2, [400, 50])
  const graph = graphOf(memo)
  attach(memo, host)
  const states = new WeakMap()
  follow(graph, states)
  host.pos = [100, 100]
  assert.equal(follow(graph, states), 0)
  assert.deepEqual(memo.pos, [400, 50])
})

test("a pasted note goes with the pasted copy of its node, and lets go of a node left behind", () => {
  const items = {
    nodes: [
      { id: 5, type: "KSampler", properties: {} },
      { id: 6, type: "Note", properties: { [PROPERTY]: { node: 5 } } },
      { id: 7, type: "Note", properties: { [PROPERTY]: { node: 40 } } },
      { id: 8, type: "VAEDecode", properties: { other: 1 } },
    ],
  }
  const marked = markPaste(items)
  assert.notEqual(marked, items)
  assert.deepEqual(items.nodes[2].properties, { [PROPERTY]: { node: 40 } })
  assert.deepEqual(marked.nodes.map((node) => node.properties), [
    { [MARK]: 5 },
    { [PROPERTY]: { node: 5 }, [MARK]: 6 },
    {},
    { other: 1 },
  ])
  const created = marked.nodes.map((node, index) => ({ id: 20 + index, properties: structuredClone(node.properties) }))
  relinkPasted([{ title: "group" }, ...created])
  assert.deepEqual(created.map((node) => node.properties), [{}, { [PROPERTY]: { node: 20 } }, {}, { other: 1 }])
  const plain = { nodes: [{ id: 1, properties: {} }] }
  assert.equal(markPaste(plain), plain)
  const alone = markPaste({ nodes: [{ id: 6, properties: { [PROPERTY]: { node: 5 } } }] })
  assert.deepEqual(alone.nodes[0].properties, {})
})

test("the target is the topmost node under the pointer that is not a note, on its title when asked", () => {
  const low = sampler(1, [0, 30], { boundingRect: [0, 0, 300, 230] })
  const high = sampler(2, [100, 130], { boundingRect: [100, 100, 300, 230] })
  const memo = note(3, [120, 140], { boundingRect: [120, 110, 100, 100] })
  const nodes = [low, high, memo]
  assert.equal(targetAt(nodes, [150, 150], memo), high)
  assert.equal(targetAt(nodes, [50, 50], memo), low)
  assert.equal(targetAt(nodes, [50, 50], memo, true), null)
  assert.equal(targetAt(nodes, [50, 10], memo, true), low)
  assert.equal(targetAt(nodes, [150, 110], memo, true), high)
  assert.equal(targetAt(nodes, [900, 900], memo), null)
})

test("the dashed line runs between the facing edges, and not at all when they overlap", () => {
  assert.deepEqual(joint([0, 0, 100, 100], [300, 0, 100, 100]), [[100, 50], [300, 50]])
  assert.deepEqual(joint([0, 0, 100, 100], [0, 300, 100, 100]), [[50, 100], [50, 300]])
  assert.equal(joint([0, 0, 100, 100], [50, 50, 100, 100]), null)
})

test("the menu of a note attaches it, or detaches it from the node it names", () => {
  const host = sampler(1, [0, 0], { title: "Sampler" })
  const memo = note(2, [400, 0])
  graphOf(host, memo)
  const calls = []
  const pick = (node) => calls.push(["pick", node.id])
  const free = (node) => calls.push(["free", node.id])
  const say = (key, params) => key + (params ? ":" + params.node : "")
  assert.deepEqual(noteMenu(host, { say, pick, detach: free }), [])
  const first = noteMenu(memo, { say, pick, detach: free })
  assert.equal(first[0], null)
  assert.equal(first[1].content, "noteAttach")
  first[1].callback()
  attach(memo, host)
  const second = noteMenu(memo, { say, pick, detach: free })
  assert.deepEqual(second.slice(1).map((item) => item.content), ["noteDetach:Sampler", "noteAttachAnother"])
  second[1].callback()
  second[2].callback()
  assert.deepEqual(calls, [["pick", 2], ["free", 2], ["pick", 2]])
})

function canvasOf(graph) {
  const drawn = []
  const proto = {
    draw() {
      drawn.push("draw")
    },
    drawFrontCanvas() {
      drawn.push("front")
    },
    _processDraggedItems() {
      drawn.push("dropped")
    },
    selectItems(items) {
      drawn.push(["select", items.map((item) => item.properties?.[PROPERTY]?.node ?? null)])
    },
    _deserializeItems(items) {
      const created = items.nodes.map((node, index) => ({ id: 30 + index, properties: structuredClone(node.properties) }))
      this.selectItems(created)
      return { created }
    },
  }
  const canvas = Object.create(proto)
  canvas.graph = graph
  canvas.ds = { scale: 1, toCanvasContext() {} }
  canvas.ctx = {
    save() {},
    restore() {},
    beginPath() {},
    setLineDash() {},
    moveTo(...at) {
      drawn.push(["from", at])
    },
    lineTo(...at) {
      drawn.push(["to", at])
    },
    stroke() {},
    arc() {},
    fill() {},
    strokeRect() {},
  }
  return { canvas, drawn }
}

test("drawing keeps notes with their nodes and joins a selected pair with a line", () => {
  const host = sampler(1, [0, 30], { boundingRect: [0, 0, 300, 230] })
  const memo = note(2, [400, 80], { boundingRect: [400, 50, 200, 130] })
  const graph = graphOf(host, memo)
  attach(memo, host)
  let on = true
  const { canvas, drawn } = canvasOf(graph)
  installAttachedNotes(canvas, { enabled: () => on })
  canvas.draw()
  host.pos = [10, 30]
  canvas.draw()
  assert.deepEqual(memo.pos, [410, 80])
  canvas.drawFrontCanvas()
  assert.deepEqual(drawn, ["draw", "draw", "front"])
  host.selected = true
  canvas.drawFrontCanvas()
  assert.deepEqual(drawn.slice(4), [["from", [400, 115]], ["to", [300, 115]]])
  on = false
  host.pos = [500, 500]
  canvas.draw()
  assert.deepEqual(memo.pos, [410, 80])
  on = true
  canvas.draw()
  assert.deepEqual(memo.pos, [410, 80])
  host.pos = [510, 500]
  canvas.draw()
  assert.deepEqual(memo.pos, [420, 80])
})

test("a paste through the canvas relinks before the selection is made and leaves the canvas as it was", () => {
  const { canvas, drawn } = canvasOf(graphOf())
  installAttachedNotes(canvas, { enabled: () => true })
  const result = canvas._deserializeItems({
    nodes: [
      { id: 5, properties: {} },
      { id: 6, properties: { [PROPERTY]: { node: 5 } } },
    ],
  })
  assert.deepEqual(drawn, [["select", [null, 30]]])
  assert.deepEqual(result.created.map((node) => node.properties), [{}, { [PROPERTY]: { node: 30 } }])
  assert.equal(Object.hasOwn(canvas, "selectItems"), false)
})

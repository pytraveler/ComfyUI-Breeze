import assert from "node:assert/strict"
import { test } from "node:test"

import { connectCandidates, connectionCandidates, connectionSource, sourceExists } from "../../web/js/quick_connect.js"

function fixture() {
  let next = 0
  const graph = { _nodes: [], _groups: [], links: new Map(), getNodeById(id) { return this._nodes.find((node) => node.id === id) }, getLink(id) { return this.links.get(id) } }
  const node = (title, inputs, outputs) => {
    const item = {
      id: graph._nodes.length + 1, title, type: title, graph, pos: [50, 50],
      inputs: inputs.map((type, i) => ({ name: "input_" + i, type, link: null })),
      outputs: outputs.map((type, i) => ({ name: "output_" + i, type })),
      canConnectTo(other, input, output) { return this !== other && (input.type === output.type || input.type === "*") },
      connectSlots(output, target, input) {
        if (target.reject || !this.canConnectTo(target, input, output)) return null
        if (input.link != null) graph.links.delete(input.link)
        const link = { id: ++next, origin_id: this.id, origin_slot: this.outputs.indexOf(output), target_id: target.id, target_slot: target.inputs.indexOf(input) }
        input.link = link.id
        graph.links.set(link.id, link)
        return link
      },
      disconnectInput(index) { graph.links.delete(this.inputs[index].link); this.inputs[index].link = null },
    }
    graph._nodes.push(item)
    return item
  }
  const a = node("Image source", [], ["IMAGE"])
  const b = node("Final image", ["IMAGE", "MASK", "IMAGE"], [])
  const c = node("Preview", ["IMAGE"], [])
  const d = node("Other source", [], ["IMAGE"])
  const source = (item = a, side = "outputs", index = 0, moving) => connectionSource(graph, [{ node: item, fromSlot: item[side][index], toType: side === "outputs" ? "input" : "output", link: moving }])
  return { graph, a, b, c, d, node, source }
}

test("lists compatible individual ports in this graph, searchable by group, ID and custom title", () => {
  const { graph, a, b, c, node, source } = fixture()
  graph._groups.push({ title: "Final pass", _bounding: [0, 0, 100, 100] })
  c.pos = [500, 500]
  node("Wildcard", ["*"], [])
  const nested = node("Subgraph", [], [])
  nested.subgraph = { _nodes: [{ inputs: [{ type: "IMAGE" }] }] }
  assert.equal(connectionCandidates(source()).length, 4)
  const found = connectionCandidates(source(), { query: "final pass input_2 #" + b.id })
  assert.equal(found.length, 1)
  assert.equal(found[0].input, b.inputs[2])
  assert.ok(connectionCandidates(source()).every((row) => row.node !== a))
})

test("occupied inputs are opt-in and existing links are marked without duplication", () => {
  const { a, b, c, d, source } = fixture()
  a.connectSlots(a.outputs[0], b, b.inputs[0])
  d.connectSlots(d.outputs[0], c, c.inputs[0])
  const rows = connectionCandidates(source())
  assert.equal(rows.length, 2)
  assert.equal(rows.filter((row) => row.connected).length, 1)
  assert.equal(connectionCandidates(source(), { occupied: true }).length, 3)
  const id = b.inputs[0].link
  assert.deepEqual(connectCandidates(source(), [rows.find((row) => row.connected)]), { connected: 0, failed: 0 })
  assert.equal(b.inputs[0].link, id)
})

test("one output connects to several ports and an input chooses one source", () => {
  const { graph, a, b, c, d, source } = fixture()
  assert.deepEqual(connectCandidates(source(), connectionCandidates(source())), { connected: 3, failed: 0 })
  assert.equal(graph.links.size, 3)
  const reverse = source(b, "inputs")
  const rows = connectionCandidates(reverse, { occupied: true })
  assert.deepEqual(connectCandidates(reverse, rows), { connected: 0, failed: 2 })
  assert.deepEqual(connectCandidates(reverse, [rows.find((row) => row.node === d)]), { connected: 1, failed: 0 })
  assert.equal(graph.getLink(b.inputs[0].link).origin_id, d.id)
  assert.equal(graph.getLink(c.inputs[0].link).origin_id, a.id)
})

test("changed occupied ports and replaced node objects cannot be connected by stale controls", () => {
  const { graph, b, c, d, source } = fixture()
  const start = source()
  const rows = connectionCandidates(start)
  d.connectSlots(d.outputs[0], b, b.inputs[0])
  graph._nodes[graph._nodes.indexOf(c)] = { ...c }
  assert.deepEqual(connectCandidates(start, rows), { connected: 1, failed: 2 })
  assert.equal(graph.getLink(b.inputs[0].link).origin_id, d.id)
})

test("a rejected connection leaves both the old wire and the occupied destination intact", () => {
  const { graph, a, b, c, d, source } = fixture()
  const old = a.connectSlots(a.outputs[0], b, b.inputs[0])
  const other = d.connectSlots(d.outputs[0], c, c.inputs[0])
  const moving = source(a, "outputs", 0, old)
  const row = connectionCandidates(moving, { occupied: true }).find((row) => row.node === c)
  c.reject = true
  assert.deepEqual(connectCandidates(moving, [row]), { connected: 0, failed: 1 })
  assert.equal(graph.getLink(old.id), old)
  assert.equal(graph.getLink(other.id), other)
})

test("moving a wire disconnects its old input only after a successful connection", () => {
  const { graph, a, b, c, source } = fixture()
  const old = a.connectSlots(a.outputs[0], b, b.inputs[0])
  const moving = source(a, "outputs", 0, old)
  assert.ok(sourceExists(moving))
  const row = connectionCandidates(moving).find((row) => row.node === c)
  assert.deepEqual(connectCandidates(moving, [row]), { connected: 1, failed: 0 })
  assert.equal(b.inputs[0].link, null)
  assert.equal(graph.links.size, 1)
  assert.equal(graph.getLink(c.inputs[0].link).origin_id, a.id)
})

test("unsupported drags fall through and stale sources invalidate an open picker", () => {
  const { graph, a, b, source } = fixture()
  assert.equal(connectionSource(graph, []), null)
  assert.equal(connectionSource(graph, [{}, {}]), null)
  assert.equal(connectionSource(graph, [{ node: { id: -10 }, toType: "input" }]), null)
  const start = source()
  a.outputs = [{ ...a.outputs[0] }]
  assert.equal(sourceExists(start), false)
  assert.deepEqual(connectionCandidates(start), [])
  const reverse = source(b, "inputs")
  a.connectSlots(a.outputs[0], b, b.inputs[0])
  assert.equal(sourceExists(reverse), false)
})

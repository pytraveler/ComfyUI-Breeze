import assert from "node:assert/strict"
import { test } from "node:test"
import { REFERENCE, changesOf, copy, equal, referenceOf, rememberReference, restoreChange } from "../../web/js/workflow_changes.js"

function node(id, value) {
  return {
    id, type: "Sampler", title: "Sampler", pos: [0, 0], size: [200, 100], properties: {},
    widgets: [{ name: "seed", type: "number", value }],
    serialize() {
      return copy({ id: this.id, type: this.type, title: this.title, pos: this.pos, size: this.size, properties: this.properties, widgets_values: this.widgets.map((w) => w.value) })
    },
  }
}

function graph(...nodes) {
  const result = {
    id: "root", _nodes: nodes, extra: {}, links: [],
    getNodeById(id) { return this._nodes.find((n) => String(n.id) === String(id)) },
    serialize() { return copy({ id: this.id, nodes: this._nodes.map((n) => n.serialize()), extra: this.extra, links: this.links }) },
  }
  for (const n of nodes) n.graph = result
  return result
}

test("a single field restores without overwriting other edits, and runs the widget callback", () => {
  const sampler = node(1, 42)
  const root = graph(sampler)
  const baseline = root.serialize()
  sampler.widgets[0].value = 99
  sampler.pos = [20, 30]
  let called = null
  sampler.widgets[0].callback = (value) => { called = value }
  const rows = changesOf(root, baseline)
  assert.equal(rows.length, 2)
  const row = rows.find((r) => r.kind === "widget")
  assert.equal(row.before, 42)
  assert.equal(restoreChange(row, {}), true)
  assert.equal(called, 42)
  assert.deepEqual(sampler.pos, [20, 30])
  assert.deepEqual(changesOf(root, baseline).map((r) => r.field), ["pos"])
  assert.equal(restoreChange(row, {}), false)
})

test("stale controls cannot restore a removed or subsequently edited node", () => {
  const sampler = node("1", 42)
  const root = graph(sampler)
  const baseline = root.serialize()
  sampler.widgets[0].value = 99
  const row = changesOf(root, baseline)[0]
  sampler.widgets[0].value = 100
  assert.equal(restoreChange(row, {}), false)
  sampler.widgets[0].value = 99
  root._nodes = [node("1", 99)]
  assert.equal(restoreChange(row, {}), false)
})

test("reference snapshots survive serialization and never contain the previous reference", () => {
  const sampler = node(1, 42)
  const root = graph(sampler)
  rememberReference(root, " Base ")
  assert.equal(referenceOf(root).name, "Base")
  sampler.widgets[0].value = 99
  assert.equal(changesOf(root, referenceOf(root).state)[0].before, 42)
  rememberReference(root, "Replacement")
  assert.equal(referenceOf(root).state.extra, undefined)
  assert.deepEqual(changesOf(root, referenceOf(root).state), [])
  assert.equal(referenceOf(copy(root.serialize())).name, "Replacement")
  root.extra[REFERENCE] = { version: 7, state: { nodes: [] } }
  assert.equal(referenceOf(root), null)
})

test("string ids and subgraph definitions compare against the right graph", () => {
  const sampler = node("1", 42)
  const nested = graph(sampler)
  nested.id = "nested"
  const parent = node(1, 10)
  parent.subgraph = nested
  const root = graph(parent)
  const baseline = root.serialize()
  baseline.definitions = { subgraphs: [nested.serialize()] }
  sampler.widgets[0].value = 55
  const rows = changesOf(root, baseline)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].node, sampler)
  assert.deepEqual(rows[0].path, [parent])
})

test("added and removed nodes and rewired links are visible without destructive restore controls", () => {
  const root = graph(node(1, 1), node(2, 2))
  root.links = [[1, 1, 0, 2, 0, "INT"]]
  const baseline = root.serialize()
  root._nodes.pop()
  root._nodes.push(node(3, 3))
  root.links = [[2, 1, 0, 3, 0, "INT"]]
  const rows = changesOf(root, baseline)
  assert.deepEqual(rows.map((r) => r.kind), ["added", "removed", "links"])
  assert.ok(rows.every((r) => !r.editable))
})

test("object key and link order changes are not edits; field values are compared exactly", () => {
  assert.equal(equal({ a: 1, b: 2 }, { b: 2, a: 1 }), true)
  assert.equal(equal([1, 2], [2, 1]), false)
  assert.equal(equal(null, {}), false)
  const root = graph(node(1, 1))
  root.links = [[1, 1, 0, 2, 0, "INT"], [2, 1, 1, 3, 0, "INT"]]
  const baseline = root.serialize()
  root.links.reverse()
  assert.deepEqual(changesOf(root, baseline), [])
})

test("custom object serialization is reported without assigning it to a widget", () => {
  const custom = node(1, 1)
  custom.serialize = function () { return { id: this.id, type: this.type, widgets_values: { seed: this.widgets[0].value } } }
  const root = graph(custom)
  const baseline = root.serialize()
  custom.widgets[0].value = 2
  const rows = changesOf(root, baseline)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].before, { seed: 1 })
  assert.equal(restoreChange(rows[0], {}), false)
})

test("fields use the latest saved baseline; remembering a reference does not itself add a node change", () => {
  const sampler = node(1, 1)
  const root = graph(sampler)
  const baseline = root.serialize()
  rememberReference(root, "Template")
  assert.deepEqual(changesOf(root, baseline), [])
  sampler.widgets[0].value = 2
  const saved = root.serialize()
  assert.deepEqual(changesOf(root, saved), [])
  assert.equal(changesOf(root, referenceOf(root).state)[0].before, 1)
  assert.deepEqual(changesOf(root, null), [])
})

import assert from "node:assert/strict"
import { test } from "node:test"

import { ROUTE, ago, fetchOutputs, wireValue } from "../../web/js/last_run.js"
import { speaker } from "../../web/js/words.js"

function root(id, nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return { id, getNodeById: (nodeId) => byId.get(nodeId) ?? null }
}

function link(origin, slot = 0) {
  return { id: 1, origin_id: origin, origin_slot: slot, target_id: 99, target_slot: 0 }
}

function server(body, ok = true) {
  const asked = []
  const fetchApi = async (route) => {
    asked.push(route)
    return { ok, json: async () => body }
  }
  return { asked, fetchApi }
}

test("the descriptions are asked for by the workflow's id", async () => {
  const nodes = { "4": { type: "VAEDecode", outputs: ["1x8x8x3 float32"], at: 0 } }
  const { asked, fetchApi } = server({ workflow: "a b/c", nodes })
  assert.deepEqual(await fetchOutputs(fetchApi, "a b/c"), nodes)
  assert.deepEqual(asked, [ROUTE + "?workflow=a%20b%2Fc"])
})

test("no id, a refusal, a wrong answer or no answer at all give nothing", async () => {
  assert.equal(await fetchOutputs(server({}).fetchApi, ""), null)
  assert.equal(await fetchOutputs(server({}, false).fetchApi, "g"), null)
  assert.equal(await fetchOutputs(server({ workflow: "other", nodes: {} }).fetchApi, "g"), null)
  const down = async () => { throw new TypeError("Failed to fetch") }
  assert.equal(await fetchOutputs(down, "g"), null)
})

test("the tooltip shows the description of the slot the wire leaves", () => {
  const outputs = { "4": { type: "VAEDecode", outputs: ["1x1536x1024x3 float32", "second"], at: 0 } }
  const graph = root("g", [{ id: 4, comfyClass: "VAEDecode" }])
  assert.deepEqual(wireValue(outputs, graph, graph, link(4, 0), 5000),
    { label: "last run, just now", text: "1x1536x1024x3 float32" })
  assert.equal(wireValue(outputs, graph, graph, link(4, 1), 5000).text, "second")
})

test("a node replaced under the same id says nothing until it has run", () => {
  const outputs = { "4": { type: "VAEDecode", outputs: ["old"], at: 0 } }
  const graph = root("g", [{ id: 4, comfyClass: "ImageScale" }])
  assert.equal(wireValue(outputs, graph, graph, link(4)), null)
})

test("a node the server has nothing on says nothing", () => {
  const graph = root("g", [{ id: 4, comfyClass: "VAEDecode" }])
  assert.equal(wireValue({}, graph, graph, link(4)), null)
  assert.equal(wireValue(null, graph, graph, link(4)), null)
  const inherited = root("g", [{ id: "constructor", comfyClass: "X" }])
  assert.equal(wireValue({}, inherited, inherited, link("constructor")), null)
})

test("inside a subgraph no value is guessed at", () => {
  const outputs = { "4": { type: "VAEDecode", outputs: ["x"], at: 0 } }
  const inner = root("sub", [{ id: 4, comfyClass: "VAEDecode" }])
  assert.equal(wireValue(outputs, root("g", []), inner, link(4)), null)
})

test("a Primitive shows its own value, run or not", () => {
  const graph = root("g", [{ id: 7, isVirtualNode: true, widgets: [{ value: 768 }] }])
  assert.deepEqual(wireValue(null, graph, graph, link(7)), { label: "value", text: "768" })
})

test("an age reads the way a person would say it", () => {
  assert.equal(ago(3000), "just now")
  assert.equal(ago(42000), "42 s ago")
  assert.equal(ago(5 * 60000), "5 min ago")
  assert.equal(ago(3 * 3600000), "3 h ago")
})

test("the labels are said in the words they are given", () => {
  const say = speaker(() => ({ lastRun: "dernier, {ago}", minutesAgo: "il y a {n} min", value: "valeur" }))
  const outputs = { "4": { type: "VAEDecode", outputs: ["x"], at: 0 } }
  const graph = root("g", [{ id: 4, comfyClass: "VAEDecode" }, { id: 7, isVirtualNode: true, widgets: [{ value: 1 }] }])
  assert.equal(wireValue(outputs, graph, graph, link(4), 5 * 60000, say).label, "dernier, il y a 5 min")
  assert.equal(wireValue(null, graph, graph, link(7), 0, say).label, "valeur")
  assert.equal(ago(42000, say), "42 s ago")
})

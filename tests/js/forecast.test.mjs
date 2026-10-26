import assert from "node:assert/strict"
import { test } from "node:test"

import { ROUTE, duration, fetchForecast, movingNodes, onCanvas, summary, summaryLines } from "../../web/js/forecast.js"
import { speaker } from "../../web/js/words.js"

function server(body, ok = true) {
  const asked = []
  const fetchApi = async (route, options) => {
    asked.push({ route, options })
    return { ok, json: async () => body }
  }
  return { asked, fetchApi }
}

const REQUEST = { workflow: "wf", prompt: { "3": { class_type: "KSampler", inputs: {} } }, moving: [] }

test("the prompt is posted as JSON, and the states come back", async () => {
  const nodes = { "3": { state: "run", seconds: 12.5 } }
  const { asked, fetchApi } = server({ workflow: "wf", nodes })
  assert.deepEqual(await fetchForecast(fetchApi, REQUEST), { nodes })
  assert.equal(asked[0].route, ROUTE)
  assert.equal(asked[0].options.method, "POST")
  assert.deepEqual(JSON.parse(asked[0].options.body), REQUEST)
})

test("a refusal by the server is passed on as its reason", async () => {
  const { fetchApi } = server({ workflow: "wf", error: "Prompt has no outputs" })
  assert.deepEqual(await fetchForecast(fetchApi, REQUEST), { error: "Prompt has no outputs" })
})

test("no prompt, no route, a wrong answer or no answer at all give nothing", async () => {
  const { asked, fetchApi } = server({})
  assert.equal(await fetchForecast(fetchApi, { workflow: "wf" }), null)
  assert.equal(asked.length, 0)
  assert.equal(await fetchForecast(server({}, false).fetchApi, REQUEST), null)
  assert.equal(await fetchForecast(server({ nodes: "x" }).fetchApi, REQUEST), null)
  const down = async () => { throw new TypeError("Failed to fetch") }
  assert.equal(await fetchForecast(down, REQUEST), null)
})

function seeded(id, control) {
  const linked = [{ name: "control_after_generate", value: control }, { name: "control_filter_list", value: "" }]
  return { id, widgets: [{ name: "seed", linkedWidgets: linked }, { name: "steps" }] }
}

test("a value the frontend changes before queueing moves its node", () => {
  const graph = { nodes: [seeded(3, "randomize"), seeded(4, "fixed"), { id: 5, widgets: [{ name: "text" }] }, { id: 6 }] }
  assert.deepEqual(movingNodes(graph, true), ["3"])
  assert.deepEqual(movingNodes(graph, false), [])
  assert.deepEqual(movingNodes(null, true), [])
})

test("a node inside a subgraph counts for the subgraph's node on the canvas", () => {
  const found = onCanvas({
    "3": { state: "cached" },
    "12:5": { state: "cached" },
    "12:7:1": { state: "run", seconds: 4 },
    "12:8": { state: "run", seconds: 1.5 },
    "12:9": { state: "always" },
    "20": { state: "maybe" },
    "21": { state: "lost" },
  })
  assert.deepEqual(found.get("3"), { state: "cached", seconds: 0, untimed: 0, computed: 0, timed: false })
  assert.deepEqual(found.get("12"), { state: "always", seconds: 5.5, untimed: 1, computed: 3, timed: true })
  assert.equal(found.get("20").state, "maybe")
  assert.equal(found.has("21"), false)
})

test("a duration reads in the largest unit that fits", () => {
  assert.equal(duration(0.3), "<1 s")
  assert.equal(duration(38.4), "38 s")
  assert.equal(duration(80), "1 min 20 s")
  assert.equal(duration(3900), "1 h 5 min")
  assert.equal(duration(-1), "")
  assert.equal(duration(Number.NaN), "")
})

test("the summary counts the states and adds up the seconds of what is computed", () => {
  const nodes = {
    "1": { state: "cached", seconds: 9 },
    "2": { state: "run", seconds: 30 },
    "3": { state: "always", seconds: 8 },
    "4": { state: "run" },
    "5": { state: "maybe", seconds: 100 },
  }
  assert.deepEqual(summary(nodes), { always: 1, run: 2, maybe: 1, cached: 1, seconds: 38, untimed: 1 })
})

test("the tip under Run says what is computed, how long it takes and what is not", () => {
  const timed = summaryLines({ nodes: { "1": { state: "cached" }, "2": { state: "run", seconds: 40 } } })
  assert.deepEqual(timed, [
    { state: "run", text: "Computed again: 1" },
    { state: "cached", text: "From the cache: 1" },
    { text: "About 40 s" },
  ])
  const partly = summaryLines({ nodes: { "2": { state: "run", seconds: 40 }, "3": { state: "always" } } })
  assert.deepEqual(partly.map((line) => line.text),
    ["Computed again: 1", "Computed on every run: 1", "At least 40 s; not timed yet: 1"])
  assert.deepEqual(summaryLines({ nodes: { "2": { state: "run" } } }).at(-1), { text: "Not timed yet" })
  assert.deepEqual(summaryLines({ nodes: { "2": { state: "run", seconds: 0.2 } } }).at(-1), { text: "Under a second" })
  const quick = summaryLines({ nodes: { "2": { state: "run", seconds: 0.2 }, "3": { state: "run" } } })
  assert.deepEqual(quick.at(-1), { text: "Not timed yet: 1" })
  assert.deepEqual(summaryLines({ nodes: { "1": { state: "cached" } } }),
    [{ state: "cached", text: "Nothing to compute: it all comes from the cache" }])
})

test("a refusal or silence is said as such, in the words of the locale", () => {
  assert.deepEqual(summaryLines({ error: "Prompt has no outputs" }), [{ text: "No forecast: Prompt has no outputs" }])
  assert.deepEqual(summaryLines(null), [{ text: "No forecast: the server did not answer" }])
  const say = speaker(() => ({ forecastRun: "Recalcule : {n}", durationSeconds: "{n} sec", forecastTime: "Environ {time}" }))
  const lines = summaryLines({ nodes: { "2": { state: "run", seconds: 5 } } }, say)
  assert.deepEqual(lines.map((line) => line.text), ["Recalcule : 1", "Environ 5 sec"])
})

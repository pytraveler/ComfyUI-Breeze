import assert from "node:assert/strict"
import { test } from "node:test"

import {
  follow, heads, installRunLight, plan, rgbOf, runWatch, sameWorkflow, stretchOf, travelTime, watchQueue, wireGlow,
} from "../../web/js/run_light.js"
import { measure } from "../../web/js/wire_arrows.js"

const SPLINE = 2
const HIDDEN = -1

function node(id, { outputs = [], inputs = 0, virtual = false, subgraph = null, rect = [0, 0, 200, 100] } = {}) {
  const [x, y, width] = rect
  return {
    id,
    boundingRect: rect,
    inputs: Array.from({ length: inputs }, () => ({})),
    outputs: outputs.map((links) => ({ links })),
    isVirtualNode: virtual || Boolean(subgraph),
    isSubgraphNode: () => Boolean(subgraph),
    subgraph,
    getInputPos: (slot) => [x, y + 40 + 20 * slot],
    getOutputPos: (slot) => [x + width, y + 40 + 20 * slot],
  }
}

function link(id, origin, originSlot, target, targetSlot) {
  return { id, origin_id: origin, origin_slot: originSlot, target_id: target, target_slot: targetSlot, type: "IMAGE" }
}

function graph(nodes, links, extra = {}) {
  const byId = new Map(nodes.map((item) => [String(item.id), item]))
  const map = new Map(links.map((item) => [item.id, item]))
  return { getNodeById: (id) => byId.get(String(id)) ?? null, getLink: (id) => map.get(id), ...extra }
}

const timeOf = (_, wire) => 10 * wire.id

function lit(pulses) {
  return pulses.map(({ link: wire, start, duration }) => [wire.id, start, duration])
}

test("a node that finishes lights every wire out of each of its outputs, all at once", () => {
  const root = graph(
    [node(1, { outputs: [[7, 8], [9]] }), node(2, { inputs: 1 }), node(3, { inputs: 1 }), node(4, { inputs: 1 })],
    [link(7, 1, 0, 2, 0), link(8, 1, 0, 3, 0), link(9, 1, 1, 4, 0)],
  )
  const pulses = plan(root, "1", timeOf, 1000)
  assert.deepEqual(lit(pulses), [[7, 1000, 70], [8, 1000, 80], [9, 1000, 90]])
  assert.ok(pulses.every((pulse) => pulse.graph === root))
})

test("the light goes on through a reroute node once it gets there", () => {
  const root = graph(
    [node(1, { outputs: [[7]] }), node(5, { inputs: 1, outputs: [[11, 12]], virtual: true }),
      node(2, { inputs: 1 }), node(3, { inputs: 1 })],
    [link(7, 1, 0, 5, 0), link(11, 5, 0, 2, 0), link(12, 5, 0, 3, 0)],
  )
  assert.deepEqual(lit(plan(root, "1", timeOf, 1000)), [[7, 1000, 70], [11, 1070, 110], [12, 1070, 120]])
})

test("reroute nodes wired into a loop light each wire once", () => {
  const root = graph(
    [node(1, { outputs: [[7]] }), node(5, { inputs: 1, outputs: [[11]], virtual: true }),
      node(6, { inputs: 1, outputs: [[12]], virtual: true })],
    [link(7, 1, 0, 5, 0), link(11, 5, 0, 6, 0), link(12, 6, 0, 5, 0)],
  )
  assert.deepEqual(lit(plan(root, "1", timeOf, 0)).map(([id]) => id), [7, 11, 12])
})

test("a node inside a subgraph lights its own wires, and its subgraph's node the outputs they reach", () => {
  const output = { id: -20 }
  const inner = graph(
    [node(5, { outputs: [[31, 32]] }), node(6, { inputs: 1 })],
    [link(31, 5, 0, 6, 0), link(32, 5, 0, -20, 1)],
    { outputNode: output },
  )
  const root = graph(
    [node(12, { inputs: 1, outputs: [[40], [41]], subgraph: inner }), node(2, { inputs: 1 }), node(3, { inputs: 1 })],
    [link(40, 12, 0, 2, 0), link(41, 12, 1, 3, 0)],
  )
  const pulses = plan(root, "12:5", timeOf, 1000)
  assert.deepEqual(lit(pulses).map(([id]) => id), [31, 32, 41])
  assert.deepEqual(pulses.map((pulse) => pulse.graph === inner), [true, true, false])
})

test("a wire into a subgraph's node goes on inside it, from the input it reaches", () => {
  const inner = graph(
    [node(5, { inputs: 1 }), node(6, { inputs: 1 })],
    [link(50, -10, 0, 5, 0), link(51, -10, 1, 6, 0)],
    { inputNode: { id: -10, slots: [{ linkIds: [50] }, { linkIds: [51] }] } },
  )
  const root = graph(
    [node(1, { outputs: [[7]] }), node(12, { inputs: 2, subgraph: inner })],
    [link(7, 1, 0, 12, 1)],
  )
  const pulses = plan(root, "1", timeOf, 1000)
  assert.deepEqual(lit(pulses), [[7, 1000, 70], [51, 1070, 510]])
  assert.equal(pulses[1].graph, inner)
})

test("an id that names no node of the workflow lights nothing", () => {
  const root = graph([node(1, { outputs: [[7]] }), node(2, { inputs: 1 })], [link(7, 1, 0, 2, 0)])
  for (const id of ["99", "1:4", "1.0.3", ""]) assert.deepEqual(plan(root, id, timeOf, 0), [], id)
  assert.deepEqual(plan(null, "1", timeOf, 0), [])
})

test("a node counts as finished once, the first time the run says so", () => {
  const watch = runWatch()
  watch.start("a")
  assert.deepEqual(watch.progress({ prompt_id: "a", nodes: { 1: { state: "running" } } }), [])
  assert.deepEqual(watch.progress({ prompt_id: "a", nodes: { 1: { state: "finished" }, 2: { state: "running" } } }), ["1"])
  assert.deepEqual(watch.progress({ prompt_id: "a", nodes: { 1: { state: "finished" }, 2: { state: "running" } } }), [])
  assert.deepEqual(watch.progress({ prompt_id: "a", nodes: { 1: { state: "finished" }, 2: { state: "finished" } } }), ["2"])
  watch.start("b")
  assert.deepEqual(watch.progress({ prompt_id: "b", nodes: { 1: { state: "finished" } } }), ["1"], "a new run starts afresh")
})

test("a run the page joins half way lights only what finishes after that", () => {
  const watch = runWatch()
  assert.deepEqual(watch.progress({ prompt_id: "a", nodes: { 1: { state: "finished" }, 2: { state: "running" } } }), [])
  assert.deepEqual(watch.progress({ prompt_id: "a", nodes: { 1: { state: "finished" }, 2: { state: "finished" } } }), ["2"])
  for (const odd of [null, undefined, {}, { prompt_id: "a" }, { prompt_id: "a", nodes: 7 }]) {
    assert.deepEqual(watch.progress(odd), [], JSON.stringify(odd))
  }
})

test("the light keeps one pace along a wire, within bounds, and the setting multiplies it", () => {
  assert.equal(travelTime(225, 2, 1), 1000)
  assert.equal(travelTime(450, 1, 1), 1000)
  assert.equal(travelTime(450, 1, 2), 500)
  assert.equal(travelTime(10, 1, 1), 700, "a short wire still shows the light")
  assert.equal(travelTime(10000, 1, 1), 2000, "a long one does not keep it for ever")
  assert.equal(travelTime(10000, 1, 0.25), 8000)
  assert.equal(travelTime(450, 1, 0), 1000)
})

test("a repeated light sets off again each time the one before reaches the input", () => {
  const pulse = { start: 0, duration: 1000, repeats: 3 }
  assert.deepEqual(heads(pulse, -1, 500, 100), [])
  assert.deepEqual(heads(pulse, 500, 500, 100), [250])
  assert.deepEqual(heads(pulse, 1100, 500, 100), [550, 50], "the tail of the first is still going in")
  assert.deepEqual(heads(pulse, 1500, 500, 100), [250])
  assert.deepEqual(heads(pulse, 2500, 500, 100), [250])
  assert.deepEqual(heads(pulse, 3300, 500, 100), [])
  assert.deepEqual(heads({ start: 0, duration: 1000 }, 1500, 500, 100), [], "once, unless told otherwise")
})

test("the whole wire glows while the light runs along it, fading in and out", () => {
  const pulse = { start: 0, duration: 1000, repeats: 2 }
  assert.equal(wireGlow(pulse, -10, 500, 100), 0)
  assert.ok(wireGlow(pulse, 100, 500, 100) > 0 && wireGlow(pulse, 100, 500, 100) < 1)
  assert.equal(wireGlow(pulse, 1000, 500, 100), 1)
  assert.ok(wireGlow(pulse, 2100, 500, 100) > 0 && wireGlow(pulse, 2100, 500, 100) < 1)
  assert.equal(wireGlow(pulse, 2200, 500, 100), 0)
})

test("a light sent along chosen wires starts on them now and goes on as a run's would", () => {
  const root = graph(
    [node(1, { outputs: [[7, 8]] }), node(5, { inputs: 1, outputs: [[11]], virtual: true }), node(2, { inputs: 1 }),
      node(3, { inputs: 1 })],
    [link(7, 1, 0, 5, 0), link(8, 1, 0, 3, 0), link(11, 5, 0, 2, 0)],
  )
  assert.deepEqual(lit(follow(root, [root.getLink(7)], timeOf, 500)), [[7, 500, 70], [11, 570, 110]])
  assert.deepEqual(follow(root, [], timeOf, 500), [])
})

test("a stretch of a wire is the part of the line between two distances along it", () => {
  const line = measure([[0, 0], [10, 0], [10, 10]])
  assert.deepEqual(stretchOf(line, 5, 15), [[5, 0], [10, 0], [10, 5]])
  assert.deepEqual(stretchOf(line, 0, 20), [[0, 0], [10, 0], [10, 10]])
})

test("a wire's colour is read from the hex forms the canvas uses, and anything else is white", () => {
  assert.deepEqual(rgbOf("#64B5F6"), [100, 181, 246])
  assert.deepEqual(rgbOf("#64b5f680"), [100, 181, 246])
  assert.deepEqual(rgbOf("#7F7"), [119, 255, 119])
  for (const odd of ["red", "rgb(1, 2, 3)", "#12345", "", undefined]) assert.deepEqual(rgbOf(odd), [255, 255, 255], String(odd))
})

test("the page remembers which workflow each prompt it queued came from", async () => {
  const api = {
    sent: 0,
    async queuePrompt(number, data) {
      this.sent++
      if (data.fail) throw new Error("refused")
      return { prompt_id: "p" + number }
    },
  }
  const queued = watchQueue(api)
  assert.deepEqual(await api.queuePrompt(1, { workflow: { id: "w" } }), { prompt_id: "p1" })
  assert.equal(queued("p1"), "w")
  assert.equal(queued("p2"), undefined)
  await assert.rejects(api.queuePrompt(2, { fail: true, workflow: { id: "v" } }))
  assert.equal(queued("p2"), undefined)
  assert.equal(api.sent, 2)
  for (let i = 3; i < 200; i++) await api.queuePrompt(i, { workflow: { id: "x" } })
  assert.equal(queued("p1"), undefined, "only the latest are kept")
  assert.equal(queued("p199"), "x")
})

test("a run lights the open workflow when it came from there, or from nowhere the page knows", () => {
  assert.equal(sameWorkflow("w", "w"), true)
  assert.equal(sameWorkflow(undefined, "w"), true)
  assert.equal(sameWorkflow("v", "w"), false)
})

function scene() {
  const root = graph(
    [node(1, { outputs: [[7, 8]] }), node(2, { inputs: 1, rect: [1000, 0, 200, 100] }),
      node(3, { inputs: 1, rect: [1000, 400, 200, 100] })],
    [link(7, 1, 0, 2, 0), link(8, 1, 0, 3, 0)],
  )
  const drawn = []
  const gradient = () => ({ addColorStop() {} })
  const ctx = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc(x, y) { drawn.push([x, y]) },
    stroke() {}, fill() {}, createLinearGradient: gradient, createRadialGradient: gradient,
  }
  const canvas = {
    graph: root, ctx, links_render_mode: SPLINE, connections_width: 4, renderedPaths: new Set([root.getLink(7)]),
    ds: { scale: 1, toCanvasContext() {} }, dirty: 0, setDirty() { this.dirty++ },
  }
  return { root, canvas, drawn }
}

test("a finished node's drawn wires carry a light, frame after frame, until it has gone by", (t) => {
  let clock = 0
  t.mock.method(performance, "now", () => clock)
  globalThis.requestAnimationFrame = (step) => step()
  const { root, canvas, drawn } = scene()
  const handlers = {}
  const earlier = []
  canvas.onRender = () => earlier.push(clock)
  installRunLight(canvas, {
    enabled: () => true, speed: () => 1, root: () => root, workflow: () => "w",
    listen: (type, handler) => { handlers[type] = handler },
  })
  handlers.execution_start({ detail: { prompt_id: "p" } })
  handlers.progress_state({ detail: { prompt_id: "p", nodes: { 1: { state: "finished" } } } })
  assert.equal(canvas.dirty, 1)
  const heads = []
  const all = []
  for (clock = 100; clock < 3000; clock += 100) {
    drawn.length = 0
    canvas.onRender()
    all.push(...drawn)
    heads.push(drawn.length ? drawn[0][0] : null)
  }
  assert.equal(earlier.length, heads.length, "whatever was drawn here before still is")
  const moving = heads.filter((x) => x != null)
  assert.ok(moving.length >= 3, String(heads))
  assert.ok(moving.every((x, i) => i === 0 || x > moving[i - 1]), "the light runs from the output to the input")
  assert.equal(heads.at(-1), null, "and is gone once it has passed")
  assert.ok(all.every(([, y]) => Math.abs(y - 40) < 1e-6), "wire 8 was not drawn, so no light runs on it")
})

test("no light runs while it is turned off, or in a workflow the run did not come from", () => {
  globalThis.requestAnimationFrame = () => {}
  for (const [enabled, workflow, mode] of [[false, "w", SPLINE], [true, "v", SPLINE], [true, "w", HIDDEN]]) {
    const { root, canvas, drawn } = scene()
    const handlers = {}
    installRunLight(canvas, {
      enabled: () => enabled, speed: () => 1, root: () => root, workflow: () => workflow, queued: () => "w",
      listen: (type, handler) => { handlers[type] = handler },
    })
    canvas.links_render_mode = mode
    handlers.execution_start({ detail: { prompt_id: "p" } })
    handlers.progress_state({ detail: { prompt_id: "p", nodes: { 1: { state: "finished" } } } })
    canvas.onRender()
    assert.deepEqual(drawn, [], String([enabled, workflow, mode]))
  }
})

test("the light runs along a wire as many times as the setting says, and a chosen wire gets it too", (t) => {
  let clock = 0
  t.mock.method(performance, "now", () => clock)
  globalThis.requestAnimationFrame = (step) => step()
  const { root, canvas, drawn } = scene()
  const handlers = {}
  const light = installRunLight(canvas, {
    enabled: () => true, speed: () => 1, repeats: () => 3, root: () => root, workflow: () => "w",
    listen: (type, handler) => { handlers[type] = handler },
  })
  const passes = () => {
    let count = 0
    let last = Infinity
    const start = clock
    for (; clock < start + 10000; clock += 50) {
      drawn.length = 0
      canvas.onRender()
      const x = drawn.length ? Math.min(...drawn.map(([each]) => each)) : null
      if (x != null && x < last) count++
      last = x ?? Infinity
    }
    return count
  }
  handlers.execution_start({ detail: { prompt_id: "p" } })
  handlers.progress_state({ detail: { prompt_id: "p", nodes: { 1: { state: "finished" } } } })
  assert.equal(passes(), 3)
  light.run(root, [root.getLink(7)])
  assert.equal(passes(), 3)
  assert.equal(light.enabled(), true)
})

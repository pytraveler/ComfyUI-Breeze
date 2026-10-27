import assert from "node:assert/strict"
import { test } from "node:test"

import { route, splits } from "../../web/js/trunks.js"
import { arrowAt, arrowsAround, flashAlpha, wireLine } from "../../web/js/wire_arrows.js"

const SPLINE = 2
const STRAIGHT = 0
const LINEAR = 1

function node(id, rect, { inputs = 1, outputs = 1, dirs = [] } = {}) {
  const [x, y, width] = rect
  return {
    id,
    boundingRect: rect,
    inputs: Array.from({ length: inputs }, (_, i) => ({ dir: dirs[i] })),
    outputs: Array.from({ length: outputs }, () => ({})),
    getInputPos: (slot) => [x, y + 40 + 20 * slot],
    getOutputPos: (slot) => [x + width, y + 40 + 20 * slot],
  }
}

function link(id, origin, originSlot, target, targetSlot, extra = {}) {
  return { id, origin_id: origin, origin_slot: originSlot, target_id: target, target_slot: targetSlot, type: "IMAGE", ...extra }
}

function graph(nodes, links, extra = {}) {
  const byId = new Map(nodes.map((item) => [item.id, item]))
  const map = new Map(links.map((item) => [item.id, item]))
  return { getNodeById: (id) => byId.get(id), getLink: (id) => map.get(id), ...extra }
}

const LOAD = [0, 0, 200, 100]
const INVERT = [1000, 0, 200, 100]
const PREVIEW = [1000, 400, 200, 100]

function fan() {
  return graph(
    [node(1, LOAD, { inputs: 0 }), node(2, INVERT), node(3, PREVIEW)],
    [link(7, 1, 0, 2, 0), link(8, 1, 0, 3, 0)],
  )
}

function bezier(a, c1, c2, b, t) {
  const u = 1 - t
  return [0, 1].map((k) => u * u * u * a[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * b[k])
}

function off(points, point) {
  let least = Infinity
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]
    const dx = points[i][0] - ax
    const dy = points[i][1] - ay
    const span = dx * dx + dy * dy
    const t = span ? Math.min(1, Math.max(0, ((point[0] - ax) * dx + (point[1] - ay) * dy) / span)) : 0
    least = Math.min(least, Math.hypot(ax + dx * t - point[0], ay + dy * t - point[1]))
  }
  return least
}

test("a wire is followed from its output to its input, along the curve the canvas draws", () => {
  const line = wireLine(fan(), fan().getLink(8), SPLINE)
  const a = [200, 40]
  const b = [1000, 440]
  const reach = Math.hypot(800, 400) * 0.25
  assert.deepEqual(line[0], a)
  assert.deepEqual(line.at(-1), b)
  for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const point = bezier(a, [a[0] + reach, a[1]], [b[0] - reach, b[1]], b, t)
    assert.ok(off(line, point) < 1, String(t))
  }
})

test("the straight and linear modes are followed as the broken lines they draw", () => {
  const g = fan()
  assert.deepEqual(wireLine(g, g.getLink(8), STRAIGHT),
    [[200, 40], [210, 40], [600, 40], [600, 440], [990, 440], [1000, 440]])
  assert.deepEqual(wireLine(g, g.getLink(8), LINEAR), [[200, 40], [215, 40], [985, 440], [1000, 440]])
})

test("a wire through reroutes passes each of them, in order", () => {
  const first = { pos: [400, 300], cos: 1, sin: 0, controlPoint: [-50, 0] }
  const second = { pos: [700, 100], cos: 0, sin: -1, controlPoint: [0, 50] }
  first.getReroutes = () => [first]
  second.getReroutes = () => [first, second]
  const g = graph(
    [node(1, LOAD, { inputs: 0 }), node(2, INVERT)],
    [link(7, 1, 0, 2, 0, { parentId: 21 })],
    { reroutes: new Map([[20, first], [21, second]]) },
  )
  const line = wireLine(g, g.getLink(7), SPLINE)
  const at = (point) => line.findIndex(([x, y]) => Math.hypot(x - point[0], y - point[1]) < 1e-9)
  assert.ok(at(first.pos) > 0 && at(second.pos) > at(first.pos) && at([1000, 40]) === line.length - 1)
})

test("resting on a wire puts an arrow on each side of the pointer, each pointing away from it along the wire", () => {
  const g = fan()
  const line = wireLine(g, g.getLink(7), SPLINE)
  const pointer = line[Math.floor(line.length / 2)]
  const arrows = arrowsAround(g, [g.getLink(7)], pointer, 1, SPLINE, () => "#64b5f6")
  assert.deepEqual(arrows.map((arrow) => arrow.key), ["source", "target"])
  const [back, ahead] = arrows
  assert.ok(back.middle[0] < pointer[0] && ahead.middle[0] > pointer[0], "the output is to the left, the input to the right")
  for (const arrow of arrows) {
    const base = [(arrow.left[0] + arrow.right[0]) / 2, (arrow.left[1] + arrow.right[1]) / 2]
    const near = Math.hypot(base[0] - pointer[0], base[1] - pointer[1])
    const far = Math.hypot(arrow.tip[0] - pointer[0], arrow.tip[1] - pointer[1])
    assert.ok(far > near && near > 5, arrow.key + ": the tip is the end further from the pointer")
    assert.ok(off(line, arrow.tip) < 1 && off(line, base) < 1, arrow.key + ": on the wire")
    assert.equal(arrow.colour, "#64b5f6")
  }
  assert.deepEqual(back.goals, [LOAD])
  assert.deepEqual(ahead.goals, [INVERT])
})

test("an arrow keeps its size on screen zoomed out, and grows with the wire zoomed in", () => {
  const straight = graph([node(1, LOAD, { inputs: 0 }), node(2, [1000, 0, 200, 100])], [link(7, 1, 0, 2, 0)])
  for (const [scale, onScreen] of [[0.25, 16], [1, 16], [2, 32], [4, 64]]) {
    const [, ahead] = arrowsAround(straight, [straight.getLink(7)], [600, 40], scale, SPLINE, () => "#fff")
    const base = (ahead.left[0] + ahead.right[0]) / 2
    assert.ok(Math.abs((ahead.tip[0] - base) * scale - onScreen) < 1e-6, String(scale))
    assert.ok(Math.abs(Math.abs(ahead.left[1] - ahead.right[1]) * scale - onScreen) < 1e-6, String(scale))
    assert.equal(arrowAt([ahead], ahead.middle, scale), ahead, "a press on a grown arrow still lands")
  }
})

test("next to an end there is no room for the arrow towards it", () => {
  const g = fan()
  const arrows = arrowsAround(g, [g.getLink(7)], [205, 40], 1, SPLINE, () => "#fff")
  assert.deepEqual(arrows.map((arrow) => arrow.key), ["target"])
})

test("a pointer away from the line worked out gets no arrows", () => {
  const g = fan()
  assert.deepEqual(arrowsAround(g, [g.getLink(7)], [600, 300], 1, SPLINE, () => "#fff"), [])
})

test("the wire drawn on top is tried first, then the others under the pointer", () => {
  const g = fan()
  const onSeven = wireLine(g, g.getLink(7), SPLINE)[30]
  const arrows = arrowsAround(g, [g.getLink(7), g.getLink(8)], onSeven, 1, SPLINE, (item) => "#" + item.id)
  assert.ok(arrows.length && arrows.every((arrow) => arrow.colour === "#7"))
})

test("wires under the pointer that leave one output fly to every input they reach", () => {
  const g = fan()
  const line = wireLine(g, g.getLink(8), SPLINE)
  const arrows = arrowsAround(g, [g.getLink(7), g.getLink(8)], line[20], 1, SPLINE, () => "#fff")
  assert.deepEqual(arrows.find((arrow) => arrow.key === "target").goals, [INVERT, PREVIEW])
  assert.deepEqual(arrows.find((arrow) => arrow.key === "source").goals, [LOAD])
})

test("a wire on a trunk is followed along the trunk and its branch, and the trunk flies to both inputs", () => {
  const g = fan()
  const [{ split }] = splits([200, 40], [{ id: 7, at: [1000, 40] }, { id: 8, at: [1000, 440] }])
  const routes = new Map([[7, route([200, 40], split, [1000, 40])], [8, route([200, 40], split, [1000, 440])]])
  const routeOf = (item) => routes.get(item.id) ?? null
  const line = wireLine(g, g.getLink(8), SPLINE, routes.get(8))
  const fork = line.findIndex(([x, y]) => x === split[0] && y === split[1])
  assert.ok(fork > 0 && fork < line.length - 1, "the line passes the split")
  assert.deepEqual([line[0], line.at(-1)], [[200, 40], [1000, 440]])
  const onTrunk = line[Math.floor(fork / 2)]
  const own = wireLine(g, g.getLink(8), SPLINE)
  assert.ok(off(own, onTrunk) > 12, "the trunk is away from where the wire would run on its own")
  const arrows = arrowsAround(g, [g.getLink(7), g.getLink(8)], onTrunk, 1, SPLINE, () => "#fff", routeOf)
  assert.deepEqual(arrows.map((arrow) => arrow.key), ["source", "target"])
  assert.deepEqual(arrows.find((arrow) => arrow.key === "target").goals, [INVERT, PREVIEW])
  assert.ok(arrows.every((arrow) => off(line, arrow.tip) < 1))
  assert.deepEqual(arrowsAround(g, [g.getLink(8)], onTrunk, 1, SPLINE, () => "#fff"), [])
})

test("with the light on, a circle stands on the wire between the arrows and lights every wire there from its output", () => {
  const g = fan()
  const line = wireLine(g, g.getLink(8), SPLINE)
  const pointer = line[20]
  const arrows = arrowsAround(g, [g.getLink(7), g.getLink(8)], pointer, 1, SPLINE, () => "#fff", () => null, { light: true })
  assert.deepEqual(arrows.map((arrow) => arrow.key), ["source", "target", "light"])
  const circle = arrows.at(-1)
  assert.ok(off(line, circle.middle) < 1 && Math.hypot(circle.middle[0] - pointer[0], circle.middle[1] - pointer[1]) < 1)
  assert.deepEqual(circle.links.map((item) => item.id), [7, 8])
  assert.equal(arrowAt(arrows, circle.middle, 1), circle, "a press on the circle lands on it, not on an arrow")
  for (const arrow of arrows.slice(0, 2)) assert.equal(arrowAt(arrows, arrow.middle, 1), arrow)
  const [onlyCircle] = arrowsAround(g, [g.getLink(8)], pointer, 1, SPLINE, () => "#fff", () => null, { arrows: false, light: true })
  assert.equal(onlyCircle.key, "light", "the circle stands with the arrows turned off")
  for (const [scale, onScreen] of [[0.25, 6], [1, 6], [2, 12]]) {
    const [, , grown] = arrowsAround(g, [g.getLink(8)], pointer, scale, SPLINE, () => "#fff", () => null, { light: true })
    assert.ok(Math.abs(grown.radius * scale - onScreen) < 1e-9, String(scale))
  }
})

test("a link gone from the graph, or with an end not on it, has no line and no arrows", () => {
  const broken = graph([node(1, LOAD, { inputs: 0 })], [link(7, 1, 0, 9, 0)])
  assert.equal(wireLine(broken, broken.getLink(7), SPLINE), null)
  assert.deepEqual(arrowsAround(broken, [broken.getLink(7)], [300, 40], 1, SPLINE, () => "#fff"), [])
})

test("inside a subgraph, the subgraph's own input and output are ends too", () => {
  const inputNode = { id: -10, boundingRect: [-400, 0, 100, 200], slots: [{ pos: [-300, 50] }] }
  const outputNode = { id: -20, boundingRect: [2000, 0, 100, 200], slots: [{ pos: [2000, 50] }] }
  const inner = graph([node(2, INVERT)], [link(5, -10, 0, 2, 0), link(6, 2, 0, -20, 0)], { inputNode, outputNode })
  const into = wireLine(inner, inner.getLink(5), SPLINE)
  assert.deepEqual([into[0], into.at(-1)], [[-300, 50], [1000, 40]])
  const arrows = arrowsAround(inner, [inner.getLink(5)], into[Math.floor(into.length / 2)], 1, SPLINE, () => "#fff")
  assert.deepEqual(arrows.map((arrow) => arrow.goals), [[inputNode.boundingRect], [INVERT]])
  const out = wireLine(inner, inner.getLink(6), SPLINE)
  assert.deepEqual([out[0], out.at(-1)], [[1200, 40], [2000, 50]])
})

test("a slot that points its wire another way bends the line with it", () => {
  const up = graph([node(1, LOAD, { inputs: 0 }), node(2, INVERT, { dirs: [1] })], [link(7, 1, 0, 2, 0)])
  const line = wireLine(up, up.getLink(7), LINEAR)
  assert.deepEqual(line.at(-2), [1000, 25])
})

test("a press lands on the arrow under it, and on none between the two", () => {
  const pointer = [600, 40]
  const straight = graph([node(1, LOAD, { inputs: 0 }), node(2, [1000, 0, 200, 100])], [link(7, 1, 0, 2, 0)])
  const arrows = arrowsAround(straight, [straight.getLink(7)], pointer, 1, SPLINE, () => "#fff")
  assert.equal(arrowAt(arrows, arrows[0].middle, 1), arrows[0])
  assert.equal(arrowAt(arrows, arrows[1].middle, 1), arrows[1])
  assert.equal(arrowAt(arrows, pointer, 1), null, "the pointer itself sits between them")
  assert.equal(arrowAt(arrows, [600, 400], 1), null)
})

test("the flash where a flight lands comes in, beats twice, and is gone at the end", () => {
  assert.equal(flashAlpha(0), 0)
  assert.equal(flashAlpha(1), 0)
  assert.equal(flashAlpha(1.5), 0)
  assert.equal(flashAlpha(-0.1), 0)
  const samples = Array.from({ length: 99 }, (_, i) => flashAlpha((i + 1) / 100))
  assert.ok(samples.every((alpha) => alpha > 0 && alpha <= 1))
  const peaks = samples.filter((alpha, i) => i > 0 && i < samples.length - 1 && alpha > samples[i - 1] && alpha >= samples[i + 1])
  assert.equal(peaks.length, 2, String(peaks))
  assert.ok(flashAlpha(0.1) > flashAlpha(0.9), "it fades")
})

test("the arrow back from a Get node flies to its Set node, and the arrow into a Set node to its Get nodes", () => {
  const SET = [400, 0, 100, 30]
  const GETS = [[0, 600, 100, 30], [0, 900, 100, 30]]
  const set = { ...node(2, SET), type: "SetNode", widgets: [{ value: "image" }] }
  const gets = GETS.map((rect, i) => ({ ...node(3 + i, rect, { inputs: 0 }), type: "GetNode", widgets: [{ value: "image" }] }))
  const nodes = [node(1, LOAD, { inputs: 0 }), set, ...gets, node(5, INVERT)]
  const g = graph(nodes, [link(7, 1, 0, 2, 0), link(8, 3, 0, 5, 0)], { _nodes: nodes })
  const into = wireLine(g, g.getLink(7), SPLINE)
  const ahead = arrowsAround(g, [g.getLink(7)], into[Math.floor(into.length / 2)], 1, SPLINE, () => "#fff")
  assert.deepEqual(ahead.find((arrow) => arrow.key === "target").goals, GETS)
  assert.deepEqual(ahead.find((arrow) => arrow.key === "source").goals, [LOAD])
  const out = wireLine(g, g.getLink(8), SPLINE)
  const back = arrowsAround(g, [g.getLink(8)], out[Math.floor(out.length / 2)], 1, SPLINE, () => "#fff")
  assert.deepEqual(back.find((arrow) => arrow.key === "source").goals, [SET])
  assert.deepEqual(back.find((arrow) => arrow.key === "target").goals, [INVERT])
})

test("the arrow ahead on a wire into a Multi Set flies only to the Get nodes that read that input", () => {
  const SET = [400, 0, 100, 60]
  const MULTI = [0, 600, 100, 60]
  const AIO = [0, 900, 100, 60]
  const set = { ...node(2, SET, { inputs: 2, outputs: 2 }), type: "darkilMultiSetNode", widgets: [{ value: "pair" }] }
  const multi = { ...node(3, MULTI, { inputs: 0, outputs: 2 }), type: "darkilMultiGetNode", widgets: [{ value: "pair" }] }
  const aio = {
    ...node(4, AIO, { inputs: 0, outputs: 1 }), type: "darkilMultiGetAIONode", widgets: [{ value: 1 }],
    slotInfo: [{ groupName: "pair", inputIdx: 1 }],
  }
  const nodes = [node(1, LOAD, { inputs: 0, outputs: 2 }), set, multi, aio, node(5, INVERT)]
  const g = graph(nodes, [link(7, 1, 0, 2, 0), link(8, 1, 1, 2, 1), link(9, 4, 0, 5, 0)], { _nodes: nodes })
  const ahead = (id) => {
    const line = wireLine(g, g.getLink(id), SPLINE)
    return arrowsAround(g, [g.getLink(id)], line[Math.floor(line.length / 2)], 1, SPLINE, () => "#fff")
  }
  assert.deepEqual(ahead(7).find((arrow) => arrow.key === "target").goals, [MULTI])
  assert.deepEqual(ahead(8).find((arrow) => arrow.key === "target").goals, [MULTI, AIO])
  assert.deepEqual(ahead(9).find((arrow) => arrow.key === "source").goals, [SET])
})

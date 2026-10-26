import assert from "node:assert/strict"
import { test } from "node:test"

import { installTrunks, route, splits } from "../../web/js/trunks.js"

const CENTER = 5

class FakePath {
  constructor(from) {
    this.parts = from ? [...from.parts] : []
  }

  addPath(other) {
    this.parts.push(...other.parts)
  }
}
globalThis.Path2D = FakePath

function node(id, [x, y], inputs = 1) {
  return {
    id,
    inputs: Array.from({ length: inputs }, () => ({})),
    outputs: [{}],
    getInputPos: (slot) => [x, y + 40 + 20 * slot],
    getOutputPos: () => [x + 200, y + 40],
  }
}

function link(id, origin, target, extra = {}) {
  return { id, origin_id: origin, origin_slot: 0, target_id: target, target_slot: 0, type: "IMAGE", _pos: [0, 0], ...extra }
}

function graph(nodes, links, extra = {}) {
  const byId = new Map(nodes.map((item) => [item.id, item]))
  const map = new Map(links.map((item) => [item.id, item]))
  return { links: map, getNodeById: (id) => byId.get(id), getLink: (id) => map.get(id), ...extra }
}

function fan(extra = {}) {
  return graph(
    [node(1, [0, 0]), node(2, [1000, 0]), node(3, [1000, 400]), node(4, [3000, 3000])],
    [link(7, 1, 2), link(8, 1, 3), link(9, 1, 4)],
    extra,
  )
}

function canvasOn(on, { reroutes = true } = {}) {
  class Canvas {
    constructor() {
      if (reroutes) this._visibleReroutes = new Set()
      this.graph = on
      this.lines = []
      this.renderedPaths = new Set()
      this.visible_area = [-500, -500, 5000, 5000]
      this.links_render_mode = 2
      this.linkMarkerShape = 1
      this.highlighted_links = {}
      this.connections_width = 3
      this.editor_alpha = 1
      this.constructor.link_type_colors = { IMAGE: "#64b5f6" }
    }

    drawConnections(ctx) {
      for (const each of this.graph.links.values()) {
        if (each.hidden) continue
        const from = this.graph.getNodeById(each.origin_id).getOutputPos(each.origin_slot)
        const to = this.graph.getNodeById(each.target_id).getInputPos(each.target_slot)
        this._renderAllLinkSegments(ctx, each, from, to, [], new Set(), 0, undefined, undefined)
      }
      if (reroutes) this.lines.push({ reroutes: this._visibleReroutes.size })
    }

    _renderAllLinkSegments(ctx, each, from, to) {
      this.lines.push({ own: true, id: each.id })
      this.renderLink(ctx, from, to, each, false, 0, null, 4, 3)
      this.renderedPaths.add(each)
    }

    renderLink(ctx, a, b, each, skip, flow, colour, startDir, endDir, options = {}) {
      this.lines.push({ id: each.id, a, b, startDir, endDir, options, marker: this.linkMarkerShape })
      const path = new FakePath()
      path.parts = [each.id + ":" + a.join(",") + ">" + b.join(",")]
      each.path = path
      each._pos[0] = (a[0] + b[0]) / 2
      each._pos[1] = (a[1] + b[1]) / 2
    }
  }
  return new Canvas()
}

function context() {
  const ctx = {
    dots: [],
    at: null,
    save() {},
    restore() {},
    beginPath() {},
    arc(x, y, radius) {
      this.at = { x, y, radius }
    },
    fill() {
      this.dots.push({ ...this.at, colour: this.fillStyle, alpha: this.globalAlpha })
    },
  }
  return ctx
}

function draw(canvas, options = {}) {
  const trunks = installTrunks(canvas, { enabled: () => true, ...options })
  const ctx = context()
  canvas.drawConnections(ctx)
  return { trunks, ctx }
}

test("two inputs in a column share a split before it, level with their middle", () => {
  const found = splits([200, 40], [{ id: 7, at: [1000, 40] }, { id: 8, at: [1000, 440] }])
  assert.equal(found.length, 1)
  assert.deepEqual(found[0].ids, [7, 8])
  assert.ok(Math.abs(found[0].split[0] - (1000 - 200 / 3)) < 1e-9, String(found[0].split))
  assert.equal(found[0].split[1], 240)
})

test("an input too close ahead, or alone in its column, stays on its own wire", () => {
  assert.deepEqual(splits([200, 40], [{ id: 1, at: [300, 40] }, { id: 2, at: [1000, 40] }]), [])
  assert.deepEqual(splits([200, 40], [{ id: 1, at: [1000, 40] }, { id: 2, at: [2000, 40] }]), [])
  assert.deepEqual(splits([200, 40], [{ id: 1, at: [100, 40] }, { id: 2, at: [150, 400] }]), [])
})

test("a column far from the output is wider", () => {
  const far = splits([0, 0], [{ id: 1, at: [1000, 0] }, { id: 2, at: [1250, 300] }])
  assert.deepEqual(far.map((each) => each.ids), [[1, 2]])
  assert.deepEqual(splits([0, 0], [{ id: 1, at: [400, 0] }, { id: 2, at: [650, 300] }]), [])
})

test("the taller the column, the further back the split, within its bounds", () => {
  const short = splits([0, 0], [{ id: 1, at: [1000, 0] }, { id: 2, at: [1000, 60] }])
  assert.equal(short[0].split[0], 940)
  const tall = splits([0, 0], [{ id: 1, at: [1000, 0] }, { id: 2, at: [1000, 3000] }])
  assert.deepEqual(tall[0].split, [600, 1500])
  const close = splits([0, 0], [{ id: 1, at: [170, 0] }, { id: 2, at: [170, 900] }])
  assert.equal(close[0].split[0], 60)
})

test("the split is level with the middle input, not the middle of the column", () => {
  const found = splits([0, 0], [0, 100, 200, 300, 2000].map((y, id) => ({ id, at: [1000, y] })))
  assert.equal(found[0].split[1], 200)
})

test("each column of an output gets a split of its own, nearest first", () => {
  const found = splits([0, 0], [
    { id: 3, at: [3000, 0] }, { id: 1, at: [1000, 0] }, { id: 4, at: [3000, 200] }, { id: 2, at: [1000, 200] },
  ])
  assert.deepEqual(found.map((each) => each.ids), [[1, 2], [3, 4]])
  assert.ok(found[0].split[0] < 1000 && found[1].split[0] < 3000 && found[1].split[0] > 1000)
})

test("a wire on a trunk is drawn as a reroute in front of the column would draw it", () => {
  const [stem, branch] = route([200, 40], [800, 240], [1000, 440])
  assert.deepEqual([stem.a, stem.b, stem.startDir, stem.endDir], [[200, 40], [800, 240], 4, CENTER])
  assert.equal(stem.startControl, null)
  assert.deepEqual(stem.endControl, [-80, 0])
  const near = Math.hypot(200, 200) * 0.25
  assert.deepEqual([branch.a, branch.b, branch.startDir, branch.endDir], [[800, 240], [1000, 440], CENTER, 3])
  assert.deepEqual(branch.startControl, [near, 0])
  assert.equal(branch.endControl, null)
})

test("the wires to a column share one trunk, drawn once, and each has a branch of its own", () => {
  const canvas = canvasOn(fan())
  const { trunks, ctx } = draw(canvas)
  const [{ split }] = splits([200, 40], [{ id: 7, at: [1000, 40] }, { id: 8, at: [1000, 440] }])
  const stems = canvas.lines.filter((line) => line.endDir === CENTER)
  assert.equal(stems.length, 1)
  assert.deepEqual(stems[0].a, [200, 40])
  assert.deepEqual(stems[0].b, split)
  assert.equal(stems[0].marker, 0)
  assert.equal(canvas.linkMarkerShape, 1)
  const branches = canvas.lines.filter((line) => line.startDir === CENTER)
  assert.deepEqual(branches.map((line) => [line.id, line.b]), [[7, [1000, 40]], [8, [1000, 440]]])
  assert.ok(branches.every((line) => line.a === split || String(line.a) === String(split)))
  assert.deepEqual(canvas.lines.filter((line) => line.own).map((line) => line.id), [9])
  const seven = canvas.graph.getLink(7)
  assert.deepEqual(seven.path.parts, [stems[0].id + ":200,40>" + split.join(","), "7:" + split.join(",") + ">1000,40"])
  assert.ok(canvas.renderedPaths.has(seven) && canvas.renderedPaths.has(canvas.graph.getLink(8)))
  assert.equal(trunks.routeOf(seven).length, 2)
  assert.equal(trunks.routeOf(canvas.graph.getLink(9)), null)
  assert.deepEqual(ctx.dots.map((dot) => [dot.x, dot.y]), [split, split])
  assert.equal(ctx.dots.at(-1).colour, "#64b5f6")
})

test("a link's centre and path stay its branch's when another link draws the trunk", () => {
  const canvas = canvasOn(fan())
  draw(canvas, { alpha: (ids) => ([...ids].includes(8) ? 1 : 0.4) })
  const stem = canvas.lines.find((line) => line.endDir === CENTER)
  assert.equal(stem.id, 8)
  const eight = canvas.graph.getLink(8)
  const [{ split }] = splits([200, 40], [{ id: 7, at: [1000, 40] }, { id: 8, at: [1000, 440] }])
  assert.deepEqual(eight._pos, [(split[0] + 1000) / 2, 340])
  assert.equal(eight.path.parts.length, 2)
  assert.match(eight.path.parts[1], /^8:.*>1000,440$/)
})

test("the dot fades with the wires, and turns white with a highlighted one", () => {
  const faded = canvasOn(fan())
  const { ctx } = draw(faded, { alpha: () => 0.4 })
  assert.ok(ctx.dots.every((dot) => dot.alpha === 0.4))
  const lit = canvasOn(fan())
  lit.highlighted_links = { 8: true }
  const drawn = draw(lit)
  assert.equal(lit.lines.find((line) => line.endDir === CENTER).id, 8)
  assert.equal(drawn.ctx.dots.at(-1).colour, "#fff")
})

test("a wire through a reroute or held by a tie keeps its own line, and so does every wire with trunks off", () => {
  const rerouted = canvasOn(fan())
  rerouted.graph.getLink(7).parentId = 3
  draw(rerouted)
  assert.deepEqual(rerouted.lines.filter((line) => line.own).map((line) => line.id), [7, 8, 9])

  const tied = canvasOn(fan({ extra: { zipTies: [{ id: "a", links: [8, "r2"] }] } }))
  draw(tied)
  assert.deepEqual(tied.lines.filter((line) => line.own).map((line) => line.id).sort(), [7, 8, 9])

  const off = canvasOn(fan())
  const { trunks, ctx } = draw(off, { enabled: () => false })
  assert.deepEqual(off.lines.filter((line) => line.own).map((line) => line.id), [7, 8, 9])
  assert.equal(trunks.routeOf(off.graph.getLink(7)), null)
  assert.deepEqual(ctx.dots, [])
})

test("nothing of a trunk off screen is drawn, and a route is only for the graph it was drawn on", () => {
  const away = canvasOn(fan())
  away.visible_area = [10000, 10000, 500, 500]
  const { trunks } = draw(away)
  assert.deepEqual(away.lines.filter((line) => line.a && line.id !== 9), [])
  assert.equal(trunks.routeOf(away.graph.getLink(7)), null)

  const moved = canvasOn(fan())
  const drawn = draw(moved)
  assert.ok(drawn.trunks.routeOf(moved.graph.getLink(7)))
  moved.graph = graph([], [])
  assert.equal(drawn.trunks.routeOf(fan().getLink(7)), null)
})

test("a hidden wire has no part in where its neighbours split", () => {
  const nodes = [node(1, [0, 0]), node(2, [1000, 0]), node(3, [1000, 400]), node(5, [1000, 2000])]
  const canvas = canvasOn(graph(nodes, [link(7, 1, 2), link(8, 1, 3), link(10, 1, 5, { hidden: true })]))
  draw(canvas)
  const [{ split }] = splits([200, 40], [{ id: 7, at: [1000, 40] }, { id: 8, at: [1000, 440] }])
  assert.deepEqual(canvas.lines.find((line) => line.endDir === CENTER).b, split)
  assert.ok(!canvas.lines.some((line) => line.id === 10))
})

test("the wires held back are drawn before the reroutes, or at the end on a canvas that never asks for them", () => {
  const asks = canvasOn(fan())
  draw(asks)
  const order = asks.lines.map((line) => ("reroutes" in line ? "reroutes" : line.endDir === CENTER ? "trunk" : "wire"))
  assert.equal(order.at(-1), "reroutes")
  assert.ok(order.indexOf("trunk") >= 0 && order.indexOf("trunk") < order.indexOf("reroutes"))

  const quiet = canvasOn(fan(), { reroutes: false })
  const { trunks, ctx } = draw(quiet)
  assert.equal(quiet.lines.filter((line) => line.endDir === CENTER).length, 1)
  assert.deepEqual(quiet.lines.filter((line) => line.own).map((line) => line.id), [9])
  assert.ok(trunks.routeOf(quiet.graph.getLink(8)))
  assert.equal(ctx.dots.length, 2)
})

test("drawn twice, a trunk is drawn again, once, from the same split", () => {
  const canvas = canvasOn(fan())
  const { ctx } = draw(canvas)
  canvas.lines = []
  canvas.drawConnections(ctx)
  assert.equal(canvas.lines.filter((line) => line.endDir === CENTER).length, 1)
  assert.equal(canvas.lines.filter((line) => line.startDir === CENTER).length, 2)
})

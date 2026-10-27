import assert from "node:assert/strict"
import { test } from "node:test"

import { aim, arrowAt, canvasRect, clearArea, gather, inset, labelOf, layout, noteOf, seenIn } from "../../web/js/compass.js"

const SAFE = [12, 12, 1000, 600]
const AT_ONE = { offset: [0, 0], scale: 1 }

function width(text) {
  return text.length * 7
}

function item(x, y, title = "", w = 200, h = 100) {
  return { rect: [x, y, w, h], title }
}

test("the view the arrows stand in is the canvas minus what covers its edges", () => {
  const covered = (x, y) => x >= 56 && y >= 120 && y < 760
  const open = clearArea([1286, 809], covered)
  assert.ok(open[0] >= 56 && open[0] <= 64, String(open))
  assert.ok(open[1] >= 120 && open[1] <= 128, String(open))
  assert.ok(open[1] + open[3] <= 760 && open[1] + open[3] >= 744, String(open))
  assert.equal(open[0] + open[2], 1286)
  assert.deepEqual(clearArea([800, 600], () => true), [0, 0, 800, 600])
})

test("a bar along one edge is not taken for a bar along the edges it reaches", () => {
  const bars = (x, y) => y < 52 || (y >= 60 && y < 115 && x >= 190 && x < 1282)
  const open = clearArea([1286, 809], (x, y) => !bars(x, y))
  assert.equal(open[0], 0)
  assert.equal(open[0] + open[2], 1286)
  assert.ok(open[1] >= 115 && open[1] <= 123, String(open))
  assert.equal(open[1] + open[3], 809)
})

test("a canvas covered all over leaves no room", () => {
  const open = clearArea([1000, 600], () => false)
  assert.ok(open[2] <= 200 && open[3] <= 120, String(open))
})

test("a view turns into canvas units the way the canvas draws them", () => {
  assert.deepEqual(canvasRect([100, 50, 800, 400], [-1000, 200], 0.5), [1200, -100, 1600, 800])
  assert.deepEqual(inset([0, 0, 100, 60], 10), [10, 10, 80, 40])
})

test("a node counts as in view only when enough of it shows", () => {
  const view = [0, 0, 1000, 600]
  assert.ok(seenIn([100, 100, 200, 100], view, 24))
  assert.ok(!seenIn([990, 100, 200, 100], view, 24))
  assert.ok(seenIn([970, 100, 200, 100], view, 24))
  assert.ok(seenIn([500, 300, 10, 10], view, 24))
  assert.ok(!seenIn([1200, 100, 200, 100], view, 24))
})

test("the nodes of one group go together, under its name", () => {
  const groups = [{ rect: [2000, 0, 900, 600], title: "Upscale", colour: "#3f789e" }]
  const found = gather([item(2100, 100), item(2500, 300), item(-3000, 0, "Save Image")], groups, [0, 0, 1000, 600], 150)
  assert.equal(found.length, 2)
  const upscale = found.find((each) => each.titles[0] === "Upscale")
  assert.equal(upscale.count, 2)
  assert.equal(upscale.colour, "#3f789e")
  assert.deepEqual(upscale.goals, [[2000, 0, 900, 600]])
  const lone = found.find((each) => each !== upscale)
  assert.deepEqual(lone.titles, ["Save Image"])
  assert.equal(lone.colour, null)
})

test("a node in a group inside a group belongs to the inner one", () => {
  const groups = [
    { rect: [2000, 0, 2000, 2000], title: "Everything", colour: null },
    { rect: [2050, 50, 500, 400], title: "Prompts", colour: null },
  ]
  const found = gather([item(2100, 100)], groups, [0, 0, 1000, 600], 150)
  assert.deepEqual(found.map((each) => each.titles), [["Prompts"]])
})

test("a group the view already shows a part of is flown to by the nodes that are out of it", () => {
  const groups = [{ rect: [800, 0, 1200, 600], title: "Sampling", colour: null }]
  const found = gather([item(1500, 100)], groups, [0, 0, 1000, 600], 150)
  assert.deepEqual(found[0].goals, [[1500, 100, 200, 100]])
})

test("loose nodes near each other go together, far apart they do not", () => {
  const found = gather([item(2000, 0), item(2300, 0), item(2600, 0), item(-4000, 0)], [], [0, 0, 1000, 600], 150)
  assert.deepEqual(found.map((each) => each.count).sort(), [1, 3])
  const three = found.find((each) => each.count === 3)
  assert.deepEqual([three.titles, three.loose], [[], 3])
})

test("an arrow stands on the edge facing what it points to, inside the clear view", () => {
  const right = aim({ count: 3, titles: [], colour: null, goals: [[3000, 250, 200, 100]], rects: [[3000, 250, 200, 100]] }, AT_ONE, SAFE, width)
  assert.ok(Math.abs(right.tip[0] - 1012) < 1e-6, String(right.tip))
  assert.ok(right.tip[1] > 250 && right.tip[1] < 400, String(right.tip))
  assert.ok(right.label[0] + right.label[2] <= right.tip[0], String(right.label))
  const up = aim({ count: 1, titles: ["Load"], colour: "#a1309b", goals: [[400, -2000, 200, 100]], rects: [[400, -2000, 200, 100]] }, AT_ONE, SAFE, width)
  assert.ok(Math.abs(up.tip[1] - 12) < 1e-6, String(up.tip))
  assert.ok(up.label[1] > up.tip[1], String(up.label))
  assert.equal(up.colour, "#a1309b")
  for (const arrow of [right, up]) {
    const [x, y, w, h] = arrow.box
    assert.ok(x >= SAFE[0] - 9 && y >= SAFE[1] - 9 && x + w <= SAFE[0] + SAFE[2] + 9 && y + h <= SAFE[1] + SAFE[3] + 9, String(arrow.box))
  }
})

test("an arrow follows the view as it pans and zooms", () => {
  const cluster = { count: 2, titles: [], colour: null, goals: [[3000, 250, 200, 100]], rects: [[3000, 250, 200, 100]] }
  const panned = aim(cluster, { offset: [-3500, 0], scale: 1 }, SAFE, width)
  assert.ok(Math.abs(panned.tip[0] - 12) < 1e-6, String(panned.tip))
})

test("arrows that would cover each other become one, which flies to all of them", () => {
  const goals = (x, y) => ({ goals: [[x, y, 200, 100]], rects: [[x, y, 200, 100]] })
  const clusters = [
    { count: 2, titles: ["Upscale"], loose: 0, colour: "#3f789e", ...goals(3000, 250) },
    { count: 1, titles: ["Save Image"], loose: 0, colour: null, ...goals(3000, 300) },
    { count: 4, titles: [], loose: 4, colour: null, ...goals(-3000, 250) },
    { count: 3, titles: [], loose: 3, colour: null, ...goals(-3000, 300) },
  ]
  const arrows = layout(clusters, AT_ONE, SAFE, width)
  assert.equal(arrows.length, 2)
  const merged = arrows.find((arrow) => arrow.cluster.titles.length)
  assert.deepEqual(merged.cluster.titles, ["Upscale", "Save Image"])
  assert.equal(merged.cluster.goals.length, 2)
  assert.equal(merged.colour, "#d8d8d8")
  assert.equal(merged.text, "Upscale, Save Image")
  assert.equal(arrows.find((arrow) => arrow !== merged).text, "7")
})

test("a label names the group or the lone node, counting the nodes that have no name", () => {
  assert.equal(labelOf({ titles: [], count: 5, loose: 5 }), "5")
  assert.equal(labelOf({ titles: ["Save Image"], count: 1, loose: 0 }), "Save Image")
  assert.equal(labelOf({ titles: ["Upscale"], count: 4, loose: 0 }), "Upscale \u00b7 4")
  assert.equal(labelOf({ titles: ["Loaders"], count: 9, loose: 7 }), "Loaders +7")
  const long = labelOf({ titles: ["A rather long group title", "Another one"], count: 9, loose: 0 })
  assert.equal(long, "A rather long group title\u2026")
})

test("a click finds the arrow under it, label included", () => {
  const arrows = [{ box: [100, 100, 60, 20] }, { box: [500, 100, 60, 20] }]
  assert.equal(arrowAt(arrows, [130, 110]), arrows[0])
  assert.equal(arrowAt(arrows, [562, 122]), arrows[1])
  assert.equal(arrowAt(arrows, [300, 110]), null)
})

test("an arrow knows the names of its nodes, top to bottom, under the name of their group", () => {
  const groups = [{ rect: [2000, 0, 900, 600], title: "Upscale", colour: "#3f789e" }]
  const found = gather([item(2100, 300, "Save Image"), item(2100, 100, "Upscale Image")], groups, [0, 0, 1000, 600], 150)
  assert.deepEqual(found[0].sections, [{ title: "Upscale", group: true, colour: "#3f789e", names: ["Upscale Image", "Save Image"] }])
  assert.deepEqual(noteOf(found[0]), {
    sections: [{ title: "Upscale", group: true, colour: "#3f789e", names: ["Upscale Image", "Save Image"] }], more: 0,
  })
})

test("loose nodes alone are listed without a heading, and with groups under one of their own", () => {
  const loose = gather([item(2000, 0, "KSampler"), item(2300, 0, "VAE Decode")], [], [0, 0, 1000, 600], 150)[0]
  assert.deepEqual(noteOf(loose).sections, [{ title: null, group: false, colour: null, names: ["KSampler", "VAE Decode"] }])
  const goals = (x, y) => ({ goals: [[x, y, 200, 100]], rects: [[x, y, 200, 100]] })
  const clusters = [
    { count: 1, titles: ["Loaders"], loose: 0, colour: null, ...goals(3000, 250),
      sections: [{ title: "Loaders", group: true, colour: null, names: ["Load Checkpoint"] }] },
    { count: 1, titles: ["Save Image"], loose: 0, colour: null, ...goals(3000, 300),
      sections: [{ title: "", group: false, colour: null, names: ["Save Image"] }] },
  ]
  const arrows = layout(clusters, AT_ONE, SAFE, width)
  assert.equal(arrows.length, 1)
  assert.deepEqual(noteOf(arrows[0].cluster).sections, [
    { title: "Loaders", group: true, colour: null, names: ["Load Checkpoint"] },
    { title: "", group: false, colour: null, names: ["Save Image"] },
  ], "an empty heading reads as Outside groups")
})

test("a long list is cut short, and the same name twice is counted", () => {
  const names = ["CLIP Text Encode", "CLIP Text Encode", ...Array.from({ length: 20 }, (_, i) => "Node " + i)]
  const note = noteOf({ sections: [{ title: "", group: false, colour: null, names }] }, 5)
  assert.deepEqual(note.sections[0].names, ["CLIP Text Encode " + String.fromCharCode(0xd7) + "2", "Node 0", "Node 1", "Node 2", "Node 3"])
  assert.equal(note.more, 16)
  const two = noteOf({ sections: [
    { title: "Loaders", group: true, colour: null, names: ["A", "B"] },
    { title: "", group: false, colour: null, names: ["C"] },
  ] }, 2)
  assert.deepEqual(two, { sections: [{ title: "Loaders", group: true, colour: null, names: ["A", "B"] }], more: 1 })
})

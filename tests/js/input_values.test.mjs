import assert from "node:assert/strict"
import { test } from "node:test"

import { connectedRows, cut, fitRow, incoming, plain, rowText, vueStyle, wrap } from "../../web/js/input_values.js"

const ARROW = String.fromCharCode(0x2190)
const ELLIPSIS = String.fromCharCode(0x2026)

function graph(nodes, links = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const linkById = new Map(links.map((link) => [link.id, link]))
  return { nodes, getNodeById: (id) => byId.get(id) ?? null, getLink: (id) => linkById.get(id) }
}

function link(id, origin, slot = 0) {
  return { id, origin_id: origin, origin_slot: slot, target_id: 99, target_slot: 0 }
}

function primitive(id, value, control = "fixed") {
  return {
    id, title: "Width", isVirtualNode: true,
    widgets: [{ name: "value", value, linkedWidgets: [{ name: "control_after_generate", value: control }] }],
  }
}

function constant(id, value, link = null) {
  return {
    id, title: "Int", comfyClass: "PrimitiveInt",
    outputs: [{ name: "INT", type: "INT" }],
    inputs: [{ name: "value", type: "INT", widget: { name: "value" }, link }],
    widgets: [{ name: "value", value }, { name: "control_after_generate", value: "fixed" }],
  }
}

function selector(id) {
  return {
    id, title: "Resolution Selector", comfyClass: "ResolutionSelector",
    outputs: [{ name: "width", type: "INT" }, { name: "height", type: "INT" }],
    inputs: [{ name: "megapixels", type: "FLOAT", widget: { name: "megapixels" }, link: null }],
    widgets: [{ name: "megapixels", value: 1 }],
  }
}

const RECORDED = { "4": { type: "ResolutionSelector", outputs: ["1024", "768"], at: 0 } }

test("only the inputs of widgets with a wire into them are rows to fill", () => {
  const into = link(5, 4)
  const node = {
    id: 9,
    inputs: [
      { name: "width", widget: { name: "width" }, link: 5 },
      { name: "model", link: 6 },
      { name: "seed", widget: { name: "seed" }, link: null },
    ],
    widgets: [{ name: "width" }, { name: "seed" }],
  }
  const rows = connectedRows(graph([node], [into]), node)
  assert.deepEqual(rows, [{ widget: node.widgets[0], index: 0, link: into }])
  assert.deepEqual(connectedRows(graph([]), { id: 1 }), [])
})

test("a Primitive gives its value as it is now", () => {
  const on = graph([primitive(7, 768)])
  assert.deepEqual(incoming(on, link(1, 7)), { value: "768", from: "Width", look: "current", body: null })
})

test("a value the frontend changes before the run is stale already", () => {
  const on = graph([primitive(7, 768, "randomize")])
  assert.equal(incoming(on, link(1, 7), { before: true }).look, "stale")
  assert.equal(incoming(on, link(1, 7), { before: false }).look, "current")
  assert.equal(incoming(graph([primitive(7, 768)]), link(1, 7), { before: true }).look, "current")
})

test("a node whose one setting is what it hands on gives that setting, run or not", () => {
  assert.deepEqual(incoming(graph([constant(3, 1024)]), link(1, 3)), { value: "1024", from: "Int", look: "current", body: null })
  const fed = constant(3, 1024, 8)
  assert.deepEqual(incoming(graph([fed]), link(1, 3)), { value: null, from: "Int", look: "unsure", body: null })
})

test("any other node gives what it handed on in the last run, plain when it still stands", () => {
  const on = graph([selector(4)])
  const asked = (same) => incoming(on, link(1, 4, 1), { outputs: RECORDED, same })
  assert.deepEqual(asked({ "4": true }), { value: "768", from: "Resolution Selector", look: "current", body: null })
  assert.equal(asked({ "4": false }).look, "stale")
  assert.equal(asked({}).look, "unsure")
  assert.equal(asked(null).look, "unsure")
})

test("a node that has not run, or another node under its id, gives only where the wire comes from", () => {
  const on = graph([selector(4)])
  assert.deepEqual(incoming(on, link(1, 4), { outputs: {} }), { value: null, from: "Resolution Selector", look: "unsure", body: null })
  const replaced = { "4": { type: "ImageScale", outputs: ["1024"], at: 0 } }
  assert.equal(incoming(on, link(1, 4), { outputs: replaced, same: { "4": true } }).value, null)
})

test("the last run, when it still stands, wins over the setting of the node", () => {
  const recorded = { "3": { type: "PrimitiveInt", outputs: ["512"], at: 0 } }
  const on = graph([constant(3, 1024)])
  assert.equal(incoming(on, link(1, 3), { outputs: recorded, same: { "3": true } }).value, "512")
  assert.equal(incoming(on, link(1, 3), { outputs: recorded, same: { "3": false } }).value, "1024")
})

test("inside a subgraph the last run is not guessed at", () => {
  const on = graph([selector(4)])
  assert.equal(incoming(on, link(1, 4), { outputs: RECORDED, same: { "4": true }, root: false }).value, null)
})

test("a value reads the way the last run describes one", () => {
  assert.equal(plain(1024), "1024")
  assert.equal(plain(0.1 + 0.2), "0.3")
  assert.equal(plain(true), "true")
  assert.equal(plain(null), null)
  assert.equal(plain("  a\n  cat "), '"a cat"')
  assert.equal(plain("x".repeat(80)), '"' + "x".repeat(60) + '..."')
})

test("a choice from a list reads as the list shows it, without quotes", () => {
  const ratio = { id: 7, title: "aspect_ratio", isVirtualNode: true, widgets: [{ name: "value", value: "1:1 (Square)" }] }
  assert.equal(incoming(graph([ratio]), link(1, 7), { bare: true }).value, "1:1 (Square)")
  assert.equal(incoming(graph([ratio]), link(1, 7)).value, '"1:1 (Square)"')
  const sampler = { id: 4, title: "Sampler Select", comfyClass: "SamplerSelect", outputs: [{ type: "COMBO" }, { type: "COMBO" }] }
  const recorded = (text) => ({ "4": { type: "SamplerSelect", outputs: [text], at: 0 } })
  const asked = (text) => incoming(graph([sampler]), link(1, 4), { outputs: recorded(text), same: { "4": true }, bare: true }).value
  assert.equal(asked('"euler"'), "euler")
  assert.equal(asked('"a long one..." (412 chars)'), '"a long one..." (412 chars)')
  assert.equal(plain("  1:1   (Square) ", true), "1:1 (Square)")
})

test("a row says the value and where it comes from", () => {
  assert.equal(rowText({ value: "1024", from: "Resolution Selector" }), "1024 " + ARROW + " Resolution Selector")
  assert.equal(rowText({ value: null, from: "Resolution Selector" }), ARROW + " Resolution Selector")
})

test("a row too long for the room loses its end", () => {
  const measure = (text) => text.length
  assert.equal(cut(measure, "abcdef", 6), "abcdef")
  assert.equal(cut(measure, "abcdef", 4), "abc" + ELLIPSIS)
  assert.equal(cut(measure, "ab cdef", 4), "ab" + ELLIPSIS)
  assert.equal(cut(measure, "abcdef", 0), "")
})

test("with Nodes 2.0 the row of a connected input carries its value after the name, and only that row", () => {
  const css = vueStyle([
    { key: "7-in-2", text: "1024 " + ARROW + " Resolution Selector", look: "current" },
    { key: "7-in-3", text: "768", look: "stale" },
  ])
  const after = '.lg-slot--input[aria-label]:has([data-slot-key="7-in-2"])::after'
  assert.ok(css.includes(after + " { content: " + JSON.stringify("1024 " + ARROW + " Resolution Selector") + "; opacity: 0.85; }"), css)
  assert.match(css, /data-slot-key="7-in-3"\]\)::after \{ content: "768"; opacity: 0.5; font-style: italic; \}/)
  assert.match(css, /contain: inline-size/, "a long value never widens the node")
  assert.ok(!css.includes(".lg-slot--input:has("), "a slot beside a control the frontend still shows is left alone")
  assert.equal(vueStyle([]), "")
})

const NEWLINE = String.fromCharCode(10)

function lines(...parts) {
  return parts.join(NEWLINE)
}

test("a string comes with its text as it is, for an input whose box the frontend hides", () => {
  const score = lines("X:1", "T:", "M:4/4")
  const writer = { id: 1, title: "Write the song", comfyClass: "YuE2GenerateSong", outputs: [{ type: "STRING" }] }
  const recorded = { "1": { type: "YuE2GenerateSong", outputs: ['"X:1 T: M:4/4"'], texts: [score], at: 0 } }
  assert.equal(incoming(graph([writer]), link(1, 1), { outputs: recorded, same: { "1": true } }).body, score)
  const typed = { id: 7, title: "Prompt", isVirtualNode: true, widgets: [{ name: "value", value: score }] }
  assert.equal(incoming(graph([typed]), link(2, 7)).body, score)
  assert.equal(incoming(graph([primitive(7, 768)]), link(2, 7)).body, null)
})

test("a narrow row gives up the value before the name of where it comes from", () => {
  const measure = (text) => text.length
  const shown = { value: "1234567890", from: "Seed" }
  assert.equal(fitRow(measure, shown, 40), "1234567890 " + ARROW + " Seed")
  assert.equal(fitRow(measure, shown, 13), "12345" + ELLIPSIS + " " + ARROW + " Seed")
  assert.equal(fitRow(measure, shown, 9), "12345678" + ELLIPSIS, "with no room for the name the value goes first")
  assert.equal(fitRow(measure, { value: null, from: "Seed" }, 3), ARROW + ELLIPSIS)
})

test("a box of text keeps its lines, wraps the long ones at a space and ends on an ellipsis", () => {
  const measure = (text) => text.length
  assert.deepEqual(wrap(measure, lines("X:1", "T:", "M:4/4"), 10, 5), ["X:1", "T:", "M:4/4"])
  assert.deepEqual(wrap(measure, "warm piano pop, acoustic piano", 12, 5), ["warm piano", "pop,", "acoustic", "piano"])
  assert.deepEqual(wrap(measure, lines("a", "b", "c", "d"), 5, 2), ["a", "b" + ELLIPSIS])
  assert.deepEqual(wrap(measure, "abcdefghij", 4, 2), ["abcd", "efg" + ELLIPSIS])
  assert.deepEqual(wrap(measure, lines("a", "", "b"), 5, 5), ["a", "", "b"])
  assert.deepEqual(wrap(measure, "abc", 5, 0), [])
})

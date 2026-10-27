import assert from "node:assert/strict"
import { test } from "node:test"

import {
  PROPERTY, cardMenu, cardOf, carded, choices, faded, firstLine, installCards, isNote, layoutCard, noteLines, pinnedOf, shrink, sizesOf, stemOf,
  titleLines,
} from "../../web/js/cards.js"

const ELLIPSIS = String.fromCharCode(0x2026)
const TIMES = String.fromCharCode(0xd7)
const CHECK = String.fromCharCode(0x2713)

const measure = (text, weight, size) => text.length * size * 0.5

const fixed = (text) => text.length * 10

function node(widgets, extra = {}) {
  return { id: 1, title: "Some Node", type: "SomeNode", inputs: [], outputs: [{ type: "X" }], widgets, ...extra }
}

const BOX = { width: 300, height: 120, title: 20, value: 16, pad: 4, smallest: 8 }

test("a card shows the model, then the prompt, the size and the seed, as many as asked for", () => {
  const sampler = node([
    { name: "steps", value: 20 },
    { name: "seed", value: 42 },
    { name: "width", value: 1024 },
    { name: "height", value: 768 },
    { name: "text", type: "customtext", value: "a cat\non a mat" },
    { name: "ckpt_name", type: "combo", value: "SDXL\\juggernaut_v9.safetensors" },
  ])
  assert.deepEqual(cardOf(sampler, 4), {
    title: "Some Node",
    values: ["juggernaut_v9", '"a cat on a mat"', "1024 " + TIMES + " 768", "seed 42"],
  })
  assert.deepEqual(cardOf(sampler, 2).values, ["juggernaut_v9", '"a cat on a mat"'])
  assert.deepEqual(cardOf(sampler, 0).values, [])
  assert.deepEqual(cardOf(sampler, 5).values.at(-1), "steps 20")
})

test("a value already in the title, an empty one and a number named value say no more than they must", () => {
  const getter = node([{ name: "Constant", type: "combo", value: "vae" }], { title: "Get_vae" })
  assert.deepEqual(cardOf(getter).values, [])
  const constant = node([{ name: "value", value: 736 }], { title: "WIDTH" })
  assert.deepEqual(cardOf(constant).values, ["736"])
  assert.deepEqual(cardOf(node([{ name: "prefix", value: "  " }, { name: "flag", value: true }])).values, ["flag true"])
  assert.deepEqual(cardOf(node([{ name: "strength_model", label: "strength", value: 0.6 }])).values, ["strength 0.6"])
})

test("a card leaves out wired, hidden, control and button rows, and players that are not text", () => {
  const busy = node([
    { name: "seed", value: 1 },
    { name: "control_after_generate", value: "fixed" },
    { name: "cfg", value: 7, connectionSuppressed: true },
    { name: "denoise", value: 1 },
    { name: "upload", type: "button", value: "image" },
    { name: "$$canvas-image-preview", value: "" },
    { name: "audioUI", value: "/api/view?filename=a.mp3", element: {} },
    { name: "secret", value: 3, hidden: true },
    { name: "prompt", value: "hello", element: {}, options: { multiline: true } },
  ], { inputs: [{ name: "denoise", widget: { name: "denoise" }, link: 5 }] })
  assert.deepEqual(choices(busy).map((row) => row.names[0]), ["seed", "prompt"])
})

test("width and height make one row, and only when both are numbers", () => {
  const rows = choices(node([{ name: "Width", value: 512 }, { name: "Height", value: 640 }, { name: "batch", value: 1 }]))
  assert.deepEqual(rows.map((row) => row.names), [["Width", "Height"], ["batch"]])
  assert.equal(rows[0].label, "Width " + TIMES + " Height")
  assert.deepEqual(choices(node([{ name: "width", value: 512 }])).map((row) => row.text), ["width 512"])
})

test("the values picked by hand replace the ones a card picks by itself", () => {
  const picked = node([{ name: "steps", value: 20 }, { name: "seed", value: 42 }, { name: "cfg", value: 7 }], {
    properties: { [PROPERTY]: ["cfg", "steps"] },
  })
  assert.deepEqual(cardOf(picked, 1).values, ["steps 20", "cfg 7"])
  picked.properties[PROPERTY] = ["gone"]
  assert.deepEqual(cardOf(picked, 1).values, ["seed 42"])
  picked.properties[PROPERTY] = "cfg"
  assert.deepEqual(pinnedOf(picked), [])
})

test("a model file is named without its folder and extension", () => {
  assert.equal(stemOf("LTX\\LTX-2\\ltx-2.3-22b.safetensors"), "ltx-2.3-22b")
  assert.equal(stemOf("loras/style.v2.gguf"), "style.v2")
  assert.deepEqual(cardOf(node([{ name: "unet", value: "flux.sft" }])).values, ["flux"])
  assert.deepEqual(cardOf(node([{ name: "image", value: "photo.png" }])).values, ["photo.png"])
})

test("a note shows its title and its text, and its first line stands in for a title it never got", () => {
  const text = "## Tips\n\n**Keep** the seed\n---\n- fixed"
  const named = { type: "MarkdownNote", title: "About Size", inputs: [], outputs: [], widgets: [{ name: "text", value: text }] }
  assert.ok(isNote(named))
  assert.deepEqual(cardOf(named), { title: "About Size", values: [], text: "Tips\nKeep the seed\nfixed" })
  assert.deepEqual(cardOf({ ...named, title: "Markdown Note" }), { title: "Tips", values: [], text: "Keep the seed\nfixed" })
  assert.deepEqual(cardOf({ ...named, title: "", widgets: [] }), { title: "MarkdownNote", values: [], text: "" })
  const plain = { type: "Note", title: "Note", widgets: [{ name: "text", value: "\n\nKeep the seed fixed" }] }
  assert.equal(cardOf(plain).title, "Keep the seed fixed")
  assert.equal(cardOf(plain).text, "")
  const loose = { type: "Sticky", title: "Sticky", inputs: [], outputs: [], widgets: [{ name: "text", value: "x" }] }
  assert.ok(isNote(loose))
  assert.ok(!isNote(node([{ name: "text", value: "x" }])))
})

test("the first line of a note is its first line of text, without the markup", () => {
  assert.equal(firstLine("## LTX-2 **Prompting** Tips\n1. more"), "LTX-2 Prompting Tips")
  assert.equal(firstLine("![logo](a.png)\n---\n> - [Models](https://x.y) here"), "Models here")
  assert.equal(firstLine("1) `step` one"), "step one")
  assert.equal(firstLine("<b>Bold</b> start"), "Bold start")
  assert.equal(firstLine("snake_case_name"), "snake_case_name")
  assert.equal(firstLine("\n \n"), "")
  assert.equal(firstLine(null), "")
})

test("a table in a note reads as rows of cells, without its rules", () => {
  const DOT = String.fromCharCode(0xb7)
  const table = "| Item | Official |\n|------|:--------:|\n| Pixels | 1M, 2M |\n|  | empty |"
  assert.deepEqual(noteLines(table), ["Item " + DOT + " Official", "Pixels " + DOT + " 1M, 2M", "empty"])
})

test("a title breaks at spaces and after underscores, and its last line runs on to an ellipsis", () => {
  assert.deepEqual(titleLines(fixed, "Load Diffusion Model", 100, 3), ["Load", "Diffusion", "Model"])
  assert.deepEqual(titleLines(fixed, "Get_model_with_lora", 100, 2), ["Get_model_", "with_lora"])
  assert.deepEqual(titleLines(fixed, "Load Diffusion Model", 100, 1), ["Load Diff" + ELLIPSIS])
  assert.deepEqual(titleLines(fixed, "Load Diffusion Model", 120, 2), ["Load", "Diffusion M" + ELLIPSIS])
  assert.deepEqual(titleLines(fixed, "Pseudoword", 60, 2), ["Pseudo", "word"])
  assert.deepEqual(titleLines(fixed, "  ", 60, 2), [])
})

test("a word too long for its line is cut short rather than split, unless the title is that one word", () => {
  assert.deepEqual(titleLines(fixed, "Positive Prompt", 70, 3), ["Positi" + ELLIPSIS, "Prompt"])
  assert.deepEqual(titleLines(fixed, "Save Picture", 50, 3), ["Save", "Pict" + ELLIPSIS])
  assert.deepEqual(titleLines(fixed, "SkipLayerGuidance", 90, 3), ["SkipLayer", "Guidance"])
  assert.deepEqual(titleLines(fixed, "Positive", 70, 3), ["Positi" + ELLIPSIS])
  assert.deepEqual(titleLines(fixed, "KSampler", 30, 2), ["KS" + ELLIPSIS])
  assert.deepEqual(titleLines(fixed, "KSampler", 30, 3), ["KS" + ELLIPSIS])
  assert.deepEqual(titleLines(fixed, "KSampler", 40, 2), ["KSam", "pler"])
})

test("a note's text fills the room under its title and ends in an ellipsis when there is more", () => {
  const note = { title: "Tips", values: [], text: "one two three four\nfive six seven eight nine ten" }
  const laid = layoutCard(measure, note, { ...BOX, width: 100, height: 120 })
  assert.deepEqual(laid.title, ["Tips"])
  assert.deepEqual(laid.values, ["one two", "three four", "five six", "seven eigh" + ELLIPSIS])
  const roomy = layoutCard(measure, note, { ...BOX, width: 400, height: 300 })
  assert.deepEqual(roomy.values, ["one two three four", "five six seven eight nine ten"])
  assert.deepEqual(layoutCard(measure, { ...note, text: "" }, BOX).values, [])
})

test("the values get the room before a long title gets more lines", () => {
  const card = { title: "Load Diffusion Model Here", values: ["model_name_long", "fp8"] }
  const narrow = { ...BOX, width: 180 }
  const roomy = layoutCard(measure, card, { ...narrow, height: 200 })
  assert.deepEqual(roomy.title, ["Load Diffusion", "Model Here"])
  assert.deepEqual(roomy.values, ["model_name_long", "fp8"])
  const tight = layoutCard(measure, card, { ...narrow, height: 70 })
  assert.deepEqual(tight.title, ["Load Diffusion M" + ELLIPSIS])
  assert.deepEqual(tight.values, ["model_name_long", "fp8"])
  const short = layoutCard(measure, card, { ...narrow, height: 40 })
  assert.deepEqual(short.values, [])
  assert.equal(short.title.length, 1)
})

test("a node too small for the title draws it smaller, and too small for that draws no text", () => {
  const card = { title: "KSampler", values: ["seed 1"] }
  const small = layoutCard(measure, card, { ...BOX, height: 20 })
  assert.ok(small.size < BOX.title && small.size >= BOX.smallest, String(small.size))
  assert.deepEqual(small.values, [])
  assert.equal(layoutCard(measure, card, { ...BOX, height: 10 }), null)
  assert.equal(layoutCard(measure, card, { ...BOX, width: 6 }), null)
})

test("collapsed nodes, reroutes and nodes without a title bar are left as they are", () => {
  assert.ok(carded({ type: "KSampler" }))
  assert.ok(!carded({ type: "KSampler", flags: { collapsed: true } }))
  assert.ok(!carded({ type: "Reroute" }))
  assert.ok(!carded({ type: "X", constructor: { title_mode: 1 } }))
  assert.ok(!carded({ type: "X", title_mode: 2 }))
  assert.ok(!carded(null))
})

test("the menu pins and unpins a value, and picking automatically clears them all", () => {
  const sampler = node([{ name: "steps", value: 20 }, { name: "width", value: 1 }, { name: "height", value: 2 }], { properties: {} })
  let changes = 0
  const menu = () => cardMenu(sampler, { changed: () => changes++ })
  const [gap, item] = menu()
  assert.equal(gap, null)
  assert.equal(item.content, "Card when zoomed out")
  assert.ok(item.has_submenu)
  const options = item.submenu.options
  assert.ok(options[0].content.startsWith(CHECK))
  assert.equal(options[1], null)
  assert.ok(!options[2].content.startsWith(CHECK) && !options[3].content.startsWith(CHECK))
  assert.ok(options[2].content.endsWith(" steps"))
  assert.ok(options[3].content.endsWith(" width " + TIMES + " height"))
  options[3].callback()
  assert.deepEqual(sampler.properties[PROPERTY], ["width"])
  menu()[1].submenu.options[2].callback()
  assert.deepEqual(sampler.properties[PROPERTY], ["width", "steps"])
  const pinned = menu()[1].submenu.options
  assert.ok(!pinned[0].content.startsWith(CHECK))
  assert.ok(pinned[2].content.startsWith(CHECK) && pinned[3].content.startsWith(CHECK))
  pinned[3].callback()
  assert.deepEqual(sampler.properties[PROPERTY], ["steps"])
  menu()[1].submenu.options[0].callback()
  assert.ok(!(PROPERTY in sampler.properties))
  assert.equal(changes, 4)
  const bare = node([{ name: "steps", value: 20 }])
  cardMenu(bare)[1].submenu.options[2].callback()
  assert.deepEqual(bare.properties, { [PROPERTY]: ["steps"] })
})

test("a note, a node with nothing to show and a collapsed node get no menu", () => {
  assert.deepEqual(cardMenu({ type: "Note", widgets: [{ name: "text", value: "x" }] }), [])
  assert.deepEqual(cardMenu(node([])), [])
  assert.deepEqual(cardMenu(node([{ name: "a", value: 1 }], { flags: { collapsed: true } })), [])
  assert.deepEqual(cardMenu(null), [])
})

test("a faded node's card mixes its colour into the ground instead of showing through", () => {
  assert.equal(faded("#ff00ff", 1), "#ff00ff")
  assert.equal(faded("#ff00ff", 0.2, "#111"), "color-mix(in srgb, #ff00ff 20%, #111)")
  assert.equal(faded("#ff00ff", 0.4), "color-mix(in srgb, #ff00ff 40%, #222)")
  assert.equal(faded(undefined, 0.4), "")
})

function canvasOf(scale, low) {
  const drawn = []
  class Canvas {
    constructor() {
      this.ds = { scale }
      this.low_quality = low
    }
    draw() {}
    drawNode(item) {
      drawn.push(["node", item.id])
    }
    getNodeModeAlpha() {
      return 1
    }
  }
  return { canvas: new Canvas(), drawn }
}

function context(drawn) {
  return {
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    fillRect(...box) {
      drawn.push(["fill", this.fillStyle, box])
    },
    fillText(text) {
      drawn.push(["text", text, this.font])
    },
    measureText(text) {
      return { width: text.length * 4 }
    },
  }
}

test("zoomed out, a card is drawn over the node, whose widgets stay as they were", () => {
  const { canvas, drawn } = canvasOf(0.25, true)
  let on = true
  installCards(canvas, { enabled: () => on, size: () => 14, count: () => 2 })
  const widgets = [{ name: "seed", value: 7 }]
  const sampler = node(widgets, { id: 3, title: "KSampler", size: [300, 200], renderingColor: "#123", renderingBgColor: "#456" })
  const ctx = context(drawn)
  canvas.drawNode(sampler, ctx)
  assert.equal(sampler.widgets, widgets)
  assert.deepEqual(sampler.widgets, [{ name: "seed", value: 7 }])
  assert.deepEqual(drawn[0], ["node", 3])
  assert.deepEqual(drawn[1], ["fill", "#456", [0, -30, 300, 230]])
  assert.equal(drawn[2][1], "#123")
  const texts = drawn.filter((step) => step[0] === "text")
  assert.deepEqual(texts.map((step) => step[1]), ["KSampler", "seed 7"])
  assert.match(texts[0][2], /^bold 56px Inter, sans-serif$/)
  assert.match(texts[1][2], /^normal 48px Inter, sans-serif$/)
  drawn.length = 0
  on = false
  canvas.drawNode(sampler, ctx)
  assert.deepEqual(drawn, [["node", 3]])
})

test("a card stops above an image preview and is not drawn up close", () => {
  const { canvas, drawn } = canvasOf(0.25, true)
  installCards(canvas, { enabled: () => true, size: () => 14, count: () => 2 })
  const preview = node([{ name: "image", value: "a.png", y: 10 }, { name: "$$canvas-image-preview", y: 60 }], { id: 4, size: [300, 400] })
  canvas.drawNode(preview, context(drawn))
  assert.deepEqual(drawn[1][2], [0, -30, 300, 90])
  const near = canvasOf(1, false)
  installCards(near.canvas, { enabled: () => true, size: () => 14, count: () => 2 })
  near.canvas.drawNode(preview, context(near.drawn))
  assert.deepEqual(near.drawn, [["node", 4]])
})

function framed(scale, low, groups) {
  const drawn = []
  const ctx = {
    save() {},
    restore() {},
    measureText(text) {
      return { width: text.length * 20 }
    },
    strokeText(text, x, y) {
      drawn.push(["halo", text, x, y, this.strokeStyle])
    },
    fillText(text, x, y) {
      drawn.push(["text", text, x, y, this.fillStyle, this.font])
    },
  }
  class Canvas {
    constructor() {
      this.ds = { scale, toCanvasContext() {} }
      this.low_quality = low
      this.ctx = ctx
      this.graph = { groups }
      this.visible_area = [0, 0, 4000, 4000]
      this.clear_background_color = "#202020"
    }
    draw() {}
    drawNode() {}
    drawFrontCanvas() {
      drawn.push(["front"])
    }
  }
  return { canvas: new Canvas(), drawn }
}

test("zoomed out, a group's name stands large just above its top edge, cut to its width", () => {
  const groups = [
    { title: "Models", boundingRect: [100, 500, 800, 400], _titleTextColor: "#8ab" },
    { title: "A rather long group name", boundingRect: [1000, 500, 300, 400] },
    { title: "Far away", boundingRect: [9000, 500, 300, 400] },
    { title: "  ", boundingRect: [100, 1500, 800, 400] },
  ]
  const { canvas, drawn } = framed(0.25, true, groups)
  installCards(canvas, { enabled: () => true, size: () => 14, count: () => 2 })
  canvas.drawFrontCanvas()
  assert.deepEqual(drawn[0], ["front"])
  const texts = drawn.filter((step) => step[0] === "text")
  assert.deepEqual(texts.map((step) => step.slice(1, 4)), [["Models", 112, 488], ["A rather lon" + ELLIPSIS, 1012, 488]])
  assert.equal(texts[0][4], "#8ab")
  assert.equal(texts[0][5], "bold 56px Inter, sans-serif")
  const halos = drawn.filter((step) => step[0] === "halo")
  assert.deepEqual(halos.map((step) => [step[1], step[4]]), [["Models", "#202020"], ["A rather lon" + ELLIPSIS, "#202020"]])
})

test("up close, or with the cards off, the groups keep only their own titles", () => {
  const groups = [{ title: "Models", boundingRect: [100, 500, 800, 400] }]
  const near = framed(1, false, groups)
  installCards(near.canvas, { enabled: () => true, size: () => 14, count: () => 2 })
  near.canvas.drawFrontCanvas()
  assert.deepEqual(near.drawn, [["front"]])
  const off = framed(0.25, true, groups)
  installCards(off.canvas, { enabled: () => false, size: () => 14, count: () => 2 })
  off.canvas.drawFrontCanvas()
  assert.deepEqual(off.drawn, [["front"]])
})

test("past a quarter of the size the text gets smaller, down to seven tenths at a tenth", () => {
  assert.equal(shrink(1), 1)
  assert.equal(shrink(0.25), 1)
  assert.ok(Math.abs(shrink(0.1) - 0.7) < 1e-9)
  assert.equal(shrink(0.05), 0.7)
  const middle = shrink(Math.sqrt(0.25 * 0.1))
  assert.ok(Math.abs(middle - 0.85) < 1e-9, String(middle))
  assert.ok(shrink(0.2) > shrink(0.15) && shrink(0.15) > shrink(0.12))
  assert.deepEqual(sizesOf(14), { title: 14, value: 12 })
  const far = sizesOf(14, 0.1)
  assert.ok(Math.abs(far.title - 9.8) < 1e-9 && Math.abs(far.value - 8.4) < 1e-9, JSON.stringify(far))
})

test("far out, the card and the group names are drawn smaller on screen", () => {
  const { canvas, drawn } = canvasOf(0.1, true)
  installCards(canvas, { enabled: () => true, size: () => 14, count: () => 2 })
  const sampler = node([{ name: "seed", value: 7 }], { id: 3, title: "KSampler", size: [900, 600] })
  canvas.drawNode(sampler, context(drawn))
  const fonts = drawn.filter((step) => step[0] === "text").map((step) => parseFloat(step[2].split(" ")[1]))
  assert.ok(Math.abs(fonts[0] - 98) < 1e-6 && Math.abs(fonts[1] - 84) < 1e-6, String(fonts))
  const groups = framed(0.1, true, [{ title: "Models", boundingRect: [100, 500, 2000, 400] }])
  installCards(groups.canvas, { enabled: () => true, size: () => 14, count: () => 2 })
  groups.canvas.drawFrontCanvas()
  const label = groups.drawn.find((step) => step[0] === "text")
  assert.ok(Math.abs(parseFloat(label[5].split(" ")[1]) - 98) < 1e-6, label[5])
})

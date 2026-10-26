import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ARROWS, BOTH, DEFAULTS, DOWNSTREAM, FADE, GLOW, LINEAGE, LOCALE, TIP, TRUNKS, UPSTREAM, definitions, hexColor, reader,
} from "../../web/js/settings.js"

function stored(values) {
  return (id) => values[id]
}

test("every setting is registered once, under its own place in the panel", () => {
  const all = definitions(() => {})
  const ids = all.map((item) => item.id)
  const places = all.map((item) => item.category.join("/"))
  assert.deepEqual(new Set(ids), new Set(Object.keys(DEFAULTS)))
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(new Set(places).size, places.length)
  for (const item of all) {
    assert.equal(item.category[0], "Breeze", item.id)
    assert.ok(item.name && item.tooltip, item.id)
    assert.equal(item.defaultValue, DEFAULTS[item.id], item.id)
  }
})

test("the panel shows the settings in the order they are defined", () => {
  const orders = definitions(() => {}).map((item) => item.sortOrder)
  assert.ok(orders.every((order, i) => i === 0 || order < orders[i - 1]), String(orders))
  assert.equal(definitions(() => {})[0].id, LINEAGE)
})

test("a colour is stored the way the colour picker stores one", () => {
  for (const item of definitions(() => {}).filter((each) => each.type === "color")) {
    assert.match(item.defaultValue, /^[0-9a-f]{6}$/, item.id)
  }
})

test("every setting that changes the picture redraws it", () => {
  const redraw = () => {}
  const redrawn = definitions(redraw).filter((item) => item.onChange === redraw)
  assert.deepEqual(redrawn.map((item) => item.id), [LINEAGE, FADE, GLOW, UPSTREAM, DOWNSTREAM, BOTH, TRUNKS])
})

test("six or eight hex digits are a colour, with or without the '#'", () => {
  assert.equal(hexColor("4CB3FF", null), "#4cb3ff")
  assert.equal(hexColor("#4cb3ff", null), "#4cb3ff")
  assert.equal(hexColor(" 4cb3ff80 ", null), "#4cb3ff80")
  for (const odd of ["fff", "#12345", "zzzzzz", "4cb3ff8", "", null, undefined, 0x4cb3ff]) {
    assert.equal(hexColor(odd, "#000000"), "#000000", String(odd))
  }
})

test("a setting never changed reads as its default", () => {
  const settings = reader(stored({}))
  assert.equal(settings.lineage(), true)
  assert.equal(settings.fade(), 0.6)
  assert.equal(settings.glow(), 16)
  assert.deepEqual(settings.colors(), { up: "#4cb3ff", down: "#ffb340", both: "#c38bff" })
  assert.equal(settings.tip(), true)
  assert.equal(settings.arrows(), true)
  assert.equal(settings.trunks(), true)
})

test("the values stored are what the extensions get", () => {
  const settings = reader(stored({
    [LINEAGE]: false, [FADE]: 35, [GLOW]: 0, [UPSTREAM]: "00ff00", [DOWNSTREAM]: "ff000080", [TIP]: false, [ARROWS]: false,
    [TRUNKS]: false,
  }))
  assert.equal(settings.lineage(), false)
  assert.equal(settings.fade(), 0.35)
  assert.equal(settings.glow(), 0)
  assert.deepEqual(settings.colors(), { up: "#00ff00", down: "#ff000080", both: "#c38bff" })
  assert.equal(settings.tip(), false)
  assert.equal(settings.arrows(), false)
  assert.equal(settings.trunks(), false)
})

test("a value that makes no sense gives the default, and a fade stays in range", () => {
  assert.equal(reader(stored({ [UPSTREAM]: "blue" })).colors().up, "#4cb3ff")
  assert.equal(reader(stored({ [FADE]: 400 })).fade(), 0.9)
  assert.equal(reader(stored({ [FADE]: -10 })).fade(), 0)
  assert.equal(reader(stored({ [FADE]: "lots" })).fade(), 0)
  assert.equal(reader(stored({ [GLOW]: 400 })).glow(), 40)
  assert.equal(reader(stored({ [GLOW]: -4 })).glow(), 0)
  assert.equal(reader(stored({ [GLOW]: "wide" })).glow(), 0)
})

test("settings not there to ask read as the defaults", () => {
  const settings = reader(() => { throw new TypeError("extensionManager is undefined") })
  assert.equal(settings.lineage(), true)
  assert.equal(settings.colors().both, "#c38bff")
  assert.equal(settings.locale(), "en")
})

test("the language is ComfyUI's own, and English when it has none", () => {
  assert.equal(reader(stored({ [LOCALE]: "ru" })).locale(), "ru")
  assert.equal(reader(stored({})).locale(), "en")
  assert.equal(reader(stored({ [LOCALE]: "" })).locale(), "en")
  assert.equal(reader(stored({ [LOCALE]: 7 })).locale(), "en")
})

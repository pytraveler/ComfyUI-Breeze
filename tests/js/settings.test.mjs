import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ARROWS, BOTH, COMPASS, COMPASS_MODES, COMPASS_NOTE, CONTROL, DEFAULTS, DOWNSTREAM, FADE, FORECAST, FORECAST_MODES, GLOW, INPUTS, LIGHT,
  LIGHT_REPEATS, LIGHT_SPEED, LINEAGE, LOCALE, TIP, TRUNKS, UPSTREAM,
  definitions, hexColor, reader,
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
  assert.deepEqual(redrawn.map((item) => item.id), [LINEAGE, FADE, GLOW, UPSTREAM, DOWNSTREAM, BOTH, TRUNKS, INPUTS, FORECAST, COMPASS, LIGHT])
})

test("a list setting offers each of its values once, the default among them", () => {
  for (const item of definitions(() => {}).filter((each) => each.type === "combo")) {
    const values = item.options.map((option) => option.value)
    assert.equal(new Set(values).size, values.length, item.id)
    assert.ok(values.includes(item.defaultValue), item.id)
    for (const option of item.options) assert.doesNotMatch(option.text, /\./, item.id)
  }
  const forecast = definitions(() => {}).find((item) => item.id === FORECAST)
  assert.deepEqual(forecast.options.map((option) => option.value), FORECAST_MODES)
  const compass = definitions(() => {}).find((item) => item.id === COMPASS)
  assert.deepEqual(compass.options.map((option) => option.value), COMPASS_MODES)
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
  assert.equal(settings.inputs(), true)
  assert.equal(settings.forecast(), "run")
  assert.equal(settings.compass(), "empty")
  assert.equal(settings.compassNote(), true)
  assert.equal(settings.light(), true)
  assert.equal(settings.lightSpeed(), 1)
  assert.equal(settings.lightRepeats(), 3)
  assert.equal(settings.controlBefore(), false)
})

test("the values stored are what the extensions get", () => {
  const settings = reader(stored({
    [LINEAGE]: false, [FADE]: 35, [GLOW]: 0, [UPSTREAM]: "00ff00", [DOWNSTREAM]: "ff000080", [TIP]: false, [ARROWS]: false,
    [TRUNKS]: false, [INPUTS]: false, [FORECAST]: "always", [COMPASS]: "always", [COMPASS_NOTE]: false, [LIGHT]: false,
    [LIGHT_SPEED]: 250, [LIGHT_REPEATS]: 5, [CONTROL]: "before",
  }))
  assert.equal(settings.lineage(), false)
  assert.equal(settings.fade(), 0.35)
  assert.equal(settings.glow(), 0)
  assert.deepEqual(settings.colors(), { up: "#00ff00", down: "#ff000080", both: "#c38bff" })
  assert.equal(settings.tip(), false)
  assert.equal(settings.arrows(), false)
  assert.equal(settings.trunks(), false)
  assert.equal(settings.inputs(), false)
  assert.equal(settings.forecast(), "always")
  assert.equal(settings.compass(), "always")
  assert.equal(settings.compassNote(), false)
  assert.equal(settings.light(), false)
  assert.equal(settings.lightSpeed(), 2.5)
  assert.equal(settings.lightRepeats(), 5)
  assert.equal(settings.controlBefore(), true)
})

test("a value that makes no sense gives the default, and a fade stays in range", () => {
  assert.equal(reader(stored({ [UPSTREAM]: "blue" })).colors().up, "#4cb3ff")
  assert.equal(reader(stored({ [FADE]: 400 })).fade(), 0.9)
  assert.equal(reader(stored({ [FADE]: -10 })).fade(), 0)
  assert.equal(reader(stored({ [FADE]: "lots" })).fade(), 0)
  assert.equal(reader(stored({ [GLOW]: 400 })).glow(), 40)
  assert.equal(reader(stored({ [GLOW]: -4 })).glow(), 0)
  assert.equal(reader(stored({ [GLOW]: "wide" })).glow(), 0)
  assert.equal(reader(stored({ [FORECAST]: "sometimes" })).forecast(), "run")
  assert.equal(reader(stored({ [COMPASS]: "north" })).compass(), "empty")
  assert.equal(reader(stored({ [LIGHT_SPEED]: 1000 })).lightSpeed(), 3)
  assert.equal(reader(stored({ [LIGHT_SPEED]: 5 })).lightSpeed(), 0.25)
  assert.equal(reader(stored({ [LIGHT_SPEED]: "brisk" })).lightSpeed(), 1)
  assert.equal(reader(stored({ [LIGHT_SPEED]: 0 })).lightSpeed(), 1)
  assert.equal(reader(stored({ [LIGHT_REPEATS]: 40 })).lightRepeats(), 5)
  assert.equal(reader(stored({ [LIGHT_REPEATS]: -2 })).lightRepeats(), 1)
  assert.equal(reader(stored({ [LIGHT_REPEATS]: 2.4 })).lightRepeats(), 2)
  assert.equal(reader(stored({ [LIGHT_REPEATS]: "often" })).lightRepeats(), 3)
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

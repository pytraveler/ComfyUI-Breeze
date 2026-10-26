import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { test } from "node:test"

import { definitions } from "../../web/js/settings.js"
import { ENGLISH, SECTION } from "../../web/js/words.js"

const ROOT = new URL("../../locales/", import.meta.url)
const LOCALES = readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)

function load(locale, name) {
  return JSON.parse(readFileSync(new URL(locale + "/" + name, ROOT), "utf-8"))
}

function key(id) {
  return id.replace(/\./g, "_")
}

function blanks(text) {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
}

test("there is at least one translation", () => {
  assert.ok(LOCALES.length)
})

for (const locale of LOCALES) {
  test(locale + ": every setting is translated, and nothing else", () => {
    const settings = load(locale, "settings.json")
    assert.deepEqual(Object.keys(settings).sort(), definitions(() => {}).map((item) => key(item.id)).sort())
    for (const [id, text] of Object.entries(settings)) {
      assert.ok(text.name?.trim(), id)
      assert.ok(text.tooltip?.trim(), id)
    }
  })

  test(locale + ": every option of a list setting is translated, and nothing else", () => {
    const settings = load(locale, "settings.json")
    for (const item of definitions(() => {})) {
      const options = settings[key(item.id)].options
      if (item.type !== "combo") {
        assert.equal(options, undefined, item.id)
        continue
      }
      assert.deepEqual(Object.keys(options ?? {}).sort(), item.options.map((option) => key(option.text)).sort(), item.id)
      for (const [text, translated] of Object.entries(options)) assert.ok(translated.trim(), text)
    }
  })

  test(locale + ": every section of the panel is named, and nothing else", () => {
    const named = load(locale, "main.json").settingsCategories
    const used = new Set(definitions(() => {}).flatMap((item) => item.category.slice(0, 2)))
    assert.deepEqual(Object.keys(named).sort(), [...used].sort())
    for (const [label, text] of Object.entries(named)) assert.ok(text.trim(), label)
  })

  test(locale + ": every word is translated, with the same blanks", () => {
    const words = load(locale, "main.json")[SECTION]
    assert.deepEqual(Object.keys(words).sort(), Object.keys(ENGLISH).sort())
    for (const [name, text] of Object.entries(words)) {
      assert.ok(text.trim(), name)
      assert.deepEqual(blanks(text), blanks(ENGLISH[name]), name)
    }
  })
}

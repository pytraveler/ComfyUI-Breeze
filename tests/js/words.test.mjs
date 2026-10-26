import assert from "node:assert/strict"
import { test } from "node:test"

import { ENGLISH, ROUTE, SECTION, english, fetchTranslations, speaker, wordsFor } from "../../web/js/words.js"

function answering(status, body) {
  return async () => ({ ok: status < 400, status, json: async () => body })
}

test("English fills in what it is given and keeps what it is not", () => {
  assert.equal(english("more", { n: 3 }), "and 3 more")
  assert.equal(english("lastRun", { ago: "just now" }), "last run, just now")
  assert.equal(english("more"), "and {n} more")
  assert.equal(english("no such word"), "no such word")
})

test("a translation is used where it has the word, English where it does not", () => {
  const say = speaker(() => ({ more: "plus {n}", value: "", justNow: 7 }))
  assert.equal(say("more", { n: 2 }), "plus 2")
  assert.equal(say("value"), ENGLISH.value)
  assert.equal(say("justNow"), ENGLISH.justNow)
  assert.equal(say("missingNode"), ENGLISH.missingNode)
})

test("the table is asked for on every word, so a language set later is followed", () => {
  let words = null
  const say = speaker(() => words)
  assert.equal(say("value"), "value")
  words = { value: "valeur" }
  assert.equal(say("value"), "valeur")
})

test("the words for a locale sit under the pack's own section", () => {
  const body = { ru: { [SECTION]: { value: "valeur" }, nodeDefs: {} }, en: {} }
  assert.deepEqual(wordsFor(body, "ru"), { value: "valeur" })
  assert.deepEqual(wordsFor(body, "en"), {})
  assert.deepEqual(wordsFor(body, "fr"), {})
  assert.deepEqual(wordsFor(null, "ru"), {})
  assert.deepEqual(wordsFor({ ru: { [SECTION]: "valeur" } }, "ru"), {})
})

test("the translations are asked for at ComfyUI's own route", async () => {
  let asked = null
  const body = { ru: { [SECTION]: {} } }
  const fetchApi = async (route) => {
    asked = route
    return { ok: true, json: async () => body }
  }
  assert.deepEqual(await fetchTranslations(fetchApi), body)
  assert.equal(asked, ROUTE)
})

test("no translations to be had is null, never an error", async () => {
  assert.equal(await fetchTranslations(answering(404, {})), null)
  assert.equal(await fetchTranslations(answering(200, null)), null)
  assert.equal(await fetchTranslations(async () => { throw new TypeError("offline") }), null)
  assert.equal(await fetchTranslations(async () => ({ ok: true, json: async () => { throw new SyntaxError("html") } })), null)
})

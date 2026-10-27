import assert from "node:assert/strict"
import { test } from "node:test"

import { toggled } from "../../web/js/compass_button.js"

test("the button turns a compass that shows off", () => {
  assert.equal(toggled("empty", null), "off")
  assert.equal(toggled("always", "empty"), "off")
})

test("the button brings back the way the compass showed before it was turned off", () => {
  assert.equal(toggled("off", "always"), "always")
  assert.equal(toggled("off", "empty"), "empty")
})

test("with nothing to bring back, the button shows the compass the default way", () => {
  assert.equal(toggled("off", null), "empty")
  assert.equal(toggled("off", "off"), "empty")
})

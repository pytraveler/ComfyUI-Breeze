import assert from "node:assert/strict"
import { test } from "node:test"

import { installForecastFeed } from "../../web/js/forecast_feed.js"

function page() {
  const handlers = {}
  globalThis.document = { hidden: false, addEventListener: () => {} }
  return {
    handlers,
    listen: (type, handler) => {
      handlers[type] = handler
    },
    status: (remaining) => handlers.status({ detail: { exec_info: { queue_remaining: remaining } } }),
  }
}

function feedOf(t, { wanted = () => true, prompt = () => ({ "3": {} }), answer = { nodes: {}, same: {} } } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] })
  const { handlers, listen, status } = page()
  const sent = []
  const feed = installForecastFeed({
    wanted,
    workflow: () => "wf",
    build: async () => ({ workflow: "wf", prompt: prompt() }),
    send: async (request) => {
      sent.push(request)
      return typeof answer === "function" ? answer() : answer
    },
    listen,
    redraw: () => {},
  })
  const settle = async (ms = 0) => {
    t.mock.timers.tick(ms)
    for (let i = 0; i < 5; i++) await Promise.resolve()
  }
  return { feed, sent, settle, handlers, status }
}

test("nothing is asked until something wants the forecast", async (t) => {
  let wanted = false
  const { feed, sent, settle } = feedOf(t, { wanted: () => wanted })
  feed.poll()
  await settle()
  assert.equal(sent.length, 0)
  wanted = true
  feed.poll()
  await settle()
  assert.equal(sent.length, 1)
  assert.deepEqual(feed.result(), { nodes: {}, same: {} })
  assert.equal(feed.version(), 1)
})

test("a change that leaves the prompt as it was asks nothing", async (t) => {
  let seed = 7
  const { feed, sent, settle, handlers } = feedOf(t, { prompt: () => ({ "3": { seed } }) })
  feed.poll()
  await settle()
  handlers.graphChanged()
  await settle(400)
  assert.equal(sent.length, 1, "a node moved, the prompt stayed")
  seed = 8
  handlers.graphChanged()
  await settle(400)
  assert.equal(sent.length, 2)
})

test("while a prompt runs there is no forecast, and after it the same prompt is asked again", async (t) => {
  const { feed, sent, settle, status } = feedOf(t)
  feed.poll()
  await settle()
  status(1)
  assert.equal(feed.result(), null)
  feed.poll()
  await settle()
  assert.equal(sent.length, 1, "nothing is asked while the run goes on")
  status(0)
  assert.equal(feed.result(), null, "what was forecast before the run is gone")
  feed.poll()
  await settle()
  assert.equal(sent.length, 2)
  assert.ok(feed.result())
})

test("a failed answer counts, so that what waits on one looks again", async (t) => {
  const { feed, settle } = feedOf(t, { answer: null })
  feed.poll()
  await settle()
  assert.equal(feed.result(), null)
  assert.equal(feed.version(), 1)
})

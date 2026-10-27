const SETTLE_MS = 400
const REFRESH_MS = 30000

export function installForecastFeed({ wanted, workflow, build, send, listen, redraw }) {
  const state = {
    result: null, resultFor: undefined, asked: undefined, key: null,
    stale: true, queued: 0, asking: 0, wanted: false, version: 0,
  }
  let timer = 0

  function schedule(delay = SETTLE_MS) {
    clearTimeout(timer)
    timer = setTimeout(refresh, delay)
  }

  async function refresh() {
    timer = 0
    if (!wanted() || document.hidden || state.queued) return
    state.asking++
    try {
      const asked = workflow()
      state.asked = asked
      const request = await build().catch(() => null)
      const key = request ? JSON.stringify(request) : ""
      if (key === state.key && !state.stale) return
      state.key = key
      state.stale = false
      const result = request ? await send(request).catch(() => null) : null
      if (key !== state.key) return
      state.result = result?.nodes ? result : null
      state.resultFor = asked
      state.version++
      redraw()
    } finally {
      state.asking--
    }
  }

  listen("graphChanged", () => {
    if (wanted()) schedule()
  })
  listen("status", (event) => {
    const remaining = event?.detail?.exec_info?.queue_remaining
    if (typeof remaining !== "number" || remaining === state.queued) return
    state.queued = remaining
    if (!remaining) {
      state.stale = true
      state.result = null
    }
    redraw()
  })
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return
    state.stale = true
    redraw()
  })
  setInterval(() => {
    state.stale = true
    if (wanted()) redraw()
  }, REFRESH_MS)

  return {
    poll() {
      const now = wanted()
      if (now && !state.wanted) state.stale = true
      state.wanted = now
      const due = state.stale || state.asked !== workflow()
      if (now && due && !timer && !state.asking && !state.queued && !document.hidden) schedule(0)
    },
    result: () => (!state.queued && state.resultFor === workflow() ? state.result : null),
    version: () => state.version,
  }
}

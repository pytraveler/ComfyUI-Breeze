import { english } from "./words.js"

export const ROUTE = "/breeze/forecast"

export const STATES = ["always", "run", "maybe", "cached"]

const COMPUTED = new Set(["always", "run"])

const CONTROL = /control_(after|before)_generate/

export async function fetchForecast(fetchApi, request) {
  if (!request?.prompt || typeof request.prompt !== "object") return null
  try {
    const response = await fetchApi(ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    })
    if (!response.ok) return null
    const body = await response.json()
    if (typeof body?.error === "string") return { error: body.error }
    if (!body?.nodes || typeof body.nodes !== "object") return null
    const same = body.same && typeof body.same === "object" ? body.same : {}
    return { nodes: body.nodes, same }
  } catch {
    return null
  }
}

export function movingNodes(graph, before) {
  if (!before) return []
  return (graph?.nodes ?? []).filter((node) => moves(node, before)).map((node) => String(node.id))
}

export function moves(node, before) {
  return Boolean(before) && (node?.widgets ?? []).some((widget) => (widget.linkedWidgets ?? []).some(
    (linked) => CONTROL.test(String(linked?.name ?? "")) && linked.value !== "fixed"))
}

export function onCanvas(nodes) {
  const found = new Map()
  for (const [id, entry] of Object.entries(nodes ?? {})) {
    if (!STATES.includes(entry?.state)) continue
    const top = id.split(":")[0]
    const seen = found.get(top) ?? { state: "cached", seconds: 0, untimed: 0, computed: 0 }
    if (STATES.indexOf(entry.state) < STATES.indexOf(seen.state)) seen.state = entry.state
    if (COMPUTED.has(entry.state)) {
      seen.computed++
      if (typeof entry.seconds === "number") seen.seconds += entry.seconds
      else seen.untimed++
    }
    found.set(top, seen)
  }
  for (const seen of found.values()) {
    seen.timed = seen.computed > seen.untimed
  }
  return found
}

export function summary(nodes) {
  const counts = { always: 0, run: 0, maybe: 0, cached: 0, seconds: 0, untimed: 0 }
  for (const entry of Object.values(nodes ?? {})) {
    if (!STATES.includes(entry?.state)) continue
    counts[entry.state]++
    if (!COMPUTED.has(entry.state)) continue
    if (typeof entry.seconds === "number") counts.seconds += entry.seconds
    else counts.untimed++
  }
  return counts
}

export function duration(seconds, say = english) {
  if (!(seconds >= 0)) return ""
  if (seconds < 1) return say("durationUnderSecond")
  const whole = Math.round(seconds)
  if (whole < 60) return say("durationSeconds", { n: whole })
  const minutes = Math.floor(whole / 60)
  if (minutes < 60) return say("durationMinutes", { m: minutes, s: whole % 60 })
  return say("durationHours", { h: Math.floor(minutes / 60), m: minutes % 60 })
}

export function summaryLines(result, say = english) {
  if (!result) return [{ text: say("forecastUnavailable") }]
  if (result.error) return [{ text: say("forecastFailed", { reason: result.error }) }]
  const counts = summary(result.nodes)
  const computed = counts.run + counts.always
  const lines = []
  if (!computed && !counts.maybe) lines.push({ state: "cached", text: say("forecastNothing") })
  if (counts.run) lines.push({ state: "run", text: say("forecastRun", { n: counts.run }) })
  if (counts.always) lines.push({ state: "always", text: say("forecastAlways", { n: counts.always }) })
  if (counts.maybe) lines.push({ state: "maybe", text: say("forecastMaybe", { n: counts.maybe }) })
  if ((computed || counts.maybe) && counts.cached) lines.push({ state: "cached", text: say("forecastCached", { n: counts.cached }) })
  if (computed) {
    const time = duration(counts.seconds, say)
    const quick = counts.seconds < 1
    if (counts.untimed === computed) lines.push({ text: say("forecastUntimed") })
    else if (counts.untimed && quick) lines.push({ text: say("forecastUntimedSome", { n: counts.untimed }) })
    else if (counts.untimed) lines.push({ text: say("forecastAtLeast", { time, n: counts.untimed }) })
    else lines.push({ text: quick ? say("forecastQuick") : say("forecastTime", { time }) })
  }
  return lines
}

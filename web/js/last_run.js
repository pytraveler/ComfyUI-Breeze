import { valueSource } from "./graph_walk.js"
import { english } from "./words.js"

export const ROUTE = "/breeze/outputs"

const SHOWN = 96

export async function fetchOutputs(fetchApi, graphId) {
  if (!graphId) return null
  try {
    const response = await fetchApi(ROUTE + "?workflow=" + encodeURIComponent(graphId))
    if (!response.ok) return null
    const body = await response.json()
    if (body?.workflow !== graphId || typeof body.nodes !== "object" || !body.nodes) return null
    return body.nodes
  } catch {
    return null
  }
}

export function wireValue(outputs, root, graph, link, now = Date.now(), say = english) {
  if (!root || graph !== root) return null
  const source = valueSource(graph, link)
  if (!source) return null
  if ("widget" in source) return { label: say("value"), text: shorten(String(source.widget)) }
  if (!outputs || !Object.hasOwn(outputs, source.id)) return null
  const entry = outputs[source.id]
  const type = source.node.comfyClass ?? source.node.type
  if (entry?.type && type && entry.type !== type) return null
  const text = entry?.outputs?.[source.slot]
  if (text == null) return null
  return { label: say("lastRun", { ago: ago(now - entry.at, say) }), text: String(text) }
}

function shorten(text) {
  return text.length <= SHOWN ? text : text.slice(0, SHOWN - 3) + "..."
}

export function ago(ms, say = english) {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 10) return say("justNow")
  if (seconds < 60) return say("secondsAgo", { n: seconds })
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return say("minutesAgo", { n: minutes })
  return say("hoursAgo", { n: Math.round(minutes / 60) })
}

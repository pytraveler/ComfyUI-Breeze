export const ROUTE = "/i18n"

export const SECTION = "breeze"

export const ENGLISH = {
  value: "value",
  lastRun: "last run, {ago}",
  justNow: "just now",
  secondsAgo: "{n} s ago",
  minutesAgo: "{n} min ago",
  hoursAgo: "{n} h ago",
  more: "and {n} more",
  missingNode: "missing node",
  subgraphInput: "Subgraph input",
  subgraphOutput: "Subgraph output",
  forecastTitle: "Next run",
  forecastRun: "Computed again: {n}",
  forecastAlways: "Computed on every run: {n}",
  forecastMaybe: "May be computed: {n}",
  forecastCached: "From the cache: {n}",
  forecastNothing: "Nothing to compute: it all comes from the cache",
  forecastTime: "About {time}",
  forecastQuick: "Under a second",
  forecastAtLeast: "At least {time}; not timed yet: {n}",
  forecastUntimed: "Not timed yet",
  forecastUntimedSome: "Not timed yet: {n}",
  forecastFailed: "No forecast: {reason}",
  forecastUnavailable: "No forecast: the server did not answer",
  durationUnderSecond: "<1 s",
  durationSeconds: "{n} s",
  durationMinutes: "{m} min {s} s",
  durationHours: "{h} h {m} min",
  compassShow: "Show the compass",
  compassHide: "Hide the compass",
  compassLoose: "Outside groups",
  compassGroup: "Untitled group",
  cardMenu: "Card when zoomed out",
  cardAuto: "Pick the values automatically",
}

export async function fetchTranslations(fetchApi) {
  try {
    const response = await fetchApi(ROUTE)
    if (!response.ok) return null
    const body = await response.json()
    return body && typeof body === "object" ? body : null
  } catch {
    return null
  }
}

export function wordsFor(translations, locale) {
  const words = translations?.[locale]?.[SECTION]
  return words && typeof words === "object" ? words : {}
}

export function speaker(words) {
  return (key, params = {}) => {
    const own = words()?.[key]
    const text = typeof own === "string" && own ? own : ENGLISH[key] ?? key
    return text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(params, name) ? String(params[name]) : whole))
  }
}

export const english = speaker(() => null)

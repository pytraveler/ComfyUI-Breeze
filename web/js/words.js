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
  noteAttach: "Attach to a node",
  noteAttachAnother: "Attach to another node",
  noteDetach: 'Detach from "{node}"',
  notePick: "Click the node to attach the note to. Esc cancels.",
  noteFold: "Fold into an info icon",
  noteUnfold: "Unfold on graph",
  foldedNotesTitle: "Notes for {node}",
  foldedNotesCount: "Read folded notes ({n})",
  readmeTitle: "Workflow README",
  notesSearch: "Search notes",
  notesCollapseAll: "Collapse all",
  notesExpandAll: "Expand all",
  notesEmpty: "Notes in this workflow will appear here, including notes inside subgraphs.",
  notesNoMatch: "No notes match your search.",
  changesTitle: "What changed",
  compareWith: "Compare with",
  compareSaved: "Last saved or opened",
  compareReference: "Remembered reference",
  referenceName: "Reference name",
  rememberReference: "Remember current workflow",
  referenceHint: "Remember a starting point to compare later edits. The reference is kept in the workflow when you save it; remembering again replaces it.",
  referenceUsing: "Reference: {name}",
  referenceMissing: "Name and remember a starting point to compare with it.",
  savedMissing: "No saved state is available for this workflow yet.",
  changesEmpty: "No changes from this starting point.",
  changedLinks: "Connections",
  before: "Before",
  after: "Now",
  restoreField: "Restore this field",
  notSet: "Not set",
  emptyValue: "Empty",
  change_added: "Node added",
  change_removed: "Node removed",
  change_links: "Connections changed",
  change_removedGraph: "Subgraph removed",
  field_title: "Title",
  field_mode: "Mode",
  field_pos: "Position",
  field_size: "Size",
  field_color: "Title colour",
  field_bgcolor: "Body colour",
  connectTitle: "Quick connect",
  connectClose: "Close",
  connectSearch: "Search by node, port, ID or group",
  connectOccupied: "Show occupied inputs",
  connectAny: "any",
  connectTargets: "Compatible ports",
  connectAdd: "Add a new node...",
  connectApply: "Connect ({n})",
  connectApplyReplace: "Connect ({n}), replace {r}",
  connectFailed: "Connected: {n}. Could not connect: {f}. A port changed or the node rejected the connection.",
  connectReplaceHint: "This input already has a source. Click Replace connection to change it.",
  connectReplace: "Replace connection",
  connectAlready: "Already connected",
  connectUsed: "Connected from: {node}",
  connectFree: "Available",
  connectShow: "Show on graph",
  connectEmpty: "No matching ports in this graph. Try showing occupied inputs or add a new node.",
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

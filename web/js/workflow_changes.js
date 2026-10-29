import { graphEntries } from "./workflow_notes.js"
import { titleOf } from "./graph_walk.js"

export const REFERENCE = "breeze_reference"
const FIELDS = ["title", "mode", "pos", "size", "color", "bgcolor"]

export function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

export function equal(a, b) {
  if (a === b) return true
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]))
}

export function referenceOf(root) {
  const ref = root?.extra?.[REFERENCE]
  return ref?.version === 1 && Array.isArray(ref.state?.nodes) ? ref : null
}

export function rememberReference(root, name) {
  const state = copy(root.serialize())
  delete state.extra
  root.extra ??= {}
  root.extra[REFERENCE] = { version: 1, name: name.trim(), state }
}

function graphsOf(state) {
  const children = state?.definitions?.subgraphs ?? state?.subgraphs
  return [state, ...(Array.isArray(children) ? children : [])].filter(Boolean)
}

function savedGraph(state, graph, root) {
  return graph === root ? state : graphsOf(state).find((entry) => String(entry.id) === String(graph.id))
}

function linkEnds(graph) {
  return (graph?.links ?? []).map((link) => Array.isArray(link)
    ? link.slice(1, 5).map(String)
    : [link.origin_id, link.origin_slot, link.target_id, link.target_slot].map(String)).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

export function changesOf(root, baseline) {
  if (!root || !Array.isArray(baseline?.nodes)) return []
  const rows = []
  const visited = new Set()
  const serialized = root.serialize()
  for (const { graph, path } of graphEntries(root)) {
    const previous = savedGraph(baseline, graph, root)
    const now = savedGraph(serialized, graph, root) ?? graph.serialize()
    const currentNodes = new Map((now.nodes ?? []).map((node) => [String(node.id), node]))
    if (previous) visited.add(previous)
    const oldNodes = new Map((previous?.nodes ?? []).map((node) => [String(node.id), node]))
    const current = graph === root ? null : graph
    for (const node of graph._nodes ?? []) {
      const old = oldNodes.get(String(node.id))
      oldNodes.delete(String(node.id))
      const base = { node, path, title: titleOf(node), id: String(node.id), graph: current }
      if (!old || old.type !== node.type) {
        rows.push({ ...base, kind: "added" })
        if (old) rows.push({ ...base, node: null, title: old.title || old.type, kind: "removed" })
        continue
      }
      const live = currentNodes.get(String(node.id)) ?? node.serialize()
      const values = Array.isArray(live.widgets_values) ? live.widgets_values : []
      for (const [index, value] of values.entries()) {
        if (!Array.isArray(old.widgets_values) || index >= old.widgets_values.length || equal(value, old.widgets_values[index])) continue
        const widget = node.widgets?.[index]
        const editable = widget && widget.type !== "button" && widget.options?.serialize !== false
          && equal(widget.value, value) && (typeof value !== "object" || value === null)
        rows.push({ ...base, kind: "widget", index, label: widget?.label || widget?.name || String(index + 1), before: copy(old.widgets_values[index]), after: copy(value), editable: Boolean(editable) })
      }
      if (!Array.isArray(live.widgets_values) && !equal(old.widgets_values, live.widgets_values)) {
        rows.push({ ...base, kind: "property", label: "widgets_values", before: copy(old.widgets_values), after: copy(live.widgets_values), editable: false })
      }
      for (const field of FIELDS) {
        if (equal(old[field], live[field])) continue
        rows.push({ ...base, kind: "field", field, label: field, before: copy(old[field]), after: copy(live[field]), editable: true })
      }
      const properties = new Set([...Object.keys(old.properties ?? {}), ...Object.keys(live.properties ?? {})])
      for (const field of properties) {
        if (field === "breeze_paste" || equal(old.properties?.[field], live.properties?.[field])) continue
        rows.push({ ...base, kind: "property", field, label: field, before: copy(old.properties?.[field]), after: copy(live.properties?.[field]), editable: false })
      }
    }
    for (const old of oldNodes.values()) rows.push({ node: null, path, id: String(old.id), title: old.title || old.type, kind: "removed" })
    if (!equal(linkEnds(previous), linkEnds(now))) rows.push({ node: null, path, id: "", title: "", kind: "links" })
  }
  for (const graph of graphsOf(baseline).slice(1)) {
    if (!visited.has(graph)) rows.push({ node: null, path: [], id: String(graph.id), title: graph.name || String(graph.id), kind: "removedGraph" })
  }
  return rows
}

export function restoreChange(row, canvas) {
  const node = row.node
  if (!row.editable || !node?.graph || node.graph.getNodeById(node.id) !== node) return false
  if (row.kind === "widget") {
    const widget = node.widgets?.[row.index]
    if (!widget || !equal(widget.value, row.after)) return false
    widget.value = copy(row.before)
    widget.callback?.call(widget, widget.value, canvas, node)
  } else if (row.kind === "field") {
    if (!equal(node.serialize()[row.field], row.after)) return false
    if (row.before === undefined) delete node[row.field]
    else if (row.field === "size" && node.setSize) node.setSize(copy(row.before))
    else node[row.field] = copy(row.before)
  } else return false
  node.setDirtyCanvas?.(true, true)
  return true
}

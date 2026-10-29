import { isNote, firstLine } from "./cards.js"
import { titleOf } from "./graph_walk.js"

export function graphEntries(root) {
  const found = []
  const seen = new Set()
  const visit = (graph, path) => {
    if (!graph || seen.has(graph)) return
    seen.add(graph)
    found.push({ graph, path })
    for (const node of graph._nodes ?? []) {
      if (node.subgraph) visit(node.subgraph, [...path, node])
    }
  }
  visit(root, [])
  return found
}

export function workflowNotes(root, query = "") {
  const needle = query.trim().toLocaleLowerCase()
  const entries = []
  for (const { graph, path } of graphEntries(root)) {
    for (const node of graph._nodes ?? []) {
      if (!isNote(node)) continue
      const text = (node.widgets ?? []).filter((widget) => typeof widget.value === "string")
        .map((widget) => widget.value).join("\n\n")
      const stock = [node.type, node.comfyClass, node.constructor?.title].filter(Boolean)
      const title = node.title && !stock.includes(node.title) ? node.title : firstLine(text) || titleOf(node)
      const location = path.map(titleOf).join(" / ")
      if (needle && ![title, text, location].join("\n").toLocaleLowerCase().includes(needle)) continue
      entries.push({ node, path, title, text, location, markdown: node.type === "MarkdownNote" || node.comfyClass === "MarkdownNote" })
    }
  }
  return entries
}

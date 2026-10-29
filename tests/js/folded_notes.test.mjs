import assert from "node:assert/strict"
import { test } from "node:test"
import { attach, detach, FOLDED, foldedHost, markPaste, relinkPasted } from "../../web/js/attached_notes.js"
import { foldedGroups } from "../../web/js/folded_notes.js"
import { workflowNotes } from "../../web/js/workflow_notes.js"

function graphOf(...nodes) {
  const graph = { _nodes: nodes, getNodeById: (id) => nodes.find((node) => node.id === id) }
  for (const node of nodes) node.graph = graph
  return graph
}

function note(id) {
  return { id, type: "MarkdownNote", widgets: [{ value: "# Guide\nContent" }], properties: { [FOLDED]: true } }
}

test("folding groups notes by their live host without removing them from README or serialized content", () => {
  const host = { id: "host", type: "KSampler" }
  const a = note(1), b = note(2), orphan = note(3)
  const graph = graphOf(host, a, b, orphan)
  attach(a, host)
  attach(b, host)
  attach(orphan, { id: "missing" })
  assert.deepEqual([...foldedGroups(graph)], [[host, [a, b]]])
  assert.equal(workflowNotes(graph).length, 3)
  const saved = JSON.parse(JSON.stringify({ properties: a.properties, widgets_values: a.widgets.map((w) => w.value) }))
  assert.equal(saved.properties[FOLDED], true)
  assert.equal(saved.widgets_values[0], "# Guide\nContent")
  detach(a)
  assert.equal(foldedHost(a), null)
  graph._nodes.splice(0, 1)
  assert.equal(foldedHost(b), null)
})

test("copying folded notes with a host remaps their icon; copying a note alone makes it visible", () => {
  const data = { nodes: [
    { id: 1, type: "KSampler", properties: {} },
    { id: 2, type: "Note", properties: { [FOLDED]: true, breeze_note: { node: 1 } } },
  ] }
  const copied = markPaste(data).nodes
  copied[0].id = 11
  copied[1].id = 12
  copied[1].widgets = [{ value: "Memo" }]
  relinkPasted(copied)
  graphOf(...copied)
  assert.equal(foldedHost(copied[1]), copied[0])
  const single = markPaste({ nodes: [data.nodes[1]] }).nodes[0]
  graphOf(single)
  assert.equal(foldedHost(single), null)
})

import assert from "node:assert/strict"
import { test } from "node:test"
import { graphEntries, workflowNotes } from "../../web/js/workflow_notes.js"

function note(id, text, extra = {}) {
  return { id, type: "MarkdownNote", title: "MarkdownNote", widgets: [{ value: text }], ...extra }
}

test("notes include subgraphs once, keep their path, and tolerate graph cycles", () => {
  const nested = { _nodes: [note("2", "# Nested\nInstructions")] }
  const parent = { id: 3, title: "Stage", subgraph: nested }
  const root = { _nodes: [note(1, "# Overview\nHello"), parent, { subgraph: nested }] }
  nested._nodes.push({ subgraph: root })
  assert.equal(graphEntries(root).length, 2)
  const notes = workflowNotes(root)
  assert.equal(notes.length, 2)
  assert.equal(notes[0].title, "Overview")
  assert.equal(notes[1].location, "Stage")
  assert.deepEqual(notes[1].path, [parent])
})

test("search finds titles, full text and the containing subgraph", () => {
  const root = { _nodes: [note(1, "body", { title: "My guide" }), { title: "Stage", subgraph: { _nodes: [note(2, "Long instructions")] } }] }
  assert.equal(workflowNotes(root, "GUIDE")[0].node.id, 1)
  assert.equal(workflowNotes(root, "instructions")[0].node.id, 2)
  assert.equal(workflowNotes(root, "stage")[0].node.id, 2)
  assert.deepEqual(workflowNotes(root, "absent"), [])
})

test("ordinary notes preserve full multiline text without treating it as markdown", () => {
  const text = "line\n".repeat(1000)
  const notes = workflowNotes({ _nodes: [note(1, text, { type: "Note", title: "Note" })] })
  assert.equal(notes[0].text, text)
  assert.equal(notes[0].markdown, false)
  assert.deepEqual(workflowNotes(null), [])
})

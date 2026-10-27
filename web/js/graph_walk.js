import { feedOf, isGetter, isSetter } from "./set_get.js"
import { english } from "./words.js"

const HOPS = 64

const UNWIRED = { split: new Set(), edges: [] }

export function selectedNodeIds(graph, items) {
  const ids = new Set()
  for (const item of items ?? []) {
    if (item != null && graph.getNodeById(item.id) === item) ids.add(item.id)
  }
  return ids
}

export function lineage(links, selected, wiring = UNWIRED) {
  const ports = new Map()
  const owner = new Map()
  const vertex = (id, side, slot) => {
    if (!wiring.split.has(id)) return id
    const key = JSON.stringify([id, side, slot])
    if (!owner.has(key)) {
      owner.set(key, id)
      group(ports, id, key)
    }
    return key
  }
  const into = new Map()
  const from = new Map()
  const join = (a, b, id) => {
    group(into, b, { next: a, id })
    group(from, a, { next: b, id })
  }
  for (const link of links) {
    join(vertex(link.origin_id, "out", link.origin_slot), vertex(link.target_id, "in", link.target_slot), link.id)
  }
  for (const { from: [setter, input], to: [node, output] } of wiring.edges) {
    join(vertex(setter, "in", input), vertex(node, "out", output), null)
  }
  const start = [...selected].flatMap((id) => wiring.split.has(id) ? ports.get(id) ?? [] : [id])
  const owners = (found) => new Set([...found].map((key) => owner.get(key) ?? key))
  const crossed = new Set()
  return {
    selected: new Set(selected),
    upstream: owners(reach(start, into, crossed)),
    downstream: owners(reach(start, from, crossed)),
    links: crossed,
  }
}

function group(map, key, item) {
  const list = map.get(key)
  if (list) list.push(item)
  else map.set(key, [item])
}

function reach(start, edges, crossed) {
  const seen = new Set(start)
  const found = new Set()
  const queue = [...start]
  while (queue.length) {
    for (const { next, id } of edges.get(queue.pop()) ?? []) {
      if (id != null) crossed.add(id)
      if (seen.has(next)) continue
      seen.add(next)
      found.add(next)
      queue.push(next)
    }
  }
  return found
}

export function roleOf(found, id) {
  const up = found.upstream.has(id)
  const down = found.downstream.has(id)
  if (up && down) return "both"
  if (up) return "up"
  if (down) return "down"
  return null
}

export function sameLineage(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return sameSet(a.selected, b.selected) && sameSet(a.upstream, b.upstream)
    && sameSet(a.downstream, b.downstream) && sameSet(a.links, b.links)
}

function sameSet(a, b) {
  if (a.size !== b.size) return false
  for (const item of a) if (!b.has(item)) return false
  return true
}

export function linkEnds(graph, link, say = english) {
  return {
    type: link.type == null ? "*" : String(link.type),
    from: endOf(graph, link.origin_id, link.origin_slot, "outputs", graph.inputNode, say("subgraphInput"), say),
    to: endOf(graph, link.target_id, link.target_slot, "inputs", graph.outputNode, say("subgraphOutput"), say),
  }
}

function endOf(graph, id, slot, side, io, ioTitle, say) {
  const node = graph.getNodeById(id)
  if (node) return { title: titleOf(node), id: node.id, slot: slotName(node[side]?.[slot]) }
  if (io && io.id === id) return { title: ioTitle, id: null, slot: slotName(io.slots?.[slot]) }
  return { title: say("missingNode"), id, slot: null }
}

export function titleOf(node) {
  return node.getTitle?.() || node.title || node.type || "node"
}

function slotName(slot) {
  if (!slot) return null
  return slot.label || slot.localized_name || slot.name || null
}

export function valueSource(graph, link, prefix = "") {
  let scope = graph
  let current = link
  let path = prefix
  for (let hop = 0; current && hop < HOPS; hop++) {
    const node = scope.getNodeById(current.origin_id)
    if (!node) return null
    if (node.isSubgraphNode?.()) {
      const inner = node.subgraph
      const id = inner?.outputNode?.slots?.[current.origin_slot]?.linkIds?.[0]
      current = id == null ? null : inner.getLink(id)
      scope = inner
      path += node.id + ":"
      continue
    }
    if (isSetter(node) || isGetter(node)) {
      current = feedOf(scope, node, current.origin_slot)
      continue
    }
    if (node.isVirtualNode) {
      const upstream = node.getInputLink?.(current.origin_slot)
      if (upstream) {
        current = upstream
        continue
      }
      if (node.widgets?.length) return { widget: node.widgets[0].value, node }
      return null
    }
    return { id: path + node.id, slot: current.origin_slot, node }
  }
  return null
}

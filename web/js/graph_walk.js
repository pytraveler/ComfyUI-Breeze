import { english } from "./words.js"

const HOPS = 64

export function selectedNodeIds(graph, items) {
  const ids = new Set()
  for (const item of items ?? []) {
    if (item != null && graph.getNodeById(item.id) === item) ids.add(item.id)
  }
  return ids
}

export function lineage(links, selected) {
  const into = new Map()
  const from = new Map()
  for (const link of links) {
    group(into, link.target_id, link)
    group(from, link.origin_id, link)
  }
  const crossed = new Set()
  return {
    selected: new Set(selected),
    upstream: reach(selected, into, "origin_id", crossed),
    downstream: reach(selected, from, "target_id", crossed),
    links: crossed,
  }
}

function group(map, key, link) {
  const list = map.get(key)
  if (list) list.push(link)
  else map.set(key, [link])
}

function reach(start, edges, end, crossed) {
  const seen = new Set(start)
  const found = new Set()
  const queue = [...start]
  while (queue.length) {
    for (const link of edges.get(queue.pop()) ?? []) {
      crossed.add(link.id)
      const next = link[end]
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

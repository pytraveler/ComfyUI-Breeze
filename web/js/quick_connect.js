import { titleOf } from "./graph_walk.js"

export function slotTitle(slot) {
  return slot?.label || slot?.localized_name || slot?.name || String(slot?.type ?? "*")
}

export function connectionSource(graph, links) {
  if (links?.length !== 1) return null
  const link = links[0]
  const { node, fromSlot: slot, toType } = link
  const side = toType === "input" ? "outputs" : toType === "output" ? "inputs" : null
  if (!side || graph.getNodeById(node?.id) !== node || !node[side]?.includes(slot)) return null
  if (typeof node.connectSlots !== "function") return null
  const moving = link.link
  if (moving && getLink(graph, moving.id) !== moving) return null
  return { graph, node, slot, side, moving, reroute: link.fromReroute, inputLink: side === "inputs" ? slot.link : null }
}

export function sourceExists(source) {
  const { graph, node, slot, side, moving, reroute } = source
  return graph.getNodeById(node.id) === node && node[side]?.includes(slot)
    && (!moving || getLink(graph, moving.id) === moving)
    && (!reroute || graph.getReroute?.(reroute.id) === reroute)
    && (side !== "inputs" || (slot.link ?? null) === (source.inputLink ?? null))
}

export function connectionCandidates(source, { query = "", occupied = false } = {}) {
  if (!sourceExists(source)) return []
  const { graph, node, side } = source
  const targetSide = side === "outputs" ? "inputs" : "outputs"
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const rows = []
  for (const target of graph._nodes ?? []) {
    if (target === node) continue
    const groups = (graph._groups ?? []).filter((group) => contains(group, target)).map((group) => group.title || "").filter(Boolean).join(" / ")
    for (const slot of target[targetSide] ?? []) {
      const row = connectionPair(source, target, slot)
      if (!row || !compatible(row)) continue
      const current = getLink(graph, row.input.link)
      const connected = current?.origin_id === row.outputNode.id && current?.origin_slot === row.outputNode.outputs.indexOf(row.output)
      if (current && !connected && !occupied) continue
      const title = titleOf(target)
      const port = slotTitle(slot)
      const text = [title, target.type, "#" + target.id, groups, port, slot.type].join(" ").toLocaleLowerCase()
      if (!words.every((word) => text.includes(word))) continue
      rows.push({ ...row, node: target, slot, title, port, groups, connected, current, expectedLink: row.input.link ?? null })
    }
  }
  return rows.sort((a, b) => Number(Boolean(a.current)) - Number(Boolean(b.current)) || a.title.localeCompare(b.title)
    || String(a.node.id).localeCompare(String(b.node.id), undefined, { numeric: true }) || a.port.localeCompare(b.port))
}

export function connectCandidates(source, rows) {
  const result = { connected: 0, failed: 0 }
  if (!sourceExists(source) || (source.side === "inputs" && rows.length !== 1)) return { connected: 0, failed: rows.length }
  const seen = new Set()
  for (const row of rows) {
    if (seen.has(row.input)) continue
    seen.add(row.input)
    if (!pairExists(source.graph, row) || (row.input.link ?? null) !== row.expectedLink || !compatible(row)) {
      result.failed++
      continue
    }
    if (row.connected) continue
    try {
      const link = row.outputNode.connectSlots(row.output, row.inputNode, row.input, source.reroute?.id)
      if (link && getLink(source.graph, row.input.link) === link) result.connected++
      else result.failed++
    } catch {
      result.failed++
    }
  }
  if (result.connected) finishMovedConnection(source)
  return result
}

export function finishMovedConnection(source) {
  const { graph, moving, side } = source
  if (side !== "outputs" || !moving || getLink(graph, moving.id) !== moving) return
  const node = graph.getNodeById(moving.target_id)
  if (node?.inputs?.[moving.target_slot]?.link === moving.id) node.disconnectInput(moving.target_slot)
  source.moving = null
}

function connectionPair(source, node, slot) {
  return source.side === "outputs"
    ? { outputNode: source.node, output: source.slot, inputNode: node, input: slot }
    : { outputNode: node, output: slot, inputNode: source.node, input: source.slot }
}

function compatible({ outputNode, output, inputNode, input }) {
  try {
    return Boolean(outputNode.canConnectTo?.(inputNode, input, output))
  } catch {
    return false
  }
}

function pairExists(graph, { outputNode, output, inputNode, input }) {
  return graph.getNodeById(outputNode.id) === outputNode && graph.getNodeById(inputNode.id) === inputNode
    && outputNode.outputs?.includes(output) && inputNode.inputs?.includes(input)
}

function getLink(graph, id) {
  return id == null ? null : graph.getLink?.(id) ?? graph.links?.get?.(id) ?? graph.links?.[id] ?? null
}

function contains(group, node) {
  const bounds = group._bounding ?? group.bounding
  if (!bounds || !node.pos) return false
  const [x, y, width, height] = bounds
  return node.pos[0] >= x && node.pos[0] <= x + width && node.pos[1] >= y && node.pos[1] <= y + height
}

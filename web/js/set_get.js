const KJ_SET = "SetNode"
const DARKIL_SET = "darkilMultiSetNode"
const DARKIL_SETS = [KJ_SET, DARKIL_SET]

const SETTERS = new Set([KJ_SET, "easy setNode", DARKIL_SET])

const GETTERS = new Map([
  ["GetNode", { sets: [KJ_SET], read: (node, slot) => slot === 0 ? { name: nameOf(node), slot: 0 } : null }],
  ["easy getNode", { sets: ["easy setNode"], read: (node, slot) => slot === 0 ? { name: nameOf(node), slot: 0 } : null }],
  ["darkilMultiGetNode", { sets: DARKIL_SETS, read: (node, slot) => ({ name: groupOf(node.widgets?.[0]?.value), slot }) }],
  ["darkilMultiGetAIONode", { sets: DARKIL_SETS, read: aioRead }],
])

export function isSetter(node) {
  return SETTERS.has(node?.type)
}

export function isGetter(node) {
  return GETTERS.has(node?.type)
}

function nameOf(node) {
  const value = node.widgets?.[0]?.value
  return typeof value === "string" && value !== "" ? value : null
}

function groupOf(value) {
  return value == null || value === "" ? null : String(value).replace(/,(local|parent)$/, "")
}

function aioRead(node, slot) {
  const info = node.slotInfo?.[slot]
  return info ? { name: groupOf(info.groupName), slot: info.inputIdx } : null
}

function nodesOf(graph) {
  return graph?._nodes ?? []
}

function setterNamed(graph, types, name) {
  if (!name) return null
  return nodesOf(graph).find((node) => types.includes(node.type) && nameOf(node) === name) ?? null
}

/** The Set node and its input that output ``slot`` of a Get node reads, the way the Get node's pack pairs them. */
export function readOf(graph, getter, slot) {
  const kind = GETTERS.get(getter?.type)
  const read = kind?.read(getter, slot)
  const setter = read && Number.isInteger(read.slot) ? setterNamed(graph, kind.sets, read.name) : null
  return setter ? { node: setter, slot: read.slot } : null
}

/** The outputs of Get nodes that read input ``slot`` of a Set node. */
export function readersOf(graph, setter, slot) {
  if (!isSetter(setter)) return []
  const found = []
  for (const node of nodesOf(graph)) {
    if (!isGetter(node)) continue
    for (const index of (node.outputs ?? []).keys()) {
      const read = readOf(graph, node, index)
      if (read?.node === setter && read.slot === slot) found.push({ node, slot: index })
    }
  }
  return found
}

export function wiring(graph) {
  const split = new Set()
  const edges = []
  const named = new Map()
  const lookup = (kind, name) => {
    const key = JSON.stringify([kind.sets, name])
    if (!named.has(key)) named.set(key, setterNamed(graph, kind.sets, name))
    return named.get(key)
  }
  for (const node of nodesOf(graph)) {
    if (isSetter(node)) {
      split.add(node.id)
      for (const index of (node.outputs ?? []).keys()) {
        if (node.inputs?.[index]) edges.push({ from: [node.id, index], to: [node.id, index] })
      }
      continue
    }
    const kind = GETTERS.get(node.type)
    if (!kind) continue
    split.add(node.id)
    for (const index of (node.outputs ?? []).keys()) {
      const read = kind.read(node, index)
      const setter = read && Number.isInteger(read.slot) ? lookup(kind, read.name) : null
      if (setter) edges.push({ from: [setter.id, read.slot], to: [node.id, index] })
    }
  }
  return { split, edges }
}

export function feedOf(graph, node, slot) {
  const read = isGetter(node) ? readOf(graph, node, slot) : isSetter(node) ? { node, slot } : null
  const id = read?.node.inputs?.[read.slot]?.link
  return id == null ? null : graph.getLink?.(id) ?? null
}

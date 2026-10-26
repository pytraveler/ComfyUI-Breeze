const DELAY = 350

const SLACK = 8

const REACH_PX = 6

export function watchWires(canvas, listeners) {
  const element = canvas.canvas
  let timer = 0
  let rested = null
  let heard = []
  let probe = null

  const end = () => {
    clearTimeout(timer)
    timer = 0
    if (!rested) return
    rested = null
    for (const listener of heard) listener.away()
    heard = []
  }

  const look = (at) => {
    const wanting = listeners.filter((listener) => listener.wanted())
    if (!wanting.length) return
    probe ??= document.createElement("canvas").getContext("2d")
    const links = linksAt(canvas, probe, at)
    if (!links.length) return
    rested = at
    heard = wanting
    for (const listener of wanting) listener.rest(links, at)
  }

  element.addEventListener("pointermove", (event) => {
    if (rested && Math.hypot(event.clientX - rested.clientX, event.clientY - rested.clientY) <= SLACK) {
      return
    }
    end()
    if (event.buttons || event.pointerType === "touch") return
    const at = { clientX: event.clientX, clientY: event.clientY }
    timer = setTimeout(() => {
      timer = 0
      look(at)
    }, DELAY)
  })
  for (const type of ["pointerdown", "pointerleave", "wheel"]) {
    element.addEventListener(type, end, { passive: true })
  }
  return { end }
}

export function linksAt(canvas, probe, at, only = null) {
  const graph = canvas.graph
  if (!graph || canvas.pointer?.isDown || canvas.linkConnector?.isConnecting) return []
  const [x, y] = canvas.convertEventToCanvasOffset(at)
  if (graph.getNodeOnPos(x, y, canvas.visible_nodes)) return []
  probe.lineWidth = Math.max(canvas.connections_width ?? 3, (2 * REACH_PX) / canvas.ds.scale)
  const found = new Map()
  for (const segment of canvas.renderedPaths ?? []) {
    if (!(segment.path instanceof Path2D)) continue
    const links = linksOf(graph, segment).filter((link) => !only || only.has(link.id))
    if (!links.length || !probe.isPointInStroke(segment.path, x, y)) continue
    for (const link of links) found.set(link.id, link)
  }
  return [...found.values()]
}

export function linksOf(graph, segment) {
  if (!segment.linkIds) return [segment]
  return [...segment.linkIds].map((id) => graph.getLink(id)).filter(Boolean)
}

export function colourOf(canvas, link) {
  const types = canvas.constructor.link_type_colors ?? {}
  return link.color || types[link.type] || canvas.default_link_color || "#9a9"
}

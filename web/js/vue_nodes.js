const NODE = ".lg-node"
const BODY = '[data-testid="node-inner-wrapper"]'
const ERROR = ".ring-4"

const OUTLINE_PX = 2
const GAP_PX = 3
const ERROR_GAP_PX = 7

export function vueNodes() {
  return Boolean(globalThis.LiteGraph?.vueNodesMode)
}

export function nodeSelector(id) {
  return NODE + "[data-node-id=" + JSON.stringify(String(id)) + "]"
}

export function rule(selectors, body) {
  return selectors.join(", ") + " { " + body + " }"
}

export function outlined(selectors, colour, { glow = 0, dashed = false } = {}) {
  if (!selectors.length) return []
  const bodies = selectors.map((node) => node + " > " + BODY)
  const style = dashed ? "dashed" : "solid"
  const rules = [
    rule(bodies, "outline: " + OUTLINE_PX + "px " + style + " " + colour + "; outline-offset: " + GAP_PX + "px;"),
    rule(bodies.map((body) => body + ERROR), "outline-offset: " + ERROR_GAP_PX + "px;"),
  ]
  if (glow > 0) rules.push(rule(selectors, "filter: drop-shadow(0 0 " + glow / 2 + "px " + colour + ") !important;"))
  return rules
}

export function styleSheet() {
  let element = null
  let css = ""
  return (next) => {
    if (next === css) return
    css = next
    element ??= document.head.appendChild(document.createElement("style"))
    element.textContent = next
  }
}

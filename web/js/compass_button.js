import { english } from "./words.js"

export const COMMAND = "Breeze.Compass.Toggle"

const MODEL = '[data-testid="toggle-minimap-button"]'
const ICON = "icon-[lucide--compass] size-4"
const ACTIVE = "not-active:bg-interface-panel-selected-surface!"
const LAST = "breeze.compass.last"

const MOUNT_MS = 1000
const MARGIN = 8

export function toggled(current, last) {
  if (current !== "off") return "off"
  return last && last !== "off" ? last : "empty"
}

export function installCompassButton({ mode, set, say = english }) {
  let button = null
  let tip = null

  const label = () => say(mode() === "off" ? "compassShow" : "compassHide")

  const sync = () => {
    if (!button) return
    const on = mode() !== "off"
    button.classList.toggle(ACTIVE, on)
    button.setAttribute("aria-pressed", String(on))
    button.setAttribute("aria-label", label())
    if (tip?.style.display === "inline-block") place(tip, button, label())
  }

  const toggle = async () => {
    const current = mode()
    if (current !== "off") remember(current)
    await set(toggled(current, recalled()))
    sync()
  }

  const mount = () => {
    if (button?.isConnected) return
    const model = document.querySelector(MODEL)
    if (!model?.parentElement) return
    button = model.cloneNode(false)
    button.classList.remove(ACTIVE)
    button.removeAttribute("data-pd-tooltip")
    button.dataset.testid = "breeze-compass-button"
    const icon = document.createElement("i")
    icon.className = ICON
    icon.setAttribute("aria-hidden", "true")
    button.append(icon)
    button.addEventListener("click", toggle)
    button.addEventListener("pointerenter", () => {
      tip ??= createTip()
      place(tip, button, label())
    })
    button.addEventListener("pointerleave", () => {
      if (tip) tip.style.display = "none"
    })
    model.parentElement.append(button)
    sync()
  }

  mount()
  setInterval(mount, MOUNT_MS)
  return { toggle, sync }
}

function recalled() {
  try {
    return localStorage.getItem(LAST)
  } catch {
    return null
  }
}

function remember(value) {
  try {
    localStorage.setItem(LAST, value)
  } catch {
    return
  }
}

function createTip() {
  const tip = document.createElement("div")
  tip.setAttribute("role", "tooltip")
  tip.className = "p-tooltip p-component p-tooltip-top"
  tip.style.cssText = "display: none; width: fit-content; pointer-events: none; z-index: 2001;"
  const arrow = document.createElement("div")
  arrow.className = "p-tooltip-arrow"
  arrow.style.cssText = "bottom: 0px; left: 50%;"
  const text = document.createElement("div")
  text.className = "p-tooltip-text"
  tip.append(arrow, text)
  document.body.append(tip)
  return tip
}

function place(tip, button, text) {
  tip.lastChild.textContent = text
  tip.style.display = "inline-block"
  const box = button.getBoundingClientRect()
  const { offsetWidth: width, offsetHeight: height } = tip
  const left = Math.max(MARGIN, Math.min(box.left + (box.width - width) / 2, window.innerWidth - width - MARGIN))
  tip.style.left = left + window.scrollX + "px"
  tip.style.top = box.top - height + window.scrollY + "px"
  tip.firstChild.style.left = box.left + box.width / 2 - left + "px"
}

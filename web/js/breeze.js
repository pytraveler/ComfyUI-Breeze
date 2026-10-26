import { app } from "../../scripts/app.js"
import { api } from "../../scripts/api.js"
import { installLineage } from "./lineage.js"
import { fetchOutputs, wireValue } from "./last_run.js"
import { definitions, reader } from "./settings.js"
import { installTrunks } from "./trunks.js"
import { installWireArrows } from "./wire_arrows.js"
import { watchWires } from "./wire_hover.js"
import { installWireTip } from "./wire_tip.js"
import { fetchTranslations, speaker, wordsFor } from "./words.js"

function redraw() {
  app.canvas?.setDirty?.(true, true)
}

function addStyles() {
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = new URL("./breeze.css", import.meta.url).href
  document.head.append(link)
}

const settings = reader((id) => app.extensionManager?.setting?.get?.(id))

app.registerExtension({
  name: "darkil.Breeze",
  settings: definitions(redraw),
  async setup() {
    const canvas = app.canvas
    addStyles()
    let translations = null
    fetchTranslations((route) => api.fetchApi(route)).then((body) => {
      translations = body
    })
    const say = speaker(() => wordsFor(translations, settings.locale()))
    const lineage = installLineage(canvas, {
      enabled: settings.lineage,
      fade: settings.fade,
      colors: settings.colors,
      glow: settings.glow,
    })
    const trunks = installTrunks(canvas, { enabled: settings.trunks, alpha: lineage.alpha })
    const tip = installWireTip(canvas, {
      enabled: settings.tip,
      load: () => canvas.graph === app.rootGraph
        ? fetchOutputs((route) => api.fetchApi(route), app.rootGraph?.id)
        : Promise.resolve(null),
      valueOf: (link, outputs) => wireValue(outputs, app.rootGraph, canvas.graph, link, Date.now(), say),
      say,
      avoid: () => arrows.area(),
    })
    const arrows = installWireArrows(canvas, {
      enabled: settings.arrows,
      flown: () => hover.end(),
      routeOf: trunks.routeOf,
    })
    const hover = watchWires(canvas, [arrows, tip])
  },
})

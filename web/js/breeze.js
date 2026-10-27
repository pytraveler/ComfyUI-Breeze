import { app } from "../../scripts/app.js"
import { api } from "../../scripts/api.js"
import { installAttachedNotes } from "./attached_notes.js"
import { cardMenu, installCards } from "./cards.js"
import { installCompass } from "./compass.js"
import { COMMAND, installCompassButton } from "./compass_button.js"
import { fetchForecast, movingNodes } from "./forecast.js"
import { installForecastFeed } from "./forecast_feed.js"
import { installForecast } from "./forecast_view.js"
import { installInputValues } from "./input_values.js"
import { installLineage } from "./lineage.js"
import { fetchOutputs, wireValue } from "./last_run.js"
import { installRunLight, watchQueue } from "./run_light.js"
import { COMPASS, definitions, reader } from "./settings.js"
import { installTrunks } from "./trunks.js"
import { installWireArrows } from "./wire_arrows.js"
import { watchWires } from "./wire_hover.js"
import { installWireTip } from "./wire_tip.js"
import { fetchTranslations, speaker, wordsFor } from "./words.js"

let compassButton = null

let say = null

let notes = null

function redraw() {
  app.canvas?.setDirty?.(true, true)
  compassButton?.sync()
}

function addStyles() {
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = new URL("./breeze.css", import.meta.url).href
  document.head.append(link)
}

const settings = reader((id) => app.extensionManager?.setting?.get?.(id))

function graphChanged() {
  app.canvas?.setDirty?.(true, true)
  const tracker = app.extensionManager?.workflow?.activeWorkflow?.changeTracker
  if (tracker?.captureCanvasState) tracker.captureCanvasState()
  else tracker?.checkState?.()
}

app.registerExtension({
  name: "darkil.Breeze",
  settings: definitions(redraw),
  commands: [
    {
      id: COMMAND,
      label: "Show or hide the compass",
      icon: "icon-[lucide--compass]",
      function: () => compassButton?.toggle(),
    },
  ],
  getNodeMenuItems(node) {
    if (!say) return []
    return [...(settings.cards() ? cardMenu(node, { say, changed: graphChanged }) : []), ...(notes?.menu(node) ?? [])]
  },
  async setup() {
    const canvas = app.canvas
    addStyles()
    let translations = null
    fetchTranslations((route) => api.fetchApi(route)).then((body) => {
      translations = body
    })
    say = speaker(() => wordsFor(translations, settings.locale()))
    const workflow = () => app.rootGraph?.id ?? ""
    const outputs = () => fetchOutputs((route) => api.fetchApi(route), app.rootGraph?.id)
    const build = async () => {
      const { output } = await app.graphToPrompt()
      const root = app.rootGraph
      return { workflow: root?.id ?? "", prompt: output, moving: movingNodes(root, settings.controlBefore()) }
    }
    const send = (request) => fetchForecast((route, options) => api.fetchApi(route, options), request)
    const feed = installForecastFeed({
      wanted: () => settings.forecast() === "always" || settings.inputs(),
      workflow,
      build,
      send,
      listen: (type, handler) => api.addEventListener(type, handler),
      redraw,
    })
    installCards(canvas, { enabled: settings.cards, size: settings.cardSize, count: settings.cardValues })
    notes = installAttachedNotes(canvas, { enabled: settings.notes, say, changed: graphChanged })
    installInputValues(canvas, {
      enabled: settings.inputs,
      feed,
      load: outputs,
      root: () => app.rootGraph,
      workflow,
      before: settings.controlBefore,
      redraw,
    })
    const lineage = installLineage(canvas, {
      enabled: () => settings.lineage() && !forecast.showing(),
      fade: settings.fade,
      colors: settings.colors,
      glow: settings.glow,
    })
    const trunks = installTrunks(canvas, { enabled: settings.trunks, alpha: lineage.alpha })
    const light = installRunLight(canvas, {
      enabled: settings.light,
      speed: settings.lightSpeed,
      repeats: settings.lightRepeats,
      root: () => app.rootGraph,
      workflow,
      queued: watchQueue(api),
      listen: (type, handler) => api.addEventListener(type, handler),
      routeOf: trunks.routeOf,
      alpha: lineage.alpha,
    })
    const tip = installWireTip(canvas, {
      enabled: settings.tip,
      load: () => canvas.graph === app.rootGraph ? outputs() : Promise.resolve(null),
      valueOf: (link, outputs) => wireValue(outputs, app.rootGraph, canvas.graph, link, Date.now(), say),
      say,
      avoid: () => arrows.area(),
    })
    const arrows = installWireArrows(canvas, {
      enabled: settings.arrows,
      flown: () => hover.end(),
      routeOf: trunks.routeOf,
      light,
    })
    const hover = watchWires(canvas, [arrows, tip])
    installCompass(canvas, { mode: settings.compass, note: settings.compassNote, say })
    compassButton = installCompassButton({
      mode: settings.compass,
      set: (value) => app.extensionManager.setting.set(COMPASS, value),
      say,
    })
    const forecast = installForecast(canvas, {
      mode: settings.forecast,
      glow: settings.glow,
      say,
      isRoot: () => canvas.graph === app.rootGraph,
      build,
      send,
      feed,
      redraw,
    })
  },
})

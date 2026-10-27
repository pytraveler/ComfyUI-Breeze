export const LINEAGE = "Breeze.Lineage.Enabled"
export const FADE = "Breeze.Lineage.Fade"
export const GLOW = "Breeze.Lineage.Glow"
export const UPSTREAM = "Breeze.Lineage.UpstreamColor"
export const DOWNSTREAM = "Breeze.Lineage.DownstreamColor"
export const BOTH = "Breeze.Lineage.BothColor"
export const TIP = "Breeze.WireTip.Enabled"
export const ARROWS = "Breeze.WireArrows.Enabled"
export const TRUNKS = "Breeze.WireTrunks.Enabled"
export const INPUTS = "Breeze.InputValues.Enabled"
export const FORECAST = "Breeze.Forecast.Mode"
export const COMPASS = "Breeze.Compass.Mode"
export const COMPASS_NOTE = "Breeze.Compass.Tooltip"

export const LOCALE = "Comfy.Locale"
export const CONTROL = "Comfy.WidgetControlMode"

export const DEFAULTS = {
  [LINEAGE]: true,
  [FADE]: 60,
  [GLOW]: 16,
  [UPSTREAM]: "4cb3ff",
  [DOWNSTREAM]: "ffb340",
  [BOTH]: "c38bff",
  [TIP]: true,
  [ARROWS]: true,
  [TRUNKS]: true,
  [INPUTS]: true,
  [FORECAST]: "run",
  [COMPASS]: "empty",
  [COMPASS_NOTE]: true,
}

export const FORECAST_MODES = ["run", "always", "off"]

export const COMPASS_MODES = ["empty", "always", "off"]

const FADE_MAX = 90

const GLOW_MAX = 40

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i

export function definitions(redraw) {
  const all = [
    {
      id: LINEAGE,
      category: ["Breeze", "Lineage", "Highlight"],
      name: "Light up what feeds and follows the selected nodes",
      tooltip: "Nodes the selection depends on are outlined in one colour, nodes that depend on it in another, and the rest of the graph fades.",
      type: "boolean",
      defaultValue: DEFAULTS[LINEAGE],
      onChange: redraw,
    },
    {
      id: FADE,
      category: ["Breeze", "Lineage", "Fade"],
      name: "How far the rest of the graph fades, in percent",
      tooltip: "0 leaves it as it is; 90 all but hides it.",
      type: "slider",
      attrs: { min: 0, max: FADE_MAX, step: 5 },
      defaultValue: DEFAULTS[FADE],
      onChange: redraw,
    },
    {
      id: GLOW,
      category: ["Breeze", "Lineage", "Glow"],
      name: "Radius of the soft glow around the outlined nodes",
      tooltip: "The glow is in the colour of the outline and grows with the zoom; 0 turns it off.",
      type: "slider",
      attrs: { min: 0, max: GLOW_MAX, step: 2 },
      defaultValue: DEFAULTS[GLOW],
      onChange: redraw,
    },
    {
      id: UPSTREAM,
      category: ["Breeze", "Lineage", "Upstream colour"],
      name: "Outline of what feeds the selection",
      tooltip: "Blue by default. Eight hex digits give the colour an alpha as well.",
      type: "color",
      defaultValue: DEFAULTS[UPSTREAM],
      onChange: redraw,
    },
    {
      id: DOWNSTREAM,
      category: ["Breeze", "Lineage", "Downstream colour"],
      name: "Outline of what the selection feeds",
      tooltip: "Amber by default. Eight hex digits give the colour an alpha as well.",
      type: "color",
      defaultValue: DEFAULTS[DOWNSTREAM],
      onChange: redraw,
    },
    {
      id: BOTH,
      category: ["Breeze", "Lineage", "Both colour"],
      name: "Outline of a node that does both",
      tooltip: "A node between two selected ones, fed by one and feeding the other. Violet by default.",
      type: "color",
      defaultValue: DEFAULTS[BOTH],
      onChange: redraw,
    },
    {
      id: TIP,
      category: ["Breeze", "Wires", "Tooltip"],
      name: "Describe a wire when the pointer rests on it",
      tooltip: "Its type, both ends, and what went along it in the last run.",
      type: "boolean",
      defaultValue: DEFAULTS[TIP],
    },
    {
      id: ARROWS,
      category: ["Breeze", "Wires", "Arrows"],
      name: "Put arrows on a wire beside the pointer resting on it",
      tooltip: "One points along the wire to where it comes from, the other to where it goes; a click on either carries the view there.",
      type: "boolean",
      defaultValue: DEFAULTS[ARROWS],
    },
    {
      id: TRUNKS,
      category: ["Breeze", "Wires", "Trunks"],
      name: "Run the wires from one output to a column of inputs as one trunk",
      tooltip: "The trunk splits just before the column, where a dot marks it. Only the drawing changes; a wire through a reroute keeps its own line.",
      type: "boolean",
      defaultValue: DEFAULTS[TRUNKS],
      onChange: redraw,
    },
    {
      id: INPUTS,
      category: ["Breeze", "Inputs", "Values"],
      name: "Show what a connected input gets, and from where",
      tooltip: "A primitive's value is shown as it is now, any other node's as it was in the last run, in italics once that node's inputs have changed since.",
      type: "boolean",
      defaultValue: DEFAULTS[INPUTS],
      onChange: redraw,
    },
    {
      id: FORECAST,
      category: ["Breeze", "Forecast", "Mode"],
      name: "Show what the next run computes again",
      tooltip: "Green comes from the cache, orange is computed again, yellow is computed on every run, with the seconds it took last time. The server answers from the cache ComfyUI really holds.",
      type: "combo",
      options: [
        { text: "While the pointer is on Run", value: "run" },
        { text: "Always, as tags on the nodes", value: "always" },
        { text: "Off", value: "off" },
      ],
      defaultValue: DEFAULTS[FORECAST],
      onChange: redraw,
    },
    {
      id: COMPASS,
      category: ["Breeze", "Compass", "Mode"],
      name: "Point to the nodes off screen",
      tooltip: "Arrows at the edges of the canvas point to the nodes out of view, each with the name of their group or how many there are; a click on one carries the view there.",
      type: "combo",
      options: [
        { text: "When no node is in view", value: "empty" },
        { text: "Always", value: "always" },
        { text: "Off", value: "off" },
      ],
      defaultValue: DEFAULTS[COMPASS],
      onChange: redraw,
    },
    {
      id: COMPASS_NOTE,
      category: ["Breeze", "Compass", "Tooltip"],
      name: "Name the nodes an arrow points to when the pointer rests on it",
      tooltip: "After a moment on an arrow, a list of the nodes a click on it brings into view, under the names of their groups.",
      type: "boolean",
      defaultValue: DEFAULTS[COMPASS_NOTE],
    },
  ]
  return all.map((item, index) => ({ ...item, sortOrder: all.length - index }))
}

export function hexColor(value, fallback) {
  const text = typeof value === "string" ? value.trim() : ""
  return HEX.test(text) ? "#" + text.replace(/^#/, "").toLowerCase() : fallback
}

export function reader(get) {
  const read = (id) => {
    try {
      return get(id) ?? DEFAULTS[id]
    } catch {
      return DEFAULTS[id]
    }
  }
  const colour = (id) => hexColor(read(id), "#" + DEFAULTS[id])
  return {
    lineage: () => Boolean(read(LINEAGE)),
    fade: () => Math.min(FADE_MAX, Math.max(0, Number(read(FADE)) || 0)) / 100,
    glow: () => Math.min(GLOW_MAX, Math.max(0, Number(read(GLOW)) || 0)),
    colors: () => ({ up: colour(UPSTREAM), down: colour(DOWNSTREAM), both: colour(BOTH) }),
    tip: () => Boolean(read(TIP)),
    arrows: () => Boolean(read(ARROWS)),
    trunks: () => Boolean(read(TRUNKS)),
    inputs: () => Boolean(read(INPUTS)),
    forecast: () => {
      const value = read(FORECAST)
      return FORECAST_MODES.includes(value) ? value : DEFAULTS[FORECAST]
    },
    compass: () => {
      const value = read(COMPASS)
      return COMPASS_MODES.includes(value) ? value : DEFAULTS[COMPASS]
    },
    compassNote: () => Boolean(read(COMPASS_NOTE)),
    controlBefore: () => read(CONTROL) === "before",
    locale: () => {
      const value = read(LOCALE)
      return typeof value === "string" && value ? value : "en"
    },
  }
}

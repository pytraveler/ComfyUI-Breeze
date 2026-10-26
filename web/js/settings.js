export const LINEAGE = "Breeze.Lineage.Enabled"
export const FADE = "Breeze.Lineage.Fade"
export const GLOW = "Breeze.Lineage.Glow"
export const UPSTREAM = "Breeze.Lineage.UpstreamColor"
export const DOWNSTREAM = "Breeze.Lineage.DownstreamColor"
export const BOTH = "Breeze.Lineage.BothColor"
export const TIP = "Breeze.WireTip.Enabled"
export const ARROWS = "Breeze.WireArrows.Enabled"
export const TRUNKS = "Breeze.WireTrunks.Enabled"

export const LOCALE = "Comfy.Locale"

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
}

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
    locale: () => {
      const value = read(LOCALE)
      return typeof value === "string" && value ? value : "en"
    },
  }
}

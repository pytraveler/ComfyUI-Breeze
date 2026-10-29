# Changelog

[Russian version](CHANGELOG_RU.md)

The version in `pyproject.toml`, the git tag, the release on GitHub and the
version in the Comfy Registry always say the same thing. A new version in
`pyproject.toml` goes to the registry as soon as it reaches `main`, and a
version published there cannot be changed; the release workflow refuses a tag
that disagrees with
`pyproject.toml`, or one that either changelog has no section for. The section it
finds is published as the release notes, English above Russian.

## 0.8.0 - 2026-10-29

- **Quick connect.** Drop a wire on empty canvas to search compatible ports
  on existing nodes, including nodes in the current subgraph. Connect one
  output to several inputs in one undoable action, choose a source from an
  input, locate a candidate, or open the usual node search. Occupied inputs
  require an explicit replacement; cancelling a moved wire preserves it.
  Supports Nodes 2.0 and can be disabled in Breeze's wire settings.
  Multiple selection is available immediately, Add a new node is at the
  top, and closing the picker after a preview restores the original view.
  The wider picker has larger node names and readable wildcard type labels.
  Show on graph pulses the target outline after the camera arrives, using
  the same glow as wire navigation.
- **Workflow README.** A sidebar collects notes from the workflow and its
  subgraphs at a readable size, with text search, Markdown formatting and a
  Show on graph button to visit the original note. Sections fold separately
  or all at once; search opens matching notes without losing the folded
  state of the full list. Section states are kept per workflow for the session.
- **Folded notes.** An attached note can fold into an info badge beside its
  host's title, on the canvas and in Nodes 2.0. The badge opens all folded
  notes for reading, with Markdown and individual Unfold on graph buttons.
  Folding supports undo and saving; orphaned notes become visible again.
  The info badge and its offset scale with the node when zooming.
- **Visible Set/Get relations.** Selection paths draw dashed virtual links
  between the exact Set/Get ports. Unrelated KJNodes/darkilNodes Show links
  lines fade; active pairs are replaced by the dashed relation, with no
  changes to the actual graph. Pairs remain scoped to the current graph.
- **What changed.** A sidebar compares node fields with the last saved or
  opened state, shows old and current values, and restores individual widget
  values, titles, modes, positions, sizes and colours with undo support.
  Changed widget fields are marked while the panel is open, on the canvas
  and in Nodes 2.0. Added and removed nodes, changed properties and rewired
  connections are listed for review.
- A named reference can be remembered in the workflow to compare later
  edits with a starting template even after saving. Both panels follow the
  active workflow and include its subgraphs.

## 0.7.1 - 2026-10-28

- **Where a hidden wire goes.** The Set and Get nodes of KJNodes and
  Easy-Use, and Multi Set, Multi Get and Multi Get AIO of darkilNodes, are
  followed as the wires they stand in for, input by input: the lineage of a
  selection runs on from an input of a Set node to the Get node outputs
  that read it and back, an input fed by a Get node shows the value of the
  node behind the Set node, the run light goes on out of those outputs, and
  the arrows on a wire carry the view from a Get node to its Set node and
  from an input of a Set node to the Get nodes that read it.
- **Fixed:** an input fed by a Get node with no Set node showed the Get
  node's own name as its value, and Breeze had KJNodes and darkilNodes put
  up their warning about the missing Set node on every redraw; with an
  Easy-Use Get node, drawing the values on inputs threw an error on every
  frame instead.

## 0.7.0 - 2026-10-27

- **Which node a note is about.** A note can be attached to a node, from
  the note's menu (Attach to a node, then a click on the node) or by
  dragging the note onto the node's title with Shift held, after which the
  note goes back to where it was. An attached note keeps its place beside
  the node wherever the node goes, a dashed line joins the two while either
  is selected, and a note copied with its node pastes attached to the copy.
  The link is kept in the note's properties; without Breeze the note is an
  ordinary note. Settings > Breeze > Notes turns it off.

## 0.6.0 - 2026-10-27

- **What a node is from far away.** Zoomed out to where ComfyUI stops
  drawing the text on the nodes, each node turns into a card with its title
  in large letters and the values that say most about it: the model, the
  start of the prompt, the size, the seed. A Markdown note shows its title
  and as much of its text as fits instead of a black box, and each group's
  name stands in large letters above it. The values on a card can be picked by hand from
  the node's menu, under Card when zoomed out. It works with Nodes 2.0 as
  well; Settings > Breeze > Cards turns it off and sets the size of the
  title and how many values a card picks by itself.

## 0.5.0 - 2026-10-27

- **What the run is computing now.** While a prompt queued from the page
  runs, a light runs along the wires out of each node as it finishes, to
  the inputs its results go to, three times over while the whole wire
  glows, so the branch being computed shows. It runs under the nodes in the
  wire's colour, at one pace, and goes on through Reroute nodes and
  subgraphs. A circle between the two arrows on a wire the pointer rests on
  sends the light along that wire at any time. Settings > Breeze > Run turns
  it off and sets how fast it runs and how many times.

## 0.4.1 - 2026-10-27

- **A node computed on every run no longer passes for unchanged.** The value
  of a node whose `IS_CHANGED` answers NaN, or whose key holds something
  ComfyUI cannot hash, could now and then show on its inputs as though it
  still stood: the fingerprint of its key was a number taken from where the
  NaN lay in memory, and a later NaN could land in the same place. The
  fingerprint of such a key now equals nothing, so the value is always in
  italics.

## 0.4.0 - 2026-10-27

- **What an input gets.** A widget with a wire into it, greyed out down to
  its name, now also says what comes in and from where: the value of a
  Primitive or of a node whose one setting is what it hands on, such as a
  seed node, as it is now, and of any other node what it handed on in the
  last run, in italics once its inputs have changed since. Before the first
  run it names the node the wire comes from. A box of text the wire hides,
  a multiline prompt's, shows the text that comes in, line by line. It works
  on Nodes 2.0 as well, and can be turned off under Settings > Breeze >
  Inputs.
- **The forecast knows what still stands.** Alongside what it computes
  again, the forecast now tells, for every node of the last run, whether
  its key in ComfyUI's cache is still the same, so whether what it handed
  on then would come again. That is what puts a value in italics. ComfyUI
  has to be restarted once for it.
- **Which nodes a compass arrow points to.** With the pointer resting on an
  arrow for half a second, a list names the nodes a click on it brings into
  view, under the names of their groups, the same name twice counted once.
  It can be turned off under Settings > Breeze > Compass.

## 0.3.1 - 2026-10-27

- **The lineage on Nodes 2.0.** With Nodes 2.0 turned on, what feeds the
  selection and what it feeds are outlined in their colours with the same
  soft glow as on the canvas, and the rest of the nodes fade along with the
  wires, where before only the wires faded.
- **The forecast on Nodes 2.0.** The nodes Nodes 2.0 draws get the
  forecast's marks too: outlined and glowing in the colour of what the next
  run does to them while the pointer is on Run, and tagged with the time
  they took over their top right corner, as on the canvas. Before, only the
  note under Run showed.

## 0.3.0 - 2026-10-27

- **Where the nodes went.** With no node in view, arrows at the edges of the
  canvas point to the nodes off screen, one to each group by its name and
  one to each cluster of loose nodes by their number, and a click carries
  the view there. Arrows that would cover each other become one, and they
  all keep clear of the panels over the canvas. Settings > Breeze > Compass
  keeps them all the time instead, faded while nodes are in view, or turns
  them off, and so does a compass button in the canvas toolbar at the bottom
  right, whose command can be given a key.

## 0.2.0 - 2026-10-27

- **What the next run computes again.** Resting the pointer on Run outlines
  every node the run needs: green from the cache, orange computed again,
  yellow computed on every run, dashed orange reached only through a lazy
  input. Nodes computed again carry the time they took last time, and a
  note under the button adds it up. The server answers from the cache
  ComfyUI really holds, building each node's key the way a run does, after
  the same replacements and validation; a prompt ComfyUI would refuse gets
  the reason. Settings > Breeze > Forecast keeps the marks on the nodes all
  the time instead, or turns them off.
- **Every node is timed.** The server keeps how long each node took the last
  time it was computed, next to the description of its outputs.

## 0.1.0 - 2026-10-26

The first release, with four extensions.

- **What feeds a node, and what it feeds.** Selecting nodes outlines
  everything they depend on in blue and everything that depends on them in
  amber, each outline with a soft glow of its colour, and fades the rest of
  the graph, wires and prompt boxes included. Reroutes are followed.
  Settings > Breeze > Lineage turns it off, sets how far the rest fades and
  how wide the glow is, and picks the three outline colours.
- **What a wire is.** Resting the pointer on a wire shows its type, the output
  it leaves, the inputs it reaches, and what went along it in the last run.
  Overlapping wires are each described.
- **Where a wire leads.** Wherever the pointer rests on a wire, two arrows in
  its colour appear on the wire beside the pointer, one pointing back to the
  output it leaves and one ahead to the input it reaches; a click on one
  carries the view there slowly, and the node it lands on flashes in the
  wire's colour. The wire itself stays drawn, and a wire too long to see
  either end of can be followed from anywhere along it. Zoomed in, the arrows
  grow with the wire.
  Settings > Breeze > Wires turns the arrows off.
- **One trunk for a fan of wires.** Wires from one output into inputs
  standing in a column run as one trunk that splits just before the column,
  at a small dot, drawn the way a reroute there would draw it; the links stay
  as they are. Clicks, the tooltip and the arrows find the trunk like any
  wire. A wire through a reroute, or held by a Zip Ties tie, keeps its own
  line, and a hidden link has no say in where the others split.
  Settings > Breeze > Wires turns the trunks off.
- **In Russian as well.** With ComfyUI set to Russian, the settings and the
  tooltip's own words are in Russian; the translations are in `locales/ru`.
- **The values come from the server.** While a prompt runs, every output is
  described in a line -- the shape and dtype of a tensor, the head of a string,
  a number -- and the line, never the value, is kept under the workflow the
  prompt came from until ComfyUI restarts. Nodes taken from the cache are
  described as well, and a reloaded page sees the same values. They are shown
  on the top level of a workflow, not yet inside subgraphs.

# Breeze for ComfyUI

Frontend extensions that make a ComfyUI graph easier to read and to work in.
They answer the questions a graph raises while you look at it: what feeds this
node, what this wire carries, what this input gets, where the nodes went when
the screen is empty, what a node is when zoomed out too far to read it, which
node a note is about, what the next run will compute again, what the run is
computing now.

[Russian version](README_RU.md) | [Changelog](CHANGELOG.md)

<p align="center">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/License-Apache--2.0-blue"></a>
  <img alt="Python 3.10+" src="https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white">
</p>

![A ComfyUI graph in Russian with KSampler selected. ModelSamplingAuraFlow and two CLIP Text Encode prompts, which feed it, are outlined in blue with a soft blue glow; VAE Decode, which it feeds, in amber. The pointer rests on the MODEL wire into KSampler: two violet arrows stand on the wire, one back up towards ModelSamplingAuraFlow and one ahead towards KSampler, and the tooltip reads MODEL, ModelSamplingAuraFlow #69 MODEL, to KSampler #70 model. On the right the blue IMAGE wires from VAE Decode run as one trunk to a small dot and split there](docs/preview.png)

*KSampler is selected: what feeds it is outlined in blue, what it feeds in
amber. The pointer rests on a wire, which names its ends and shows the two
arrows that carry the view to them. On the right, one output's wires share a
trunk.*

## What it does

- **Connect without crossing the graph.** Drop a wire on empty canvas to
  search compatible ports on existing nodes by title, ID, port or group.
  Select one or several inputs, then click Connect. Drag from an input to
  choose a single output instead. Show on graph visits a candidate; closing
  the picker after connecting or cancelling restores the original view.
  Occupied inputs are hidden until requested and require an explicit
  replacement. Existing connections are marked. Esc leaves the wires as
  they were, including a wire being moved, and Ctrl+Z undoes a whole batch.
  Add a new node at the top opens ComfyUI's usual search or connection menu.
  The wider picker uses larger node names and labels wildcard types as any.
  Works in the current graph, inside subgraphs and with Nodes 2.0; external
  subgraph ports are ordinary candidates. It does not create ports across
  subgraph boundaries. Drags from subgraph boundary sockets and native
  drags of several existing wires keep ComfyUI's normal behaviour.
  Turn off Enable quick connect under Settings > Breeze > Wires.

  ![Quick connect in Russian: compatible inputs for the STRING output of String (User Prompt), with selection boxes, Show on graph buttons, search and Add a new node at the top](docs/quick_connect.png)

  *Choose compatible inputs on existing nodes without dragging a wire across
  the graph; Show on graph locates a candidate before connecting.*

- **What feeds a node, and what it feeds.** Select a node and everything it
  depends on is outlined in blue, everything that depends on it in amber, each
  with a soft glow of its colour, and the rest of the graph fades, wires and
  prompt boxes included. Select several
  and they light up together; a node between two of them is outlined in violet.
  Frontend reroutes and Reroute nodes are followed like any other link. With
  Nodes 2.0 the outlines and the glow sit on the nodes it draws as well, and
  those nodes fade too.
- **What a wire is.** Rest the pointer on a wire for a moment and a tooltip
  names its type, the output it leaves and the inputs it reaches, and what went
  along it in the last run: `1x1536x1024x3 float32` for an image, the head of
  the text for a string, `latent 1x16x128x128 float32`, `ModelPatcher: Flux`.
  Where wires overlap, each one is described.

  ![The pointer rests on the IMAGE wire from Text to Image (MOSS-Image) to Save Image, with ComfyUI in Russian. On the wire beside it stand two blue arrows, one back towards the output and one ahead towards the input, with a small circle between them. The tooltip reads IMAGE, Text to Image (MOSS-Image) #18 IMAGE, to Save Image #9 images, last run 4 min ago, 1x1024x1024x3 float32](docs/what_this_wire.png)

  *The tooltip names the wire's ends and what went along it in the last
  run; the arrows and the circle between them stand where the pointer is.*

- **What an input gets.** A widget with a wire into it is greyed out down to
  its name, and the row now says what comes in and from where: `1024` and an
  arrow back to Resolution Selector. A Primitive, or a node whose one setting is
  what it hands on, such as a seed node, gives its value as it is now, run or
  not. Any other node gives what it handed on in the last run, in italics
  once its inputs have changed since, so the value no longer stands. Before
  the first run the row names the node the wire comes from. Where the wire
  hides a box of text, a multiline prompt's, the box shows the text that
  comes in, line by line. A row too narrow for both keeps the name of the
  node and cuts the value. On Nodes 2.0 the same text stands in the row of
  the input, on one line.
- **Where a wire leads.** Two arrows in the wire's colour appear on the wire
  beside the resting pointer, one pointing back along it to the output it
  leaves, one ahead to the input it reaches, and a click on one carries the
  view there, slowly enough to follow. They stand wherever the pointer is, so
  a wire too long to see either end of can be followed from the middle; when
  several of the wires under the pointer leave one output, the arrow ahead
  frames every input they reach. Where the view lands, the node flashes in
  the wire's colour, twice, and fades. Zoomed in, the arrows grow with the
  wire. The wire itself stays drawn.
- **One trunk for a fan of wires.** Wires that leave one output for inputs
  standing in a column, a CLIP into both prompts or a VAE into several
  decoders, run as one trunk that splits just before the column, at a small
  dot, instead of each crossing the graph on its own. It is drawn as a reroute
  in front of the column would draw it, in every link render mode, but
  nothing is added to the graph: the links stay as they are. A click, the
  tooltip and the arrows find the trunk like any wire, and the arrow ahead on
  it frames every input it splits to. A wire through a reroute of yours keeps
  its own line.

  ![The wires from the IMAGE output of a node on the left, drawn as one blue trunk that runs to a small dot just before a column of four nodes on the right and splits there, one wire to each node](docs/wire_leads.png)

  *One output into four inputs in a column: one trunk, split at the dot.*
- **What the run is computing now.** While a prompt queued from the page
  runs, a light runs along the wires out of each node as it finishes, from
  its outputs to the inputs its results go to, three times over while the
  whole wire glows, so the branch being computed shows as the run goes. The
  light is in the wire's colour and runs under the nodes at one pace, so a
  long wire takes longer than a short one, though no more than two seconds;
  it goes on through Reroute nodes and into and out of subgraphs. A small
  circle stands on a wire the pointer rests on, between its two arrows, and
  a click on it sends the light along that wire at any time, along every
  branch of a trunk. Settings > Breeze > Run turns it off and sets how fast
  it runs and how many times. ComfyUI tells only the page that queued a
  prompt how its nodes are doing, so a run queued from another tab has no
  light.

  ![The IMAGE wire from Text to Image (MOSS-Image) to Save Image during a run: the whole wire glows a lighter blue, and a bright white head with a fading tail is about to reach the input on the right. Above Save Image a tag reads 0.116s](docs/wire_light.png)

  *Text to Image has finished, and the light runs along its wire to the
  node that saves the image.*
- **Where a hidden wire goes.** The Set and Get nodes of KJNodes and
  Easy-Use, and Multi Set, Multi Get and Multi Get AIO of darkilNodes,
  stand in for wires, and Breeze follows them as if the wires were there,
  input by input. Select a node fed by a Get node and the Set node lights
  up with what feeds the one input behind that output, and nothing else
  that goes into the Set node; select a Set node and its Get nodes light up
  with what they feed. An input fed by a Get node shows the value of the
  node behind the Set node and names that node, the run light that reaches
  an input of a Set node goes on out of every output that carries it, and
  on a wire out of a Get node the arrow back carries the view to its Set
  node, as the arrow ahead on a wire into a Set node does to every Get node
  that reads that input. A Get node is paired with the Set node of its name
  in the same graph, so one inside a subgraph whose Set node is outside it
  is not followed. While a selection crosses a Set/Get pair, a dashed line
  joins the matching ports in the upstream/downstream colour. Unrelated
  virtual lines drawn by KJNodes or darkilNodes with Show links fade with
  the rest of the graph; active pairs use Breeze's dashed line instead.
- **Where the nodes went.** When no node is in view, arrows at the edges
  of the canvas point to the ones off screen: one to each group, with its
  name, and one to each cluster of nodes outside any group, with how many
  there are, or with the node's own title when it stands alone. A click
  carries the view there, as the arrows on a wire do. Arrows that would
  cover each other become one, which frames everything they pointed to, and
  all of them keep clear of the panels and toolbars over the canvas. Rest
  the pointer on an arrow for a moment and a list names the nodes it points
  to, under the names of their groups; it can be turned off under Settings >
  Breeze > Compass. Under
  Settings > Breeze > Compass they can stay all the time instead, faded
  while nodes are in view. A button with a compass on it, next to the
  minimap's in the toolbar at the bottom right of the canvas, turns them off
  and back on, and the command behind it can be given a key under Settings >
  Keybinding.

  ![Two white arrows at the top edge of an empty canvas, one with 3 under it and one with 4. The pointer rests on the second, and a list beside it names the four nodes it points to: Text to Image (MOSS-Image), Save Image, Note: ref_image, Resolution Selector](docs/compass_arrows.png)

  *No node is in view: each arrow points to nodes off screen and says how
  many there are, and resting on one lists them.*

  ![The toolbar at the bottom right of the canvas: select, fit view, zoom at 112%, minimap, link visibility, and last the button with a compass on it, highlighted](docs/compass_button.png)

  *The button with the compass, last in the toolbar, turns the arrows off
  and back on.*
- **What a node is from far away.** Zoom out to where ComfyUI stops drawing
  the text on the nodes, and each node turns into a card: its title in large
  letters, as easy to read as a title at 100%, and under it the values that
  say most about the node, as many as there is room for: the model without
  its folder and extension, the start of the prompt, the width and height,
  the seed, and otherwise the first values in the node. A value the title
  already gives, as `vae` in `Get_vae`, is not repeated, and an image
  preview stays in view under the card. A Markdown note, a black box at
  that zoom, shows its title instead, or its first line when it has no title
  of its own, and under it as much of its text as fits, without the markup.
  Each group's name stands in letters as large just above its top edge, cut
  to the group's width. Further out than 25% all of this text shrinks bit by
  bit, to seven tenths at 10%, so that more words fit a line. To choose what
  a card shows, right-click the node and tick the values under Card when
  zoomed out. Settings > Breeze > Cards turns the cards off and sets the
  size of the title and how many values a card picks by itself; how far out the cards appear is ComfyUI's own setting, Zoom
  Node Level of Detail - font size threshold, under LiteGraph. Nodes 2.0
  has no simpler look of its own for that zoom, and the cards appear there
  at the same point.

  ![A MOSS-Image workflow zoomed far out. Two black Markdown notes on the left read Guide: Subgraph and MOSS-Image capabilities and limits in large letters, with the start of their text under each: Model Links, Hugging Face: Comfy-Org/MOSS-Image, and Sources, Resolution, Item and Official. On the right the names of the groups, Prompt Enhancer, Models, Prompt and Image Size, stand large above their top edges. The nodes are cards: KSampler with seed and steps 25, Save Image with moss_image_t2i, Load CLIP with qwen3.5_9b, Resolution Selector with megapixels 1 and multiple 16, Text (User Prompt) with the start of its prompt](docs/zoom_text.png)

  *Zoomed far out, every node keeps a title you can read and the values that
  matter most, the notes keep their text, and the groups their names.*
- **Which node a note is about.** A note put beside a node stays there only
  until the node moves. Right-click the note, choose Attach to a node and
  click the node; or drag the note onto the node's title with Shift held,
  and the note goes back to where it was, attached. From then on it keeps
  its place beside the node wherever the node goes, dragged, snapped to the
  grid or carried with its group, and a dashed line joins the two while
  either is selected. A note and its node copied together paste as a pair
  that is attached in the same way; a note copied alone pastes free. The
  same menu detaches the note or attaches it to another node, and Settings >
  Breeze > Notes turns all this off. It works the same with Nodes 2.0.
  Choose Fold into an info icon in an attached note's menu to hide it behind
  an info badge beside its node's title. The badge counts folded notes;
  click it to read them, then Unfold on graph to restore one. Folding is
  undoable and saved with the workflow. Notes remain available in Workflow
  README; disabling the feature, deleting their host, or opening without
  Breeze makes them visible again.

  ![An info badge above the upper-right corner of a node with a folded attached note](docs/note_icon.png)

  *Click the info badge to read folded notes or unfold them on the graph.
  Its size follows the graph's zoom.*

  ![The Markdown note MOSS-Image capabilities and limits is selected, with its tables of resolution and strengths. From its right edge a dashed white line runs up to the corner of Load Diffusion Model in the Models group and ends in a small dot there](docs/attach_note.png)

  *The selected note and the node it is attached to are joined by a dashed
  line; when the node moves, the note moves with it.*
- **What the next run computes again.** Rest the pointer on Run and every
  node the run needs is outlined: green where its result comes from the
  cache, orange where it is computed again, yellow where it is computed on
  every run, dashed orange where only a lazy input asks for it, which the
  node may or may not do. Above each node computed again stands the time it
  took the last time it was computed, and a note under the button sums it
  up: computed again 2, from the cache 3, about 40 s. The answer comes from
  ComfyUI's own cache, so a run from another tab, an entry the cache let go
  and a seed that changes after every run all count. Under Settings >
  Breeze > Forecast the marks can stay on the nodes all the time instead,
  renewed after every edit and every run. With Nodes 2.0 the outlines, their
  glow and the tags sit on the nodes it draws as well.

  ![The forecast with the pointer resting on Run, with ComfyUI in Russian. Text to Image (MOSS-Image) is outlined in orange with a tag above it saying 17 s, Save Image in orange with a tag saying under a second, and Resolution Selector below them in green. The note under Run reads Next run: computed again 3, from the cache 14, about 17 s. On Text to Image the rows of width and height read 1024 with an arrow back to Resolution Selector](docs/forecast.png)

  *The next run computes Text to Image again, for about 17 seconds, and
  saves the image again; Resolution Selector comes from the cache, and the
  rows of width and height say what it hands on: 1024.*

- **Read the workflow's notes.** Open Workflow README (the book icon in the
  sidebar) to read all notes at a fixed text size, including notes inside
  subgraphs. Search matches their titles, text and subgraph names. Markdown
  notes keep their formatting. Click a heading to fold or unfold a section,
  or use Collapse all / Expand all. Search temporarily opens matching notes
  and preserves the previous folded sections when cleared. Section states
  are remembered per workflow during this session. Show on graph visits
  the original note, unfolding it from its info badge if needed.
  Older frontends without the Markdown rendering API show the original text.

  ![The Workflow README sidebar with a search field and the Fibo 2.0 Edit note rendered with headings, bold text, code and a bulleted list](docs/workflow_readme.png)

  *Read a workflow's notes in the sidebar, with Markdown formatting and
  search, regardless of the graph's zoom.*

- **See what changed.** Open What changed (the history icon in the sidebar)
  to compare with the last saved or opened state. Each edited field shows
  its old and current values. Restore this field changes just that value;
  Ctrl+Z undoes the restoration. Widget values, titles, modes, positions,
  sizes and colours can be restored individually. Added or removed nodes,
  changed custom properties and connections are listed for review, without
  a restore button. While the panel is open, changed widget fields are
  marked on the graph too. To compare against a template after saving your
  edits, give the starting point a name and choose Remember current workflow.
  The reference is kept with the workflow on save; remembering again replaces
  it. Switch between the saved state and that reference using the dropdown.

  ![The What changed sidebar in Russian, comparing with the last saved or opened state: Load Image (Temp) has changed image and darkil_temp_info fields, with old and current values and a Restore this field button](docs/what_changed.png)

  *Review old and current field values and restore an individual change;
  the controls above let you remember a named reference for comparison.*

The canvas features can be switched off under Settings > Breeze, which is also where the
fade, the glow's radius, the three outline colours, the pace of the light
and the size of a card's title are set; a radius of 0
turns the glow off. A colour given in eight hex digits
carries an alpha as well. With ComfyUI set to Russian the settings and the
tooltip are in Russian; in any other language they read in English.

### Where the values on a wire come from

ComfyUI tells the browser about a node's result only when the node displays
it. For everything else the pack's server side writes a line about each output
while the prompt runs -- the shape and dtype of a tensor, the head of a string,
a number -- and keeps that line, never the value, under the workflow the prompt
was queued from. Nodes taken from the cache are described too, so a run in
which nothing had to be computed again still fills every wire in.

The tooltip asks the server for those lines, so they survive a reload of the
page and show in every tab with the same workflow open; they last until
ComfyUI restarts. A line is shown only while the node it describes is still of
the same type, and only on the top level of a workflow: inside a subgraph the
tooltip gives the type and the ends, not yet the value. A prompt queued through
the HTTP API carries no workflow and leaves nothing behind.

A string is also kept as it is, line breaks and all, up to 2000 characters,
for the boxes of text on the inputs it feeds.

With each line the server keeps a fingerprint of the key ComfyUI's cache filed
the result under. The forecast below builds the keys the graph on screen would
have, and a node whose key is still the same would hand on the same again,
whether the cache still holds the result or not; one whose key has changed is
shown in italics on the inputs it feeds. A key with a NaN from `IS_CHANGED` in
it, the way a node computed on every run says so, never counts as the same.
The forecast is asked for after every
edit that changes the prompt, the way the forecast's marks that stay on the
nodes are, and while none has come back the value from the last run is shown
dimmed.

To read the outputs the pack wraps `PromptExecutor.execute_async`, to learn
which workflow is running, and three methods of `ExecutionList`, one of them
to time each node. The originals run first and unchanged; a description that
fails is dropped, never raised into the run. If an update of ComfyUI moves
any of them, the pack wraps none, logs a warning at startup, and the tooltip
shows no values and Run no forecast; everything else keeps working.

### How the forecast is made

ComfyUI takes a node from its cache when the node's key is there: its class,
its inputs, what its `IS_CHANGED` says, and the same for everything upstream.
The browser cannot see that cache, so it sends the server the prompt Run
would queue, and the server builds the keys for it the way a run does and
looks them up in the cache the last run left. The prompt goes through what
ComfyUI does to a queued prompt first, node replacements and validation, so a
prompt ComfyUI would refuse gets the reason instead of a forecast. Handlers
other packs register for queued prompts are not called.

The cache is only read. `IS_CHANGED` does run, as it does when a prompt is
queued, so a LoadImage hashes its file; that happens on a thread of its own,
one forecast at a time. The cache can still change before the prompt runs,
which is why it is a forecast. The seconds are those of the node's last
computation in the same workflow, and a node no run has computed yet has
none.

## How it changes a workflow

The visual features draw over the canvas. Card choices, attached-note
links and folded-note states are kept in node properties; a remembered comparison reference goes
in `extra.breeze_reference`. These are workflow metadata, not execution
inputs. The What changed panel edits a field only when you click its restore
button, just as editing that field yourself would, with normal undo support.
Quick connect creates or replaces ordinary links only when you choose a
destination; it adds no helper nodes. A saved workflow loads and runs
without Breeze, and an attached note remains an ordinary note there.
The visual principle is borrowed from
[Zip Ties](https://github.com/safzanpirani/comfyui-zip-ties).

## Install

The pack is in the [Comfy Registry](https://registry.comfy.org) as
`comfyui-breeze`: find Breeze in ComfyUI-Manager's Custom Nodes Manager, or
install it with comfy-cli:

```text
comfy node install comfyui-breeze
```

Or clone the repository into ComfyUI's `custom_nodes`:

```text
cd ComfyUI/custom_nodes
git clone https://github.com/pytraveler/ComfyUI-Breeze
```

Either way, restart ComfyUI afterwards. The pack needs nothing beyond ComfyUI
itself: no Python packages, no models.

## Development

The suite runs without ComfyUI, torch or a browser:

```text
python -m pip install pytest
python -m pytest tests -q
```

With Node.js 22 or later on `PATH` it also parses every script under `web/js`
and runs the browser-free parts of them against `tests/js`; without Node those
tests skip. CI installs Node and sets `BREEZE_REQUIRE_NODE`, so there they
fail instead.

The suite also carries the house rules, so CI and the release archive enforce
them as well:

- **ASCII only**, outside the translations.
- **Both changelogs describe every release**, and the version in
  `pyproject.toml`, the git tag and the GitHub release always agree. The
  release workflow refuses a tag that breaks either rule.

## Licence

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

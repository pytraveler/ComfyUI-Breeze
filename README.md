# Breeze for ComfyUI

Frontend extensions that make a ComfyUI graph easier to read and to work in.
They answer the questions a graph raises while you look at it: what feeds this
node, what this wire carries, what this input gets, where the nodes went when
the screen is empty, what the next run will compute again.

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

![The forecast with the pointer resting on Run, in a YuE2 workflow with ComfyUI in Russian. Write the song, whose badge says it took 18.85 s last time, and The score it sang are outlined in green: both come from the cache. The song, a SaveAudioAdvanced node whose format has just been switched to mp3, is outlined in orange, with a tag beside its badges saying it took under a second. The note under the Run button reads Next run: computed again 1, from the cache 2, under a second](docs/what_computes_again.png)

*Only the format of the save node has changed, so the next run saves the
song again and takes the 19 seconds of singing from the cache.*

Each can be switched off under Settings > Breeze, which is also where the
fade, the glow's radius and the three outline colours are set; a radius of 0
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
shown in italics on the inputs it feeds. The forecast is asked for after every
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

### Not yet supported

- Inside a subgraph the forecast marks nothing; on the top level a subgraph's
  node takes the mark of what is inside it. The inputs there show the values
  of Primitives and seed nodes, and only the name of any other node.
- A trunk only forms for inputs ahead of the output, on the left of their
  nodes; wires that run backwards, or into inputs too close to the output to
  gain anything, are drawn as before.

## How it changes a workflow

It does not. Everything is drawn over the canvas, and anything an extension
has to remember is kept in the workflow's `extra` field. No node is added and
no link is rewired, so a workflow saved with these extensions loads and runs
the same without them. The principle is borrowed from
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

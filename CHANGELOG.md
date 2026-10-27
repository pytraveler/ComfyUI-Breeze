# Changelog

[Russian version](CHANGELOG_RU.md)

The version in `pyproject.toml`, the git tag, the release on GitHub and the
version in the Comfy Registry always say the same thing. A new version in
`pyproject.toml` goes to the registry as soon as it reaches `main`, and a
version published there cannot be changed; the release workflow refuses a tag
that disagrees with
`pyproject.toml`, or one that either changelog has no section for. The section it
finds is published as the release notes, English above Russian.

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
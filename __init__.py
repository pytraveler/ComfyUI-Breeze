"""ComfyUI entry point for ComfyUI-Breeze, a set of canvas extensions.

What this pack does happens in the browser, in the extensions WEB_DIRECTORY
points at. They draw over the canvas and keep what they need in the workflow's
``extra`` field, so a graph saved with them loads and runs the same without
them.

Two parts run on the server. breeze_comfy.last_run describes what every node
hands on while a prompt runs, and times it, for the wire tooltip, because
ComfyUI sends the browser nothing about a value no node displays.
breeze_comfy.forecast tells the browser which nodes the next run would compute,
from the cache the last run left, and needs last_run to know where that cache
is. Both are installed here, once, and do nothing but log a warning when the
ComfyUI internals they use are not where they expect them.

There are no nodes. The mappings are empty rather than absent because ComfyUI
skips a pack that has neither NODE_CLASS_MAPPINGS nor comfy_entrypoint and
reports it as a failed import, web extensions and all.

Module scope imports nothing outside the standard library and this pack.
ComfyUI imports this while it builds the node list, and an exception here would
take every extension out at once.
"""

from .breeze_comfy import forecast, last_run

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./web/js"

if last_run.install():
    forecast.install(last_run.RUNS)

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

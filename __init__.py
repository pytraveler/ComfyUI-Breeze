"""ComfyUI entry point for ComfyUI-Breeze, a set of canvas extensions.

What this pack does happens in the browser, in the extensions WEB_DIRECTORY
points at. They draw over the canvas and keep what they need in the workflow's
``extra`` field, so a graph saved with them loads and runs the same without
them.

One part runs on the server: breeze_comfy.last_run describes what every
node hands on while a prompt runs, for the wire tooltip, because ComfyUI sends
the browser nothing about a value no node displays. It is installed here, once,
and does nothing but log a warning when the ComfyUI internals it wraps are not
where it expects them.

There are no nodes. The mappings are empty rather than absent because ComfyUI
skips a pack that has neither NODE_CLASS_MAPPINGS nor comfy_entrypoint and
reports it as a failed import, web extensions and all.

Module scope imports nothing outside the standard library and this pack.
ComfyUI imports this while it builds the node list, and an exception here would
take every extension out at once.
"""

from .breeze_comfy import last_run

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./web/js"

last_run.install()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

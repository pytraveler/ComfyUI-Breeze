"""The server side of ComfyUI-Breeze, for what a browser cannot see.

ComfyUI sends the browser the results of nodes that display something -- Save
Image, Preview, Show Any -- and nothing else, so the value of any other output
has to be read here while the prompt runs and handed on. last_run does that for
the wire tooltip.
"""

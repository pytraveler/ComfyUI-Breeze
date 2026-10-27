"""Which nodes the next run of a prompt would compute, asked of ComfyUI's own cache.

ComfyUI decides what to compute again by a key per node: its class, its
inputs, what IS_CHANGED says about it, and the same for everything upstream.
A node whose key is in the output cache is taken from there, and nothing
upstream of it is needed. The browser cannot see that cache, so
``POST /breeze/forecast`` builds the keys for the prompt the browser would
queue, the way a run builds them, and looks them up in the cache the last run
left behind.

The prompt goes through what the server does to a queued prompt first, on a
copy: node replacements, then validation, which also picks the outputs that
will run. Handlers that custom nodes register for queued prompts are not
called, as they may do anything. Nothing is ever written to the cache, and
nothing validation logs about a refused output reaches the console.

IS_CHANGED runs for every node that has one, as it does when a prompt is
queued: a LoadImage hashes its file. That happens on a thread of its own, one
forecast at a time, so the server keeps answering meanwhile.

The cache can change before the prompt runs -- a RAM-pressure cache drops
entries, a prompt queued from elsewhere adds them -- so the answer is a
forecast and not a promise.

The same keys also tell whether what a node handed on in the last run still
stands: last_run keeps a fingerprint of the key each node had then, and a
node whose key is the same now would hand on the same, whether the cache
still holds it or not.
"""

from __future__ import annotations

import asyncio
import contextlib
import copy
import logging
import threading
from collections.abc import Mapping, Sequence

from .last_run import fingerprint

ROUTE = "/breeze/forecast"
"""The route web/js/forecast.js posts to; ComfyUI also serves it under /api."""

PROMPT_ID = "breeze-forecast"
"""The prompt id IS_CHANGED and validation see; no prompt is ever queued under it."""

CACHED = "cached"
"""Taken from the cache, or not needed because what it feeds is."""

RUN = "run"
"""Computed again."""

ALWAYS = "always"
"""Computed again because its IS_CHANGED never matches itself: on every run."""

MAYBE = "maybe"
"""Reached only through lazy inputs, which the node asks for, or not, as it runs."""

MARK = "_breeze_forecast"
"""Set on the server once the route is added, so a second install() adds none."""

log = logging.getLogger(__name__)


def unstable(value) -> bool:
    """True for an IS_CHANGED result no later key can equal: a NaN, or anything ComfyUI cannot hash.

    ComfyUI turns the result into a key with comfy_execution.caching.to_hashable,
    which keeps numbers, strings and None, walks mappings and sequences, and
    puts a fresh object in place of anything else.
    """
    if isinstance(value, float):
        return value != value
    if value is None or isinstance(value, (bool, int, str, bytes)):
        return False
    if isinstance(value, Mapping):
        return any(unstable(key) or unstable(item) for key, item in value.items())
    if isinstance(value, Sequence):
        return any(unstable(item) for item in value)
    return True


def source_of(value):
    """The node a prompt input is linked to, or None for a constant.

    A link is ``[node id, output slot]``, the shape
    comfy_execution.graph_utils.is_link accepts.
    """
    if (isinstance(value, list) and len(value) == 2 and isinstance(value[0], str)
            and isinstance(value[1], (int, float)) and not isinstance(value[1], bool)):
        return value[0]
    return None


def downstream(prompt, starts) -> set:
    """``starts`` and every node of ``prompt`` one of them feeds, however far down."""
    found = {node_id for node_id in starts if node_id in prompt}
    grew = bool(found)
    while grew:
        grew = False
        for node_id, node in prompt.items():
            if node_id not in found and any(source_of(value) in found
                                            for value in (node.get("inputs") or {}).values()):
                found.add(node_id)
                grew = True
    return found


def plan(prompt, outputs, cached, always, lazy) -> dict:
    """The state of every node of ``prompt`` that feeds one of ``outputs``.

    The walk is the one ExecutionList makes: from each output up its inputs,
    stopping at a node the cache holds, and passing over lazy inputs. A node
    such a walk reaches and the cache lacks is computed; one reached only
    across a lazy input may be; every other node that feeds an output is
    taken from the cache or not needed at all, which costs the same. A node
    that feeds no output is left out: the run does not touch it.

    ``cached`` and ``always`` are sets of node ids, ``lazy(node, input)`` says
    whether an input is lazy.
    """
    def ancestors(node_id, strong):
        for name, value in (prompt[node_id].get("inputs") or {}).items():
            source = source_of(value)
            if source in prompt and not (strong and lazy(node_id, name)):
                yield source

    def walk(starts, strong, stop):
        seen = set()
        todo = list(starts)
        while todo:
            node_id = todo.pop()
            if node_id in seen:
                continue
            seen.add(node_id)
            if node_id not in stop:
                todo.extend(ancestors(node_id, strong))
        return seen

    roots = [node_id for node_id in outputs if node_id in prompt]
    feeds = walk(roots, False, set())
    computed = walk(roots, True, cached) - cached
    maybe = walk(computed, False, cached) - cached - computed
    states = {}
    for node_id in feeds:
        if node_id in computed:
            states[node_id] = ALWAYS if node_id in always else RUN
        elif node_id in maybe:
            states[node_id] = MAYBE
        else:
            states[node_id] = CACHED
    return states


def timed(states, prompt, kept) -> dict:
    """Each state with the seconds the node took the last time it ran, where that is known.

    ``kept`` is what last_run keeps for the workflow. Its seconds count only
    for a node of the same class as the one in the prompt now.
    """
    found = {}
    for node_id, state in states.items():
        entry = {"state": state}
        last = kept.get(node_id) or {}
        if last.get("seconds") is not None and last.get("type") == prompt[node_id].get("class_type"):
            entry["seconds"] = last["seconds"]
        found[node_id] = entry
    return found


def unchanged(keys, prompt, kept) -> dict:
    """For each node last_run kept a key for, whether ``keys`` give it the same one now.

    ``keys`` are fingerprints, node id -> number, of the keys the prompt
    would have; a node missing there will not keep its key. A node of
    another class than the one that ran under its id is not the same node.
    """
    same = {}
    for node_id, last in kept.items():
        if node_id not in prompt or last.get("key") is None:
            continue
        same[node_id] = (last["key"] == keys.get(node_id)
                         and last.get("type") == prompt[node_id].get("class_type"))
    return same


def reason(error) -> str:
    """One line for the error validate_prompt reports about a prompt it refuses."""
    if not isinstance(error, dict):
        return str(error)
    message = str(error.get("message") or "invalid prompt")
    details = str(error.get("details") or "")
    return message + (": " + details if details and details != message else "")


@contextlib.contextmanager
def quiet():
    """Keep what is logged through the root logger on this thread, and only this one, out of the console."""
    thread = threading.get_ident()

    def other(record):
        return record.thread != thread

    root = logging.getLogger()
    root.addFilter(other)
    try:
        yield
    finally:
        root.removeFilter(other)


async def forecast(prompt, executor, server=None, moving=()) -> dict:
    """``{"nodes": {node id: state}, "keys": {node id: fingerprint}}`` for ``prompt``.

    For a prompt ComfyUI would refuse it is ``{"error": line}`` instead.

    ``executor`` is the PromptExecutor that ran the last prompt, None before
    the first, when the cache is empty. Its output cache is read and never
    written: the keys are built on a set of their own.

    ``moving`` names nodes the browser will change before it queues the
    prompt -- a seed set to randomize when ComfyUI applies that before the
    run -- so neither they nor anything below them can come from the cache,
    and none of them has a key yet.
    """
    from comfy_execution.caching import CacheKeySetInputSignature
    from comfy_execution.graph import DynamicPrompt, TopologicalSort
    from execution import IsChangedCache, validate_prompt

    prompt = copy.deepcopy(prompt)
    replacements = getattr(server, "node_replace_manager", None)
    with quiet():
        if replacements is not None:
            replacements.apply_replacements(prompt)
        valid = await validate_prompt(PROMPT_ID, prompt, None)
        if not valid[0]:
            return {"error": reason(valid[1])}
        cache = getattr(getattr(executor, "caches", None), "outputs", None)
        dynprompt = DynamicPrompt(prompt)
        changed = IsChangedCache(PROMPT_ID, dynprompt, cache)
        ids = list(prompt)
        keys = getattr(cache, "key_class", CacheKeySetInputSignature)(dynprompt, ids, changed)
        await keys.add_keys(ids)
    store = getattr(cache, "cache", None)
    cached = {node_id for node_id in ids
              if isinstance(store, dict) and keys.get_data_key(node_id) in store}
    shifting = downstream(prompt, moving)
    cached -= shifting
    always = {node_id for node_id in ids if unstable(changed.is_changed.get(node_id, False))}
    sort = TopologicalSort(dynprompt)

    def lazy(node_id, name):
        info = sort.get_input_info(node_id, name)[2]
        return isinstance(info, dict) and bool(info.get("lazy"))

    found = {node_id: fingerprint(keys, node_id) for node_id in ids if node_id not in shifting}
    return {"nodes": plan(prompt, valid[2], cached, always, lazy),
            "keys": {node_id: key for node_id, key in found.items() if key is not None}}


def well_formed(prompt) -> bool:
    """A prompt the way the browser sends one: node id -> a node with a class type."""
    return isinstance(prompt, dict) and bool(prompt) and all(
        isinstance(node_id, str) and isinstance(node, dict) and isinstance(node.get("class_type"), str)
        for node_id, node in prompt.items())


async def respond(body, runs, compute, lock) -> dict:
    """The body of a ROUTE response to the JSON the browser posted.

    It has the state of each node, with the seconds it took last time, and,
    under ``same``, whether what each node handed on in the last run of the
    workflow still stands.

    ``compute(prompt, executor, moving)`` is forecast() with the server bound,
    run on a thread of its own and under ``lock``, so forecasts never overlap.
    An exception in it is the answer's error, never the server's.
    """
    body = body if isinstance(body, dict) else {}
    workflow = body.get("workflow") if isinstance(body.get("workflow"), str) else ""
    prompt = body.get("prompt")
    if not well_formed(prompt):
        return {"workflow": workflow, "error": "no prompt"}
    moving = body.get("moving")
    moving = [node_id for node_id in moving if isinstance(node_id, str)] if isinstance(moving, list) else []
    async with lock:
        try:
            found = await asyncio.to_thread(asyncio.run, compute(prompt, runs.executor, moving))
        except Exception as error:
            log.debug("Breeze: the forecast failed", exc_info=True)
            found = {"error": "{}: {}".format(type(error).__name__, error)}
    if "error" in found:
        return {"workflow": workflow, "error": str(found["error"])}
    kept = runs.snapshot(workflow) if workflow else {}
    return {"workflow": workflow, "nodes": timed(found["nodes"], prompt, kept),
            "same": unchanged(found.get("keys") or {}, prompt, kept)}


def add_route(server, runs) -> None:
    """Serve ROUTE from ``server``, the PromptServer, the way custom nodes add routes."""
    lock = asyncio.Lock()

    def compute(prompt, executor, moving):
        return forecast(prompt, executor, server, moving)

    @server.routes.post(ROUTE)
    async def forecast_route(request):
        from aiohttp import web
        try:
            body = await request.json()
        except Exception:
            body = None
        return web.json_response(await respond(body, runs, compute, lock))


def install(runs) -> bool:
    """Add the route, once, for the runs last_run watches. False when ComfyUI lacks what a forecast needs.

    Only call it once last_run.install() has succeeded: without the executor
    it records, every forecast would read an empty cache.
    """
    try:
        import execution
        from comfy_execution import caching, graph
        from server import PromptServer
    except Exception:
        log.warning("Breeze: ComfyUI's cache modules were not found; there is no forecast before Run")
        return False
    needed = ((execution, "IsChangedCache"), (execution, "validate_prompt"),
              (caching, "CacheKeySetInputSignature"), (graph, "DynamicPrompt"),
              (graph, "TopologicalSort"))
    missing = [module.__name__ + "." + name for module, name in needed
               if not callable(getattr(module, name, None))]
    if missing:
        log.warning("Breeze: this ComfyUI has no %s; there is no forecast before Run",
                    ", ".join(missing))
        return False
    server = PromptServer.instance
    if getattr(server, MARK, False):
        return True
    add_route(server, runs)
    setattr(server, MARK, True)
    return True

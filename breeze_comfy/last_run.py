"""What every node handed on in the last run of each workflow, for the wire tooltip and the connected inputs.

ComfyUI tells the browser about a node's result only when the node has
something to show, a saved image or a preview. A wire between any other two
nodes carries a value the browser never hears about, so this module writes a
line about every output while the prompt runs, keeps the lines per workflow,
and answers ``GET /breeze/outputs?workflow=<id>`` with them.

Four methods are wrapped, and each original runs first and unchanged:

- PromptExecutor.execute_async, to learn which workflow is running. The
  frontend sends the workflow along with every prompt it queues, in
  ``extra_data.extra_pnginfo.workflow``, and its ``id`` is the id of the root
  graph the browser has on screen. A prompt without one, queued through the
  HTTP API, is not about any graph on screen, and nothing is kept for it.
  The executor itself is kept too: its cache is what breeze_comfy.forecast
  reads.
- ExecutionList.stage_node_execution, which hands the run the next node to
  execute, to start that node's clock. A node that waits for something comes
  back to it, and only the first time counts, so the seconds kept are those
  from the moment it was first staged to the moment it handed on its result.
- ExecutionList.cache_update, the one call every node the run visits passes
  through on its way to the nodes downstream: nodes that ran, nodes that
  finished asynchronously, and nodes whose cached result was taken instead.
- ExecutionList.__init__, because a cached node the run never visits, as
  nothing downstream of it has to run again, never reaches cache_update. The
  execution list is built right after the cache has been matched against the
  prompt, and every node of the prompt with an entry in it is described from
  there. The entry is read through output_cache.get_local, the plain lookup
  ExecutionList.is_cached uses, which touches no cache bookkeeping.

Only the description is kept: the shape and dtype of a tensor, the head of a
string, a number, how long the node took when it was computed rather than
taken from the cache, and a fingerprint of the key the cache filed the result
under, which breeze_comfy.forecast compares with the key the node would have
now. A string is also kept as it is, up to TEXT characters, for an input whose
box of text the frontend hides. Nothing bigger than that is ever held, so the
cache frees what it frees exactly as it would without this module, and a description that
fails is dropped rather than raised into the run that produced the value. The
descriptions last until ComfyUI restarts, so a reloaded page, or a second tab
with the same workflow, sees what the first one would.

The module imports nothing from ComfyUI at module scope. install() looks for
what it wraps when it is called and reports False when it is not there, which
is what happens under the test suite and would happen on a ComfyUI whose
execution has been reorganised.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import OrderedDict

ROUTE = "/breeze/outputs"
"""The route web/js/breeze.js asks; ComfyUI also serves it under /api."""

MARK = "_breeze_last_run"
"""Set on every wrapper, so a second install() finds it and wraps nothing."""

LIMIT = 96
"""Characters per description. The tooltip is a glance, not a dump."""

QUOTED = 60
"""Characters of a string shown before it is cut."""

TEXT = 2000
"""Characters of a string also kept as they are, line breaks and all, for an input
whose box of text the frontend hides once a wire feeds it."""

LISTED = 4
"""Keys of a dict, or items of a list of plain values, shown before the rest are elided."""

HOLDERS = ("model", "cond_stage_model", "first_stage_model")
"""Attributes through which ComfyUI's MODEL, CLIP and VAE objects hold the network
they wrap. They are read from the instance dict and never through getattr, so a
property that would load or compute something is never triggered."""

log = logging.getLogger(__name__)


def describe(value) -> str:
    """One short line for one value, safe on anything a node can return."""
    try:
        text = _describe(value, 0)
    except Exception:
        text = type(value).__name__
    return clip(text)


def clip(text: str) -> str:
    """``text`` cut to LIMIT characters, with the cut marked."""
    return text if len(text) <= LIMIT else text[:LIMIT - 3] + "..."


def _describe(value, depth: int) -> str:
    """The description, allowed to raise; describe() catches it."""
    if value is None or isinstance(value, (bool, int)):
        return str(value)
    if isinstance(value, float):
        return format(value, ".6g")
    if isinstance(value, str):
        return quoted(value)
    shape = tensor(value)
    if shape is not None:
        return shape
    if isinstance(value, dict):
        return mapping(value, depth)
    if isinstance(value, (list, tuple)):
        return sequence(value, depth)
    return held(value)


def quoted(text: str) -> str:
    """The head of a string on one line, with its length when it was cut."""
    flat = " ".join(text.split())
    if len(flat) <= QUOTED:
        return '"{}"'.format(flat)
    return '"{}..." ({} chars)'.format(flat[:QUOTED], len(text))


def tensor(value):
    """``1x1536x1024x3 float32`` for a torch tensor or a numpy array, else None.

    Recognised by the type having both ``shape`` and ``dtype``, which reads
    neither the data nor the device, so a tensor on the GPU stays there.
    """
    kind = type(value)
    if not (hasattr(kind, "shape") and hasattr(kind, "dtype")):
        return None
    dims = "x".join(str(int(size)) for size in value.shape) or "scalar"
    return "{} {}".format(dims, str(value.dtype).replace("torch.", ""))


def mapping(value: dict, depth: int) -> str:
    """A LATENT or an AUDIO by what it holds, any other dict by its keys."""
    if "samples" in value:
        text = "latent " + _describe(value["samples"], depth + 1)
        return text + (", masked" if "noise_mask" in value else "")
    if "waveform" in value and "sample_rate" in value:
        return "{}, {} Hz".format(_describe(value["waveform"], depth + 1), value["sample_rate"])
    keys = [str(key) for key in list(value)[:LISTED]]
    more = ", ..." if len(value) > LISTED else ""
    return "dict: " + ", ".join(keys) + more


def sequence(value, depth: int) -> str:
    """A CONDITIONING by its first tensor, a list of plain values by its items, any other by its first."""
    kind = type(value).__name__
    if not value:
        return "empty " + kind
    first = value[0]
    if is_conditioning(value):
        return "{} cond, {}".format(len(value), _describe(first[0], depth + 1))
    if all(value_is_plain(item) for item in value):
        shown = ", ".join(_describe(item, depth + 1) for item in value[:LISTED])
        return "[" + shown + (", ...]" if len(value) > LISTED else "]")
    if depth >= 2:
        return "{} of {}".format(kind, len(value))
    return "{} x {}".format(len(value), _describe(first, depth + 1))


def is_conditioning(value) -> bool:
    """ComfyUI's CONDITIONING: a list of ``[tensor, dict]`` pairs."""
    return all(isinstance(item, (list, tuple)) and len(item) == 2
               and tensor(item[0]) is not None and isinstance(item[1], dict)
               for item in value)


def value_is_plain(value) -> bool:
    """A value whose description is the value itself."""
    return value is None or isinstance(value, (bool, int, float, str))


def held(value) -> str:
    """A model-like object by its class, and by the network it wraps where it has one."""
    name = type(value).__name__
    if name == "ExecutionBlocker":
        return "blocked"
    try:
        own = vars(value)
    except TypeError:
        return name
    for holder in HOLDERS:
        inner = own.get(holder)
        if inner is not None:
            return "{}: {}".format(name, type(inner).__name__)
    return name


def describe_outputs(outputs) -> list:
    """One description per output slot, None for a slot with nothing in it.

    Each slot holds one value per call of the node's function: one, unless the
    node ran over a list. A list is described by its length and first item.
    """
    found = []
    for values in outputs:
        if not isinstance(values, (list, tuple)) or not values:
            found.append(None)
            continue
        text = describe(values[0])
        if len(values) > 1:
            text = "{} items, first {}".format(len(values), text)
        found.append(clip(text))
    return found


def texts_of(outputs):
    """The head of each output that is one string, None for any other; None when there is none.

    A string longer than TEXT is cut there and the cut marked.
    """
    found = []
    for values in outputs:
        text = values[0] if isinstance(values, (list, tuple)) and len(values) == 1 else None
        if not isinstance(text, str):
            found.append(None)
            continue
        found.append(text if len(text) <= TEXT else text[:TEXT] + "...")
    return found if any(text is not None for text in found) else None


def workflow_of(extra_data):
    """The id of the workflow a prompt was queued from, or None."""
    try:
        workflow = extra_data["extra_pnginfo"]["workflow"]["id"]
    except (KeyError, TypeError):
        return None
    return workflow if isinstance(workflow, str) and workflow else None


class Runs:
    """The descriptions of the last runs, ``workflow id -> node id -> entry``.

    Written from the thread that runs prompts and read from the server's event
    loop, so every access holds the lock. The workflow reported to most
    recently is the last to go once ``workflows`` are kept, and a workflow
    keeps at most ``nodes`` entries, which only a graph that expands into
    thousands of nodes ever reaches.

    The clocks in ``started`` are only ever touched from the thread that runs
    prompts, and ``executor`` is only ever replaced whole, so neither needs
    the lock.
    """

    def __init__(self, workflows: int = 32, nodes: int = 4096):
        self.limits = (workflows, nodes)
        self.lock = threading.Lock()
        self.workflows = OrderedDict()
        self.current = None
        self.executor = None
        self.started = {}

    def begin(self, workflow, executor=None) -> None:
        """A prompt of ``workflow`` started running on ``executor``; None for one of no workflow.

        The executor stays once the prompt is done, for the forecast to read
        its cache.
        """
        self.current = workflow
        self.started = {}
        if executor is not None:
            self.executor = executor

    def end(self) -> None:
        """The running prompt finished, however it finished."""
        self.current = None

    def start(self, node_id) -> None:
        """``node_id`` was staged; its clock starts the first time it is."""
        self.started.setdefault(str(node_id), time.perf_counter())

    def took(self, node_id):
        """Seconds since ``node_id`` was first staged, or None; the clock stops either way."""
        started = self.started.pop(str(node_id), None)
        return None if started is None else time.perf_counter() - started

    def record(self, node_id: str, entry: dict) -> None:
        """Keep ``entry`` for ``node_id`` of the running workflow.

        An entry without seconds, of a node taken from the cache, keeps the
        seconds the same node took the last time it was computed.
        """
        workflow = self.current
        if workflow is None:
            return
        most_workflows, most_nodes = self.limits
        with self.lock:
            nodes = self.workflows.pop(workflow, None) or OrderedDict()
            previous = nodes.pop(node_id, None) or {}
            if ("seconds" not in entry and previous.get("seconds") is not None
                    and previous.get("type") == entry.get("type")):
                entry = dict(entry, seconds=previous["seconds"])
            nodes[node_id] = entry
            while len(nodes) > most_nodes:
                nodes.popitem(last=False)
            self.workflows[workflow] = nodes
            while len(self.workflows) > most_workflows:
                self.workflows.popitem(last=False)

    def snapshot(self, workflow) -> dict:
        """A copy of what is kept for ``workflow``, empty when nothing is."""
        with self.lock:
            return dict(self.workflows.get(workflow) or {})


RUNS = Runs()
"""What this ComfyUI process has seen, shared by the wrappers and the route."""


def report(execution_list, node_id, entry, runs: Runs) -> None:
    """Describe what ``entry`` holds for ``node_id`` and keep it in ``runs``.

    Nodes a node expanded into while running are not in the prompt the browser
    sent and have no wire on screen, so they are left out. The class type goes
    along, so the browser can tell a description of the node that is there now
    from one of a node that had the same id when the prompt was queued.

    ``entry`` is the very object the output cache holds when the node was
    taken from there; a computed result reaches cache_update before the cache.
    Only a computed one is timed.
    """
    if runs.current is None:
        return
    outputs = getattr(entry, "outputs", None)
    if not isinstance(outputs, (list, tuple)):
        return
    node = execution_list.dynprompt.get_original_prompt().get(node_id)
    if node is None:
        return
    seconds = runs.took(node_id)
    cache = execution_list.output_cache
    found = {
        "type": node.get("class_type"),
        "outputs": describe_outputs(outputs),
        "at": int(time.time() * 1000),
    }
    if seconds is not None and cache.get_local(node_id) is not entry:
        found["seconds"] = round(seconds, 3)
    texts = texts_of(outputs)
    if texts:
        found["texts"] = texts
    key = fingerprint(getattr(cache, "cache_key_set", None), node_id)
    if key is not None:
        found["key"] = key
    runs.record(str(node_id), found)


def fingerprint(keys, node_id):
    """A number that stands for the key ``keys`` file ``node_id`` under, or None.

    Two keys the cache would take for the same entry give the same number
    within one process, which is as long as anything here is kept. The key
    itself is not kept: it holds the inputs of every node upstream. A key
    with something the cache cannot compare in it, a NaN from IS_CHANGED
    among them, gives a number no later key matches, as the cache never
    matches it either.
    """
    try:
        key = keys.get_data_key(node_id)
        return None if key is None else hash(key)
    except Exception:
        return None


def report_cached(execution_list, runs: Runs) -> None:
    """Describe every node of the prompt that the output cache already holds."""
    if runs.current is None:
        return
    cache = execution_list.output_cache
    for node_id in execution_list.dynprompt.get_original_prompt():
        entry = cache.get_local(node_id)
        if entry is not None:
            report(execution_list, node_id, entry, runs)


def wrapped_update(original, runs: Runs):
    """``cache_update`` followed by a report; the report can never fail the run.

    The original runs first and its exceptions propagate untouched, so with
    this in place ComfyUI caches, links and fails exactly as it did before.
    """
    def cache_update(self, node_id, value):
        result = original(self, node_id, value)
        try:
            report(self, node_id, value, runs)
        except Exception:
            log.debug("Breeze: could not describe the outputs of node %s",
                      node_id, exc_info=True)
        return result

    return marked(cache_update, original)


def wrapped_init(original, runs: Runs):
    """``__init__`` followed by report_cached, on the same terms as wrapped_update()."""
    def __init__(self, *args, **kwargs):
        original(self, *args, **kwargs)
        try:
            report_cached(self, runs)
        except Exception:
            log.debug("Breeze: could not describe the cached outputs", exc_info=True)

    return marked(__init__, original)


def wrapped_stage(original, runs: Runs):
    """``stage_node_execution`` that starts the clock of the node it stages, on the same terms."""
    async def stage_node_execution(self, *args, **kwargs):
        staged = await original(self, *args, **kwargs)
        try:
            if staged[0] is not None:
                runs.start(staged[0])
        except Exception:
            log.debug("Breeze: could not time the staged node", exc_info=True)
        return staged

    return marked(stage_node_execution, original)


def wrapped_execute(original, runs: Runs):
    """``execute_async`` between a begin() and an end() for the workflow it runs.

    ``extra_data`` is the third argument after self, positional in every caller
    ComfyUI has, by keyword in any other.
    """
    async def execute_async(self, *args, **kwargs):
        extra_data = kwargs.get("extra_data", args[2] if len(args) > 2 else None)
        runs.begin(workflow_of(extra_data), self)
        try:
            return await original(self, *args, **kwargs)
        finally:
            runs.end()

    return marked(execute_async, original)


def marked(wrapper, original):
    """``wrapper``, recognisable as this module's and pointing back at ``original``."""
    setattr(wrapper, MARK, True)
    wrapper.__wrapped__ = original
    return wrapper


def answer(query, runs: Runs) -> dict:
    """The body of a ROUTE response for the request's query parameters.

    The fingerprints stay on the server: outside this process they mean nothing.
    """
    workflow = query.get("workflow") or ""
    nodes = runs.snapshot(workflow) if workflow else {}
    return {"workflow": workflow, "nodes": {
        node_id: {name: value for name, value in entry.items() if name != "key"}
        for node_id, entry in nodes.items()}}


def add_route(server, runs: Runs) -> None:
    """Serve ROUTE from ``server``, the PromptServer, the way custom nodes add routes."""
    @server.routes.get(ROUTE)
    async def outputs(request):
        from aiohttp import web
        return web.json_response(answer(request.query, runs))


def install(runs: Runs = RUNS) -> bool:
    """Wrap what this module needs and add its route, once. False when there is nothing to wrap.

    Nothing is wrapped unless all four methods are there: without the
    workflow id from execute_async the descriptions could not be kept, and
    half the wrappers would only cost time.
    """
    try:
        from comfy_execution.graph import ExecutionList
        from execution import PromptExecutor
        from server import PromptServer
    except Exception:
        log.warning("Breeze: ComfyUI's execution modules were not found; "
                    "wire tooltips will show no values")
        return False
    targets = ((ExecutionList, "cache_update", wrapped_update),
               (ExecutionList, "__init__", wrapped_init),
               (ExecutionList, "stage_node_execution", wrapped_stage),
               (PromptExecutor, "execute_async", wrapped_execute))
    missing = [owner.__name__ + "." + name for owner, name, _wrap in targets
               if not callable(getattr(owner, name, None))]
    if missing:
        log.warning("Breeze: this ComfyUI has no %s; wire tooltips will show no values",
                    ", ".join(missing))
        return False
    if getattr(ExecutionList.cache_update, MARK, False):
        return True
    for owner, name, wrap in targets:
        setattr(owner, name, wrap(getattr(owner, name), runs))
    add_route(PromptServer.instance, runs)
    return True

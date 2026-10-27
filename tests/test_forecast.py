"""breeze_comfy.forecast without ComfyUI.

plan() and everything around it take plain dicts and sets. forecast() itself
is run against fakes of the ComfyUI pieces it puts together -- validation,
IsChangedCache, a cache key set, the output cache -- put into sys.modules,
small enough that what they do is visible in the test: a key is the class,
the inputs and what IS_CHANGED said.
"""

from __future__ import annotations

import asyncio
import logging
import sys
import threading
import types

from breeze_comfy import forecast, last_run

NAN = float("nan")


def node(class_type, **inputs):
    return {"class_type": class_type, "inputs": inputs}


def chain():
    """A loader, a text encoder, a sampler, a save; and a note nobody reads."""
    return {
        "1": node("Loader", ckpt="a.safetensors"),
        "2": node("Encode", clip=["1", 1], text="a cat"),
        "3": node("Sampler", model=["1", 0], positive=["2", 0], seed=7),
        "4": node("Save", images=["3", 0]),
        "9": node("Loader", ckpt="b.safetensors"),
    }


def never_lazy(node_id, name):
    return False


def test_an_is_changed_that_never_matches_itself_is_told_from_one_that_does():
    for value in (NAN, [NAN], ("a", [NAN]), {"k": NAN}, object(), [object()]):
        assert forecast.unstable(value), value
    for value in (False, None, 0, 1.5, "hash", b"x", ["hash", 3], {"k": "v"}):
        assert not forecast.unstable(value), value


def test_only_a_list_of_a_node_id_and_a_slot_is_a_link():
    assert forecast.source_of(["3", 0]) == "3"
    assert forecast.source_of(["3", 0.0]) == "3"
    for value in ("3", 3, [3, 0], ["3", True], ["3"], ["3", 0, 1], {"__value__": [1, 2]}):
        assert forecast.source_of(value) is None, value


def test_a_change_is_computed_again_down_to_the_output():
    states = forecast.plan(chain(), ["4"], {"1"}, set(), never_lazy)
    assert states == {"1": "cached", "2": "run", "3": "run", "4": "run"}


def test_downstream_is_everything_a_node_feeds_however_far_down():
    assert forecast.downstream(chain(), ["2"]) == {"2", "3", "4"}
    assert forecast.downstream(chain(), ["1"]) == {"1", "2", "3", "4"}
    assert forecast.downstream(chain(), ["77"]) == set()


def test_a_node_that_feeds_no_output_is_left_out():
    assert "9" not in forecast.plan(chain(), ["4"], set(), set(), never_lazy)


def test_a_cached_output_needs_nothing_above_it():
    """Even an entry the cache has dropped upstream is never asked for."""
    states = forecast.plan(chain(), ["4"], {"4"}, set(), never_lazy)
    assert states == {"1": "cached", "2": "cached", "3": "cached", "4": "cached"}


def test_a_node_whose_is_changed_never_matches_is_computed_on_every_run():
    states = forecast.plan(chain(), ["4"], {"1"}, {"2"}, never_lazy)
    assert states["2"] == "always"
    assert states["3"] == "run"


def test_what_only_a_lazy_input_reaches_may_be_computed():
    prompt = {
        "1": node("Big", x=1),
        "2": node("Small", x=2),
        "3": node("Switch", on_true=["1", 0], on_false=["2", 0], pick=True),
        "4": node("Save", images=["3", 0]),
    }

    def lazy(node_id, name):
        return node_id == "3" and name.startswith("on_")

    assert forecast.plan(prompt, ["4"], set(), set(), lazy) == {
        "1": "maybe", "2": "maybe", "3": "run", "4": "run"}
    assert forecast.plan(prompt, ["4"], {"1"}, set(), lazy)["1"] == "cached"


def test_an_output_that_is_not_in_the_prompt_is_ignored():
    assert forecast.plan(chain(), ["77"], set(), set(), never_lazy) == {}


def test_seconds_count_only_for_a_node_of_the_same_class():
    kept = {"2": {"type": "Encode", "seconds": 0.4}, "3": {"type": "OtherSampler", "seconds": 30.0}}
    states = {"2": "run", "3": "run", "4": "run"}
    assert forecast.timed(states, chain(), kept) == {
        "2": {"state": "run", "seconds": 0.4}, "3": {"state": "run"}, "4": {"state": "run"}}


def test_a_refusal_reads_as_one_line():
    error = {"type": "prompt_outputs_failed_validation", "message": "Prompt outputs failed validation",
             "details": "Value not in list"}
    assert forecast.reason(error) == "Prompt outputs failed validation: Value not in list"
    assert forecast.reason({"message": "No outputs", "details": "No outputs"}) == "No outputs"
    assert forecast.reason("broken") == "broken"


def test_quiet_drops_only_what_this_thread_logs(caplog):
    caplog.set_level(logging.ERROR)
    with forecast.quiet():
        logging.error("from the forecast")
        other = threading.Thread(target=logging.error, args=("from the run",))
        other.start()
        other.join()
    logging.error("after")
    assert [record.getMessage() for record in caplog.records] == ["from the run", "after"]


class Keys:
    """A cache key set as CacheKeySetInputSignature builds one: a linked input is the key upstream."""

    def __init__(self, dynprompt, node_ids, changed):
        self.prompt = dynprompt.prompt
        self.changed = changed
        self.keys = {}

    async def add_keys(self, node_ids):
        for node_id in node_ids:
            await self.key(node_id)

    async def key(self, node_id):
        if node_id not in self.keys:
            found = self.prompt[node_id]
            inputs = []
            for name, value in sorted(found["inputs"].items()):
                source = forecast.source_of(value)
                inputs.append((name, await self.key(source) if source else repr(value)))
            self.keys[node_id] = (found["class_type"], tuple(inputs), await self.changed.get(node_id))
        return self.keys[node_id]

    def get_data_key(self, node_id):
        return self.keys.get(node_id)


class IsChangedCache:
    """What IS_CHANGED says: a Clock never matches itself, anything else has no IS_CHANGED."""

    def __init__(self, prompt_id, dynprompt, outputs_cache):
        self.prompt = dynprompt.prompt
        self.is_changed = {}

    async def get(self, node_id):
        value = float("nan") if self.prompt[node_id]["class_type"] == "Clock" else False
        self.is_changed[node_id] = value
        return value


async def validate_prompt(prompt_id, prompt, partial):
    """Unwraps ``__value__`` in place, as ComfyUI's does, and refuses a node of class Broken."""
    if any(found["class_type"] == "Broken" for found in prompt.values()):
        return (False, {"message": "Prompt outputs failed validation", "details": "Broken"}, [], {})
    for found in prompt.values():
        for name, value in found["inputs"].items():
            if isinstance(value, dict) and "__value__" in value:
                found["inputs"][name] = value["__value__"]
    return (True, None, [node_id for node_id, found in prompt.items() if found["class_type"] == "Save"], {})


class TopologicalSort:
    """Says an input named ``lazy_*`` is lazy."""

    def __init__(self, dynprompt):
        pass

    def get_input_info(self, node_id, name):
        return ("ANY", "required", {"lazy": name.startswith("lazy_")})


def comfyui(monkeypatch, routes=None):
    """The fakes above in place of the ComfyUI modules forecast imports."""
    execution = types.ModuleType("execution")
    execution.IsChangedCache = IsChangedCache
    execution.validate_prompt = validate_prompt
    caching = types.ModuleType("comfy_execution.caching")
    caching.CacheKeySetInputSignature = Keys
    graph = types.ModuleType("comfy_execution.graph")
    graph.DynamicPrompt = lambda prompt: types.SimpleNamespace(prompt=prompt)
    graph.TopologicalSort = TopologicalSort
    package = types.ModuleType("comfy_execution")
    package.caching = caching
    package.graph = graph
    server = types.ModuleType("server")
    server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=routes))
    for name, module in (("execution", execution), ("comfy_execution", package),
                         ("comfy_execution.caching", caching), ("comfy_execution.graph", graph),
                         ("server", server)):
        monkeypatch.setitem(sys.modules, name, module)
    return server.PromptServer.instance


def executor_with(*keys):
    """A PromptExecutor whose output cache holds ``keys``."""
    outputs = types.SimpleNamespace(key_class=Keys, cache={key: object() for key in keys})
    return types.SimpleNamespace(caches=types.SimpleNamespace(outputs=outputs))


def keys_of(prompt):
    """The keys every node of ``prompt`` had when it last ran."""
    dynprompt = types.SimpleNamespace(prompt=prompt)
    keys = Keys(dynprompt, list(prompt), IsChangedCache(None, dynprompt, None))
    asyncio.run(keys.add_keys(list(prompt)))
    return keys.keys.values()


def test_the_forecast_looks_the_validated_prompt_up_in_the_executors_cache(monkeypatch):
    comfyui(monkeypatch)
    prompt = chain()
    prompt["2"]["inputs"]["text"] = {"__value__": "a cat"}
    prompt["3"]["inputs"]["seed"] = 8
    prompt["5"] = node("Clock")
    prompt["6"] = node("Save", images=["5", 0])
    executor = executor_with(*keys_of(chain()))
    found = asyncio.run(forecast.forecast(prompt, executor))
    assert found["nodes"] == {"1": "cached", "2": "cached", "3": "run", "4": "run",
                              "5": "always", "6": "run"}
    assert prompt["2"]["inputs"]["text"] == {"__value__": "a cat"}


def test_a_node_the_browser_changes_before_the_run_is_not_taken_from_the_cache(monkeypatch):
    comfyui(monkeypatch)
    found = asyncio.run(forecast.forecast(chain(), executor_with(*keys_of(chain())), moving=["3"]))
    assert found["nodes"] == {"1": "cached", "2": "cached", "3": "run", "4": "run"}
    assert sorted(found["keys"]) == ["1", "2", "9"], "what moves has no key yet"


def test_every_node_gets_the_fingerprint_of_its_key_cached_or_not(monkeypatch):
    comfyui(monkeypatch)
    before = asyncio.run(forecast.forecast(chain(), None))["keys"]
    again = asyncio.run(forecast.forecast(chain(), executor_with(*keys_of(chain()))))["keys"]
    assert before == again, "the cache holding a key or not leaves the key as it is"
    prompt = chain()
    prompt["3"]["inputs"]["seed"] = 8
    prompt["5"] = node("Clock")
    prompt["6"] = node("Save", images=["5", 0])
    changed = asyncio.run(forecast.forecast(prompt, None))["keys"]
    assert [changed[i] == before[i] for i in ("1", "2", "3", "4", "9")] == [True, True, False, False, True]
    assert changed["5"] != asyncio.run(forecast.forecast(prompt, None))["keys"]["5"]
    assert forecast.unchanged(changed, prompt, {"5": {"key": changed["5"], "type": "Clock"}}) == {"5": False}


def test_before_any_run_everything_is_computed(monkeypatch):
    comfyui(monkeypatch)
    found = asyncio.run(forecast.forecast(chain(), None))
    assert set(found["nodes"].values()) == {"run"}


def test_a_prompt_validation_refuses_is_answered_with_the_reason(monkeypatch):
    comfyui(monkeypatch)
    prompt = chain()
    prompt["4"]["class_type"] = "Broken"
    found = asyncio.run(forecast.forecast(prompt, executor_with()))
    assert found == {"error": "Prompt outputs failed validation: Broken"}


def test_lazy_inputs_are_read_off_the_node_definition(monkeypatch):
    comfyui(monkeypatch)
    prompt = {"1": node("Big"), "2": node("Switch", lazy_a=["1", 0]), "3": node("Save", images=["2", 0])}
    assert asyncio.run(forecast.forecast(prompt, None))["nodes"] == {
        "1": "maybe", "2": "run", "3": "run"}


def respond(body, runs, compute):
    return asyncio.run(forecast.respond(body, runs, compute, asyncio.Lock()))


def test_the_route_answers_with_the_states_and_the_seconds_kept():
    runs = last_run.Runs()
    runs.executor = "the executor"
    runs.begin("wf")
    runs.record("3", {"type": "Sampler", "outputs": [], "at": 1, "seconds": 12.5})
    runs.end()
    asked = []

    async def compute(prompt, executor, moving):
        asked.append((executor, moving))
        return {"nodes": {"3": "run", "4": "cached"}}

    answer = respond({"workflow": "wf", "prompt": chain(), "moving": ["3", 4]}, runs, compute)
    assert answer == {"workflow": "wf", "nodes": {"3": {"state": "run", "seconds": 12.5},
                                                  "4": {"state": "cached"}}, "same": {}}
    respond({"prompt": chain(), "moving": "3"}, runs, compute)
    assert asked == [("the executor", ["3"]), ("the executor", [])]


def test_the_route_says_whose_last_run_still_stands():
    runs = last_run.Runs()
    runs.begin("wf")
    runs.record("1", {"type": "Loader", "outputs": []})
    runs.record("2", {"type": "Other", "outputs": [], "key": 2})
    runs.record("3", {"type": "Sampler", "outputs": [], "key": 3})
    runs.record("4", {"type": "Save", "outputs": [], "key": 7})
    runs.record("5", {"type": "Gone", "outputs": [], "key": 5})
    runs.end()

    async def compute(prompt, executor, moving):
        return {"nodes": {}, "keys": {"1": 1, "2": 2, "3": 3, "4": 4}}

    assert respond({"workflow": "wf", "prompt": chain()}, runs, compute)["same"] == {
        "2": False, "3": True, "4": False}


def test_the_route_turns_anything_that_goes_wrong_into_an_error():
    async def failing(prompt, executor, moving):
        raise KeyError("Sampler")

    async def refusing(prompt, executor, moving):
        return {"error": "Prompt has no outputs"}

    runs = last_run.Runs()
    assert respond({"prompt": chain()}, runs, failing) == {"workflow": "", "error": "KeyError: 'Sampler'"}
    assert respond({"workflow": "wf", "prompt": chain()}, runs, refusing) == {
        "workflow": "wf", "error": "Prompt has no outputs"}
    for body in (None, [], {}, {"prompt": {}}, {"prompt": {"1": {"inputs": {}}}}, {"prompt": {"1": "x"}}):
        assert respond(body, runs, failing)["error"] == "no prompt", body


class FakeRoutes:
    """aiohttp's RouteTableDef, as far as add_route() uses it."""

    def __init__(self):
        self.paths = []

    def post(self, path):
        def register(handler):
            self.paths.append(path)
            return handler
        return register


def test_install_adds_the_route_once_and_reports_false_without_comfyui(monkeypatch):
    for name in ("comfy_execution", "comfy_execution.caching", "comfy_execution.graph",
                 "execution", "server"):
        monkeypatch.delitem(sys.modules, name, raising=False)
    monkeypatch.setattr(sys, "path", [])
    assert forecast.install(last_run.Runs()) is False

    routes = FakeRoutes()
    comfyui(monkeypatch, routes)
    assert forecast.install(last_run.Runs()) is True
    assert forecast.install(last_run.Runs()) is True
    assert routes.paths == [forecast.ROUTE]


def test_install_wants_every_piece_it_uses(monkeypatch):
    routes = FakeRoutes()
    comfyui(monkeypatch, routes)
    monkeypatch.delattr(sys.modules["execution"], "IsChangedCache")
    assert forecast.install(last_run.Runs()) is False
    assert routes.paths == []

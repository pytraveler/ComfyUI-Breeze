"""breeze_comfy.last_run without ComfyUI or torch.

Values are stood in for by small classes shaped like the real ones -- a tensor
is anything whose type has ``shape`` and ``dtype`` -- and ComfyUI's
ExecutionList, PromptExecutor and PromptServer by fakes, put into sys.modules
for the one test that installs the wrappers.
"""

from __future__ import annotations

import asyncio
import sys
import types

from breeze_comfy import last_run


class Tensor:
    """Has what last_run reads off a torch tensor, and nothing it must not touch."""

    shape = ()
    dtype = None

    def __init__(self, *shape, dtype="torch.float32"):
        self.shape = shape
        self.dtype = dtype


class Flux:
    """Stands in for the network a ModelPatcher wraps."""


class ModelPatcher:
    def __init__(self):
        self.model = Flux()


class Exploding:
    """A value whose every attribute raises, the worst a custom node can return."""

    def __getattribute__(self, name):
        raise RuntimeError(name)


def test_a_tensor_is_its_shape_and_dtype():
    assert last_run.describe(Tensor(1, 1536, 1024, 3)) == "1x1536x1024x3 float32"
    assert last_run.describe(Tensor(dtype="torch.bfloat16")) == "scalar bfloat16"


def test_plain_values_are_themselves():
    assert last_run.describe(1024) == "1024"
    assert last_run.describe(0.1 + 0.2) == "0.3"
    assert last_run.describe(True) == "True"
    assert last_run.describe(None) == "None"


def test_a_long_string_is_its_head_on_one_line_and_its_length():
    text = "Anime-style digital\npainting of " + "x" * 200
    described = last_run.describe(text)
    assert described.startswith('"Anime-style digital painting of xxx')
    assert described.endswith('..." ({} chars)'.format(len(text)))
    assert last_run.describe("short") == '"short"'


def test_comfyui_types_are_told_by_what_they_hold():
    latent = {"samples": Tensor(1, 16, 128, 128), "noise_mask": Tensor(1, 1, 128, 128)}
    assert last_run.describe(latent) == "latent 1x16x128x128 float32, masked"
    audio = {"waveform": Tensor(1, 2, 441000), "sample_rate": 44100}
    assert last_run.describe(audio) == "1x2x441000 float32, 44100 Hz"
    conditioning = [[Tensor(1, 77, 2048), {"pooled_output": None}]]
    assert last_run.describe(conditioning) == "1 cond, 1x77x2048 float32"
    assert last_run.describe(ModelPatcher()) == "ModelPatcher: Flux"


def test_other_containers_are_told_by_their_shape():
    assert last_run.describe([1, 2, 3]) == "[1, 2, 3]"
    assert last_run.describe(list(range(10))) == "[0, 1, 2, 3, ...]"
    assert last_run.describe([Tensor(2, 2), Tensor(2, 2)]) == "2 x 2x2 float32"
    assert last_run.describe({"a": 1, "b": 2}) == "dict: a, b"
    assert last_run.describe(()) == "empty tuple"


def test_a_description_never_raises_and_never_runs_long():
    assert last_run.describe(Exploding()) == "Exploding"
    assert len(last_run.describe(["x" * 500] * 50)) <= last_run.LIMIT


def test_a_string_is_also_kept_as_it_is_up_to_a_limit():
    score = "X:1\nT:\nM:4/4"
    assert last_run.texts_of([[score], [1024], []]) == [score, None, None]
    assert last_run.texts_of([["x" * 5000]])[0] == "x" * last_run.TEXT + "..."
    assert last_run.texts_of([[1024], [Tensor(1, 2)]]) is None
    assert last_run.texts_of([["a", "b"]]) is None, "a node run over a list has no one text"


def test_a_string_output_keeps_its_text_beside_its_line():
    runs = running()
    last_run.report(FakeExecutionList(), "8", entry(["X:1\nT:"]), runs)
    assert kept(runs)["8"]["texts"] == ["X:1\nT:"]
    last_run.report(FakeExecutionList(), "1", entry([1]), runs)
    assert "texts" not in kept(runs)["1"]


def test_each_output_slot_gets_one_line():
    outputs = [[Tensor(1, 8, 8, 3)], [512, 768], []]
    assert last_run.describe_outputs(outputs) == [
        "1x8x8x3 float32", "2 items, first 512", None]


def test_the_workflow_is_read_from_what_the_frontend_sends():
    extra = {"extra_pnginfo": {"workflow": {"id": "4f1c", "nodes": []}}}
    assert last_run.workflow_of(extra) == "4f1c"
    assert last_run.workflow_of({}) is None
    assert last_run.workflow_of(None) is None
    assert last_run.workflow_of({"extra_pnginfo": {"workflow": {"id": 7}}}) is None


def entry(*outputs):
    """A CacheEntry as execution.py builds it: ui, then one list per output."""
    return types.SimpleNamespace(ui={}, outputs=list(outputs))


class FakeCache:
    """An output cache that holds node 1 and nothing else."""

    def get_local(self, node_id):
        return entry([Tensor(1, 2, 2, 3)]) if node_id == "1" else None


class FakeExecutionList:
    """The part of comfy_execution.graph.ExecutionList that last_run touches."""

    def __init__(self):
        self.updated = []
        self.output_cache = FakeCache()
        prompt = {"1": {"class_type": "EmptyImage"}, "8": {"class_type": "VAEDecode"}}
        self.dynprompt = types.SimpleNamespace(get_original_prompt=lambda: prompt)

    def cache_update(self, node_id, value):
        self.updated.append(node_id)
        return "original result"

    async def stage_node_execution(self):
        return ("8", None, None)


def running(workflow="wf"):
    """A Runs with a prompt of ``workflow`` running."""
    runs = last_run.Runs()
    runs.begin(workflow)
    return runs


def kept(runs, workflow="wf"):
    """What ``runs`` keeps for ``workflow``, without the timestamps."""
    return {node: {key: value for key, value in found.items() if key != "at"}
            for node, found in runs.snapshot(workflow).items()}


def test_the_update_wrapper_runs_the_original_first_then_keeps_a_description():
    runs = running()
    update = last_run.wrapped_update(FakeExecutionList.cache_update, runs)
    execution_list = FakeExecutionList()
    assert update(execution_list, "8", entry([Tensor(1, 4, 4, 3)])) == "original result"
    assert execution_list.updated == ["8"]
    assert kept(runs) == {"8": {"type": "VAEDecode", "outputs": ["1x4x4x3 float32"]}}
    assert isinstance(runs.snapshot("wf")["8"]["at"], int)


def test_a_description_that_fails_does_not_fail_the_run():
    class Broken(last_run.Runs):
        def record(self, node_id, found):
            raise RuntimeError("full")

    runs = Broken()
    runs.begin("wf")
    update = last_run.wrapped_update(FakeExecutionList.cache_update, runs)
    assert update(FakeExecutionList(), "8", entry([1])) == "original result"


def test_an_original_that_fails_is_not_described():
    def failing(self, node_id, value):
        raise KeyError(node_id)

    runs = running()
    update = last_run.wrapped_update(failing, runs)
    try:
        update(FakeExecutionList(), "8", entry([1]))
    except KeyError:
        pass
    else:
        raise AssertionError("the original's exception was swallowed")
    assert runs.snapshot("wf") == {}


def test_nodes_not_in_the_prompt_and_prompts_of_no_workflow_keep_nothing():
    runs = running()
    last_run.report(FakeExecutionList(), "8.0.0.3", entry([1]), runs)
    assert runs.snapshot("wf") == {}
    nowhere = running(None)
    last_run.report(FakeExecutionList(), "8", entry([1]), nowhere)
    assert nowhere.workflows == {}


def test_what_the_cache_already_holds_is_described_when_the_run_starts():
    """A cached node the run never visits is described once, from __init__."""
    runs = running()

    class Wrapped(FakeExecutionList):
        __init__ = last_run.wrapped_init(FakeExecutionList.__init__, runs)

    Wrapped()
    assert kept(runs) == {"1": {"type": "EmptyImage", "outputs": ["1x2x2x3 float32"]}}


def test_a_cache_that_cannot_be_read_does_not_stop_the_run():
    class Unreadable(FakeCache):
        def get_local(self, node_id):
            raise RuntimeError("evicted")

    def init(self):
        FakeExecutionList.__init__(self)
        self.output_cache = Unreadable()

    class Wrapped(FakeExecutionList):
        __init__ = last_run.wrapped_init(init, running())

    assert Wrapped().updated == []


class FakeKeys:
    """A cache key set: the key of node 8 is its class and its seed, and node 1 has none."""

    def __init__(self, seed):
        self.seed = seed

    def get_data_key(self, node_id):
        return frozenset({("VAEDecode", self.seed)}) if node_id == "8" else None


def keyed(seed):
    """A FakeExecutionList whose cache files node 8 under a key with ``seed`` in it."""
    execution_list = FakeExecutionList()
    execution_list.output_cache.cache_key_set = FakeKeys(seed)
    return execution_list


def test_the_key_a_result_is_filed_under_is_kept_as_a_fingerprint():
    runs = running()
    last_run.report(keyed(7), "8", entry([1]), runs)
    first = runs.snapshot("wf")["8"]["key"]
    last_run.report(keyed(7), "8", entry([1]), runs)
    assert runs.snapshot("wf")["8"]["key"] == first
    last_run.report(keyed(8), "8", entry([1]), runs)
    assert runs.snapshot("wf")["8"]["key"] != first
    last_run.report(keyed(7), "1", entry([1]), runs)
    assert "key" not in runs.snapshot("wf")["1"]


def test_a_key_with_a_nan_in_it_matches_no_later_one():
    nan = float("nan")
    assert last_run.fingerprint(FakeKeys(nan), "8") != last_run.fingerprint(FakeKeys(float("nan")), "8")
    assert last_run.fingerprint(FakeKeys(nan), "8") != last_run.fingerprint(FakeKeys(nan), "8"), \
        "a NaN hashes by address, and a later one may get the address back"
    assert last_run.fingerprint(None, "8") is None


def test_a_key_with_an_object_equal_only_to_itself_matches_no_later_one():
    unhashable = object()
    assert last_run.fingerprint(FakeKeys(unhashable), "8") != last_run.fingerprint(FakeKeys(unhashable), "8")
    assert last_run.fingerprint(FakeKeys((7, "a", None, b"")), "8") == last_run.fingerprint(FakeKeys((7, "a", None, b"")), "8")


def test_the_running_workflow_is_known_exactly_while_its_prompt_runs():
    runs = last_run.Runs()
    seen = []

    async def original(self, prompt, prompt_id, extra_data={}, execute_outputs=[]):
        seen.append(runs.current)
        if prompt_id == "fails":
            raise ValueError(prompt_id)
        return "done"

    execute = last_run.wrapped_execute(original, runs)
    extra = {"extra_pnginfo": {"workflow": {"id": "wf"}}}
    assert asyncio.run(execute(None, {}, "p1", extra, [])) == "done"
    assert asyncio.run(execute(None, {}, "p2", extra_data=extra)) == "done"
    try:
        asyncio.run(execute(None, {}, "fails", extra, []))
    except ValueError:
        pass
    assert seen == ["wf", "wf", "wf"]
    assert runs.current is None


def test_the_executor_that_ran_last_is_kept_for_the_forecast():
    runs = last_run.Runs()

    async def original(self, prompt, prompt_id, extra_data={}, execute_outputs=[]):
        return None

    execute = last_run.wrapped_execute(original, runs)
    executor = object()
    asyncio.run(execute(executor, {}, "p1", {}, []))
    assert runs.executor is executor
    assert runs.current is None


class HoldingCache:
    """An output cache that holds one entry for node 8, the object a cache hit hands on."""

    def __init__(self):
        self.held = entry([1])

    def get_local(self, node_id):
        return self.held if node_id == "8" else None


def test_a_computed_node_is_timed_from_when_it_was_first_staged():
    runs = running()
    stage = last_run.wrapped_stage(FakeExecutionList.stage_node_execution, runs)
    execution_list = FakeExecutionList()
    assert asyncio.run(stage(execution_list)) == ("8", None, None)
    first = runs.started["8"]
    asyncio.run(stage(execution_list))
    assert runs.started["8"] == first
    last_run.report(execution_list, "8", entry([1]), runs)
    assert runs.snapshot("wf")["8"]["seconds"] >= 0
    assert runs.started == {}


def test_a_node_taken_from_the_cache_keeps_the_seconds_it_took_when_computed():
    runs = running()
    runs.record("8", {"type": "VAEDecode", "outputs": ["x"], "at": 1, "seconds": 2.5})
    execution_list = FakeExecutionList()
    execution_list.output_cache = HoldingCache()
    runs.start("8")
    last_run.report(execution_list, "8", execution_list.output_cache.held, runs)
    assert runs.snapshot("wf")["8"]["seconds"] == 2.5
    runs.record("8", {"type": "ImageScale", "outputs": ["x"], "at": 2})
    assert "seconds" not in runs.snapshot("wf")["8"]


def test_a_node_never_staged_is_not_timed():
    runs = running()
    last_run.report(FakeExecutionList(), "8", entry([1]), runs)
    assert "seconds" not in runs.snapshot("wf")["8"]


def test_staging_that_hands_on_no_node_starts_no_clock_and_a_new_run_starts_none():
    runs = running()

    async def nothing(self):
        return (None, {"node_id": "3"}, RuntimeError("cycle"))

    stage = last_run.wrapped_stage(nothing, runs)
    assert asyncio.run(stage(FakeExecutionList()))[0] is None
    assert runs.started == {}
    runs.start("8")
    runs.begin("wf")
    assert runs.started == {}


def test_only_so_many_workflows_and_nodes_are_kept():
    runs = last_run.Runs(workflows=2, nodes=2)
    for workflow in ("a", "b", "c"):
        runs.begin(workflow)
        for node in ("1", "2", "3"):
            runs.record(node, {"outputs": [node]})
    assert sorted(runs.workflows) == ["b", "c"]
    assert sorted(runs.snapshot("c")) == ["2", "3"]


def test_the_route_answers_with_one_workflow_and_nothing_without_one():
    runs = running()
    runs.record("1", {"type": "EmptyImage", "outputs": ["x"], "at": 1})
    assert last_run.answer({"workflow": "wf"}, runs) == {
        "workflow": "wf", "nodes": {"1": {"type": "EmptyImage", "outputs": ["x"], "at": 1}}}
    assert last_run.answer({}, runs) == {"workflow": "", "nodes": {}}
    assert last_run.answer({"workflow": "other"}, runs)["nodes"] == {}


def test_the_fingerprints_stay_on_the_server():
    runs = running()
    runs.record("1", {"type": "EmptyImage", "outputs": ["x"], "at": 1, "key": 12345})
    assert last_run.answer({"workflow": "wf"}, runs)["nodes"] == {
        "1": {"type": "EmptyImage", "outputs": ["x"], "at": 1}}
    assert runs.snapshot("wf")["1"]["key"] == 12345


class FakeRoutes:
    """aiohttp's RouteTableDef, as far as add_route() uses it."""

    def __init__(self):
        self.paths = []

    def get(self, path):
        def register(handler):
            self.paths.append(path)
            return handler
        return register


def test_install_wraps_once_and_reports_false_without_comfyui(monkeypatch):
    for name in ("comfy_execution", "comfy_execution.graph", "execution", "server"):
        monkeypatch.delitem(sys.modules, name, raising=False)
    monkeypatch.setattr(sys, "path", [])
    assert last_run.install(last_run.Runs()) is False

    class ExecutionList(FakeExecutionList):
        pass

    class PromptExecutor:
        async def execute_async(self, prompt, prompt_id, extra_data={}, execute_outputs=[]):
            return None

    original_execute = PromptExecutor.execute_async
    routes = FakeRoutes()
    graph = types.ModuleType("comfy_execution.graph")
    graph.ExecutionList = ExecutionList
    package = types.ModuleType("comfy_execution")
    package.graph = graph
    execution = types.ModuleType("execution")
    execution.PromptExecutor = PromptExecutor
    server = types.ModuleType("server")
    server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=routes))
    for name, module in (("comfy_execution", package), ("comfy_execution.graph", graph),
                         ("execution", execution), ("server", server)):
        monkeypatch.setitem(sys.modules, name, module)

    runs = last_run.Runs()
    assert last_run.install(runs) is True
    wrapped = (ExecutionList.cache_update, ExecutionList.__init__,
               ExecutionList.stage_node_execution, PromptExecutor.execute_async)
    assert all(getattr(function, last_run.MARK) for function in wrapped)
    assert routes.paths == [last_run.ROUTE]

    assert last_run.install(runs) is True
    assert (ExecutionList.cache_update, ExecutionList.__init__,
            ExecutionList.stage_node_execution, PromptExecutor.execute_async) == wrapped
    assert routes.paths == [last_run.ROUTE]
    assert ExecutionList.cache_update.__wrapped__ is FakeExecutionList.cache_update
    assert ExecutionList.__init__.__wrapped__ is FakeExecutionList.__init__
    assert ExecutionList.stage_node_execution.__wrapped__ is FakeExecutionList.stage_node_execution
    assert PromptExecutor.execute_async.__wrapped__ is original_execute

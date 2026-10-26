"""The entry point as ComfyUI sees it: what it finds there, and what importing it costs.

ComfyUI imports the root __init__.py as a package of its own while it builds
the node list. What it reads there decides whether the pack loads at all --
without NODE_CLASS_MAPPINGS the pack is reported as a failed import, web
extensions included -- and anything that raises there takes every extension
out at once. None of that shows until ComfyUI is restarted, so it is checked
here.
"""

from __future__ import annotations

import ast
import importlib.util
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENTRY = ROOT / "__init__.py"
ALIAS = "comfyui_breeze_entry"


def entry_point():
    """The root __init__.py, loaded the way ComfyUI loads it: as a package.

    It gets a name of its own, so nothing it does lands on the package that
    conftest registered, and the repository as its search path, so a relative
    import inside it resolves the way it does under custom_nodes.
    """
    spec = importlib.util.spec_from_file_location(
        ALIAS, ENTRY, submodule_search_locations=[str(ROOT)])
    module = importlib.util.module_from_spec(spec)
    sys.modules[ALIAS] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(ALIAS, None)
    return module


def test_comfyui_finds_what_it_looks_for():
    module = entry_point()
    assert isinstance(module.NODE_CLASS_MAPPINGS, dict)
    assert isinstance(module.NODE_DISPLAY_NAME_MAPPINGS, dict)
    assert isinstance(module.WEB_DIRECTORY, str)
    assert set(module.__all__) == {"NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS",
                                   "WEB_DIRECTORY"}


def test_every_node_has_a_display_name_and_every_name_has_a_node():
    module = entry_point()
    assert set(module.NODE_DISPLAY_NAME_MAPPINGS) == set(module.NODE_CLASS_MAPPINGS)


def test_every_script_under_web_is_one_comfyui_serves():
    """ComfyUI serves WEB_DIRECTORY and nothing else, and says nothing about it.

    A directory that is missing is skipped without a word, and a script beside
    it is simply never loaded, so an extension in the wrong folder looks
    exactly like one that does nothing.
    """
    module = entry_point()
    served = (ROOT / module.WEB_DIRECTORY).resolve()
    assert served.is_relative_to(ROOT), served
    stray = sorted(path.relative_to(ROOT).as_posix()
                   for path in (ROOT / "web").rglob("*.js")
                   if not path.resolve().is_relative_to(served))
    assert not stray, "outside {}: {}".format(module.WEB_DIRECTORY, stray)


def test_the_entry_point_imports_only_the_standard_library_and_the_pack():
    """Module scope stays light on purpose.

    A package that is installed on one machine and missing on the next fails
    here, in ComfyUI's startup, where it takes the whole pack with it. Every
    import in the file counts, at any depth: the entry point has no business
    importing anything else at any point.
    """
    foreign = []
    for node in ast.walk(ast.parse(ENTRY.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and not node.level:
            names = [node.module or ""]
        else:
            continue
        foreign.extend(name for name in names
                       if name.split(".")[0] not in sys.stdlib_module_names)
    assert not foreign, foreign

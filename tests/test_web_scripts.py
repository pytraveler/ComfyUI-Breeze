"""The browser half of the pack, checked with Node where Node is installed.

The extensions under web/js are ES modules that ComfyUI imports in the
browser, and a syntax error in one of them shows only as a line in the browser
console after a restart, with the extension silently missing. Every script is
parsed here instead, and the parts that need no browser -- walking the graph,
filing the server's reports -- have tests of their own in tests/js, run through
``node --test``.

Node is not a dependency of the pack. Where it is missing these tests skip,
unless BREEZE_REQUIRE_NODE is set: CI sets it, so a runner that lost its
Node fails instead of passing for the wrong reason.
"""

from __future__ import annotations

import os
import pathlib
import shutil
import subprocess

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web" / "js"
SUITES = ROOT / "tests" / "js"


def node() -> str:
    """The Node executable, or a skip (a failure where Node is required)."""
    found = shutil.which("node")
    if found:
        return found
    if os.environ.get("BREEZE_REQUIRE_NODE"):
        pytest.fail("BREEZE_REQUIRE_NODE is set and node is not on PATH")
    pytest.skip("node is not installed")


def test_there_are_scripts_and_suites_to_check():
    """A check over an empty list passes for the wrong reason."""
    assert sorted(WEB.glob("*.js")), WEB
    assert sorted(SUITES.glob("*.test.mjs")), SUITES


def test_every_script_parses_as_an_es_module():
    """Read from stdin with --input-type=module, so nothing has to guess the type.

    ``node --check file.js`` decides between CommonJS and an ES module from the
    nearest package.json, and on a typeless .js file with module syntax it
    reports nothing at all, broken or not.
    """
    executable = node()
    broken = []
    for path in sorted(WEB.rglob("*.js")):
        result = subprocess.run(
            [executable, "--input-type=module", "--check"],
            input=path.read_text(encoding="utf-8"), capture_output=True,
            text=True, encoding="utf-8", timeout=60)
        if result.returncode:
            broken.append("{}:\n{}".format(path.relative_to(ROOT).as_posix(),
                                           result.stderr.strip()))
    assert not broken, "\n\n".join(broken)


def test_the_parts_that_need_no_browser_pass_their_suites():
    executable = node()
    suites = [str(path) for path in sorted(SUITES.glob("*.test.mjs"))]
    result = subprocess.run([executable, "--test", *suites], cwd=ROOT,
                            capture_output=True, text=True, encoding="utf-8",
                            timeout=300)
    assert result.returncode == 0, result.stdout + result.stderr

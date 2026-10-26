"""The translations under locales/, as ComfyUI's server reads them.

ComfyUI merges every pack's locales/<lang>/ into what it serves at /i18n, but
only the files it knows by name, and a file it cannot parse is dropped with a
line in the log. Either way the translation is simply missing in the browser,
so both are checked here, Node or not. Whether the translations cover the
settings and words the scripts have is checked in tests/js/locales.test.mjs.
"""

from __future__ import annotations

import json
import pathlib

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOCALES = ROOT / "locales"

READ = {"main.json", "nodeDefs.json", "commands.json", "settings.json"}
"""The files app/custom_node_manager.py reads from each language's folder."""


def files():
    return sorted(path for path in LOCALES.rglob("*") if path.is_file())


def test_there_is_a_translation_with_the_file_every_other_extends():
    assert (LOCALES / "ru" / "main.json").is_file()


@pytest.mark.parametrize("path", files(), ids=lambda p: p.relative_to(LOCALES).as_posix())
def test_every_file_is_one_comfyui_reads(path):
    assert path.parent.parent == LOCALES, "nested too deep to be read"
    assert path.name in READ, "ComfyUI never reads {}".format(path.name)


@pytest.mark.parametrize("path", files(), ids=lambda p: p.relative_to(LOCALES).as_posix())
def test_every_file_parses_as_an_object(path):
    assert isinstance(json.loads(path.read_text(encoding="utf-8")), dict)

"""Two house rules about this pack's own source, enforced where CI can see them.

ASCII only, and docstrings rather than comments. In the Python that means no
inline comments; in the scripts it means no comment but a JSDoc block, which
is the docstring of a JavaScript module, function or constant, and in a
stylesheet no comment at all. The same check runs on a laptop, in CI, and
against the release archive after it is unpacked, so the rule is real
everywhere the pack is, not on one machine.

What each rule covers is written out below rather than inferred from a walk of
the working directory, which on a developer's machine also holds junctions,
scratch files and a virtualenv that no rule of this pack governs.
"""

from __future__ import annotations

import io
import pathlib
import tokenize
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent

SCANNED_DIRS = ("breeze_comfy", "tests", ".github", "web")
SCANNED_FILES = ("README.md", "CHANGELOG.md", "NOTICE.md", "LICENSE",
                 "pyproject.toml", "requirements.txt", "__init__.py")
SUFFIXES = {".py", ".toml", ".txt", ".json", ".yml", ".yaml", ".md", ".js", ".mjs",
            ".css"}

SKIP_DIRS = {"__pycache__", ".git", ".venv", "venv", "vendor", ".pytest_cache",
             "node_modules", "dist", "build", "locales"}
"""Vendored code is carried verbatim, so rewriting its punctuation would make
the diff against upstream unreadable. Translations are exempt for the opposite
reason: for README_RU.md, CHANGELOG_RU.md and locales/ the other alphabet is
the whole point."""

TRANSLATED = {"README_RU.md", "CHANGELOG_RU.md"}

DIRECTIVES = ("# noqa", "# pragma", "#!", "# type:", "# -*-")
COMMENT_DIRS = ("breeze_comfy", "tests")

SCRIPT_DIRS = ("web", "tests")
SCRIPT_SUFFIXES = {".js", ".mjs", ".css"}

REGEX_AFTER = set("(,=:[!&|?{};+-*%<>~^")
REGEX_KEYWORDS = {"return", "typeof", "case", "do", "else", "in", "of", "new",
                  "delete", "void", "throw", "instanceof", "yield", "await"}
"""What may come right before a ``/`` that opens a regular expression rather
than divides: an operator, an opening bracket, or one of these keywords."""


def scanned():
    """Every file the ASCII rule governs, in a stable order."""
    found = []
    for name in SCANNED_FILES:
        path = ROOT / name
        if path.is_file():
            found.append(path)
    for name in SCANNED_DIRS:
        directory = ROOT / name
        if not directory.is_dir():
            continue
        for path in sorted(directory.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in SUFFIXES:
                continue
            if SKIP_DIRS.intersection(path.parts) or path.name in TRANSLATED:
                continue
            found.append(path)
    return found


def non_ascii(path: pathlib.Path):
    """``(line, column, character)`` for everything above U+007E in one file."""
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        for column, char in enumerate(line, 1):
            if ord(char) > 126:
                yield lineno, column, char


def described(path: pathlib.Path, lineno: int, column: int, char: str) -> str:
    """One offender, in the form an editor can jump to."""
    try:
        name = unicodedata.name(char)
    except ValueError:
        name = "unnamed"
    try:
        where = path.relative_to(ROOT).as_posix()
    except ValueError:
        where = path.as_posix()
    return "{}:{}:{}: U+{:04X} {}".format(where, lineno, column, ord(char), name)


def commented():
    """Every .py file the comment rule governs."""
    found = []
    for name in COMMENT_DIRS:
        directory = ROOT / name
        if not directory.is_dir():
            continue
        for path in sorted(directory.rglob("*.py")):
            if not SKIP_DIRS.intersection(path.parts):
                found.append(path)
    return found


def prose_comments(path: pathlib.Path):
    """``(line, text)`` for every comment addressed to a reader, not a tool."""
    source = path.read_text(encoding="utf-8")
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type != tokenize.COMMENT:
            continue
        if not any(token.string.startswith(prefix) for prefix in DIRECTIVES):
            yield token.start[0], token.string


def scripts():
    """Every script and stylesheet the comment rule governs."""
    found = []
    for name in SCRIPT_DIRS:
        directory = ROOT / name
        if not directory.is_dir():
            continue
        for path in sorted(directory.rglob("*")):
            if (path.is_file() and path.suffix.lower() in SCRIPT_SUFFIXES
                    and not SKIP_DIRS.intersection(path.parts)):
                found.append(path)
    return found


def script_comments(path: pathlib.Path):
    """``(line, text)`` for every comment in a script or stylesheet that breaks the rule."""
    source = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".css":
        return [(source.count("\n", 0, start) + 1, source[start:start + 40])
                for start in _occurrences(source, "/*")]
    return [(line, text) for line, text in js_comments(source)
            if not (text.startswith("/**") and text != "/**/")]


def _occurrences(source: str, needle: str):
    """Every index at which ``needle`` starts in ``source``."""
    start = source.find(needle)
    while start >= 0:
        yield start
        start = source.find(needle, start + len(needle))


def js_comments(source: str):
    """``(line, text)`` for every comment in JavaScript source, JSDoc blocks included.

    A small scanner rather than a pattern, because a comment marker inside a
    string, a template literal or a regular expression is not a comment, and
    the URLs in this pack's scripts are full of ``//``. Template literals nest:
    a ``${`` hands back to code until its own ``}``, which the brace depth
    recorded on ``holes`` finds. A ``/`` opens a regular expression only where
    an operand could not have ended, which REGEX_AFTER and REGEX_KEYWORDS
    describe.
    """
    found = []
    i, line, depth, size = 0, 1, 0, len(source)
    holes = []
    last = ""
    while i < size:
        char = source[i]
        if char == "\n":
            line += 1
            i += 1
        elif char.isspace():
            i += 1
        elif source.startswith("//", i):
            end = source.find("\n", i)
            end = size if end < 0 else end
            found.append((line, source[i:end]))
            i = end
        elif source.startswith("/*", i):
            end = source.find("*/", i + 2)
            end = size if end < 0 else end + 2
            found.append((line, source[i:end]))
            line += source.count("\n", i, end)
            i = end
        elif char in "'\"":
            i, line = _skip_string(source, i, line)
            last = "a"
        elif char == "`" or (char == "}" and holes and depth == holes[-1]):
            if char == "}":
                holes.pop()
            i, line, opened = _skip_template(source, i + 1, line)
            if opened:
                holes.append(depth)
            last = "a"
        elif char == "/" and (last in REGEX_AFTER or last in REGEX_KEYWORDS or not last):
            i, line = _skip_regex(source, i, line)
            last = "a"
        elif char.isalnum() or char in "_$":
            start = i
            while i < size and (source[i].isalnum() or source[i] in "_$"):
                i += 1
            last = source[start:i]
        else:
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
            last = char
            i += 1
    return found


def _skip_string(source: str, i: int, line: int):
    """Past the quoted string that opens at ``i``."""
    quote, i = source[i], i + 1
    while i < len(source) and source[i] != quote:
        if source[i] == "\\":
            i += 1
        if i < len(source) and source[i] == "\n":
            line += 1
        i += 1
    return i + 1, line


def _skip_template(source: str, i: int, line: int):
    """Past template text from ``i``: to its closing backtick, or into a ``${``.

    The third value is True when it stopped at a ``${``, inside the template.
    """
    while i < len(source):
        char = source[i]
        if char == "\\":
            line += source[i + 1:i + 2] == "\n"
            i += 2
            continue
        if char == "`":
            return i + 1, line, False
        if source.startswith("${", i):
            return i + 2, line, True
        line += char == "\n"
        i += 1
    return i, line, False


def _skip_regex(source: str, i: int, line: int):
    """Past the regular expression literal that opens at ``i``, flags included."""
    i += 1
    in_class = False
    while i < len(source) and source[i] != "\n":
        char = source[i]
        if char == "\\":
            i += 2
            continue
        if char == "[":
            in_class = True
        elif char == "]":
            in_class = False
        elif char == "/" and not in_class:
            i += 1
            break
        i += 1
    while i < len(source) and source[i].isalpha():
        i += 1
    return i, line


def test_the_rules_govern_the_files_they_are_for():
    """A rule that governs no files passes for the wrong reason.

    The pack is small enough that a count would prove little, so the check
    names files each rule has to reach instead.
    """
    assert ROOT / "README.md" in scanned()
    assert ROOT / "__init__.py" in scanned()
    assert ROOT / ".github" / "workflows" / "tests.yml" in scanned()
    assert ROOT / "tests" / "test_source_style.py" in commented()
    assert ROOT / "breeze_comfy" / "__init__.py" in commented()
    assert ROOT / "web" / "js" / "breeze.js" in scripts()
    assert ROOT / "web" / "js" / "breeze.css" in scripts()
    assert ROOT / "tests" / "js" / "graph_walk.test.mjs" in scripts()
    assert ROOT / "web" / "js" / "breeze.js" in scanned()


def test_the_source_is_ascii_only():
    """A typographic dash survives none of the ways this pack gets read.

    Console code pages that are not UTF-8, editors that guess encodings, issue
    reports retyped by hand: each of those loses one character silently, and
    the file still parses afterwards.
    """
    offenders = []
    for path in scanned():
        offenders.extend(described(path, *found) for found in non_ascii(path))
    assert not offenders, "non-ASCII characters:\n" + "\n".join(offenders)


def test_the_translations_are_exempt_and_really_are_translated():
    """Otherwise the exemption above is silently covering nothing."""
    for name in TRANSLATED:
        path = ROOT / name
        if not path.is_file():
            continue
        assert any(non_ascii(path)), name + " is on the exempt list but is ASCII"


def test_reasons_live_in_docstrings_rather_than_inline_comments():
    """A comment explains a line to whoever already found it.

    A docstring explains a function to everyone who calls it, shows up in
    help() and in an editor's hover, and cannot drift out of sight of what it
    describes. Tool directives are allowed, since moving those into a docstring
    would stop them working.
    """
    offenders = []
    for path in commented():
        for lineno, text in prose_comments(path):
            offenders.append("{}:{}: {}".format(
                path.relative_to(ROOT).as_posix(), lineno, text[:72]))
    assert not offenders, ("inline comments, widen the docstring instead:\n"
                           + "\n".join(offenders))


def test_scripts_have_docstrings_rather_than_comments():
    """The same rule as the Python's, in the language's own terms.

    A JSDoc block on a module, a function or a constant is what an editor shows
    on hover, as it shows a Python docstring, and it is allowed for the same
    reason. Any other comment explains a line to whoever already found it.
    """
    offenders = []
    for path in scripts():
        for lineno, text in script_comments(path):
            offenders.append("{}:{}: {}".format(
                path.relative_to(ROOT).as_posix(), lineno, text[:72]))
    assert not offenders, ("comments, write a JSDoc block instead:\n"
                           + "\n".join(offenders))


def test_comment_markers_in_strings_templates_and_regexes_are_not_comments(tmp_path):
    path = tmp_path / "sample.js"
    path.write_text(
        'const url = "http://example.com/a"\n'
        "const nested = `x ${ { a: '//' }.a + `${'/*'}` } // still text`\n"
        "const pattern = /\\/\\/[/]/g\n"
        "const half = 1 / 2 / 3\n"
        "/** A JSDoc block is a docstring. */\n"
        "function f() { return /\\/*/.test(url) }\n", encoding="utf-8")
    assert script_comments(path) == []


def test_a_script_comment_is_reported_on_its_line(tmp_path):
    """Including one right after a template, where the scanner has to have left it."""
    path = tmp_path / "sample.js"
    path.write_text(
        "const a = 1 // why\n"
        "/* and\n   more */\n"
        "const b = `${a}` // after a template\n"
        "/**/\n", encoding="utf-8")
    assert [line for line, _text in script_comments(path)] == [1, 2, 4, 5]


def test_a_stylesheet_comment_is_reported(tmp_path):
    path = tmp_path / "sample.css"
    path.write_text("a {\n  color: red; /** no docstrings here */\n}\n", encoding="utf-8")
    assert [line for line, _text in script_comments(path)] == [2]


def test_a_tool_directive_is_not_reported_as_prose(tmp_path):
    """Looped rather than parametrized so this module imports without pytest.

    tools/check_ascii.py reads its rules from here, and a local shortcut that
    needed pytest installed in order to avoid running pytest would be a joke.
    """
    for directive in DIRECTIVES:
        path = tmp_path / "sample.py"
        path.write_text("x = 1  {} something\n".format(directive), encoding="utf-8")
        assert list(prose_comments(path)) == [], directive


def test_a_prose_comment_is_reported(tmp_path):
    """The checker has to be able to fail, or it is decoration."""
    path = tmp_path / "sample.py"
    path.write_text("x = 1  # a prose comment\n", encoding="utf-8")
    assert [text for _line, text in prose_comments(path)] == ["# a prose comment"]


def test_a_typographic_character_is_reported(tmp_path):
    """Written as escapes, because the rule above scans this file too."""
    dash, nbsp = chr(0x2013), chr(0x00A0)
    path = tmp_path / "sample.md"
    path.write_text("an en dash " + dash + " and a nbsp" + nbsp + "here",
                    encoding="utf-8")
    assert [char for _line, _column, char in non_ascii(path)] == [dash, nbsp]
    assert "EN DASH" in described(path, 1, 12, dash)

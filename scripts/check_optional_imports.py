#!/usr/bin/env python3
"""
Optional-import audit
=====================
Usage:
    python scripts/check_optional_imports.py                    # audit backend/
    python scripts/check_optional_imports.py --source DIR --requirements FILE [FILE ...]

Ported from the LocalLens MCP agent repo and relicensed under this repository's
AGPL-3.0. The two copies are independent from here on: a fix in one does not
reach the other.

Fails when the source imports a third-party module that no dependency file
declares. Exits 0 when clean, 1 when something is undeclared.

Why this exists
---------------
LocalLens shipped `find_duplicates` broken in EVERY build for months. The cause
was one line — `import imagehash` inside the endpoint body — against a package
that appeared in no requirements file. Nothing caught it:

  * PyInstaller only WARNS about unresolved imports, and a deferred import inside
    a function body is not in the startup graph at all, so it saw nothing.
  * The release smoke test only checked that the process stayed alive. A
    function-level import does not execute until someone calls that endpoint, so
    the binary started perfectly.
  * It worked on the maintainer's machine, because the dev venv happened to have
    it. `reportlab` (/api/export-report) was dead in every shipped build for
    exactly this reason until this check found it.

backend/test_api_smoke.py now calls the real endpoints, so run against a `--built`
binary it would catch these too — but only one endpoint at a time, only after a
full PyInstaller build. This runs offline in under a second, against every import
in the tree.

So the module was only ever missing for users. This check is the one place that
looks where the packaging tools cannot.

What it deliberately does NOT do
--------------------------------
It does not work out which build job installs which extra. A module declared in
any dependency group passes. The high-signal, zero-false-positive case is a
module declared NOWHERE — that one is provably dead in every artifact, and it is
the case that actually reached customers twice.

It also cannot see a dependency's own optional extras: `send2trash` picks its
Windows backend based on whether `pywin32` imports, and nothing in this repo's
source names pywin32. Transitive optionals need a runtime check, not a static one.
"""

import argparse
import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Import name -> distribution name, for the cases where they differ. Add as needed;
# an unknown name is compared after normalising case and _/- , which covers most.
ALIASES = {
    "pil": "pillow",
    "yaml": "pyyaml",
    "cv2": "opencv-python",
    "dateutil": "python-dateutil",
    "dotenv": "python-dotenv",
    "pkg_resources": "setuptools",
    "win32com": "pywin32",
    "win32api": "pywin32",
    "pythoncom": "pywin32",
    "pywintypes": "pywin32",
}


# Undeclared on purpose. A gate that fires on a known-benign case gets ignored, so
# each entry needs a reason — and the reason has to be "nothing user-facing breaks".
# imagehash was ALSO guarded by try/except; its except branch raised a 501 and killed a
# whole feature. Guarded is not the same as harmless, which is why this list is by name.
ACKNOWLEDGED = {
    "setproctitle": "try/except ImportError: pass — cosmetic process name only, "
                    "nothing degrades when it is absent",
    "starlette": "transitive — fastapi requires it, and main.py imports it directly. "
                 "This check reads dependency FILES, not a resolved environment, so it "
                 "cannot see transitive resolution on its own",
}


def _quoted(block: str) -> list[str]:
    """
    Every quoted string in a TOML array, tolerating the other quote kind inside.

    A naive ["\']([^"\']+)["\'] stops dead at the apostrophes in
    "rumps>=0.4.0; sys_platform == 'darwin'" and shreds the rest of the array —
    which made this script's own first run report pystray as undeclared when it
    was declared two lines below rumps.
    """
    return [d or s for d, s in re.findall(r'"([^"]*)"|\'([^\']*)\'', block)]


def _norm(name: str) -> str:
    return ALIASES.get(name.lower(), name.lower().replace("_", "-"))


def _pkg_name(requirement: str) -> str:
    """'Pillow>=10.0.0; sys_platform == "darwin"' -> 'pillow'"""
    return _norm(re.split(r"[<>=!~;\[\s]", requirement.strip(), maxsplit=1)[0].strip())


def declared_packages(paths: list[Path]) -> set[str]:
    """Every distribution named by a pyproject.toml or requirements.txt."""
    names: set[str] = set()
    for path in paths:
        text = path.read_text(encoding="utf-8")
        if path.suffix == ".toml":
            # ponytail: regex rather than tomllib, which is 3.11+ while this repo
            # supports 3.10. Dependency entries are plain quoted strings, so this
            # holds; switch to tomllib if the floor ever rises to 3.11.
            for block in re.findall(r"dependencies\s*=\s*\[(.*?)\]", text, re.S):
                names |= {_pkg_name(r) for r in _quoted(block)}
            extras = re.search(r"\[project\.optional-dependencies\](.*?)(?=\n\[|\Z)", text, re.S)
            if extras:
                for block in re.findall(r"=\s*\[(.*?)\]", extras.group(1), re.S):
                    names |= {_pkg_name(r) for r in _quoted(block)}
        else:
            for line in text.splitlines():
                line = line.split("#")[0].strip()
                if line and not line.startswith("-"):
                    names.add(_pkg_name(line))
    return names - {""}


def source_imports(source: Path) -> list[tuple[str, str, int, str, bool]]:
    """(module, file, lineno, enclosing_function, is_deferred) for every import."""
    out = []
    for path in sorted(source.rglob("*.py")):
        if any(part in {"venv", ".venv", "build", "dist", "__pycache__"} for part in path.parts):
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), str(path))
        except SyntaxError as exc:  # a file we cannot parse is a finding of its own
            out.append(("<unparseable>", str(path), exc.lineno or 0, "", False))
            continue
        scope: dict[int, str] = {}
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                for sub in ast.walk(node):
                    scope.setdefault(id(sub), node.name)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                mods = [a.name.split(".")[0] for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                mods = [node.module.split(".")[0]]
            else:
                continue
            fn = scope.get(id(node), "")
            out.append((mods[0] if len(mods) == 1 else "", str(path), node.lineno, fn, bool(fn)))
            for mod in mods[1:]:
                out.append((mod, str(path), node.lineno, fn, bool(fn)))
            if len(mods) > 1:
                out[-len(mods)] = (mods[0], str(path), node.lineno, fn, bool(fn))
    return out


def audit(source: Path, requirement_files: list[Path],
          acknowledged: set[str] | None = None) -> list[str]:
    declared = declared_packages(requirement_files)
    acknowledged = (acknowledged or set()) | set(ACKNOWLEDGED)
    first_party = {p.stem for p in source.iterdir() if p.is_dir() or p.suffix == ".py"}
    # Group by module: five `from reportlab.x import y` lines are one missing package,
    # and a gate that prints them five times teaches people to skim its output.
    hits: dict[str, list[str]] = {}
    for mod, path, lineno, fn, deferred in source_imports(source):
        if not mod or mod in sys.stdlib_module_names or mod in first_party:
            continue
        if _norm(mod) in declared or mod in acknowledged:
            continue
        rel = Path(path)
        rel = rel.relative_to(ROOT) if ROOT in rel.parents else Path(path).name
        how = f"deferred inside {fn}()" if deferred else "module level"
        hits.setdefault(mod, []).append(f"{rel}:{lineno} ({how})")

    problems = []
    for mod, places in sorted(hits.items()):
        shown = ", ".join(places[:2])
        more = f" +{len(places) - 2} more" if len(places) > 2 else ""
        problems.append(
            f"{mod!r} is imported but declared in no dependency file — {shown}{more}"
        )
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "backend")
    # BOTH requirements files. Passing only requirements.txt reports apscheduler and
    # watchdog as undeclared when they are declared in requirements_pro.txt — a gate
    # that cries wolf is a gate people learn to skim.
    parser.add_argument("--requirements", type=Path, nargs="+",
                        default=[ROOT / "backend" / "requirements.txt",
                                 ROOT / "backend" / "requirements_pro.txt"])
    parser.add_argument(
        "--acknowledge", nargs="*", default=[], metavar="MODULE",
        help="Modules to treat as fine despite being undeclared. Use for transitive "
             "deps a declared package already pulls in — e.g. starlette, which fastapi "
             "requires. This check reads dependency FILES, not an installed environment, "
             "so it cannot see transitive resolution on its own.")
    args = parser.parse_args()

    problems = audit(args.source, args.requirements, set(args.acknowledge))
    declared = declared_packages(args.requirements)
    print(f"\n🔍 Optional-import audit — {args.source} against "
          f"{', '.join(p.name for p in args.requirements)} ({len(declared)} packages declared)\n")
    if problems:
        for p in problems:
            print(f"  ❌ {p}")
        print(f"\n🛑 {len(problems)} undeclared import(s) — these are dead in every shipped build.\n")
        return 1
    print("  ✅ every third-party import is declared\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

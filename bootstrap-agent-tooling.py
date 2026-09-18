"""Arm the agent tooling on a fresh clone of this repo.

Two tools install git hooks under .githooks/ (gitignored, machine-local because
each hook embeds this machine's Python path): Aramid (pre-commit, pre-push,
post-commit triage) and Graphite (post-commit, post-merge, post-rewrite graph
rebuild). Both want post-commit. Graphite chains a sibling `post-commit.local`
if one exists, and its init relocates a foreign post-commit there; Aramid's init
refuses to touch a hook it does not own. So the order matters:

    1. aramid init .                      (installs Aramid's hooks, post-commit included)
    2. python -P -m graphite init . --yes --strict
                                          (moves Aramid's post-commit to post-commit.local
                                           and installs its own, which chains it)

This script runs that sequence, handles the case where Graphite already owns
post-commit but no Aramid shim exists yet, then proves the result by reading
the hook files back. It is safe to re-run.

Usage:
    python -P bootstrap-agent-tooling.py          arm (or re-arm) both tools
    python -P bootstrap-agent-tooling.py --check  report only, change nothing

Both packages must be importable by the interpreter that runs this script
(`python -P -c "import aramid, graphite"`). Standard library only.
"""

import importlib.util
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOOKS = ROOT / ".githooks"
GATE_HOOKS = ("pre-commit", "pre-push")
ARAMID_MARK = ">>> aramid managed >>>"
GRAPHITE_MARK = ">>> graphite managed >>>"


def owner(path: Path):
    """'aramid', 'graphite', 'foreign' or None (absent) for a hook file."""
    try:
        head = path.read_text(encoding="utf-8", errors="replace")[:600]
    except FileNotFoundError:
        return None
    if ARAMID_MARK in head:
        return "aramid"
    if GRAPHITE_MARK in head:
        return "graphite"
    return "foreign"


def run_module(*args: str) -> int:
    argv = [sys.executable, "-P", "-m", *args]
    print("+", " ".join(argv[1:]), flush=True)
    return subprocess.run(argv, cwd=ROOT, check=False).returncode  # noqa: S603 - fixed argv, no user input


def verdict() -> list[str]:
    """Human-readable problems with the hook layout; empty when armed correctly."""
    problems = []
    post = owner(HOOKS / "post-commit")
    local = owner(HOOKS / "post-commit.local")
    if post != "graphite":
        problems.append(f".githooks/post-commit is {post or 'absent'}, expected Graphite's rebuild hook")
    if local != "aramid":
        problems.append(f".githooks/post-commit.local is {local or 'absent'}, expected Aramid's triage shim")
    for name in GATE_HOOKS:
        who = owner(HOOKS / name)
        if who != "aramid":
            problems.append(f".githooks/{name} is {who or 'absent'}, expected Aramid's gate")
    return problems


def report(problems: list[str]) -> None:
    if problems:
        print("hooks: NOT armed")
        for p in problems:
            print("  -", p)
    else:
        print("hooks: armed (Graphite post-commit chains Aramid's post-commit.local; Aramid gates pre-commit and pre-push)")


def main() -> int:
    check_only = "--check" in sys.argv[1:]
    missing = [m for m in ("aramid", "graphite") if importlib.util.find_spec(m) is None]
    if missing:
        print(f"missing package(s) for {sys.executable}: {', '.join(missing)}; install them first", file=sys.stderr)
        return 2
    if check_only:
        problems = verdict()
        report(problems)
        return 1 if problems else 0

    HOOKS.mkdir(exist_ok=True)
    post = HOOKS / "post-commit"
    parked = HOOKS / "post-commit.graphite-parked"
    if owner(post) == "graphite" and owner(HOOKS / "post-commit.local") != "aramid":
        # Aramid will not overwrite Graphite's hook, so park it; Graphite's init
        # below re-installs it once Aramid's copy is in place.
        print(f"parking Graphite's post-commit so Aramid can install its own: {parked.name}")
        post.replace(parked)

    rc = run_module("aramid", "init", ".")
    if rc != 0:
        print(f"aramid init failed (exit {rc})", file=sys.stderr)
        return rc
    rc = run_module("graphite", "init", ".", "--yes", "--strict")
    if rc != 0:
        print(f"graphite init failed (exit {rc})", file=sys.stderr)
        return rc
    if parked.exists():
        if owner(post) == "graphite":
            parked.unlink()
        else:
            print(f"warning: Graphite did not re-install post-commit; its previous hook is kept at {parked.name}", file=sys.stderr)

    problems = verdict()
    report(problems)
    if problems:
        return 1
    print("doctors:")
    run_module("graphite", "doctor", ".")
    run_module("aramid", "doctor")
    return 0


if __name__ == "__main__":
    sys.exit(main())

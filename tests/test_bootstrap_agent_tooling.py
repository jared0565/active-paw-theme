"""Unit tests for bootstrap-agent-tooling.py (hook ownership and the armed-layout verdict).

The script's file name carries hyphens, so it is loaded by path. Only the pure
helpers are exercised here; the init/doctor subprocess calls are not run.
"""

import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "bootstrap-agent-tooling.py"

ARAMID_HOOK = "#!/bin/sh\n# >>> aramid managed >>>\nexit 0\n"
GRAPHITE_HOOK = "#!/bin/sh\n# >>> graphite managed >>>\nexit 0\n"
FOREIGN_HOOK = "#!/bin/sh\necho hello\n"


def load_script():
    spec = importlib.util.spec_from_file_location("bootstrap_agent_tooling", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class HookDirCase(unittest.TestCase):
    def setUp(self):
        self.module = load_script()
        self.tmp = tempfile.TemporaryDirectory()
        self.hooks = Path(self.tmp.name)
        self.module.HOOKS = self.hooks

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, text):
        path = self.hooks / name
        path.write_text(text, encoding="utf-8")
        return path


class TestOwner(HookDirCase):
    def test_absent_hook_is_none(self):
        self.assertIsNone(self.module.owner(self.hooks / "missing"))

    def test_aramid_marker(self):
        self.assertEqual(self.module.owner(self.write("h", ARAMID_HOOK)), "aramid")

    def test_graphite_marker(self):
        self.assertEqual(self.module.owner(self.write("h", GRAPHITE_HOOK)), "graphite")

    def test_unmarked_hook_is_foreign(self):
        self.assertEqual(self.module.owner(self.write("h", FOREIGN_HOOK)), "foreign")


class TestVerdict(HookDirCase):
    def arm(self):
        self.write("post-commit", GRAPHITE_HOOK)
        self.write("post-commit.local", ARAMID_HOOK)
        self.write("pre-commit", ARAMID_HOOK)
        self.write("pre-push", ARAMID_HOOK)

    def test_armed_layout_has_no_problems(self):
        self.arm()
        self.assertEqual(self.module.verdict(), [])

    def test_empty_hook_dir_reports_every_hook(self):
        problems = self.module.verdict()
        self.assertEqual(len(problems), 4)
        for name in ("post-commit", "post-commit.local", "pre-commit", "pre-push"):
            self.assertTrue(any(name in p for p in problems), name)

    def test_missing_aramid_shim_is_reported(self):
        self.arm()
        (self.hooks / "post-commit.local").unlink()
        problems = self.module.verdict()
        self.assertEqual(len(problems), 1)
        self.assertIn("post-commit.local", problems[0])
        self.assertIn("absent", problems[0])

    def test_wrong_order_leaves_aramid_holding_post_commit(self):
        # The state `aramid init` produces when Graphite's hook was not there first.
        self.arm()
        self.write("post-commit", ARAMID_HOOK)
        (self.hooks / "post-commit.local").unlink()
        problems = self.module.verdict()
        self.assertEqual(len(problems), 2)
        self.assertTrue(any("post-commit is aramid" in p for p in problems))

    def test_foreign_gate_hook_is_reported(self):
        self.arm()
        self.write("pre-push", FOREIGN_HOOK)
        problems = self.module.verdict()
        self.assertEqual(len(problems), 1)
        self.assertIn("pre-push is foreign", problems[0])


if __name__ == "__main__":
    unittest.main()

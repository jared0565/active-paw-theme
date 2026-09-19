"""Tests for the PowerShell launcher helper in import-cj-products.py.

The script is a dev-era one-off tool (see CLAUDE.md, "Python scripts"); it
only defines functions at import time, so it can be loaded by path without
touching the network. Its helper modules are machine-local, so they are stubbed. `powershell_executable()` must hand subprocess an
absolute path (ruff S607) and fail loudly when PowerShell is not on PATH.
"""

import importlib.util
import unittest
from pathlib import Path
from unittest import mock

from tests.script_stubs import stubbed_helpers

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ("import-cj-products.py",)


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_").removesuffix(".py"), ROOT / name)
    module = importlib.util.module_from_spec(spec)
    with stubbed_helpers():
        spec.loader.exec_module(module)
    return module


class TestPowershellExecutable(unittest.TestCase):
    def test_returns_the_resolved_absolute_path(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                fixture = str(Path(Path.cwd().anchor, "tools", "powershell.exe"))  # absolute on Windows and POSIX alike
                with mock.patch.object(module.shutil, "which", return_value=fixture):
                    found = module.powershell_executable()
                self.assertTrue(Path(found).is_absolute())
                self.assertTrue(found.lower().endswith("powershell.exe"))

    def test_raises_when_powershell_is_missing(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                with (
                    mock.patch.object(module.shutil, "which", return_value=None),
                    self.assertRaises(RuntimeError) as raised,
                ):
                    module.powershell_executable()
                self.assertIn("powershell", str(raised.exception).lower())

    def test_importing_the_scripts_runs_nothing(self):
        # Loading must not launch the Shopify CLI: subprocess.run is never called at import.
        for name in SCRIPTS:
            with self.subTest(script=name):
                with mock.patch("subprocess.run") as run:
                    load(name)
                run.assert_not_called()


if __name__ == "__main__":
    unittest.main()

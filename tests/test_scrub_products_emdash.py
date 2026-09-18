"""Tests for scrub-products-emdash.py's dash rule.

The script is a dev-era one-off (see CLAUDE.md, "Python scripts"). Its catalog
walk lives in main() behind a __main__ guard, so loading it by path defines
fix() without calling the Admin API; the test proves both.
"""

import importlib.util
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scrub-products-emdash.py"


def load():
    spec = importlib.util.spec_from_file_location("scrub_products_emdash", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestFix(unittest.TestCase):
    def setUp(self):
        self.fix = load().fix

    def test_em_en_and_horizontal_bar_become_hyphens(self):
        text = "Cooling mat — large – grey ― new"
        self.assertEqual(self.fix(text), ("Cooling mat - large - grey - new", True))

    def test_plain_text_is_unchanged_and_unflagged(self):
        self.assertEqual(self.fix("Cooling mat - large"), ("Cooling mat - large", False))

    def test_empty_and_none_pass_through(self):
        self.assertEqual(self.fix(""), ("", False))
        self.assertEqual(self.fix(None), (None, False))


class TestImportIsInert(unittest.TestCase):
    def test_loading_the_script_does_not_call_the_admin_api(self):
        with mock.patch("shopify_admin.admin_graphql") as admin_graphql:
            load()
        admin_graphql.assert_not_called()


if __name__ == "__main__":
    unittest.main()

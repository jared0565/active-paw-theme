"""Stand-ins for the machine-local helper modules the dev scripts import.

cj_client.py, shopify_product.py, store_collections.py and shopify_admin.py are
not committed (they carry store access), so a clean checkout cannot import the
scripts that use them. Tests that only exercise a script's own functions load it
with these stubs in sys.modules and restore whatever was there afterwards.

The context manager is re-entrant: a stub already installed by an outer block
is kept, so a test can patch an attribute on the stub and then load the script.
"""

import contextlib
import sys
import types


def _module(name, **attrs):
    module = types.ModuleType(name)
    module.__dict__.update(attrs)
    module._script_stub = True
    return module


class _AnyTitles(dict):
    """Collection titles keyed by handle; the scripts index it at import time."""

    def __missing__(self, handle):
        return handle.replace("-", " ").title()


def build_stubs():
    return {
        "cj_client": _module(
            "cj_client",
            request_json=lambda *args, **kwargs: None,
            get_token=lambda *args, **kwargs: "",
        ),
        "shopify_product": _module(
            "shopify_product",
            handleize=lambda text: text,
            money=lambda value: value,
            retail_price=lambda *args, **kwargs: 0,
            compare_price=lambda *args, **kwargs: 0,
        ),
        "store_collections": _module("store_collections", COLLECTION_TITLES=_AnyTitles()),
        "shopify_admin": _module("shopify_admin", admin_graphql=lambda *args, **kwargs: {}),
    }


@contextlib.contextmanager
def stubbed_helpers():
    """Install the stubs, yield {name: module}, restore the previous modules on exit."""
    installed = {}
    saved = {}
    for name, module in build_stubs().items():
        current = sys.modules.get(name)
        if getattr(current, "_script_stub", False):
            installed[name] = current  # an outer block owns it; reuse and leave it
            continue
        saved[name] = current
        sys.modules[name] = module
        installed[name] = module
    try:
        yield installed
    finally:
        for name, previous in saved.items():
            if previous is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = previous

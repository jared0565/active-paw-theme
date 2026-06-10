# PawScout Timing Probe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained measurement script that creates, publishes, and tears down real CJ→Shopify products against the live Active Paw store, and reports P50/P90 latency for every phase of the search-trigger pipeline — so the progressive-fill UX (poll interval, per-product cadence, spinner copy) is designed against real numbers instead of estimates.

**Architecture:** A thin runnable entrypoint (`pawscout-timing-probe.py`) orchestrates four layers: (1) CJ candidate fetch via the existing `cj_client.py`; (2) a new `shopify_admin.py` that talks to the Shopify Admin GraphQL API over **direct HTTP** (token from `.env`) — this is the first real piece of PawScout's Admin layer, not a throwaway, because BYOC needs it anyway; (3) pure, unit-tested logic in `probe_lib.py` (percentiles, the poll-until-ready loop, minimal-product payload builders, metric derivation); (4) the live measurement of two distinct things — **single-product isolation latency** (one product start-to-buyable, drives the "first product ~3–5s" + spinner) and **sustained throughput** (back-to-back creation under Shopify's throttle, drives the "~2s apart" grid-fill cadence). Ground truth for "PDP-ready & buyable" is a real storefront `GET /products/{handle}` polled until HTTP 200 — not the Admin API's publication flags, which can lag. Every product the probe creates is tagged `pawscout-probe-temp` and deleted in a `finally` block, with a `--cleanup-only` safety net.

**Tech Stack:** Python 3 standard library only (`urllib`, `json`, `time`, `pathlib`, `re`, `argparse`) — matching the repo convention of zero third-party deps. Tests use the stdlib `unittest` module (the repo has no pytest). Shopify Admin GraphQL API version **2026-04**. Reuses existing `.graphql` query files unchanged.

---

## Scope note (read first)

This is **Plan 1 of the search-trigger path**, not the whole path. The design doc (`docs/superpowers/specs/2026-06-07-pawscout-search-trigger-design.md`) §9 makes the timing probe **build step 0** — the explicit prerequisite to everything else — because the progressive-fill UX numbers (poll interval ≈1.5s, cadence ≈2s, parallelization) are estimates that must be validated before they're baked into the Cloudflare Worker and theme code. Writing those plans now would hardcode unvalidated constants. **This plan produces the numbers; Plan 2 (PawScout Worker) and Plan 3 (theme progressive fill) get written once the probe has run.**

**Not a git repository.** `f:\Projects\Shopify\demo-store2` is not under git (verified: `git rev-parse` fails). The standard "commit" step is therefore replaced throughout by a **Checkpoint** note (run tests green, eyeball the diff). If you want version control, `git init` is a separate decision out of scope here — do not `git add` blindly, the directory contains `node_modules/`, `output/`, and `graphify-out/`.

---

## File Structure

**New files:**

| File | Responsibility | Tested? |
|---|---|---|
| `probe_lib.py` | Pure logic: `percentile`, `summarize`, `poll_until`, `minimal_product_payload`, `minimal_variant_update`, `product_critical_path`, `format_summary`. No I/O. | Yes — `tests/test_probe_lib.py` |
| `shopify_admin.py` | Direct Admin GraphQL HTTP client: `read_admin_token`, `load_query`, `admin_graphql` (with THROTTLED/429 backoff), `storefront_status`. Constants `STORE`, `API_VERSION`, `ONLINE_STORE_PUBLICATION_ID`. | Live smoke check only (not mock-unit-tested — it's thin I/O) |
| `product-probe-state.graphql` | One query returning `onlineStoreUrl`, `publishedOnPublication`, and `media{status}` for a single product by ID (serves the media-ready poll + the API-vs-storefront comparison). | n/a (query file) |
| `pawscout-timing-probe.py` | Runnable orchestrator: CJ fetch → `measure_single` ×N → `measure_burst` → cleanup → summarize → write `pawscout-probe-report.json` + print. `--cleanup-only` mode. | Validated by the live run (Task 8) |
| `tests/__init__.py` | Empty — makes `tests` an importable package. | n/a |
| `tests/test_probe_lib.py` | Unit tests for all `probe_lib` pure functions. | — |

**Reused unchanged:** `cj_client.py` (`get_token`, `request_json`), `shopify_product.py` (`handleize`, `retail_price`, `money`), and the query files `product-create.graphql`, `product-variants-update.graphql`, `publish-product.graphql`, `product-update-media.graphql`, `product-delete-variable.graphql`.

**Modified at the end:** `docs/superpowers/specs/2026-06-07-pawscout-search-trigger-design.md` (Task 9 writes the measured numbers into §4 and resolves §11 open questions).

---

## What the probe measures (and why each number exists)

| Phase key | What it times | Drives which design decision |
|---|---|---|
| `t_cj_query` | listV2 keyword search at CJ (once per search) | §3a "query CJ ~0.5–2s"; the per-search fixed cost |
| `t_cj_detail` | `product/query` detail fetch (per product) | per-product CJ cost on the critical path |
| `t_product_create` | `productCreate` mutation | minimal-first create cost |
| `t_variant_update` | `productVariantsBulkUpdate` (price, untracked inventory) | makes the product buyable |
| `t_publish` | `publishablePublish` to Online Store | publish cost |
| `t_pdp_live` | storefront `GET /products/{handle}` polled until **HTTP 200** | **the load-bearing number** — "PDP-ready & buyable" (§4). This is ground truth, not an Admin flag. |
| `t_image_ready` | media `status` polled until `READY` (off critical path) | validates "image off the critical path" (§4) — must be safely larger than `t_pdp_live` |
| burst inter-arrival + throttle onset | back-to-back create→publish→live cadence | the "~2s apart" grid-fill rate (§4) and the throttle ceiling |

**Cold-search first-product latency** (the exact thing the user asked about — "how long until the first product is fully present") = `t_cj_query + product_critical_path(first sample)` where `product_critical_path = t_cj_detail + t_product_create + t_variant_update + t_publish + t_pdp_live`.

**Measurement-fidelity rules** (from review):
- The probe polls **tight (≈300 ms)**, NOT production's ≈1.5 s — otherwise you get ±1.5 s resolution on a 3–5 s budget.
- Single-product runs are **spaced ≈3 s apart** to avoid self-throttling and get clean isolation numbers; the burst is deliberately back-to-back to *characterize* the throttle.
- Caveat recorded in the report: local-PC→Shopify RTT ≠ Cloudflare-Worker→Shopify RTT. Shopify-side processing (create + publish + storefront propagation) dominates the multi-second budget, so it's a fair proxy, but the absolute floor will be a touch lower from a Worker.

---

## Task 0: Prerequisites (manual setup — no code)

**Files:** `.env` (add two lines; gitignored — never commit, never print the secret).

> **Platform change (Jan 1, 2026):** Shopify no longer lets you create custom apps in the admin, and there is no static `shpat_` token in the UI anymore. New apps are created in the **Dev Dashboard** and expose a **Client ID + Client Secret**, which `shopify_admin.py` exchanges for a 24h Admin API token via the client-credentials grant (own-store app). The code also still accepts a legacy `SHOPIFY_ADMIN_TOKEN` if one exists.

- [ ] **Step 1: Create a Dev Dashboard app + get Client ID/Secret**

In the Shopify admin for `4qkudm-ez.myshopify.com`: **Settings → Apps and sales channels** → **Build apps in Dev Dashboard** → **Create app** (name it `pawscout-probe`). Then, in the app: (a) under **Versions/Access → Scopes**, set `write_products,read_products,write_publications,read_publications` and **Release** the version; (b) **install it on the store** via the app **Overview → Installs → Install app** (select Active Paw) — *required: the client-credentials grant returns HTTP 400 `app_not_installed` until the app is installed*; (c) copy the **Client ID** and **Client Secret** from **Settings → Credentials**.

- [ ] **Step 2: Add both to `.env`**

Append two lines to `f:\Projects\Shopify\demo-store2\.env` (already holds the CJ key, gitignored):

```
SHOPIFY_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 3: Confirm Python runs and the repo modules import**

Run from the repo root:

```powershell
python -c "import cj_client, shopify_product; print('repo modules OK')"
```

Expected: `repo modules OK`

- [ ] **Step 4: Confirm the Online Store publication ID is still correct**

The constant `gid://shopify/Publication/350644961618` is reused from `publish-products-online-store.py`. Verify it against the live store with the existing query file:

```powershell
shopify store execute --store 4qkudm-ez.myshopify.com --query-file list-publications.graphql
```

Expected: the JSON output contains a publication named "Online Store" with id `gid://shopify/Publication/350644961618`. If the id differs, note the new value — you'll update the constant in `shopify_admin.py` (Task 5) and the `product-probe-state.graphql` literal (Task 6).

- [ ] **Checkpoint:** token in `.env`, modules import, publication id confirmed.

---

## Task 1: `probe_lib` — percentile + summarize (pure stats)

**Files:**
- Create: `probe_lib.py`
- Create: `tests/__init__.py` (empty)
- Test: `tests/test_probe_lib.py`

- [ ] **Step 1: Create the empty test package marker**

Create `tests/__init__.py` with no content (empty file).

- [ ] **Step 2: Write the failing test**

Create `tests/test_probe_lib.py`:

```python
import unittest

import probe_lib


class TestPercentile(unittest.TestCase):
    def test_empty_returns_none(self):
        self.assertIsNone(probe_lib.percentile([], 50))

    def test_single_value(self):
        self.assertEqual(probe_lib.percentile([5.0], 50), 5.0)
        self.assertEqual(probe_lib.percentile([5.0], 90), 5.0)

    def test_p50_even_count_interpolates(self):
        self.assertAlmostEqual(probe_lib.percentile([1, 2, 3, 4], 50), 2.5)

    def test_p90_interpolates(self):
        self.assertAlmostEqual(probe_lib.percentile([1, 2, 3, 4], 90), 3.7)

    def test_p50_odd_count_is_middle(self):
        self.assertEqual(probe_lib.percentile([10, 20, 30], 50), 20)

    def test_unsorted_input(self):
        self.assertEqual(probe_lib.percentile([30, 10, 20], 50), 20)


class TestSummarize(unittest.TestCase):
    def test_summarizes_one_phase(self):
        samples = [{"a": 1.0}, {"a": 2.0}, {"a": 3.0}]
        out = probe_lib.summarize(samples, ["a"])
        self.assertEqual(out["a"]["n"], 3)
        self.assertEqual(out["a"]["p50"], 2.0)
        self.assertEqual(out["a"]["min"], 1.0)
        self.assertEqual(out["a"]["max"], 3.0)
        self.assertAlmostEqual(out["a"]["mean"], 2.0)

    def test_skips_missing_and_none_values(self):
        samples = [{"a": 1.0}, {"a": None}, {"b": 9.0}]
        out = probe_lib.summarize(samples, ["a"])
        self.assertEqual(out["a"]["n"], 1)
        self.assertEqual(out["a"]["p50"], 1.0)

    def test_empty_phase_is_all_none(self):
        out = probe_lib.summarize([], ["a"])
        self.assertEqual(out["a"]["n"], 0)
        self.assertIsNone(out["a"]["p50"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run the test to verify it fails**

Run from the repo root:

```powershell
python -m unittest tests.test_probe_lib -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'probe_lib'`.

- [ ] **Step 4: Write the minimal implementation**

Create `probe_lib.py`:

```python
"""Pure, I/O-free logic for the PawScout timing probe.

Standard library only, per repo convention. Everything here is unit-tested in
tests/test_probe_lib.py; the live API calls live in shopify_admin.py and the
pawscout-timing-probe.py entrypoint, which are validated by the live run.
"""
import re

from shopify_product import handleize, retail_price


def percentile(values, p):
    """Linear-interpolation percentile (same method as numpy's default)."""
    if not values:
        return None
    s = sorted(values)
    if len(s) == 1:
        return s[0]
    rank = (p / 100.0) * (len(s) - 1)
    lo = int(rank)
    hi = min(lo + 1, len(s) - 1)
    frac = rank - lo
    return s[lo] + (s[hi] - s[lo]) * frac


def summarize(samples, phases):
    """Reduce a list of per-iteration dicts to {phase: {n,p50,p90,min,max,mean}}."""
    out = {}
    for phase in phases:
        vals = [s[phase] for s in samples if s.get(phase) is not None]
        out[phase] = {
            "n": len(vals),
            "p50": percentile(vals, 50),
            "p90": percentile(vals, 90),
            "min": min(vals) if vals else None,
            "max": max(vals) if vals else None,
            "mean": (sum(vals) / len(vals)) if vals else None,
        }
    return out
```

- [ ] **Step 5: Run the test to verify it passes**

```powershell
python -m unittest tests.test_probe_lib -v
```

Expected: all tests in `TestPercentile` and `TestSummarize` PASS.

- [ ] **Checkpoint:** stats tests green.

---

## Task 2: `probe_lib.poll_until` — injectable poll-until-ready loop

**Files:**
- Modify: `probe_lib.py`
- Test: `tests/test_probe_lib.py` (add a class)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_probe_lib.py` (before the `if __name__` block):

```python
class FakeClock:
    """Returns each queued time value in order on successive calls."""

    def __init__(self, times):
        self._times = list(times)

    def __call__(self):
        return self._times.pop(0)


class FakeFetch:
    def __init__(self, results):
        self._results = list(results)
        self.calls = 0

    def __call__(self):
        self.calls += 1
        return self._results.pop(0)


class TestPollUntil(unittest.TestCase):
    def test_returns_elapsed_when_ready(self):
        # clock calls: start, timeout-check x2 (non-ready), return -> 4 values
        clock = FakeClock([0.0, 0.3, 0.6, 0.9])
        fetch = FakeFetch([False, False, "ready"])
        sleeps = []
        elapsed, result, timed_out = probe_lib.poll_until(
            fetch=fetch,
            is_ready=lambda r: r == "ready",
            clock=clock,
            sleep=sleeps.append,
            timeout_s=10.0,
            interval_s=0.3,
        )
        self.assertAlmostEqual(elapsed, 0.9)
        self.assertEqual(result, "ready")
        self.assertFalse(timed_out)
        self.assertEqual(fetch.calls, 3)
        self.assertEqual(sleeps, [0.3, 0.3])

    def test_times_out(self):
        clock = FakeClock([0.0, 0.3, 0.6])
        fetch = FakeFetch([False, False, False])
        elapsed, result, timed_out = probe_lib.poll_until(
            fetch=fetch,
            is_ready=lambda r: r == "ready",
            clock=clock,
            sleep=lambda _s: None,
            timeout_s=0.5,
            interval_s=0.3,
        )
        self.assertTrue(timed_out)
        self.assertAlmostEqual(elapsed, 0.6)
```

- [ ] **Step 2: Run to verify it fails**

```powershell
python -m unittest tests.test_probe_lib.TestPollUntil -v
```

Expected: FAIL with `AttributeError: module 'probe_lib' has no attribute 'poll_until'`.

- [ ] **Step 3: Write the implementation**

Append to `probe_lib.py`:

```python
def poll_until(fetch, is_ready, clock, sleep, timeout_s, interval_s):
    """Poll fetch() until is_ready(result) or timeout.

    clock() and sleep() are injected so the loop is unit-testable without real
    time. Returns (elapsed_seconds, last_result, timed_out).
    """
    start = clock()
    while True:
        result = fetch()
        now = clock()  # read once per iteration so injected FakeClock values map 1:1
        if is_ready(result):
            return now - start, result, False
        if now - start >= timeout_s:
            return now - start, result, True
        sleep(interval_s)
```

- [ ] **Step 4: Run to verify it passes**

```powershell
python -m unittest tests.test_probe_lib.TestPollUntil -v
```

Expected: both tests PASS.

- [ ] **Checkpoint:** poll loop tests green.

---

## Task 3: `probe_lib` — minimal product + variant payload builders

**Files:**
- Modify: `probe_lib.py`
- Test: `tests/test_probe_lib.py` (add a class)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_probe_lib.py`:

```python
SAMPLE_DETAIL = {
    "pid": "1234567890",
    "productNameEn": "Cool Dog Brush Pet Products",
    "bigImage": "https://cj.example/big.jpg",
    "variants": [
        {"variantSku": "SKU1", "variantSugSellPrice": "12.50",
         "variantImage": "https://cj.example/v1.jpg", "vid": "v-1"},
    ],
}


class TestPayloadBuilders(unittest.TestCase):
    def test_minimal_product_payload(self):
        product, handle = probe_lib.minimal_product_payload(SAMPLE_DETAIL, "ab12")
        self.assertEqual(product["title"], "Cool Dog Brush")  # "Pet Products" stripped
        self.assertEqual(product["status"], "ACTIVE")
        self.assertEqual(handle, "cool-dog-brush-567890-ab12")
        self.assertEqual(product["handle"], handle)
        self.assertIn("pawscout-probe-temp", product["tags"])
        self.assertIn("cj-pid-1234567890", product["tags"])
        self.assertEqual(product["productOptions"], [{"name": "Title", "values": [{"name": "Default"}]}])

    def test_minimal_variant_update_is_buyable_and_untracked(self):
        variables = probe_lib.minimal_variant_update(
            "gid://shopify/Product/1", "gid://shopify/ProductVariant/9", SAMPLE_DETAIL
        )
        self.assertEqual(variables["productId"], "gid://shopify/Product/1")
        variant = variables["variants"][0]
        self.assertEqual(variant["id"], "gid://shopify/ProductVariant/9")
        self.assertEqual(variant["price"], "12.50")
        self.assertEqual(variant["inventoryItem"], {"tracked": False})

    def test_first_image_url_prefers_variant_image(self):
        self.assertEqual(probe_lib.first_image_url(SAMPLE_DETAIL), "https://cj.example/v1.jpg")

    def test_first_image_url_falls_back_to_big_image(self):
        detail = {"bigImage": "https://cj.example/big.jpg", "variants": []}
        self.assertEqual(probe_lib.first_image_url(detail), "https://cj.example/big.jpg")
```

- [ ] **Step 2: Run to verify it fails**

```powershell
python -m unittest tests.test_probe_lib.TestPayloadBuilders -v
```

Expected: FAIL with `AttributeError: module 'probe_lib' has no attribute 'minimal_product_payload'`.

- [ ] **Step 3: Write the implementation**

Append to `probe_lib.py`:

```python
def clean_title(value):
    """Trim CJ noise from a product title (local copy; mirrors the importer)."""
    title = re.sub(r"\s+", " ", value or "").strip()
    title = re.sub(r"\b(Pet Products|Pet Supplies|Pets Supplies)\b", "", title, flags=re.IGNORECASE).strip()
    return title[:180] or "CJ Pet Product"


def first_image_url(detail):
    """Best available CJ image URL: first variant image, else the product bigImage."""
    for variant in detail.get("variants") or []:
        if variant.get("variantImage"):
            return variant["variantImage"]
    return detail.get("bigImage")


def minimal_product_payload(detail, nonce):
    """ProductCreateInput for a minimal, ACTIVE, probe-tagged product.

    Returns (product_input, handle). nonce keeps handles unique across reruns.
    """
    title = clean_title(detail.get("productNameEn") or detail.get("entryNameEn"))
    handle = f"{handleize(title)}-{str(detail.get('pid'))[-6:]}-{nonce}"
    product = {
        "title": title,
        "handle": handle,
        "status": "ACTIVE",
        "vendor": "CJ Dropshipping",
        "productType": "PawScout probe",
        "tags": ["pawscout-probe-temp", f"cj-pid-{detail.get('pid')}"],
        "productOptions": [{"name": "Title", "values": [{"name": "Default"}]}],
    }
    return product, handle


def minimal_variant_update(product_id, variant_id, detail):
    """Set price and make the default variant buyable immediately (inventory untracked).

    Untracked inventory isolates PDP-live timing from inventory-quantity setting:
    the variant is purchasable the instant the product is published.
    """
    variants = [v for v in (detail.get("variants") or []) if v.get("variantSku")]
    first = variants[0] if variants else {}
    return {
        "productId": product_id,
        "variants": [
            {
                "id": variant_id,
                "price": retail_price(first),
                "inventoryItem": {"tracked": False},
            }
        ],
    }
```

- [ ] **Step 4: Run to verify it passes**

```powershell
python -m unittest tests.test_probe_lib.TestPayloadBuilders -v
```

Expected: all four tests PASS.

- [ ] **Checkpoint:** payload-builder tests green.

---

## Task 4: `probe_lib` — critical-path metric + summary formatting

**Files:**
- Modify: `probe_lib.py`
- Test: `tests/test_probe_lib.py` (add a class)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_probe_lib.py`:

```python
class TestMetrics(unittest.TestCase):
    def test_product_critical_path_sums_phases(self):
        sample = {
            "t_cj_detail": 0.5, "t_product_create": 0.4, "t_variant_update": 0.3,
            "t_publish": 0.2, "t_pdp_live": 1.1, "t_image_ready": 8.0,
        }
        # image_ready is intentionally excluded from the critical path
        self.assertAlmostEqual(probe_lib.product_critical_path(sample), 2.5)

    def test_product_critical_path_treats_missing_as_zero(self):
        self.assertAlmostEqual(probe_lib.product_critical_path({"t_publish": 0.2}), 0.2)

    def test_format_summary_contains_phase_and_p50(self):
        summary = {"t_pdp_live": {"n": 3, "p50": 1.25, "p90": 1.8, "min": 1.0, "max": 2.0, "mean": 1.4}}
        text = probe_lib.format_summary(summary)
        self.assertIn("t_pdp_live", text)
        self.assertIn("1.25", text)
```

- [ ] **Step 2: Run to verify it fails**

```powershell
python -m unittest tests.test_probe_lib.TestMetrics -v
```

Expected: FAIL with `AttributeError: module 'probe_lib' has no attribute 'product_critical_path'`.

- [ ] **Step 3: Write the implementation**

Append to `probe_lib.py`:

```python
CRITICAL_PATH_KEYS = ("t_cj_detail", "t_product_create", "t_variant_update", "t_publish", "t_pdp_live")

ALL_PHASES = CRITICAL_PATH_KEYS + ("t_image_ready",)


def product_critical_path(sample):
    """Seconds from CJ detail fetch to PDP-live-and-buyable (image excluded)."""
    return sum(sample.get(k) or 0 for k in CRITICAL_PATH_KEYS)


def _fmt(value):
    return "   n/a" if value is None else f"{value:6.2f}"


def format_summary(summary):
    """Human-readable table of {phase: {n,p50,p90,min,max,mean}}."""
    lines = [f"{'phase':<20} {'n':>3} {'p50':>6} {'p90':>6} {'min':>6} {'max':>6} {'mean':>6}"]
    for phase, stats in summary.items():
        lines.append(
            f"{phase:<20} {stats['n']:>3} {_fmt(stats['p50'])} {_fmt(stats['p90'])} "
            f"{_fmt(stats['min'])} {_fmt(stats['max'])} {_fmt(stats['mean'])}"
        )
    return "\n".join(lines)
```

- [ ] **Step 4: Run to verify it passes**

```powershell
python -m unittest tests.test_probe_lib.TestMetrics -v
```

Expected: all three tests PASS.

- [ ] **Step 5: Run the full probe_lib suite**

```powershell
python -m unittest tests.test_probe_lib -v
```

Expected: every test across all four classes PASSES.

- [ ] **Checkpoint:** all pure-logic tests green. `probe_lib.py` is complete.

---

## Task 5: `shopify_admin.py` — direct Admin GraphQL HTTP client (+ live smoke check)

**Files:**
- Create: `shopify_admin.py`

This module is thin I/O glue, so it is **not** mock-unit-tested (per review: don't TDD one-line HTTP wrappers). It is validated by a live smoke check in Step 3 and exercised fully by the live run in Task 8.

- [ ] **Step 1: Write the module**

Create `shopify_admin.py`:

```python
"""Direct Shopify Admin GraphQL client over HTTP (no CLI subprocess).

This mirrors how the PawScout Cloudflare Worker will call the Admin API, so the
probe's numbers are representative. Standard library only. The Admin token is
read from .env (gitignored) and never printed or written to any report.
"""
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STORE = "4qkudm-ez.myshopify.com"
API_VERSION = "2026-04"  # current stable as of 2026-06; bump quarterly
ONLINE_STORE_PUBLICATION_ID = "gid://shopify/Publication/350644961618"
ADMIN_GRAPHQL_URL = f"https://{STORE}/admin/api/{API_VERSION}/graphql.json"


def read_admin_token():
    raw = (ROOT / ".env").read_text(encoding="utf-8")
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("SHOPIFY_ADMIN_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("SHOPIFY_ADMIN_TOKEN not found in .env (see Task 0)")


def load_query(filename):
    return (ROOT / filename).read_text(encoding="utf-8")


def _is_throttled(errors):
    return any((e.get("extensions") or {}).get("code") == "THROTTLED" for e in errors)


def _throttle_wait(payload):
    cost = (payload.get("extensions") or {}).get("cost") or {}
    status = cost.get("throttleStatus") or {}
    restore = status.get("restoreRate") or 50.0
    requested = cost.get("requestedQueryCost") or 100
    available = status.get("currentlyAvailable") or 0
    deficit = max(0, requested - available)
    return min(5.0, max(0.5, deficit / restore))


def admin_graphql(query, variables=None, token=None, max_retries=5):
    """POST a GraphQL query string; return the `data` object.

    Retries on HTTP 429 and on in-body THROTTLED errors (Admin GraphQL signals
    throttling inside a 200 response, not as 429). Raises RuntimeError on any
    other userErrors-level `errors` array.
    """
    token = token or read_admin_token()
    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    headers = {"Content-Type": "application/json", "X-Shopify-Access-Token": token}
    last = None
    for attempt in range(max_retries):
        req = urllib.request.Request(ADMIN_GRAPHQL_URL, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < max_retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise
        errors = payload.get("errors")
        if errors and _is_throttled(errors) and attempt < max_retries - 1:
            time.sleep(_throttle_wait(payload))
            last = errors
            continue
        if errors:
            raise RuntimeError(errors)
        return payload["data"]
    raise RuntimeError(f"admin_graphql exhausted retries (throttled): {last}")


def storefront_status(handle, timeout=10):
    """GET the live storefront PDP. Returns (http_status, body_text).

    HTTP 200 once the product is published and live; 404 until then. This is the
    ground-truth signal for 'PDP-ready & buyable'.
    """
    url = f"https://{STORE}/products/{handle}"
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "pawscout-probe"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as exc:
        return exc.code, ""
```

- [ ] **Step 2: If Task 0 Step 4 reported a different publication id, update it now**

If the verified Online Store publication id differs from `350644961618`, change the `ONLINE_STORE_PUBLICATION_ID` constant above to match. Otherwise leave it.

- [ ] **Step 3: Live smoke check (token + version + endpoint)**

Run from the repo root:

```powershell
python -c "import shopify_admin as s; print(s.admin_graphql('{ shop { name myshopifyDomain } }'))"
```

Expected: a dict like `{'shop': {'name': '...', 'myshopifyDomain': '4qkudm-ez.myshopify.com'}}`.
- If you get `SHOPIFY_ADMIN_TOKEN not found` → revisit Task 0 Step 2.
- If you get an HTTP 401/403 → the token lacks scopes or is wrong (Task 0 Step 1).
- If you get an HTTP 404 → the `API_VERSION` string is wrong; check https://shopify.dev/docs/api/admin and update the constant.

- [ ] **Checkpoint:** smoke check returns the shop name (token, version, and endpoint all confirmed working).

---

## Task 6: Orchestrator — CJ fetch, single + burst measurement, cleanup

**Files:**
- Create: `product-probe-state.graphql`
- Create: `pawscout-timing-probe.py`

This task wires the live pipeline. It is validated by the live run (Task 8), not by mocks — the pure logic it depends on is already tested.

- [ ] **Step 1: Create the combined state query**

Create `product-probe-state.graphql`:

```graphql
query ProductProbeState($id: ID!) {
  product(id: $id) {
    id
    handle
    onlineStoreUrl
    publishedOnPublication(publicationId: "gid://shopify/Publication/350644961618")
    media(first: 5) {
      nodes { status }
    }
  }
}
```

*(If Task 0 Step 4 found a different publication id, use it in the literal above too.)*

- [ ] **Step 2: Write the orchestrator entrypoint**

Create `pawscout-timing-probe.py`:

```python
"""PawScout timing probe — measures the real search-trigger pipeline latency.

Run from the repo root:
    python pawscout-timing-probe.py                  # full run (default N=5, K=8)
    python pawscout-timing-probe.py --keyword "dog brush" --singles 5 --burst 8
    python pawscout-timing-probe.py --cleanup-only   # delete any leftover probe products

Every product created is tagged 'pawscout-probe-temp' and deleted at the end.
The Admin token is never printed or written to the report.
"""
import argparse
import json
import time
import urllib.parse
from pathlib import Path

import probe_lib
import shopify_admin as admin
from cj_client import get_token, request_json

ROOT = Path(__file__).resolve().parent
CJ_LIST_URL = "https://developers.cjdropshipping.com/api2.0/v1/product/listV2"
CJ_QUERY_URL = "https://developers.cjdropshipping.com/api2.0/v1/product/query"
REPORT_PATH = ROOT / "pawscout-probe-report.json"

POLL_INTERVAL = 0.3       # tight, for measurement fidelity (NOT production cadence)
PDP_TIMEOUT = 30.0        # cap the storefront-live wait
IMAGE_TIMEOUT = 30.0      # cap the image-ready wait
SINGLE_SPACING = 3.0      # space isolation runs to avoid self-throttle


def _nonce(i):
    # Deterministic-enough unique suffix without Math.random/Date (which are fine
    # in plain Python, but a counter keeps reruns readable).
    return f"p{int(time.time()) % 100000}{i:02d}"


def fetch_cj_candidates(token, keyword, count):
    """listV2 keyword search -> list of (pid, query_seconds_for_search)."""
    params = urllib.parse.urlencode({"page": 1, "size": count, "keyWord": keyword})
    t0 = time.perf_counter()
    listing = request_json(f"{CJ_LIST_URL}?{params}", headers={"CJ-Access-Token": token})
    t_cj_query = time.perf_counter() - t0
    pids = []
    for block in (listing.get("data") or {}).get("content") or []:
        for item in block.get("productList") or []:
            if item.get("id"):
                pids.append(item["id"])
    return pids[:count], t_cj_query


def fetch_cj_detail(token, pid):
    """product/query -> (detail_dict, seconds). Returns (None, secs) if unavailable."""
    url = f"{CJ_QUERY_URL}?pid={urllib.parse.quote(pid)}"
    t0 = time.perf_counter()
    resp = request_json(url, headers={"CJ-Access-Token": token})
    secs = time.perf_counter() - t0
    time.sleep(1.05)  # CJ rate-limit courtesy (same as the importer)
    if not resp.get("result") or not resp.get("data"):
        return None, secs
    return resp["data"], secs


def _create_minimal(detail, nonce):
    product_input, handle = probe_lib.minimal_product_payload(detail, nonce)
    t0 = time.perf_counter()
    data = admin.admin_graphql(admin.load_query("product-create.graphql"), {"product": product_input})
    t_create = time.perf_counter() - t0
    result = data["productCreate"]
    if result["userErrors"]:
        raise RuntimeError(result["userErrors"])
    product = result["product"]
    variant_id = product["variants"]["nodes"][0]["id"]
    return product["id"], variant_id, product["handle"], t_create


def _set_price(product_id, variant_id, detail):
    variables = probe_lib.minimal_variant_update(product_id, variant_id, detail)
    t0 = time.perf_counter()
    data = admin.admin_graphql(admin.load_query("product-variants-update.graphql"), variables)
    t_update = time.perf_counter() - t0
    if data["productVariantsBulkUpdate"]["userErrors"]:
        raise RuntimeError(data["productVariantsBulkUpdate"]["userErrors"])
    return t_update


def _publish(product_id):
    variables = {"id": product_id, "input": [{"publicationId": admin.ONLINE_STORE_PUBLICATION_ID}]}
    t0 = time.perf_counter()
    data = admin.admin_graphql(admin.load_query("publish-product.graphql"), variables)
    t_publish = time.perf_counter() - t0
    errors = data["publishablePublish"]["userErrors"]
    if errors and "already published" not in json.dumps(errors).lower():
        raise RuntimeError(errors)
    return t_publish


def _wait_pdp_live(handle):
    # Require the handle in the page body, not just HTTP 200: a password-protected
    # storefront or a soft-404 can return 200 without the real PDP. The handle
    # appears in the live PDP (canonical link / og:url) but not on those pages, so
    # a protected store times out visibly instead of reporting a false ~0s.
    elapsed, (status, _body), timed_out = probe_lib.poll_until(
        fetch=lambda: admin.storefront_status(handle),
        is_ready=lambda sb: sb[0] == 200 and handle in sb[1],
        clock=time.perf_counter,
        sleep=time.sleep,
        timeout_s=PDP_TIMEOUT,
        interval_s=POLL_INTERVAL,
    )
    return (None if timed_out else elapsed), status


def _attach_image_and_wait(product_id, image_url):
    if not image_url:
        return None
    variables = {"product": {"id": product_id}, "media": [
        {"originalSource": image_url, "mediaContentType": "IMAGE"}]}
    admin.admin_graphql(admin.load_query("product-update-media.graphql"), variables)
    state_query = admin.load_query("product-probe-state.graphql")

    def media_ready(data):
        nodes = (((data or {}).get("product") or {}).get("media") or {}).get("nodes") or []
        return bool(nodes) and all(n.get("status") == "READY" for n in nodes)

    elapsed, _data, timed_out = probe_lib.poll_until(
        fetch=lambda: admin.admin_graphql(state_query, {"id": product_id}),
        is_ready=media_ready,
        clock=time.perf_counter,
        sleep=time.sleep,
        timeout_s=IMAGE_TIMEOUT,
        interval_s=POLL_INTERVAL,
    )
    return None if timed_out else elapsed


def measure_single(detail, nonce, created_ids):
    """Create -> price -> publish -> wait PDP live -> attach+wait image. Returns a sample dict."""
    sample = {"pid": detail.get("pid"), "t_cj_detail": detail.get("_t_cj_detail")}
    product_id, variant_id, handle, sample["t_product_create"] = _create_minimal(detail, nonce)
    created_ids.append(product_id)
    sample["t_variant_update"] = _set_price(product_id, variant_id, detail)
    sample["t_publish"] = _publish(product_id)
    sample["t_pdp_live"], sample["pdp_status"] = _wait_pdp_live(handle)
    sample["t_image_ready"] = _attach_image_and_wait(product_id, probe_lib.first_image_url(detail))
    sample["critical_path"] = probe_lib.product_critical_path(sample)
    return sample


def measure_burst(details, created_ids):
    """Back-to-back create+publish to characterize sustained throughput + throttle."""
    arrivals = []
    burst_start = time.perf_counter()
    for i, detail in enumerate(details):
        nonce = _nonce(900 + i)
        try:
            product_id, variant_id, handle, _ = _create_minimal(detail, nonce)
            created_ids.append(product_id)
            _set_price(product_id, variant_id, detail)
            _publish(product_id)
            live, _status = _wait_pdp_live(handle)
            arrivals.append({"i": i, "since_start": time.perf_counter() - burst_start, "pdp_live": live})
        except Exception as exc:  # throttle or transient error -> record, keep going
            arrivals.append({"i": i, "error": str(exc)[:200], "since_start": time.perf_counter() - burst_start})
    gaps = [b["since_start"] - a["since_start"]
            for a, b in zip(arrivals, arrivals[1:]) if "error" not in a and "error" not in b]
    return {"arrivals": arrivals, "inter_arrival_p50": probe_lib.percentile(gaps, 50),
            "inter_arrival_p90": probe_lib.percentile(gaps, 90)}


def cleanup(created_ids):
    """Best-effort delete of every product the probe created."""
    delete_query = admin.load_query("product-delete-variable.graphql")
    deleted = 0
    for product_id in created_ids:
        try:
            admin.admin_graphql(delete_query, {"input": {"id": product_id}})
            deleted += 1
        except Exception as exc:
            print(f"  cleanup: failed to delete {product_id}: {exc}")
    return deleted


def cleanup_by_tag():
    """Safety net: find and delete any lingering 'pawscout-probe-temp' products."""
    query = ('query($q: String!) { products(first: 100, query: $q) '
             '{ nodes { id title } } }')
    data = admin.admin_graphql(query, {"q": "tag:pawscout-probe-temp"})
    ids = [n["id"] for n in data["products"]["nodes"]]
    print(f"Found {len(ids)} leftover probe products.")
    return cleanup(ids)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--keyword", default="dog brush")
    parser.add_argument("--singles", type=int, default=5)
    parser.add_argument("--burst", type=int, default=8)
    parser.add_argument("--cleanup-only", action="store_true")
    args = parser.parse_args()

    if args.cleanup_only:
        print(f"Deleted {cleanup_by_tag()} leftover probe products.")
        return

    token = get_token()
    needed = args.singles + args.burst
    pids, t_cj_query = fetch_cj_candidates(token, args.keyword, needed)
    print(f"CJ keyword search '{args.keyword}': {len(pids)} candidates in {t_cj_query:.2f}s")
    if len(pids) < needed:
        print(f"  WARNING: only {len(pids)} candidates for {needed} needed; reducing counts.")

    details = []
    for pid in pids:
        detail, secs = fetch_cj_detail(token, pid)
        if detail:
            detail["_t_cj_detail"] = secs
            details.append(detail)
    single_details = details[:args.singles]
    burst_details = details[args.singles:args.singles + args.burst]

    created_ids = []
    singles = []
    try:
        for i, detail in enumerate(single_details):
            print(f"single {i + 1}/{len(single_details)} (pid {detail.get('pid')})...")
            singles.append(measure_single(detail, _nonce(i), created_ids))
            time.sleep(SINGLE_SPACING)
        print("burst...")
        burst = measure_burst(burst_details, created_ids)
    finally:
        print("cleanup...")
        deleted = cleanup(created_ids)
        print(f"  deleted {deleted}/{len(created_ids)} products")

    summary = probe_lib.summarize(singles, list(probe_lib.ALL_PHASES) + ["critical_path"])
    cold_first = (t_cj_query + singles[0]["critical_path"]) if singles else None
    report = {
        "keyword": args.keyword,
        "api_version": admin.API_VERSION,
        "t_cj_query": t_cj_query,
        "cold_search_first_product_seconds": cold_first,
        "singles": singles,
        "single_summary": summary,
        "burst": burst,
        "caveat": ("Measured from a local PC. Worker->Shopify RTT will differ slightly, "
                   "but Shopify-side create/publish/propagation dominates the budget."),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print("\n=== SINGLE-PRODUCT LATENCY (seconds) ===")
    print(probe_lib.format_summary(summary))
    print(f"\nCJ keyword search: {t_cj_query:.2f}s")
    if cold_first is not None:
        print(f"COLD-SEARCH first product PDP-ready & buyable: {cold_first:.2f}s")
    print(f"Burst inter-arrival p50/p90: {burst['inter_arrival_p50']}/{burst['inter_arrival_p90']}s")
    print(f"\nFull report: {REPORT_PATH.name}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Syntax/import check (no live calls)**

```powershell
python -c "import ast; ast.parse(open('pawscout-timing-probe.py', encoding='utf-8').read()); print('parse OK')"
```

Expected: `parse OK`.

- [ ] **Checkpoint:** orchestrator and query file written; parses clean.

---

## Task 7: Cleanup safety net — verify `--cleanup-only` works

**Files:** none (uses `pawscout-timing-probe.py` from Task 6).

- [ ] **Step 1: Dry-run the cleanup path against the live store**

With no probe products yet present, this should find zero and exit cleanly:

```powershell
python pawscout-timing-probe.py --cleanup-only
```

Expected: `Found 0 leftover probe products.` then `Deleted 0 leftover probe products.`
- If it errors on the `products(query:)` call, the token lacks `read_products` — fix scopes (Task 0).

- [ ] **Checkpoint:** the safety net runs and reports zero leftovers (confirms tag-search + delete wiring before any real products exist).

---

## Task 8: The live run — capture real numbers (the deliverable)

**Files:** writes `pawscout-probe-report.json`.

- [ ] **Step 1: Run the full probe against the store**

```powershell
python pawscout-timing-probe.py --keyword "dog brush" --singles 5 --burst 8
```

Expected console output, in order:
1. `CJ keyword search 'dog brush': N candidates in X.XXs`
2. five `single i/5 (pid ...)...` lines
3. `burst...`
4. `cleanup...` → `deleted 13/13 products` (or however many were created)
5. a `=== SINGLE-PRODUCT LATENCY (seconds) ===` table
6. `COLD-SEARCH first product PDP-ready & buyable: X.XXs`
7. `Burst inter-arrival p50/p90: .../...s`

- [ ] **Step 2: Confirm the store was left clean**

```powershell
python pawscout-timing-probe.py --cleanup-only
```

Expected: `Found 0 leftover probe products.` (the `finally` block already deleted them; this confirms nothing leaked).

- [ ] **Step 3: Sanity-check the numbers against the design's claims**

Open `pawscout-probe-report.json` and verify the shape of the results:
- `single_summary.t_pdp_live.p50` is present and non-null (the headline PDP-live number).
- `cold_search_first_product_seconds` is the end-to-end "first product" number — compare to the design's ~3–5s estimate.
- For each single, `t_image_ready` should be **larger** than `t_pdp_live` (confirms the image is safely off the critical path). If `t_image_ready` is frequently `null` (timed out at 30s), that's an even stronger confirmation — note it.
- `burst.inter_arrival_p50` is the real "~2s apart" cadence — compare to the design's estimate.

- [ ] **Step 4: If every single shows `t_pdp_live` is null (timed out)**

First suspect **storefront password protection** (Online Store → Preferences → "Restrict access… with a password"). With it on, `/products/{handle}` serves a password page, the handle never appears in the body, and the probe correctly times out rather than reporting a false ~0s. Disable it for the run, then re-run. If a *few* (not all) singles time out with protection off, that's a real finding — publish→storefront propagation is slower than assumed, which directly affects the no-quick-add UX; record it as a risk in Task 9. Do not paper over it.

- [ ] **Checkpoint:** `pawscout-probe-report.json` exists with real P50/P90 for every phase; store confirmed clean.

---

## Task 9: Close the loop — write measured numbers back into the design

**Files:**
- Modify: `docs/superpowers/specs/2026-06-07-pawscout-search-trigger-design.md`

- [ ] **Step 1: Replace the §4 estimate table with measured numbers**

In the search-trigger design doc, find §4 ("Latency budget (estimates — confirm via §9 probe)"). Replace the estimate values with the measured P50/P90 from `pawscout-probe-report.json`, and retitle it `## 4. Latency budget (measured 2026-06-07 — see pawscout-probe-report.json)`. Keep the rows; fill real numbers. Add a one-line note with the local-RTT caveat from the report.

Example shape (fill with YOUR measured values):

```markdown
## 4. Latency budget (measured 2026-06-07)

| | P50 | P90 |
|---|---|---|
| CJ keyword search (per search) | _x.x_s | _x.x_s |
| First pipeline product **PDP-ready & buyable** (cold search) | _x.x_s | _x.x_s |
| Each subsequent product (burst inter-arrival) | _x.x_s | _x.x_s |
| Shopify image fully processed (off critical path) | _x.x_s | _x.x_s |

Measured from a local PC against `4qkudm-ez.myshopify.com`. Worker→Shopify RTT will
differ slightly; Shopify-side create/publish/propagation dominates. Full data:
`pawscout-probe-report.json`.
```

- [ ] **Step 2: Resolve the §11 open questions that the probe answers**

In §11 ("Open decisions"), update items 2 and 3 with data:
- **Poll interval** — set the production default based on the measured `t_pdp_live` (e.g., if P90 PDP-live is ~1.5s, a 1.5s production poll surfaces each product within ~one extra interval; state the chosen value and why).
- **Target / minimum** — note the measured burst cadence and how long filling 16 tiles actually takes, which informs whether 16 is reachable inside a tolerable search wait.

- [ ] **Step 3: Note any surprises as risks**

If Task 8 surfaced anything off-estimate (slow propagation, early throttle, frequent image timeouts), add a short "Measured risks" subsection under §4 capturing it, so Plans 2–3 account for it.

- [ ] **Checkpoint:** the design doc now carries real numbers; the estimate-vs-measured loop is closed.

---

## Addendum: CJ fulfillment spike (folded in 2026-06-07)

The user asked to fold a fulfillment-latency hook into the probe. Split into a safe part (done) and a gated part (deferred).

**Done — freight latency (read-only, zero side effects):** `--freight-only` mode added to `pawscout-timing-probe.py` (`cj_freight` + `measure_freight`, using `CJ_FREIGHT_URL = /logistic/freightCalculate`). Needs only the CJ key; places no orders. First live run (4 "dog brush" variants): **t_cj_freight P50 1.36s / P90 1.41s**, all `result=True`, 9–24 options each. Report: `pawscout-freight-report.json`. This proves CJ logistics connectivity for real variants and measures the synchronous pre-order step.

**Deferred — `createOrderV2` functional spike (pending user now-vs-defer decision):** The safe path is `payType=3` (create unpaid order, no wallet charge, no confirmation) → measure → `deleteOrder` cleanup. NOT yet written, by intent: (1) its latency is near-worthless as a metric (async, post-checkout, not customer-facing); (2) its real value is *functional proof* for the fulfillment module, which is 2–3 plans away; (3) it creates unpaid orders on the user's live CJ account and needs 1–3 live iterations to settle the exact payload (CJ v2 order docs are login-gated; the stale third-party client uses v1 `createOrders`). Per review: do this deliberately with consent, never as a delegated live-iteration loop. If the user defers, it lives in the future fulfillment plan, not here (YAGNI — don't leave unvalidated order-placing code in the repo).

## Self-Review (completed during planning)

- **Spec coverage:** The probe validates §4 (latency budget — every row now has a measuring phase), §3a (CJ query timing), the §3/§4 "minimal-first create + image off critical path" claim (separate `t_pdp_live` vs `t_image_ready`), the §1/§3 "PDP is safe / publish makes it live" claim (real storefront 200 poll — the load-bearing measurement), and §9 (this *is* build step 0). It answers the user's literal question ("average time for the first product to become fully present") via `cold_search_first_product_seconds`. Quality gating (§5), collection tagging (§6), dedup (§7), and caching (§8) are **out of scope for the probe** — they belong to Plan 2 (the Worker), which this plan explicitly precedes.
- **Placeholder scan:** No TBD/TODO. The only intentional blanks are the measured values in Task 9 (which can only exist after Task 8 runs) — these are clearly marked "fill with YOUR measured values."
- **Type consistency:** Phase keys (`t_cj_detail`, `t_product_create`, `t_variant_update`, `t_publish`, `t_pdp_live`, `t_image_ready`, `critical_path`) are identical across `probe_lib.ALL_PHASES`, `measure_single`, `summarize`, and the tests. `admin.ONLINE_STORE_PUBLICATION_ID`, `admin.API_VERSION`, `admin.load_query`, `admin.admin_graphql`, `admin.storefront_status` are referenced consistently. `poll_until` signature matches all three call sites.
- **Proportional testing:** TDD covers the bug-prone pure logic (percentile edge cases, the inject-clock poll loop, payload builders, metric math); thin HTTP wrappers and live orchestration are validated by smoke check + the live run, not mocks.
```

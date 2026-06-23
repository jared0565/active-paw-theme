# PawScout - Search-Trigger Inventory Population (design)

**Date:** 2026-06-07
**Companion to:** `2026-06-07-pawscout-design.md` (refines the product into a **signal-driven inventory populator**; this doc details the *visitor-search* trigger).

---

## 1. Goal

When a visitor searches Active Paw and the store has **fewer than the target grid** (4×4 = **16**, but **fewer is fine if that's all that passes quality gating**), the search **signals** PawScout to pull matching CJ products, create them as **real, published Shopify inventory**, and **progressively stream** them into the results grid.

**Strict rules (carried from discussion):**
- Nothing reaches the **cart** that isn't a real inventory product with proper info.
- Search-result tiles for pipeline products have **no express/quick-add** button → the visitor must open the **PDP**, by which time the product is live.
- Every product created - by any trigger - **must land in a collection** (§6).

---

## 2. The two interfaces

| Direction | Mechanism | Used for |
|---|---|---|
| **Storefront → PawScout** | **Shopify App Proxy** (`/apps/pawscout/...`, HMAC-signed) | Carry the search *signal*; poll for ready products. CJ key never touches the browser. |
| **PawScout → Active Paw** | **Shopify Admin API** (store's token, server-side) | Create + publish the product, set variants/price/inventory, supplier metafields, collection tag. |

---

## 3. The flow (progressive fill)

```
Visitor searches "dog brush"
 1. main-search renders EXISTING store results immediately (say 3).
 2. theme.js: have=3 < target=16 → POST /apps/pawscout/search-signal {q, have, target}
 3. PawScout:
      a. per-term CACHE hit? → reuse CJ candidate list. else query CJ (~0.5–2s).
      b. QUALITY-GATE candidates (§5); DEDUP vs existing inventory (§7).
      c. for each passing candidate (eager, small concurrency, paced by CJ limits):
           create MINIMAL purchasable product → publish to Online Store
           → tag for collection (§6)  →  mark "ready" with its handle
           → async: attach CJ image, extra variants, full metafields
 4. theme.js POLLS /apps/pawscout/search-status?id=… every ~1.5s
      → each poll returns any newly-ready {handle, title, price, cj_image_url}
      → theme APPENDS each as a tile (NO quick-add) → grid fills one-by-one
 5. stop when grid hits target OR PawScout signals "done"
      (settle below 16 if that's all that passed gating)
 6. visitor clicks a tile → PDP at /products/{handle}
      → already published → add-to-cart present.
      → if clicked before "ready": PDP shows "Locating your product" spinner,
        polls, reveals add-to-cart when live.
```

**Why the PDP is safe even though search isn't:** the PDP is a direct `/products/{handle}` URL rendered from the **published product record**, independent of Shopify's (non-real-time) **search index**. Publishing makes the PDP live in well under a second; the search index catching up later doesn't matter.

---

## 4. Latency budget (MEASURED 2026-06-07 - `pawscout-probe-report.json`)

Real numbers: 5 isolated single-product runs + an 8-product back-to-back burst against `4qkudm-ez.myshopify.com`, Admin API `2026-04`, **direct HTTP** (client-credentials grant), tight 300 ms polling.

| Phase | P50 | P90 |
|---|---|---|
| CJ keyword search (per search, once) | 1.33s | - |
| CJ product detail fetch (per product) | 0.78s | 0.90s |
| Shopify product create | 0.53s | 0.82s |
| Variant price/inventory update | 0.25s | 0.30s |
| Publish to Online Store | 0.36s | 0.38s |
| **Publish → storefront PDP live & buyable** | **0.39s** | **0.44s** |
| Per-product critical path (detail → PDP live) | 2.33s | 2.65s |
| Shopify image fully processed (**off critical path**) | 2.34s | 2.47s |

**Headline results:**
- **Cold-search first product PDP-ready & buyable: ~4.15s** (CJ search 1.33s + first product's ~2.8s critical path) - the spinner duration for the first tile of a brand-new search term.
- **Subsequent products: ~1.4s apart** (burst P50 1.40s / P90 1.48s, **no throttling** at 8 back-to-back) - but this is **Shopify-side create→publish→live throughput only**: the burst ran on CJ details fetched *up front*, so it excludes per-product CJ detail-fetch (0.78s) and CJ's ~1.05s pacing sleep. Real pipeline cadence depends on either (a) **pipelining** CJ detail fetches ahead of creation, or (b) skipping the per-product `product/query` call entirely if `listV2` already carries enough variant data. **Confirmed in Plan 2a brainstorming (2026-06-07):** `listV2` carries `nameEn`, `bigImage`, `sellPrice`, `id` (dedup), and `listedNum` (popularity) - enough for minimal-create + tile + quality-gate + dedup. So the per-product `product/query` detail call (for `vid`/variants → fulfillment metafields) moves entirely to **async enrich, off the hot path**, and the optimistic branch holds: ~1.4s cadence → cold 16-grid ≈ 4.15s + 15×1.4s ≈ **~25s**.
- **The decisive rule, confirmed:** the PDP goes live **<0.5s after publish** (P90 0.44s), independent of the (laggy) search index - so publishing reliably makes `/products/{handle}` live before a visitor can click through. The no-quick-add → PDP handshake is sound.
- **Image is genuinely off the critical path:** buyable at ~0.4s vs image-ready at ~2.34s (~6×). Show **CJ's own image URL** on the tile/PDP meanwhile; gating "ready" on the processed image would ~6× the time-to-buyable.

*Measured from a local PC; a Cloudflare Worker (closer to Shopify, no local ISP hop) should be equal or slightly faster - Shopify-side processing dominates the budget.*

---

## 5. Quality gating (what's allowed to land)

A CJ candidate becomes inventory only if it passes (thresholds are merchant-tunable - see Open Qs):
- has a usable image + title + price within the store's range,
- in-stock / available at CJ,
- meets a popularity floor (CJ listing-count / trending flag),
- is **not already in inventory** (§7),
- matches the search intent (keyword relevance).

Gating may yield **< 16**; that is acceptable and expected. Never pad the grid with junk to reach 16.

---

## 6. Collection assignment (hard requirement, all triggers)

Active Paw collections are **smart/rule-based**. So PawScout **tags** each product so the smart-collection rule auto-includes it - no separate "add to collection" call. Collection is chosen from the signal (search term / product title) → `pet-cleaning | pet-accessories | pet-health | pet-toys`, fallback `more-to-love`.
**RESOLVED (2026-06-08):** the field is **TAG**, and the routing + the managed-rule guarantee are fully specified in `2026-06-08-pawscout-collection-mapping-design.md` (keyword-bucket routing → `chooseCollection`; append-only `TAG EQUALS <tag>` rule via `ensureCollectionRule`). The pipeline tags each created product with `chooseCollection(term, title, map).tag`. Active Paw reuses the live `cj-cat-*` tags (so already-imported products are included); new tenants use `pawscout-<handle>`. The worker is the single, append-only authority on the rule - see that design's §11 for reconciliation with the existing Python scripts.
**Trigger 3 (merchant manual adds):** enforce the same rule via a **Shopify Flow / product-create webhook** that tags any untagged new product into a collection.

---

## 7. Dedup

Before creating, skip any CJ product already in inventory - matched by the `supplier.cj_product_id` / `cjd.product_id` metafield (or deterministic handle). Prevents the scheduled-trending trigger and the search trigger from creating duplicates of each other's work.

---

## 8. Caching & permanence (why the delay decays)

- **Per-term CJ cache** (normalized query, short TTL): only the first searcher of a term pays the CJ query latency.
- **Created products are permanent inventory** → the *second* searcher of "dog brush" hits real stock: no pipeline, no spinner. The delay is a **first-time-per-term cost** that fades as the catalog fills from real demand.

---

## 9. Build step 0 - measure it for real (FIRST task) - ✓ DONE 2026-06-07

**Completed.** Built `pawscout-timing-probe.py` (+ `probe_lib.py`, `shopify_admin.py`) and ran it against the live store: 5 isolated single-product runs + an 8-product burst, create + publish + real-storefront PDP-live poll + image-ready poll, all products auto-deleted. Results folded into §4 and §11 above; raw data in `pawscout-probe-report.json`. Plan: `docs/superpowers/plans/2026-06-07-pawscout-timing-probe.md`. Outcome: the §4 estimates held (first product 4.15s, ~1.4s cadence, image off critical path confirmed), so the progressive-fill UX can be built on these numbers.

---

## 10. Edge cases

| Case | Handling |
|---|---|
| Create fails (CJ/Shopify error) | Drop that tile; don't link to a dead PDP |
| CJ down / rate-limited | Show existing results only; no pipeline tiles this search |
| Clicked before ready | PDP "Locating your product" spinner + poll → reveal add-to-cart |
| Visitor abandons mid-fill | Already-created products **stay** in inventory (the point) |
| Zero existing results | Same flow; grid builds entirely from pipeline (first tile ~3–5s) |
| Shopify rate limit | Small create concurrency; the ~2s cadence keeps cost under the throttle |

---

## 11. Open decisions

1. **Quality-gate thresholds** - popularity floor, price band, relevance strictness (merchant input). *Still open.*
2. **Target / minimum** - *data:* a full 16-tile **cold** grid takes **~25–40s** (4.15s first + 15× cadence; cadence is ~1.4s with CJ-detail pipelining or ~2.5–3s serial - see §4). Existing inventory renders instantly; pipeline tiles stream in. **Recommendation:** don't block on 16 - render existing first, stream pipeline tiles as they land, settle at whatever passes gating. The per-term cache + permanent inventory (§8) mean only the *first* searcher of a term pays the cold cost; repeat searches hit warm stock with no spinner. Consider a lower "good-enough" threshold (8–12) if cold-grid wait proves long in UX testing.
3. **Poll interval** - *resolved:* **~1.5s** confirmed (can tighten to ~1s). Measured publish→PDP-live P90 = 0.44s and burst cadence ~1.4s/product, so each new product is live well within one poll cycle; 1.5s surfaces it within ~one interval of going live.
4. **Eager vs lazy create** - recommend **eager** (create all gating-passed up to target) since populating inventory *is* the goal; lazy-on-click would under-seed. *Probe confirms eager is cheap: ~1.4s/product, no throttling at 8 back-to-back.*

# PawScout — Collection-Mapping UI (design)

**Date:** 2026-06-08
**Companion to:** `2026-06-07-pawscout-search-trigger-design.md` (this designs the merchant-facing console section that makes §6 "collection assignment" work for **any** merchant, not just the pre-seeded Active Paw store).
**Part of:** Plan 2b (worker pipeline + theme progressive-fill + this UI).

---

## 1. Goal

Let any merchant map their own Shopify smart collections to keyword buckets, so the search-trigger pipeline can route each sourced CJ product into the right collection — **guaranteed**, by a tag rule PawScout owns on both sides.

Active Paw is pre-seeded (4 category collections + a `more-to-love` fallback). This generalizes that hardcoded map to a configurable, per-tenant one.

---

## 2. The problem this solves (why a string isn't enough)

A merchant's smart collection already has its **own** matching rules. Worse, on Active Paw **two existing scripts fight over the same five collection handles**: `create-home-collections.py` sets `TYPE`/`TITLE` rules (e.g. `TYPE = "Dog grooming shampoo"`, `TITLE contains "Teeth"`), while `import-cj-category-products.py` → `ensure_collections()` *replaces* the whole ruleSet with `TAG EQUALS "cj-cat-<category>"`. Whichever ran last owns the live rule — so whether the worker's `cj-cat-pet-cleaning` tag actually lands is a **coin-flip**, not a guarantee (the risk flagged in search-trigger §6, now diagnosed).

**Resolution:** PawScout owns both sides of one tag, **non-destructively**, and becomes the single authority on the rule for any collection it manages.
- When a collection is mapped, `ensureCollectionRule` reads the collection's current ruleSet and **appends** one rule it controls — `TAG EQUALS <entry.tag>` with `appliedDisjunctively: true` — preserving every existing rule. It never replaces or narrows the merchant's collection. (Contrast `ensure_collections()`, which sets `appliedDisjunctively: False` and overwrites — destructive, unacceptable for a third-party merchant's collection.)
- The managed **tag is per-entry data**, not a hardcoded namespace. New merchants default to `pawscout-<handle>`. **Active Paw seeds to the existing `cj-cat-<category>` values** so the ~hundreds of already-imported, already-`cj-cat-*`-tagged products retroactively land in their collections with zero migration, and the worker stays consistent with the live `import-cj-category-products.py` contract instead of inventing a competing one.

This reuses what already works (the live `cj-cat-*` tag contract) where it exists, generalizes cleanly for new tenants, and stops the two-script clobber by making the worker's append-only strategy authoritative. See §11 for the reconciliation with the existing Python scripts.

---

## 3. Data model

`TenantConfig.collectionMap` entries grow from `{ handle, tag }` to:

```ts
export interface CollectionMapEntry {
  handle: string;        // Shopify collection handle — the bucket key
  collectionId: string;  // Shopify GID (gid://shopify/Collection/123) — needed to edit the ruleSet
  title: string;         // display label shown in the console
  tag: string;           // managed auto-include tag (see invariants) — never merchant-typed
  keywords: string[];    // routing keywords, stored lowercased
  fallback?: boolean;    // exactly ONE entry is the catch-all for unmatched searches
}

export type CollectionMap = Record<string, CollectionMapEntry>; // keyed by handle
```

`ACTIVE_PAW_COLLECTION_MAP` is rewritten to the new shape but **keeps its existing `cj-cat-<category>` tags** (e.g. `cj-cat-pet-cleaning`), adds per-bucket keywords, and marks `more-to-love` as `fallback: true`. Reusing the live tags means every product already imported by `import-cj-category-products.py` is retroactively included — no re-tagging pass.

**Invariants:**
- Exactly one entry has `fallback: true`.
- `tag` is **system-assigned, never merchant-typed**: for a newly-mapped collection it defaults to `pawscout-${handle}`; for Active Paw's pre-seed it is the established `cj-cat-${category}` value. Either way the worker applies that exact tag to products and adds the matching collection rule — both sides always agree.
- `keywords` are stored lowercased and de-duplicated.

---

## 4. The guarantee mechanism — `src/shopify-collections.ts` (new)

Two functions, both taking an **injected** Admin API client so they unit-test without a live Shopify call (same pattern as `ensureInstalled`'s injected `exchange`).

- **`fetchSmartCollections(client): Promise<{ id; handle; title }[]>`**
  Lists the store's rule-based collections for the console dropdown. GraphQL `collections(first: 100, query: "collection_type:smart")`; return `id, handle, title`. Scope: `read_products` (already granted).

- **`ensureCollectionRule(client, collectionId, tag): Promise<void>`**
  Reads the collection's current `ruleSet` (rules + `appliedDisjunctively`), and if no rule already matches `{ column: TAG, relation: EQUALS, condition: tag }`, appends it and writes the whole set back via `collectionUpdate(input: { id, ruleSet })`. **Idempotent** — re-saving an unchanged map is a no-op write-back. Forces `appliedDisjunctively: true` so the added TAG rule is OR-ed with the merchant's existing rules (**never narrows or replaces** their collection — the deliberate difference from `ensure_collections()`, which overwrites). Scope: `write_products` (already granted). Throws on `userErrors` so the save path can surface which collection failed.

  This is a TypeScript port of the **proven** `ensure_collections()` in `import-cj-category-products.py:190` (same `collection-update.graphql` mutation, same `userErrors` handling) — with the one behavioural change from destructive-replace to non-destructive-append. Use it as the reference implementation.

Both use the sealed **offline** Admin token (the same one `persistInstall` stored), opened from the vault per request.

---

## 5. Console UX — section in `src/console/page.ts`

A new dark-themed "Collections" card, below Quality gates:

```
3. Collections
   Sourced products are auto-added to a collection by matching the search term
   to its keywords. One collection is the fallback for everything else.

   [ Pet Toys            ▾ ]  [ toy, ball, chew, plush      ]  ( ) fallback   [✕]
   [ Pet Health          ▾ ]  [ dental, vitamin, supplement ]  ( ) fallback   [✕]
   [ More To Love        ▾ ]  [                              ]  (•) fallback   [✕]
   [ + Add collection ]                       [ Save collections ]   <status>
```

- The dropdown is populated from `fetchSmartCollections` (loaded on page open via a new read route).
- Keywords are a comma-separated text input (parsed to a lowercased array on save).
- Exactly one fallback radio is selected across rows (the keywords box on the fallback row is optional/ignored).
- Save posts the full map. Inline feedback only (no `alert()`), consistent with the existing console.
- **Empty-state:** if `fetchSmartCollections` returns none, the card shows guidance — "No smart (automated) collections found. Create one in Shopify admin → Products → Collections, then reload." — because the picker is existing-only by design.

App Bridge v4 (`shopify.idToken()`), same `api()`/`setMsg()` helpers already in the page.

---

## 6. Routing function — `src/routing.ts` (new, pure)

`chooseCollection(term: string, title: string, map: CollectionMap): CollectionMapEntry`

1. Lowercase `term` and `title`.
2. For each non-fallback entry (stable iteration order), if any of its `keywords` is a substring of `term`, return it (first match wins).
3. Else repeat the test against `title`.
4. Else return the `fallback` entry.

Pure and deterministic — the Plan 2b pipeline calls it to get `.tag` (applied at product create) and `.handle` (for logging). No Shopify or CJ dependency, fully unit-testable.

---

## 7. API routes — `src/console/routes.ts` + `src/index.ts`

- **New read route** `POST /api/shopify-collections` → `listSmartCollections(db, vault, shop)`: opens the offline token, calls `fetchSmartCollections`, returns `{ collections: [{id, handle, title}] }`. Session-token authed via the existing `shopOf` middleware.
- **Extend** `saveCollectionMap(db, vault, shop, map)`:
  1. Validate exactly one `fallback`; reject otherwise with `{ ok:false, error }`.
  2. For every entry, `ensureCollectionRule(client, entry.collectionId, entry.tag)`.
  3. **Only if all succeed**, persist the map (`seedConfig` merge). All-or-nothing — a rule-sync failure persists nothing and returns which collection failed.
  Signature gains `vault` (currently it only takes `db, shop, map`) because it now needs the Admin token.

---

## 8. Error handling

| Case | Handling |
|---|---|
| Store has no smart collections | Console empty-state guidance; Save disabled until ≥1 row |
| No fallback / multiple fallbacks | Save rejected inline: "Pick exactly one fallback collection" |
| `collectionUpdate` userError / API failure | Save reports "Couldn't update <title>: <error>"; nothing persisted |
| Offline token missing/expired | Existing `shopOf` 401 path ("Install handshake failed") |
| Merchant removes a bucket | Routing/tagging stops; the leftover managed TAG rule (`pawscout-*` or `cj-cat-*`) on the collection is harmless and is **not** auto-removed (cleanup out of scope) |
| Manual (non-smart) collection | Not selectable — dropdown lists smart collections only |

---

## 9. Testing

- **`tests/routing.test.ts`** (pure): term-keyword match, title fallback match, first-match precedence across buckets, case-insensitivity, no-match → fallback, empty keywords on a non-fallback bucket never matches.
- **`tests/shopify-collections.test.ts`** (injected mock client): `ensureCollectionRule` appends the TAG rule when absent; is a no-op when already present (idempotent); preserves existing rules and forces `appliedDisjunctively: true`; throws on `userErrors`. `fetchSmartCollections` maps the GraphQL response to `{id, handle, title}`.
- **Extend `tests/config.test.ts`**: `saveCollectionMap` rejects a map without exactly one fallback; persists the new entry shape; calls rule-sync before persisting (spy on injected client); `getStatus` returns the new shape.

---

## 10. Scope boundaries (YAGNI)

**In:** the console section, smart-collection fetch, managed-rule sync, routing function, new data shape, Active Paw map migration.

**Out (later/separate):** creating new collections from the console (picker is existing-only); converting manual→smart collections; removing the managed rule on un-map; CJ-category-based routing; per-keyword weighting/relevance scoring. The routing function is consumed by the Plan 2b pipeline, which is specified in the search-trigger design — not re-specified here.

---

## 11. Reconciliation with the existing collection scripts

The graph surfaced a real conflict the worker must not inherit. Two Python scripts already manage the same five Active Paw collection handles with **incompatible** rule strategies:

| Script | ruleSet written | Disposition |
|---|---|---|
| `create-home-collections.py` | `TYPE`/`TITLE` rules (e.g. `TYPE = "Dog grooming shampoo"`) | Historical home-page setup. |
| `import-cj-category-products.py` → `ensure_collections()` | **Replaces** ruleSet with single `TAG EQUALS "cj-cat-<category>"`, `appliedDisjunctively: False` | The live, CJ-driven contract; products carry `cj-cat-*` + `cj-pid-*` tags. |

Because both *overwrite*, whichever ran last owns the live rule — the non-determinism this design removes.

**The worker becomes the single authority** for the rule on any collection it manages, and it is **append-only**:
1. The worker reuses the `cj-cat-*` tag for Active Paw (§2, §3), so it agrees with `import-cj-category-products.py` rather than competing — products imported by that script and products created by the search-trigger pipeline share one tag and one collection rule.
2. Because `ensureCollectionRule` appends with `appliedDisjunctively: true` (never replaces), a later run of `ensure_collections()` would still *overwrite* the worker's rule. **Action for Active Paw:** once the worker manages a collection, stop running `ensure_collections()` against it — or align that function to the same append-only strategy (a one-line change: read-merge-write instead of replace). This is operational guidance for the Active Paw store, **not** a code dependency of the worker.
3. For any **non-Active-Paw** merchant there is no Python script in the loop, so the worker is trivially the sole authority and the question is moot.

**Net benefit of the chosen alignment:** existing imported inventory is retroactively collected (reuse of `cj-cat-*`), third-party collections are never destroyed (append-only), the rule stops being a coin-flip (single authority), and the proven `ensure_collections()` becomes the implementation reference for `ensureCollectionRule`.

# Search Relevance + Supplier Results in the Main Listing - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the search page surfacing off-topic items, and bring supplemental supplier products into the main results listing (above the fold, esp. mobile) - but only when relevant and only when the native grid is thin.

**Architecture:** Two stages. **Stage 1 (Liquid/CSS, ships independently, no infra):** make the existing collection-backed "offer" block query-relevant, capped, deduped, gated to thin results, and rendered *inside* the main grid as clearly-labelled "Suggested" cards; plus restrict native Shopify search fields to kill description/tag noise. **Stage 2 (theme.js + App Proxy, gated on a Partner-Dashboard setting):** wire the already-built live worker feed (`/apps/pawscout/proxy/search`) so genuinely query-relevant supplier *ghost cards* stream into the same grid, with the no-quick-add → PDP-import handshake.

**Tech Stack:** Shopify Liquid (no build step - edit `assets/*` and `sections/*` directly), vanilla `assets/theme.js` (no framework), `assets/theme.css` (single file). Cloudflare Worker `pawscout-worker` (already built/deployed) reached via Shopify App Proxy.

## Global Constraints

- This work is in the **theme** repo `F:\Projects\Shopify\demo-store2` (NOT `pawscout-worker`). The worker is already built; Stage 2 changes are theme-side only.
- Live storefront is **`https://activepaw.co.uk`** (the `4qkudm-ez.myshopify.com` domain 301-redirects there). Store handle for CLI is `4qkudm-ez.myshopify.com`.
- No build step, no test framework for the theme. "Tests" = verification against `shopify theme dev` (`http://127.0.0.1:9292`) via curl+grep and a visual check. Heed the `shopify theme dev` sync gotcha in `docs/shopify-theme-dev-troubleshooting.md`: **batch all edits, then run `theme dev` once to verify**; never kill the `claude.exe`/`node` watcher mid-edit.
- Worker endpoints (live, via App Proxy `/apps/pawscout/*` → worker root): `GET /proxy/search?q=&have=&limit=&exclude=` → `{ ok, products: GhostCard[] }`; `GET /proxy/product?pid=` (triggers background import); `GET /proxy/import-status?pid=` → `{ ok, state, url }`. `GhostCard = { pid:string, title:string, image:string, price:number /* GBP */, state:'ghost'|'imported', url:string|null }`. Every `/proxy/*` response is **HTTP 200 with an `ok` flag** - check `ok`, never the status.
- Ghost cards (not yet real products) must have **NO quick-add/express button** - the visitor must open the PDP, which triggers the import (spec rule, `2026-06-07-pawscout-search-trigger-design.md` §1).
- Reuse existing card markup/styles: cards are `{% render 'product-card-commerce', product:, badge:, show_purchase_action: %}` → `<article class="commerce-card">`; grid is `.commerce-grid` (4 cols desktop / 2 cols ≤900px / 2 cols ≤620px). Match these exactly for visual consistency.
- Suggestion/supplier framing decision (merchant-approved): show supplemental cards **only when native results are thin (< 4)**, **cap 3**, framed as **labelled "Suggested" cards** with a subtle in-grid separator - never as undifferentiated equal matches.

---

## File Structure

| File | Responsibility | Stage |
|---|---|---|
| `sections/main-search.liquid` | Result grid + the suggestion/supplier render logic (query-relevance, dedup, thin-gate, cap, in-grid merge, Stage-2 mount node) | 1 & 2 |
| `sections/site-header.liquid` | The search form - add `options[fields]` to restrict native matching | 1 |
| `assets/theme.css` | In-grid suggestion separator; Stage-2 ghost-card badge + spinner styles | 1 & 2 |
| `assets/theme.js` | Stage-2 supplier-feed fetch/render + ghost-card click→import→poll→redirect | 2 |

---

# STAGE 1 - Liquid/CSS relevance + in-grid merge (ships now)

### Task 1: Query-relevant, capped, thin-gated suggestions merged into the main grid

**Files:**
- Modify: `sections/main-search.liquid:16-115` (the `{% liquid %}` assign block, the grid, and the whole `.search-offer` section)
- Modify: `assets/theme.css` (add `.search-suggested-sep`; the old `.search-offer*` rules at ~931-965 may remain unused or be removed)

**Interfaces:**
- Consumes: Shopify `search.results`, `collections[handle].products`, `product-card-commerce` snippet (`product`, `badge`, `show_purchase_action`).
- Produces: a `.commerce-grid` whose trailing cards (when present) are labelled `Suggested`, preceded by a full-width `.search-suggested-sep`. No separate below-the-fold offer section.

**Root causes this fixes** (verified live, query "pet feeding" = 1 real result + 6 off-topic `pet-accessories` cards): the offer block dumped a whole collection with **no query filter** (severity high); cards were visually indistinguishable from results (high); dedup had a substring-prefix bug (low).

- [ ] **Step 1: Write the verification harness (manual/curl test)**

There is no theme test framework. The "failing test" is the current live behavior. Record it first:
```bash
# Against the LIVE store (baseline, before any change):
curl -s "https://activepaw.co.uk/search?q=pet+feeding&type=product" \
  | grep -o "Pairs well\|Search match\|Build a feeding" | sort | uniq -c
```
Expected BEFORE fix: `Build a feeding…` present and **6× "Pairs well"** (the off-topic dump) alongside `1× Search match`. This is the bug to eliminate.

- [ ] **Step 2: Replace the assign block + grid + offer section in `sections/main-search.liquid`**

Replace lines 16-115 (from `{% liquid` through the `{% else %}…</div>` empty-state, i.e. everything between `{% paginate search.results by 24 %}` and the `{% if paginate.pages > 1 %}` block) with:

```liquid
        {% liquid
          assign product_count = 0
          # Boundary-safe membership string: leading AND trailing comma so a short
          # id ('2,') can never substring-match a longer one ('12,').
          assign result_product_ids = ','
          for item in search.results
            if item.object_type == 'product' and item.available
              assign product_count = product_count | plus: 1
              assign result_product_ids = result_product_ids | append: item.id | append: ','
            endif
          endfor

          assign normalized_terms = search.terms | downcase
          assign offer_collection_handle = 'more-to-love'
          if normalized_terms contains 'food' or normalized_terms contains 'feed' or normalized_terms contains 'bowl' or normalized_terms contains 'water'
            assign offer_collection_handle = 'pet-accessories'
          elsif normalized_terms contains 'toy' or normalized_terms contains 'play' or normalized_terms contains 'scratch'
            assign offer_collection_handle = 'pet-toys'
          elsif normalized_terms contains 'health' or normalized_terms contains 'dental' or normalized_terms contains 'tooth' or normalized_terms contains 'clean teeth'
            assign offer_collection_handle = 'pet-health'
          elsif normalized_terms contains 'groom' or normalized_terms contains 'brush' or normalized_terms contains 'wash' or normalized_terms contains 'shampoo' or normalized_terms contains 'paw' or normalized_terms contains 'clean'
            assign offer_collection_handle = 'pet-cleaning'
          endif
          assign offer_collection = collections[offer_collection_handle]

          # Suggestions fill in ONLY when the native grid is thin (< 4 real matches),
          # capped at 3, and only when query-relevant (a query token - 4-char prefix
          # for longer tokens - appears in the product title). This is what stops a
          # 'feeding' search surfacing leashes.
          assign suggestions_cap = 3
          assign show_suggestions = false
          if product_count > 0 and product_count < 4 and offer_collection != blank and offer_collection.products_count > 0
            assign show_suggestions = true
          endif
          # Comma-wrapped stop set (matched against ',token,') - generic words that
          # must not drive a "relevant" match. Tokens < 3 chars are dropped anyway.
          assign stop_tokens = ',pet,pets,for,the,and,with,your,'
          assign q_tokens = normalized_terms | split: ' '
        %}

        <div class="search-results-meta">
          <strong>{{ product_count }} product{% unless product_count == 1 %}s{% endunless %}</strong>
          <span>Matched from your search</span>
        </div>

        {% if product_count > 0 %}
          <div class="commerce-grid search-results-grid">
            {% for item in search.results %}
              {% if item.object_type == 'product' and item.available %}
                {% render 'product-card-commerce', product: item, badge: 'Search match', show_purchase_action: true %}
              {% endif %}
            {% endfor %}

            {% if show_suggestions %}
              {% assign suggested_count = 0 %}
              {% capture suggestion_cards %}
                {% for offer_product in offer_collection.products %}
                  {% if suggested_count >= suggestions_cap %}{% break %}{% endif %}
                  {% liquid
                    assign offer_product_signature = ',' | append: offer_product.id | append: ','
                    assign is_duplicate_result = false
                    if result_product_ids contains offer_product_signature
                      assign is_duplicate_result = true
                    endif
                    assign title_l = offer_product.title | downcase
                    assign is_query_relevant = false
                    for tk in q_tokens
                      assign tkz = tk | strip
                      assign tklen = tkz | size
                      if tklen < 3
                        continue
                      endif
                      assign tkc = ',' | append: tkz | append: ','
                      if stop_tokens contains tkc
                        continue
                      endif
                      if tklen > 4
                        assign probe = tkz | slice: 0, 4
                      else
                        assign probe = tkz
                      endif
                      if title_l contains probe
                        assign is_query_relevant = true
                        break
                      endif
                    endfor
                  %}
                  {% if offer_product.available and is_duplicate_result == false and is_query_relevant %}
                    {% render 'product-card-commerce', product: offer_product, badge: 'Suggested', show_purchase_action: true %}
                    {% assign suggested_count = suggested_count | plus: 1 %}
                  {% endif %}
                {% endfor %}
              {% endcapture %}

              {% if suggested_count > 0 %}
                <div class="search-suggested-sep" role="separator">
                  <span>Suggested for this search · from our supplier network</span>
                </div>
                {{ suggestion_cards }}
              {% endif %}
            {% endif %}
          </div>
        {% else %}
          <div class="search-empty">
            <strong>No product matches yet</strong>
            <span>Try a broader search like grooming, toy, feeder, bowl, leash, or cleaning.</span>
          </div>
        {% endif %}
```

Note: this removes the `data-bundle-add` "Add recommended set" button (it lived in the old offer section and is out of scope). The `data-bundle-add` handler in `assets/theme.js:250` becomes dormant on search - leave it; it is harmless with no button present.

- [ ] **Step 3: Add the in-grid separator style to `assets/theme.css`**

Add near the other `.search-*`/`.commerce-grid` rules. First open `assets/theme.css` and read the `.search-results-meta span` rule to copy its exact muted color token (the theme's own variable) - do not invent a variable name. Then add (substituting the muted color you found for `<MUTED>` and the border color for `<BORDER>`):
```css
.search-suggested-sep {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 6px 0 0;
  color: <MUTED>;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
}
.search-suggested-sep::before,
.search-suggested-sep::after { content: ""; flex: 1 1 auto; height: 1px; background: <BORDER>; }
.search-suggested-sep span { flex: 0 0 auto; }
```

- [ ] **Step 4: Verify on the dev server (this is the test)**

```bash
# Start once (after ALL edits batched), from F:\Projects\Shopify\demo-store2:
shopify theme dev --store 4qkudm-ez.myshopify.com
# Then, in another shell:
curl -s "http://127.0.0.1:9292/search?q=pet+feeding&type=product" \
  | grep -o "search-suggested-sep\|Suggested<\|Pairs well\|Search match" | sort | uniq -c
```
Expected AFTER fix: **zero** `Pairs well`; at most **3** `Suggested`; the `search-suggested-sep` appears only if ≥1 suggestion survived the query filter. Repeat for `q=dog+toy` (expect toy-relevant suggestions only), `q=shampoo` (cleaning-relevant), and a query with ≥4 real results (expect **no** suggestions at all - thin-gate off).

Also confirm a suggestion's title actually shares a query token (open the page in a browser via the dev URL and eyeball the trailing "Suggested" cards) - no leashes under a feeding search.

- [ ] **Step 5: Commit**

```bash
git add sections/main-search.liquid assets/theme.css
git commit -m "fix(search): query-relevant, capped, thin-gated suggestions merged into the results grid"
```

---

### Task 2: Restrict native search fields to kill description/tag noise

**Files:**
- Modify: `sections/site-header.liquid:26-43` (the search `<form>`)

**Interfaces:**
- Consumes: Shopify storefront search form parameters. `options[fields]` accepts a comma-separated subset of the searchable fields (default includes `title, product_type, tag, vendor, variants.title, variants.sku, variants.barcode, body/description`). Restricting it drops body/vendor/SKU noise while keeping the meaningful fields.
- Produces: a search form that submits `options[fields]=title,product_type,tag,variants.title`.

**Why:** native Shopify search matches `body_html`/vendor/SKU by default, so a product whose *description* mentions "feeding" ranks for "pet feeding". Restricting fields removes that class of false match for every query. (For "pet feeding" the main grid is already thin, so the visible win is larger on broader queries; do it as relevance hygiene.)

- [ ] **Step 1: Record baseline result counts (the test)**

```bash
for q in "pet+feeding" "dog" "brush" "clean"; do
  printf "%s: " "$q"
  curl -s "https://activepaw.co.uk/search?q=$q&type=product" | grep -o "result[s]* found" | head -1
done
```
Note each query's "N result(s) found" so you can confirm the restriction does not zero-out legitimate searches.

- [ ] **Step 2: Add the hidden `options[fields]` input to the form**

In `sections/site-header.liquid`, immediately after the existing `<input type="hidden" name="type" value="product">` (line 36), add:
```liquid
      <input type="hidden" name="options[fields]" value="title,product_type,tag,variants.title">
```

- [ ] **Step 3: Verify on the dev server (the test)**

```bash
# With shopify theme dev running:
for q in "pet+feeding" "dog" "brush" "clean"; do
  printf "%s: " "$q"
  curl -s "http://127.0.0.1:9292/search?q=$q&type=product&options%5Bfields%5D=title,product_type,tag,variants.title" \
    | grep -o "result[s]* found" | head -1
done
```
Expected: result counts are **equal or lower** than baseline, and spot-checking a previously-irrelevant query no longer returns the description-only matches. **If any legitimate query drops to 0**, widen the field list (e.g. add `vendor`) and re-verify - do not ship a restriction that hides real products. If `options[fields]` does not change behavior at all on this store, fall back to recommending Shopify **Search & Discovery** ranking config to the merchant and revert this input.

- [ ] **Step 4: Commit**

```bash
git add sections/site-header.liquid
git commit -m "fix(search): restrict native search to title/type/tag/variant-title (drop description noise)"
```

---

# STAGE 2 - Live supplier feed (ghost cards) in the grid (gated on App Proxy)

> **PREREQUISITE - Task 3 below.** Stage 2 cannot be verified live until the `/apps/pawscout` App Proxy routes to the worker; today `https://activepaw.co.uk/apps/pawscout/proxy/search` returns **404**. Build Tasks 4-7, but their live verification waits on Task 3.
>
> **MUST-FIX BEFORE WIRING - Task 3b (worker pet-scoping).** The live feed as built is NOT pet-safe: `searchBackfill` calls `cj.search(keyword)` with the RAW keyword (no category filter), and the live gate `liveCjPasses` only checks popularity/price/species/title-token - it "trusts CJ's relevance". The pet guard `isLikelyPetProduct()` + LLM curation run ONLY on the import path (`jobs.ts:348`, `proxy/import.ts`), so a `shampoo` search would DISPLAY human/baby/car shampoo as ghost cards (rejected only on click → show-then-fail). Task 3b must land before any ghost card is shown.

### Task 3 (ops prerequisite): Enable + verify the App Proxy

**Not a code change - a Shopify Partner Dashboard setting the merchant performs.**

- [ ] **Step 1:** In the Partner Dashboard → the PawScout app → **App setup → App proxy**, set: Subpath prefix = `apps`, Subpath = `pawscout`, Proxy URL = `https://pawscout.activepaw.co.uk`. (This is documented as previously registered in `docs/superpowers/specs/2026-06-07-pawscout-worker-foundation-design.md:58`, but is currently not routing.)
- [ ] **Step 2: Verify it forwards + signs (the test):**
```bash
curl -s "https://activepaw.co.uk/apps/pawscout/proxy/search?q=dog%20toy&limit=3" | head -c 300
```
Expected: JSON `{"ok":true,"products":[...]}` (Shopify adds the HMAC `signature`; the worker's `verifyAppProxy` passes). Today this returns `404 Not Found` → proxy not yet active. Do not proceed to live-verify Tasks 5-6 until this returns JSON.

---

### Task 3b (worker, must-fix): pet-scope the supplier search so non-pet products never display

**Files:**
- Modify: `pawscout-worker/src/cj.ts` (`search`/`searchV2` - accept an optional pet category scope)
- Modify: `pawscout-worker/src/proxy/search.ts` (`searchBackfill` - scope the CJ query + apply a strengthened pet floor to live results)
- Modify: `pawscout-worker/src/proxy/search.ts` (`isLikelyPetProduct` - add a strict variant that REQUIRES a pet signal)
- Test: `pawscout-worker/tests/search.test.ts`

**Why:** verified in code - the live feed returns whatever CJ's keyword search returns. CJ sells human/baby/car products; `cj.search("shampoo")` includes human shampoo. The store catalog is safe (import-time pet gate), but the *display* feed is not. This is independent of the App Proxy and is **testable now** (mock the CJ client).

**Interfaces:**
- Produces: `searchBackfill` returns only pet-relevant `GhostCard`s. Add `isPetProductStrict(text): boolean` - returns true only when a PET_TOKEN is present (no "ambiguous admits"), used on the live feed where false positives are worst.

- [ ] **Step 1: Write the failing test** - a mocked CJ client returns `[{ pid:'h1', nameEn:'Moisturizing Argan Hair Shampoo 500ml', ... }, { pid:'p1', nameEn:'Pet Dog Shampoo Oatmeal', ... }]` for query `shampoo`; assert `searchBackfill(...)` returns only `p1` (the human shampoo is dropped). Test fails today (both returned).

- [ ] **Step 2: Implement the strict pet floor** in `proxy/search.ts`:
```ts
/** Live-feed pet gate: REQUIRE an explicit pet signal (no ambiguous admits). */
export function isPetProductStrict(text: string): boolean {
  const words = (text || '').toLowerCase().split(/[^a-z0-9]+/);
  return words.some((w) => PET_TOKENS.has(w));
}
```
Apply it in `searchBackfill`'s live-CJ branch: `const gated = items.filter((i) => !seen.has(i.pid) && liveCjPasses(i, cfg.gates, kw) && isPetProductStrict(i.nameEn));`. (Warehouse rows are already admission-gated, so the strict floor is only needed on the live-CJ items.)

- [ ] **Step 3: Category-scope the CJ query (primary fix).** Add an optional `categoryId?: string` to `cj.search`/`searchV2`, passing CJ listV2's category filter param when present (confirm the exact param name against CJ's listV2 API - likely `categoryId`; verify before relying on it). In `searchBackfill`, resolve the pet category for the query from `getKeywordMeta(...).category` (or the keyword→collection map) and pass its CJ category id. If no category resolves, fall back to keyword-only + the strict floor from Step 2.

- [ ] **Step 4: Run the test** - `npx vitest run tests/search.test.ts`; expect the human shampoo dropped, pet shampoo kept. Add a case asserting a query that resolves to a pet category scopes the CJ call.

- [ ] **Step 5: Commit** (worker repo):
```bash
git add src/cj.ts src/proxy/search.ts tests/search.test.ts
git commit -m "fix(search): pet-scope the live supplier feed (strict pet floor + CJ category filter)"
```

---

### Task 4: Emit a supplier-feed mount node from `main-search.liquid`

**Files:**
- Modify: `sections/main-search.liquid` (inside the `{% if product_count > 0 %}` grid block, after the suggestion block, still inside `.commerce-grid` is fine OR immediately after the grid `</div>`)

**Interfaces:**
- Produces: a single hidden mount element the Stage-2 JS reads: `#supplier-feed[data-q][data-have]`. JS appends ghost cards into the existing `.search-results-grid`.

- [ ] **Step 1:** After the main `.commerce-grid` closing `</div>` (still inside `{% if product_count > 0 %}`), add:
```liquid
          <div id="supplier-feed"
               data-q="{{ search.terms | escape }}"
               data-have="{{ product_count }}"
               hidden></div>
```
(`exclude` of already-shown CJ pids is omitted in v1 - the worker dedups by warehouse/title signature, and the feed only runs on thin grids where overlap is unlikely. Add `data-exclude` later if duplicates are observed.)

- [ ] **Step 2: Commit**
```bash
git add sections/main-search.liquid
git commit -m "feat(search): emit #supplier-feed mount node for the live supplier feed"
```

---

### Task 5: Fetch + render supplier ghost cards into the grid

**Files:**
- Modify: `assets/theme.js` (add a search-page module near the bottom, after existing DOMContentLoaded wiring)
- Modify: `assets/theme.css` (ghost-card badge style; reuse `.commerce-card`)

**Interfaces:**
- Consumes: `#supplier-feed` (Task 4); `GET /apps/pawscout/proxy/search?q=&have=&limit=3` → `{ ok, products: GhostCard[] }`.
- Produces: up to 3 `<article class="commerce-card commerce-card--ghost">` appended to `.search-results-grid`, each carrying `data-pid`, `data-state`, `data-url`. No quick-add form.

- [ ] **Step 1:** Add this module to `assets/theme.js` (append near the other init code; uses the existing global patterns - plain DOM, `fetch`):
```js
// --- Live supplier feed on the search page (ghost cards) ---
(function supplierFeed() {
  var mount = document.getElementById('supplier-feed');
  var grid = document.querySelector('.search-results-grid');
  if (!mount || !grid) return;
  var q = (mount.getAttribute('data-q') || '').trim();
  var have = parseInt(mount.getAttribute('data-have') || '0', 10) || 0;
  if (!q || have >= 4) return; // only fill thin grids (matches Stage-1 gate)

  var url = '/apps/pawscout/proxy/search?q=' + encodeURIComponent(q) + '&have=' + have + '&limit=3';
  fetch(url, { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.ok || !Array.isArray(data.products) || !data.products.length) return;
      var sep = document.createElement('div');
      sep.className = 'search-suggested-sep';
      sep.setAttribute('role', 'separator');
      sep.innerHTML = '<span>From our supplier network</span>';
      // Only add a separator if Stage-1 hasn't already added one this render.
      if (!grid.querySelector('.search-suggested-sep')) grid.appendChild(sep);
      data.products.forEach(function (p) { grid.appendChild(renderGhostCard(p)); });
    })
    .catch(function () { /* CJ/worker down → show native results only (spec §10) */ });

  function money(n) { return '£' + (Math.round(Number(n) * 100) / 100).toFixed(2); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

  function renderGhostCard(p) {
    var el = document.createElement('article');
    el.className = 'commerce-card commerce-card--ghost';
    el.setAttribute('data-pid', p.pid);
    el.setAttribute('data-state', p.state);
    if (p.url) el.setAttribute('data-url', p.url);
    // Imported → real PDP link; ghost → button that triggers import+poll (Task 6).
    var media = '<div class="commerce-media">' + (p.image ? '<img loading="lazy" src="' + esc(p.image) + '" alt="' + esc(p.title) + '">' : '') +
      '<span class="commerce-badge">From our network</span></div>';
    var body = '<div class="commerce-card-body"><h3>' + esc(p.title) + '</h3>' +
      '<div class="commerce-card-footer"><strong>' + money(p.price) + '</strong></div></div>';
    if (p.url) {
      el.innerHTML = '<a class="commerce-card-link" href="' + esc(p.url) + '">' + media + body + '</a>';
    } else {
      // NO quick-add: a single CTA that opens the product (import handshake).
      el.innerHTML = '<button type="button" class="commerce-card-link commerce-card-ghost-cta" data-ghost-open>' + media + body +
        '<span class="commerce-card-ghost-hint">View product</span></button>';
    }
    return el;
  }
})();
```

- [ ] **Step 2:** Add ghost-card styling to `assets/theme.css` (reuse `.commerce-card`; the `--ghost` button must look like the card link). Read the existing `.commerce-card-link`, `.commerce-media`, and `.commerce-badge`/badge rules first and mirror them:
```css
.commerce-card-ghost-cta { width: 100%; text-align: left; background: none; border: 0; padding: 0; cursor: pointer; font: inherit; color: inherit; display: block; }
.commerce-card-ghost-hint { display: block; padding: 8px 14px 14px; font-size: 13px; font-weight: 600; }
.commerce-card--ghost.is-loading { opacity: .65; pointer-events: none; }
```

- [ ] **Step 3: Verify** (requires Task 3 live). With the proxy active:
```bash
curl -s "http://127.0.0.1:9292/search?q=automatic+feeder&type=product" | grep -c "supplier-feed"
```
Confirm the mount node renders; then load the dev URL in a browser on a thin-result query and confirm up to 3 "From our network" cards append after the native results, none with a quick-add button. If the proxy is not yet live, the module no-ops gracefully (the `.catch`/`!data.ok` paths) - confirm the page still renders native results with no console error.

- [ ] **Step 4: Commit**
```bash
git add assets/theme.js assets/theme.css
git commit -m "feat(search): fetch + render live supplier ghost cards into the results grid"
```

---

### Task 6: Ghost-card click → import → poll → redirect

**Files:**
- Modify: `assets/theme.js` (extend the supplier-feed module)
- Modify: `assets/theme.css` (spinner/loading state)

**Interfaces:**
- Consumes: `GET /apps/pawscout/proxy/product?pid=` (starts background import, returns preview); `GET /apps/pawscout/proxy/import-status?pid=` → `{ ok, state, url }`.
- Produces: clicking a ghost CTA imports the product and navigates to the real `/products/{handle}` PDP once `state==='imported'`.

- [ ] **Step 1:** Add a delegated click handler inside the `supplierFeed` IIFE (before its close):
```js
  grid.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-ghost-open]');
    if (!btn) return;
    var card = btn.closest('.commerce-card--ghost');
    if (!card || card.classList.contains('is-loading')) return;
    var pid = card.getAttribute('data-pid');
    var known = card.getAttribute('data-url');
    if (known) { window.location.assign(known); return; }
    card.classList.add('is-loading');
    var hint = card.querySelector('.commerce-card-ghost-hint');
    if (hint) hint.textContent = 'Finding this in our network…';

    // Reaching /proxy/product starts the background import.
    fetch('/apps/pawscout/proxy/product?pid=' + encodeURIComponent(pid), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok && d.product && d.product.url) { window.location.assign(d.product.url); return; }
        pollStatus(pid, card, hint, 0);
      })
      .catch(function () { failGhost(card, hint); });
  });

  function pollStatus(pid, card, hint, tries) {
    if (tries > 20) { failGhost(card, hint); return; } // ~20 × 1.5s ≈ 30s budget (spec §4: first product ~4s)
    setTimeout(function () {
      fetch('/apps/pawscout/proxy/import-status?pid=' + encodeURIComponent(pid), { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok && d.url) { window.location.assign(d.url); return; }
          pollStatus(pid, card, hint, tries + 1);
        })
        .catch(function () { pollStatus(pid, card, hint, tries + 1); });
    }, 1500);
  }
  function failGhost(card, hint) {
    card.classList.remove('is-loading');
    if (hint) hint.textContent = 'Temporarily unavailable - try again';
  }
```
(Note: `/proxy/product` returns `{ ok, product }` where `product` is a preview object; if it already carries a `url` (already-imported), redirect immediately; otherwise poll `/proxy/import-status` for the handle. If the worker's preview shape lacks `url`, rely solely on the poll - verify the actual field name against `buildPreview` in the worker during implementation.)

- [ ] **Step 2:** Add a loading spinner style to `assets/theme.css`:
```css
.commerce-card--ghost.is-loading .commerce-card-ghost-hint::after {
  content: ""; display: inline-block; width: 12px; height: 12px; margin-left: 8px; vertical-align: -2px;
  border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 3: Verify** (requires Task 3 live): on a thin-result search, click a "From our network" ghost card → hint shows "Finding this in our network…" with spinner → within ~5s the browser navigates to a real `/products/{handle}` PDP with an add-to-cart button. Confirm a second click of the same term later (now imported) links straight through (no spinner). If the proxy is down, the CTA fails gracefully to "Temporarily unavailable".

- [ ] **Step 4: Commit**
```bash
git add assets/theme.js assets/theme.css
git commit -m "feat(search): ghost-card click triggers import, polls, redirects to the live PDP"
```

---

## Self-Review notes (author)

- **Spec coverage:** relevance bug → Task 1 (offer query-filter) + Task 2 (native fields); merge into main listing → Task 1 (suggested cards in grid) + Tasks 4-6 (live supplier ghost cards in grid); above-the-fold/mobile → in-grid render replaces the below-fold `.search-offer` section; thin-only + cap 3 + labelled → Task 1 gate/cap/badge + Stage-2 reuse; dedup bug → Task 1 Step 2 (comma-wrapped membership).
- **Stage independence:** Stage 1 ships and fixes the live complaint with zero infra. Stage 2 is purely additive and gated on Task 3 (App Proxy), which is currently 404.
- **Type consistency:** GhostCard fields (`pid,title,image,price,state,url`) used identically in Tasks 5-6; `#supplier-feed[data-q][data-have]` produced in Task 4, consumed in Task 5.
- **Known approximations (acceptable for v1, documented not hidden):** Stage-1 relevance uses a 4-char-prefix title contains-match (no real stemming/synonyms - that's Stage 2's worker); `exclude` of shown CJ pids is omitted in v1 (worker dedups). Both err toward under-showing (relevant) rather than over-showing (irrelevant).

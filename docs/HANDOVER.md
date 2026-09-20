# Handover Brief - Active Paw · PawScout · Shopify · CJDropshipping

**Last updated:** 2026-06-09
**Audience:** the next developer picking this up cold.
**Read this first, then follow the document index (§13) into the specs.**

---

## 1. TL;DR - where we are, what's next

We are building a **signal-driven inventory populator** for a Shopify pet-care store. A visitor searches the store; if the results grid is thin, a backend service (PawScout) sources matching products from a dropshipping supplier (CJDropshipping), creates them as **real, published** Shopify products, and streams them into the results grid in real time. Every created product lands in a collection.

**Two codebases:**
- **`f:\Projects\Shopify\demo-store2`** - the **Active Paw** Shopify theme (Liquid) + Python Admin-API scripts + the `graphite` internal tool. (This repo. *Not* a git repo.)
- **`f:\Projects\Shopify\pawscout-worker`** - the **PawScout** Cloudflare Worker (multi-tenant SaaS backend). (Its own git repo.)

**Status at a glance:**

| Piece | Status |
|---|---|
| Active Paw theme + supplier metafield contract + quantity caps | ✅ Live in theme |
| Python CJ-import pipeline (import → images → inventory → publish → collections) | ✅ Working |
| Latency probe (does the progressive-fill idea hold?) | ✅ Done - numbers confirm it (§7) |
| **PawScout worker foundation (Plan 2a)** - auth, vault, tenant isolation, install, console | ✅ **Deployed live + installed on the store** (verified 2026-06-09, §6) |
| **Plan 2b** - search-trigger pipeline + collection-mapping UI + theme progressive-fill | 🟡 **Designed, NOT built** (§8) |

> **⏭️ THE NEXT ACTION:** the collection-mapping UI design (`docs/superpowers/specs/2026-06-08-pawscout-collection-mapping-design.md`) is written and was in **spec review**. The next step is to turn it (and the rest of Plan 2b) into an implementation plan via the `writing-plans` skill, then build it. See §8 and §14.

---

## 2. The four systems and how they relate

```
  Visitor ──search──▶ Active Paw (Shopify theme)
                          │  thin grid? POST signal via Shopify App Proxy (HMAC)
                          ▼
                    PawScout (Cloudflare Worker)
                          │  query CJ, gate, dedup
            ┌─────────────┼──────────────┐
            ▼             ▼               ▼
     CJDropshipping   Shopify Admin    D1 / KV / vault
     (supplier API)   API (create +    (tenant data +
                      publish product)  encrypted creds)
```

- **Active Paw** = the storefront. A custom Shopify theme. It *displays* supplier intelligence (availability, caps) read from Shopify metafields - it **never** calls a supplier API from the browser.
- **PawScout** = the brain. A standalone multi-tenant SaaS on Cloudflare. It's the only thing that talks to CJ and to the Shopify Admin API. Active Paw is its **tenant #1**; the same rails serve other merchants later.
- **Shopify** = the commerce platform. Two interfaces: **App Proxy** (storefront → PawScout, signed) and **Admin API** (PawScout → store, server-side, with the store's token).
- **CJDropshipping (CJ)** = the first supplier, behind a `SupplierProvider` interface so others slot in later. Source of products, images, price, stock, and (later) order fulfillment.

**BYOC ("Bring Your Own Credentials")** is the core model: each merchant supplies their *own* CJ key (and Shopify token). PawScout never uses its own supplier account to serve others - this is what keeps it ToS-clean (§11).

---

## 3. Repos, paths, and how to run things

### demo-store2 (theme + scripts + tooling)
- **No build step.** Edit `assets/theme.css` / `assets/theme.js` directly.
- Deploy theme: `shopify theme push` · preview: `shopify theme dev` (store handle `4qkudm-ez.myshopify.com`).
- Python scripts: stdlib-only, run `python <script>.py`. Credentials in `.env` (gitignored) + tokens embedded in script headers.
- ⚠️ **Read `docs/shopify-theme-dev-troubleshooting.md` before debugging a wedged `theme dev`** (editing files while it runs can break sync - never kill `claude.exe`).

### pawscout-worker (the SaaS)
- Stack: **Cloudflare Worker · Hono · TypeScript · D1 · KV · WebCrypto vault · @shopify/shopify-api**.
- Commands (from `package.json`):
  - `npm run dev` - local wrangler dev
  - `npm test` - vitest (full suite exists)
  - `npm run typecheck` - `tsc --noEmit`
  - `npm run migrate:local` / `migrate:remote` - apply D1 migrations
  - `npm run deploy` - `wrangler deploy`
- Config (`wrangler.toml`): custom domain **`pawscout.activepaw.co.uk`**, D1 db `pawscout` (id provisioned), public Shopify app client id, scopes `write_products,read_products,write_publications,read_publications`.
- **Secrets** (NOT in repo): `SHOPIFY_API_SECRET`, `PAWSCOUT_MASTER_KEY` - set via `wrangler secret put` (prod) and `.dev.vars` (local). The master key is the envelope-encryption KEK for the credential vault.

---

## 4. Active Paw theme - what to know

- Single-file CSS (`assets/theme.css`) and JS (`assets/theme.js`), no framework/bundler. Sections in `sections/`, partials in `snippets/`, JSON templates in `templates/`.
- **Supplier metafield contract (the core data boundary).** The theme reads supplier intelligence ONLY from Shopify metafields in the `supplier` namespace - never from live supplier calls. The worker writes eight PRODUCT-level keys and nothing on variants (corrected 2026-09-20; the spec follows the writer). Full spec: `docs/shopify-supplier-metafields.md`. Keys summarized in `CLAUDE.md`.
- **Quantity-cap priority** (decided once, in `snippets/supplier-availability.liquid`): tracked Shopify inventory, else the hardcoded `20` fallback. Supplier quantities never cap a variant (corrected 2026-09-20).
- **Collections** (smart/rule-based): `pet-cleaning`, `pet-accessories`, `pet-health`, `pet-toys`. PDP related-products walks `product.collections` in that priority order. (`more-to-love` retired 2026-07-06.)
- **Theme settings**: `demo_brand_name` (default "Active Paw"), `brand_logo`, `favicon`, `color_ink/accent/surface` (`config/settings_schema.json`).
- **Copy rule:** always say **"Collections"**, never "Categories."
- Recent UX work is logged append-only in `docs/design-improvements.md` (Entries 1-14).

---

## 5. Python scripts (the CJ import pipeline)

All stdlib-only, run directly. The working pipeline (demo store seeding):

`discover-cj-category-products.py` → `import-cj-category-products.py` (creates draft products + `ensure_collections()`) → `attach-cj-product-images.py` → `set-cj-inventory-one.py` → `categorize-store-products.py` → `publish-products-online-store.py` / `publish-home-collections-online-store.py`.

Support modules: `cj_client.py` (CJ API - the reference logic PawScout's TS reimplements), `shopify_admin.py` / `shopify_product.py` (Admin API), `store_collections.py`, `probe_lib.py` + `pawscout-timing-probe.py` (the latency probe), `cj_probe.py`.

> **Imported products carry `cj-cat-*` and `cj-pid-*` tags.** Smart collections include them by a `TAG EQUALS "cj-cat-<category>"` rule. **This is load-bearing for the conflict in §9 - read it.**

---

## 6. PawScout worker - what's BUILT (Plan 2a)

Spec: `docs/superpowers/specs/2026-06-07-pawscout-worker-foundation-design.md` · Plan: `docs/superpowers/plans/2026-06-07-pawscout-worker-foundation.md`.

**Module map (`pawscout-worker/src/`), all committed + tested:**

| Module | Responsibility |
|---|---|
| `vault.ts` | WebCrypto **envelope encryption** of tenant credentials (master key → per-tenant ciphertext in D1). |
| `tenant-store.ts` | **Tenant-isolated D1 access** - the only path to tenant tables, auto-injects `WHERE tenant_id = ?`. |
| `cj.ts` | CJ API key **validation** (test call before storing). |
| `shopify.ts` | `@shopify/shopify-api` init with the Cloudflare-Worker adapter. |
| `auth/install.ts`, `callback.ts`, `ensure-installed.ts`, `uninstall.ts` | Shopify **managed installation + token exchange** (2026 model, not legacy OAuth callback). Offline token sealed for background jobs; uninstall webhook purges tenant secrets. |
| `console/session.ts`, `routes.ts`, `page.ts` | Embedded admin **console**: session-token shop resolution; API routes (`connect-cj`, `gates`, `collections`, `status`); the dark-themed App Bridge v4 UI. |
| `index.ts` | Hono app wiring. |
| `migrations/0001_init.sql` | D1 schema (tenants, credentials, stores, store_suppliers, matches, runs, audit_log, notify_prefs - see design §5). |

**Test suite** (`tests/`): `vault`, `tenant-store`, `guard` (**CI guard that fails the build on any unscoped D1 query** - the load-bearing security artifact), `cj`, `callback`, `ensure-installed`, `session`, `uninstall`, `config`.

**Security model** (design §6): tenants are mutually untrusted and we hold their credentials. Envelope-encrypted vault, `TenantStore`-only access, CI guard against unscoped queries, audit log, parameterized binds, log scrubbing.

**Install model** (memory: token-exchange managed install): Shopify 2026 managed installation; scopes come from app config, not worker code; offline token sealed in the vault for background use.

> **✅ Verified live (2026-06-09).** Plan 2a is **deployed and installed end-to-end**, not just coded:
> - **Worker deployed** to Cloudflare (account `bmorris0565@gmail.com`); `GET https://pawscout.activepaw.co.uk/app` returns the console (HTTP 200), `POST /api/status` runs the auth code. Deployments + a "Secret Change" dated 2026-06-08 (so `SHOPIFY_API_SECRET` + `PAWSCOUT_MASTER_KEY` are set).
> - **App installed** on `4qkudm-ez.myshopify.com` - production D1 `tenants` row is `status=active`, `installed_at=2026-06-08T08:58Z` (managed-install token exchange completed, offline token sealed).
> - **CJ connected** - `supplier_credentials` has supplier `cj` validated `2026-06-08T09:15Z`; `tenant_config` seeded (target 16).
>
> How to re-check yourself (read-only): `cd pawscout-worker && npx wrangler deployments list`, then `npx wrangler d1 execute pawscout --remote --command "SELECT shop, status, installed_at FROM tenants;"`. Load the console live at `https://pawscout.activepaw.co.uk/app` (it renders standalone; full App Bridge auth needs to be opened inside the Shopify admin). Granted scopes on the token are the `write_*` set (`write_products`,`write_publications`) - Shopify treats `write_*` as implying the matching `read_*`.

---

## 7. The product direction + the measured latency budget

Spec: `docs/superpowers/specs/2026-06-07-pawscout-search-trigger-design.md` (companion to the main design `2026-06-07-pawscout-design.md`).

**Three triggers create inventory**, all collection-assigned: (1) scheduled trending scan, (2) **visitor search that comes up short** (the focus), (3) merchant manual add. **Cart/checkout/fulfillment-binding is out of scope for now** - "nothing reaches the cart that isn't real inventory with proper info." Search-result tiles for pipeline products have **no quick-add**; the visitor must open the PDP, by which time the product is published and buyable.

**Why the PDP is safe even though search isn't:** publishing makes `/products/{handle}` live in <0.5s, independent of Shopify's (laggy) search index.

**Measured (2026-06-07, live store, `pawscout-probe-report.json`):**
- Cold-search **first product PDP-ready & buyable ≈ 4.15s**.
- Subsequent products **≈ 1.4s apart** (no throttling at 8 back-to-back).
- Publish → PDP live **P90 0.44s**. Image processing (~2.3s) is **off** the critical path - show CJ's own image URL meanwhile.
- A full cold 16-tile grid ≈ **25-40s**; existing inventory renders instantly, pipeline tiles stream in. Per-term cache + permanent inventory mean only the *first* searcher of a term pays the cold cost.

The probe **confirmed the progressive-fill UX is viable** on these numbers. `listV2` carries enough (`nameEn`, `bigImage`, `sellPrice`, `id`, `listedNum`) for minimal-create + tile + gate + dedup, so the per-product CJ detail call moves to async enrichment off the hot path.

---

## 8. What's DESIGNED but NOT built - Plan 2b (the active frontier)

Plan 2b = **worker pipeline + theme progressive-fill + collection-mapping UI**. Specs exist; **no implementation plan or code yet.**

1. **Search-trigger pipeline (worker)** - App Proxy endpoints `/apps/pawscout/search-signal` + `/apps/pawscout/search-status`; CJ `listV2` query + per-term cache; quality gating (§5 of search-trigger spec); dedup vs existing inventory (by `supplier.cj_product_id`); minimal product create → publish → collection-tag → mark ready; async enrich. Detailed in the search-trigger spec.
2. **Collection-mapping UI (worker + console)** - `docs/superpowers/specs/2026-06-08-pawscout-collection-mapping-design.md`. New files planned: `src/routing.ts` (`chooseCollection`), `src/shopify-collections.ts` (`fetchSmartCollections`, `ensureCollectionRule`), a "Collections" card in `console/page.ts`, routes in `console/routes.ts`, new `CollectionMapEntry` shape. **This is the piece that was in spec-review - turn it into a plan next.**
3. **Theme progressive-fill (Active Paw)** - `sections/main-search.liquid` renders existing results immediately, `theme.js` polls `search-status` and appends tiles (no quick-add). Not yet started.

---

## 9. ⚠️ The collection-rule conflict (must not be re-introduced)

Two existing Python scripts fight over the same five collection handles:
- `create-home-collections.py` writes `TYPE`/`TITLE` rules.
- `import-cj-category-products.py` → `ensure_collections()` **replaces** the whole ruleSet with `TAG EQUALS "cj-cat-<category>"` (`appliedDisjunctively: False` - destructive).

Whichever ran last owns the live rule - a coin-flip. **Resolution (design §11 of the collection-mapping spec):** PawScout becomes the single authority, **append-only**. `ensureCollectionRule` reads the current ruleSet and **appends** `TAG EQUALS <tag>` with `appliedDisjunctively: true` - never replaces. Active Paw **reuses the existing `cj-cat-*` tags** so already-imported products are retroactively collected with zero migration; new tenants use `pawscout-<handle>`. **Operational rule for Active Paw:** once the worker manages a collection, stop running `ensure_collections()` against it (or make it append-only too). Port `ensure_collections()` as the *reference* for `ensureCollectionRule`, with the one behavioural change (append not replace).

*(This conflict was surfaced by the `graphite` tool - see §12.)*

---

## 10. CJDropshipping integration

- **API key format:** `CJ<email>@api@<token>` (in `.env`, gitignored). Per-tenant in PawScout (one CJ account manages a tenant's many stores - CJ §IV.1.4).
- **Discovery:** `listV2` (`searchType=2` trending / keyword search; `orderBy` listing count). Reference impl in `cj_client.py`; PawScout reimplements in TS.
- **Detail:** `product/query` for variants/`vid` (moved off the hot path - see §7).
- **Fulfillment (future, separate module):** `createOrderV2` with `payType=2` (CJ Wallet) for own store; probe-safe testing via freight calc + `payType=3` + `deleteOrder`. ToS-clean for the operator's own store. (memory: pawscout-fulfillment.) **Not in current scope.**

---

## 11. Compliance & ToS (don't skip before commercializing)

- **CJ BYOC** clears the worst (§III.2/§III.11) - each subscriber is a first-party CJ customer. **Residual: CJ §IX.3(1)** (commercial use of platform content). Mitigations: reference-only (no catalog warehousing), and PawScout drives orders *to* CJ. **Secure a CJ partnership nod before charging (M2).** (memory: cj-tos-byoc.)
- **Own multi-store is CJ-compliant**; serving *other* merchants needs the partnership.
- **Shopify:** managed installation + token exchange (2026); public app needs the usual review + GDPR webhooks if going to App Store. Custom-app-per-merchant (BYOC token) avoids review (design §11 open Q).
- **Privacy:** PawScout holds subscribers' credentials + workflow data → needs a privacy policy + GDPR/CCPA deletion posture before public signup.

---

## 12. Internal tooling - `graphite` (zero-LLM knowledge graph)

Graphite, installed as a package (run `python -m graphite build .`). Deterministic, **0 LLM tokens**, ~0.4s incremental. Builds a navigable graph of the demo-store2 repo (`graph-out/graph.html` + `GRAPH_REPORT.md`). Docs: `GRAPHITE.md`. **Recently (2026-06-09):** fixed an O(n²) Python-extractor bug (~60× faster) and added an opt-in **`--semantic`** TF-IDF overlay that surfaces cross-file similarity links (0 tokens, additive, doesn't touch clustering).

### Proper usage - three modes, used at the right time

| Mode | Command | Tokens | Use it for |
|---|---|---|---|
| **Structural build** (default) | `python -m graphite build .` | **0** | Keep the navigable code map current. Run after landing **new modules/files**. |
| **Similarity overlay** | `python -m graphite build . --semantic` | **0** | Cheap cross-file **discovery hints** - browse `GRAPH_REPORT.md` "Cross-cutting semantic links" or search `graph.html`. |
| **Full LLM pass** | the `/graphite` skill | ~40k+ | **Reasoning-grade conflict detection** before a cross-system design decision. |

**Automated (2026-06-09):** the **structural build runs automatically** via a Claude Code **`Stop` hook** (`.claude/settings.json` → `.claude/graphite-autobuild.py`). It fires once per turn, is 0 tokens, self-bounds via the SHA256 manifest (no-ops in ~0.1s when nothing changed), and never blocks a turn (always exits 0). So the structural graph stays current with no manual action. **The `--semantic` overlay and the LLM `/graphite` pass are deliberately NOT automated** - they stay manual (see discipline below). To disable the auto-build, remove the `hooks` block from `.claude/settings.json`.

**The discipline (this is the part that matters):**
- The **zero-LLM structural build** is now automatic (above) - you rarely run it by hand. It only does work when structure actually changes; prose-only doc edits produce a near-zero delta.
- **Reserve the LLM `/graphite` pass for design checkpoints** - most importantly **at the top of Plan 2b**. It is the *only* mode that reasons about relationships and can catch a conflict like §9 (`ensure_collections` ↔ `appliedDisjunctively`). The zero-LLM build and the `--semantic` overlay give *structural + similarity hints only* - they surface that two files are *related*, never that a relationship is *dangerous*. **The overlay does NOT make the LLM pass optional.**
- **Never treat the graph as an input to code correctness.** It's a discovery/navigation aid; it does not change what code gets written. (See `GRAPHITE.md` for the full rationale and the honest limitations.)
- **Token economics:** the hybrid (free build routinely + one ~40k LLM pass at each cross-file checkpoint) is ~80% cheaper than running the LLM pass on every change, while still protecting against the expensive failure mode - an undetected cross-file conflict that causes rework.

---

## 13. Document index

| Doc | What it is |
|---|---|
| `docs/supplier-intelligence-platform-prd.md` | The long-term product vision (PRD). |
| `docs/superpowers/specs/2026-06-07-pawscout-design.md` | PawScout master design (multi-tenant BYOC SaaS). |
| `docs/superpowers/specs/2026-06-07-pawscout-search-trigger-design.md` | The visitor-search progressive-fill trigger + measured latency. |
| `docs/superpowers/specs/2026-06-07-pawscout-worker-foundation-design.md` | Worker foundation (Plan 2a) design. |
| `docs/superpowers/specs/2026-06-08-pawscout-collection-mapping-design.md` | Collection-mapping UI design (next to plan/build) + §11 rule reconciliation. |
| `docs/superpowers/plans/2026-06-07-pawscout-worker-foundation.md` | Plan 2a implementation plan (executed). |
| `docs/superpowers/plans/2026-06-07-pawscout-timing-probe.md` | Latency-probe plan (executed). |
| `docs/shopify-supplier-metafields.md` | The metafield data contract. |
| `docs/shopify-theme-dev-troubleshooting.md` | `theme dev` gotchas - read before debugging a wedged dev server. |
| `docs/shopify-theme-store-compliance.md` | Theme Store compliance notes. |
| `docs/design-improvements.md` | Append-only theme/tooling change log (Entries 1-14). |
| `TASKS.md` | Original Supplier-Intelligence backlog (some items superseded by the PawScout reframe). |
| `CLAUDE.md` (both repos' root) | Repo-specific operating instructions for AI assistants. |

---

## 14. Immediate next steps (ordered)

1. ~~Confirm worker deploy/install state~~ - ✅ done 2026-06-09: deployed + installed + CJ connected (§6). **The foundation is live; start building on it.**
2. **Plan Plan 2b (the real next action).** Use the `writing-plans` skill on the collection-mapping spec (`2026-06-08-...`) + search-trigger spec to produce a task-by-task implementation plan. The collection-mapping UI is the cleanest starting slice (console + `routing.ts` + `shopify-collections.ts`) - and `tenant_config.collection_map` is still empty in prod, so nothing depends on it yet.
3. **Build the collection-mapping UI** (worker) - append-only `ensureCollectionRule` (§9), `chooseCollection` routing, console "Collections" card. Has its own test plan in the spec §9.
4. **Build the search-trigger pipeline** (worker) - App Proxy endpoints, CJ query + cache, gating, dedup, create→publish→tag, status polling. Calibrate against the §7 numbers.
5. **Build theme progressive-fill** (Active Paw `main-search.liquid` + `theme.js`) - render existing results, poll status, append no-quick-add tiles.
6. **Before charging anyone:** CJ partnership nod + privacy policy (§11).

---

## 15. Environment gotchas (carry-over knowledge)

- **`theme dev` sync wedge** - editing a file while `shopify theme dev` runs can 500 the dev server (`*.liquid.tmp.<pid>` "illegal characters"). The `<pid>` is `claude.exe` - **never kill it**. Batch edits, then restart the `node` process on port 9292. Full playbook: `docs/shopify-theme-dev-troubleshooting.md`.
- **Always check contrast + theme congruence** on every screen - the console must look native to Shopify admin (dark-first), not just be readable. A screen isn't "done" until it's presentable AND congruent.
- **The dev PC is unreliable** (random shutdowns; one heavy op force-restarted it). Keep scans/builds/parallel fan-out bounded; prefer cloud/hosted for anything scheduled or always-on (PawScout is deliberately off the local PC on Cloudflare).
- **Say "Collections," never "Categories."**
- **Tokens:** never expose the CJ key or Shopify token in theme JavaScript. PawScout is the only thing that touches supplier/admin credentials.
```

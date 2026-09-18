# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- graphite:managed version=14 -->
## Shared Graphite Instructions

Graphite-first is required in this repo. Follow `GRAPHITE.md` before making non-trivial code changes: for cross-file questions (who-calls, where-defined, impact, data flow, structure) run the Graphite commands first; grep/glob are for literal text and filename lookups only. Fall back to manual search only after a Graphite answer proved insufficient, and say so. Use the existing `graph-out/graph.json` as the shared project graph, and do not edit `graph-out/` manually.

**Stay inside this repository.** Do not read, write, or run commands in any other repo, including its graph. Findings about another repo go to its agent as a recommendation through the shared `.agent-channel/` (see its `PROTOCOL.md`); that agent decides and acts. A tool doing its designed job is a separate question from an agent's boundary. See `GRAPHITE.md` section "Repository Isolation".
<!-- graphite:managed-end -->

## What this repo is

**Active Paw** - a Shopify theme (custom Liquid) paired with a set of Python Admin API scripts. The theme powers a pet-care demo store hosted at `4qkudm-ez.myshopify.com`. The Python scripts handle one-off data operations (product import, inventory, collection setup) against the Shopify Admin API and the CJDropshipping API.

The long-term direction is a **Supplier Intelligence Platform** (see `docs/supplier-intelligence-platform-prd.md`). The MVP scope and implementation sequence are tracked in `TASKS.md`.

## Credentials

`.env` holds the CJDropshipping API key (`CJ<email>@api@<token>` format). It is gitignored. Shopify Admin API calls in the Python scripts use the token embedded directly in the script headers (`STORE`, `TOKEN` constants). Never expose either token in theme JavaScript.

## Theme structure

```
layout/theme.liquid       # HTML shell - loads theme.css and theme.js
assets/theme.css          # All styles (single file, no build step)
assets/theme.js           # All client JS (single file, no build step, no framework)
config/settings_schema.json  # Theme settings: brand name, logo, favicon, ink/accent/surface colors
sections/                 # One file per page region
snippets/                 # Reusable partials rendered via {% render %}
templates/                # JSON templates that compose sections per page type
locales/                  # Translation strings
```

The theme has no bundler and no build step. Edit `assets/theme.css` and `assets/theme.js` directly. Deploy by pushing files to Shopify via the CLI or Theme Editor. The root `package.json` is dev tooling only (Playwright for browser checks, eslint for the Aramid gate, wrangler); `.shopifyignore` keeps it and every other root file out of the theme push.

## Supplier metafields (the core data contract)

The theme reads supplier intelligence exclusively from Shopify-backed metafields - **never** from direct browser calls to supplier APIs.

**Namespace:** `supplier`

Variant-level metafields drive availability display and cart limits:

| Key | Type |
|---|---|
| `supplier.name` | Single line text |
| `supplier.cj_product_id` / `supplier.cj_variant_id` | Single line text |
| `supplier.sku` / `supplier.warehouse` | Single line text |
| `supplier.status` | Single line text (`in_stock`, `low_stock`, `supplier_available`, `backorder_possible`, `unavailable`, `unknown_stale`) |
| `supplier.available_qty` / `supplier.max_order_qty` | Integer |
| `supplier.last_checked_at` | Date and time |
| `supplier.fulfillment_confidence` | Single line text (`High`, `Medium`, `Limited`) |

Product-level metafields are fallbacks for `name`, `status`, `warehouse`, `last_checked_at`, and `fulfillment_confidence`.

Full spec: `docs/shopify-supplier-metafields.md`.

## Quantity cap logic (implemented in theme)

Both `sections/main-product.liquid` (PDP) and `sections/main-cart.liquid` follow the same priority order:

1. **Tracked Shopify inventory** when `inventory_management` is set and `inventory_policy == 'deny'`
2. **`supplier.max_order_qty`** when present
3. **`supplier.available_qty`** when max order qty is absent
4. **Conservative fallback cap** (hardcoded `20`) when no trusted data exists

## Python scripts

> **Operational policy (2026-07-07, owner rule):** these scripts and `shopify_admin.py` are a dev-era one-off tool. **Do NOT use them for operational or feature Shopify work** - the `pawscout-worker` is the production Shopify integration and the sole operational Admin API actor. Never propose adding scopes to the scripts app or call its Admin API for a feature; build the capability into the worker instead. See `pawscout-worker/CLAUDE.md` ("The worker is the system").

All scripts use only the Python standard library (`urllib`, `json`, `pathlib`, `subprocess`, `time`). Run any of them directly with `python <script>.py`.

Key scripts:

| Script | Purpose |
|---|---|
| `import-cj-category-products.py` | Import CJ products by category into Shopify as drafts |
| `attach-cj-product-images.py` | Attach supplier images to imported Shopify products |
| `set-cj-inventory-one.py` | Set inventory quantities for CJ-sourced variants |
| `publish-products-online-store.py` | Publish draft products to the Online Store sales channel |
| `publish-home-collections-online-store.py` | Publish collections to the Online Store |
| `create-home-collections.py` | Create collections with smart rules via Admin API |
| `categorize-store-products.py` | Tag imported products with category metadata |

`.graphql` files are standalone query/mutation files used for manual Shopify Admin API exploration (not executed by the Python scripts - those build queries inline).

## Shopify CLI

To push theme changes to the store:

```sh
shopify theme push
```

To preview locally:

```sh
shopify theme dev
```

These require the Shopify CLI authenticated against the store. The store handle is `4qkudm-ez.myshopify.com`.

**Known `theme dev` gotcha (read before debugging a wedged dev server):** editing a theme file while `shopify theme dev` is running can wedge its sync - pages return 500 with title "Failed to Upload Theme Files" and the log shows `*.liquid.tmp.<pid>.<hash> contains illegal characters`. Cause: Claude Code's atomic Edit/Write creates a temp file the watcher tries to upload (the `<pid>` is the `claude.exe` process - **never kill it**). Your real edit still syncs ("Synced » update …" appears in the log). Fix: finish edits, kill **only** the `node` process on port 9292, then restart `theme dev`. **Prevention: batch all edits, then run `theme dev` once to verify.** Full playbook with copy-paste commands (and the auth-expiry + "linters pass but page is broken" gotchas): `docs/shopify-theme-dev-troubleshooting.md`.

## Fresh clone: arm the agent tooling

`.githooks/` is gitignored (each hook embeds this machine's Python path), so a fresh clone has the committed instructions and `-P` launch surfaces but no git hooks. Run:

```sh
npm install
python -P bootstrap-agent-tooling.py
```

The script runs `aramid init .` first and `python -P -m graphite init . --yes --strict` second. That order matters: both tools want `post-commit`, and only Graphite knows how to chain the other's copy (as `post-commit.local`). It then reads the hook files back and runs both doctors. `python -P bootstrap-agent-tooling.py --check` reports without changing anything. `requirements.txt` is intentionally empty of packages: the scripts are standard library only, and the file exists so the gate's pip-audit has a declared source to audit.

## Collections used in the theme

The home page and PDP related-products logic resolve against these collection handles:
`pet-cleaning`, `pet-accessories`, `pet-health`, `pet-toys`

The PDP walks `product.collections` in that priority order to find a related collection with more than one product. (The old `more-to-love` fallback collection was retired 2026-07-06: its members were all archived, and all theme references were removed.)

## Theme settings

Configured in Shopify admin (Theme Editor) or via `config/settings_schema.json`:

- `demo_brand_name` - display name replacing "Active Paw" throughout
- `brand_logo` / `favicon` - image pickers
- `color_ink` / `color_accent` / `color_surface` - CSS color tokens

All Liquid reads `settings.demo_brand_name | default: 'Active Paw'` as the fallback.

<!-- aramid:begin -- managed by `aramid init`; hand-edits inside the fence are overwritten -->
## Aramid (security & quality gate)

This repo is gated by aramid. Read `ARAMID.md` before your first commit.

- Before committing: run `aramid check --staged`. Read findings with
  `aramid ledger filter --status open`.
- NEVER pass `--no-verify` (or `-n`) to `git commit`, or `--no-verify` to
  `git push` -- it disables secret scanning along with everything else.
  Armed repos reject the call outright.
- To suppress a WARN finding, use `aramid override <id> --reason "..."`
  (ledger-logged); never edit findings away by hand.
<!-- aramid:end -->

# Active Paw — Shopify Theme

**Active Paw** ([activepaw.co.uk](https://activepaw.co.uk)) is a UK-based online pet store selling pet accessories, toys, grooming tools, and health products. The catalogue is fully demand-driven — it grows and self-optimises based on what real visitors search for and interact with, without any manual product curation.

This repository is the **Shopify Liquid storefront theme** — the visitor-facing half of the system. The backend intelligence lives in [`pawscout-worker`](https://github.com/jared0565/pawscout-worker).

| Repo | Role |
|---|---|
| `active-paw-theme` (**this repo**) | Shopify theme: search grid, ghost cards, preview modal, performance beacons. |
| [`pawscout-worker`](https://github.com/jared0565/pawscout-worker) | Cloudflare Worker: supplier search, quality gates, pricing, import pipeline, fulfilment automation, merchant console. |

---

## Why it was built

Traditional pet stores require constant manual effort to stay stocked: finding products, writing listings, managing prices, retiring dead stock. Active Paw was built to eliminate that entirely. The founding idea — **let customer demand decide what gets listed**. If visitors are searching for something, import it automatically. If nothing sells for 30 days, archive it automatically.

The theme's role in that system is to be the **demand surface**: it captures what visitors are looking for, shows them supplier products before they're ever listed in the store, and signals back to the worker what's getting real attention.

---

## What it does

### Search backfill (the core feature)

When Shopify's native search returns fewer than 12 results, the theme silently calls PawScout and fills the remaining slots with quality-gated supplier "ghost cards" — real products with prices and images, not yet listed in Shopify. Ghost cards look identical to real product cards. Clicking one opens an instant preview modal; the import runs in the background and the "View" CTA flips to "Add to cart" within seconds.

### Performance beacons

For imported products, the theme sends JS-only `view` and `atc` (add-to-cart) signals to PawScout. These drive the 30-day performance cull: products with no qualifying activity are automatically archived.

---

## How it became helpful

**"Cat on a dog listing."** CJ's search thumbnail and detail gallery are populated independently by the supplier. The search card showed a cat photo; the product detail showed the correct dog image. Fixed by PawScout caching a vision-vetted hero image on first preview — the grid card self-heals on all subsequent appearances.

**"The modal loads slowly on first open."** Preview data is now pre-cached by PawScout's warehouse, so the modal opens from cache with no perceptible delay.

---

## Sample use case

A visitor searches "dog grooming brush" on activepaw.co.uk. Shopify finds 6 matching products. The theme calls PawScout and receives 6 ghost cards to fill the grid to 12. The visitor clicks one — the preview modal opens instantly. The import runs in the background: Shopify product created, images uploaded, price set to £14.99, published. The modal CTA flips to "Add to cart" within seconds. The visitor buys it. When the order is paid, PawScout creates the CJ order and writes the tracking number back to Shopify — the buyer gets a shipping notification with a live tracking link.

---

## ⚠️ Branch Strategy (read first)

| Branch | Purpose |
|---|---|
| **`shopify-deploy`** | **Default branch.** Theme files only (~428KB). Connected to Shopify via GitHub integration — **every push goes live on the store.** |
| **`master`** | Development branch. Full repo: theme + `docs/` (67MB) + tooling. All feature work happens here. |

**Rules:**

- Develop on `master` (or feature branches off it). Never develop directly on `shopify-deploy`.
- **Never merge `master` into `shopify-deploy`** — the 67MB `docs/` folder breaks Shopify's 50MB theme limit.
- **Syncing is automatic:** a GitHub Action (`.github/workflows/sync-shopify-deploy.yml`) copies the theme folders to `shopify-deploy` on every push to `master` that touches them. Pushing theme changes to `master` deploys them to the live store — treat `master` pushes as production releases.
- Manual fallback (only if the Action is down):

  ```bash
  git checkout shopify-deploy
  git checkout master -- assets config layout locales sections snippets templates
  git commit -m "Sync theme from master"
  git push origin shopify-deploy
  ```

---

## Features

### 🎨 **Design**
- Mobile-first responsive layout
- Customizable typography and color scheme via Theme Editor
- Clean, semantic Liquid templates
- No build step — edit CSS/JS directly

### 📦 **Inventory & Supplier Integration**
- Real-time supplier metafield sync (CJDropshipping API)
- Quantity cap enforcement (Shopify inventory > supplier max > supplier available > default)
- Multi-source fulfillment support
- PawScout Cloudflare Worker for cross-tenant data sync

### 🔍 **Commerce**
- Product discovery with collections and search
- Cart drawer with instant updates
- Structured data (JSON-LD) for SEO
- Conversion tracking via Shopify analytics

### 🛠️ **Developer Experience**
- Built-in knowledge graph (graphify) for codebase exploration
- Theme Check validation (zero offenses)
- Setup hooks for persistent tool installation
- Comprehensive development documentation

---

## Quick Start

### Prerequisites
- Shopify CLI v4.1.0+
- Node.js 18+ (for local development)
- Git

### Installation

```bash
# Clone the repo
git clone https://github.com/jared0565/active-paw-theme.git
cd active-paw-theme

# Install dependencies (optional, only for CLI tools)
npm install

# Or use uv for Python tools
uv tool install --upgrade graphifyy  # Knowledge graph explorer
```

### Development

#### Local Preview
```bash
# Authenticate with Shopify
shopify app dev

# Start local theme server (requires app auth)
shopify theme dev --store 4qkudm-ez.myshopify.com
```

**Note:** Known issue with `theme dev` — if editing while server is running causes a "sync wedge" error, kill the `node` process on port 9292 and restart. See `docs/shopify-theme-dev-troubleshooting.md` for full troubleshooting.

#### Push to Shopify
```bash
# Push theme changes to store
shopify theme push --store 4qkudm-ez.myshopify.com

# Or push to a new draft theme
shopify theme push --store 4qkudm-ez.myshopify.com --unpublished
```

---

## Project Structure

```
active-paw-theme/
├── layout/                 # HTML shell (theme.liquid)
├── sections/              # Page regions (20+ section types)
├── snippets/              # Reusable partials
├── templates/             # Page templates (home, product, cart, etc.)
├── config/                # Theme settings schema
├── assets/                # CSS, JS, images
│   ├── theme.css          # All styles (single file, no build)
│   └── theme.js           # Client-side logic (no framework)
├── locales/               # Translation strings
├── docs/                  # Development guides
│   ├── supplier-intelligence-platform-prd.md
│   ├── shopify-supplier-metafields.md
│   ├── shopify-theme-dev-troubleshooting.md
│   └── ...
├── .claude/               # Claude Code setup
│   ├── setup.sh           # Auto-install tools (graphify)
│   ├── hooks.json         # SessionStart hook config
│   └── PLUGINS.md         # Plugin setup guide
├── .shopifyignore         # Deployment filter (docs excluded)
└── CLAUDE.md              # Project guide for Claude Code
```

### Key Files

| File | Purpose |
|------|---------|
| `layout/theme.liquid` | HTML shell, CSS vars, font loading |
| `assets/theme.css` | All styling, responsive breakpoints |
| `assets/theme.js` | Cart logic, DOM manipulation, event handlers |
| `config/settings_schema.json` | Theme Editor settings (fonts, colors, brand name) |
| `sections/main-product.liquid` | PDP with supplier metafield display |
| `sections/main-cart.liquid` | Cart with quantity cap enforcement |

---

## Supplier Metafields Data Contract

The theme reads supplier intelligence exclusively from **Shopify metafields** — never directly from supplier APIs.

**Namespace:** `supplier`

### Variant-Level Metafields

| Key | Type | Purpose |
|-----|------|---------|
| `supplier.name` | Text | Supplier name (e.g., "CJDropshipping") |
| `supplier.cj_product_id` | Text | External product ID for sync |
| `supplier.status` | Text | Availability: `in_stock`, `low_stock`, `backorder_possible`, `unavailable` |
| `supplier.available_qty` | Integer | Current stock at supplier |
| `supplier.max_order_qty` | Integer | Order cap per transaction |
| `supplier.last_checked_at` | DateTime | Last inventory sync timestamp |

### Quantity Cap Priority (Enforced in theme.js)

1. **Shopify inventory** (if `inventory_management` enabled + `inventory_policy == 'deny'`)
2. **`supplier.max_order_qty`** (if present)
3. **`supplier.available_qty`** (fallback)
4. **Conservative default** (20 units)

See `docs/shopify-supplier-metafields.md` for full spec.

---

## Development Tools

### Graphify — Knowledge Graph Explorer

Explore the codebase as a queryable knowledge graph with community detection and cross-file relationships.

```bash
# Install (auto via SessionStart hook)
uv tool install --upgrade graphifyy

# Build graph
graphify .

# Query the graph
graphify query "How do supplier metafields flow through the cart?"

# Open interactive visualization
open graphify-out/graph.html
```

**Graph includes:**
- 173 nodes (sections, functions, concepts, docs)
- 212 edges (relationships, data flows, implementations)
- 16 communities (cart logic, templates, supplier integration, etc.)

See `.claude/setup.sh` for auto-installation on SessionStart.

### Superpowers — Development Methodology

Structured workflow for spec → design → implementation.

```bash
# Install (one-time per session)
/plugin install superpowers@claude-plugins-official
```

Guides the AI through TDD, YAGNI, and subagent-driven development. See `.claude/PLUGINS.md`.

---

## Theme Customization

### Via Theme Editor (Recommended)

1. **Shopify Admin** → **Sales channels** → **Online Store** → **Themes**
2. Click **Customize** on Active Paw
3. Edit:
   - **Brand name** (`demo_brand_name`)
   - **Logo & favicon** (image picker)
   - **Colors** (ink, accent, surface)
   - **Fonts** (heading, body — from Shopify font library)

Changes apply instantly; no redeploy needed.

### Via Code

Edit source files directly:

```bash
# Styling
assets/theme.css          # CSS custom properties (--ink, --accent, --surface, etc.)

# Liquid templates
sections/main-product.liquid
sections/main-cart.liquid
# Edit and push: shopify theme push
```

---

## Deployment

### GitHub Integration → Shopify

Push changes automatically on repo commit:

1. Get **Shopify access token** from Admin → Apps & integrations → Develop apps
2. Set **GitHub secrets:**
   - `SHOPIFY_STORE`: `4qkudm-ez.myshopify.com`
   - `SHOPIFY_ACCESS_TOKEN`: (your token)
3. Push to branch (or create `.github/workflows/deploy.yml` with GitHub Actions)

### CLI Deployment

```bash
shopify theme push --store 4qkudm-ez.myshopify.com
```

**Size note:** `.shopifyignore` excludes `docs/` (67MB). Deployable theme is ~650KB.

---

## Theme Audit & Compliance

### Theme Check Validation
```bash
shopify theme check
```
**Status:** ✅ Zero offenses (Theme Store compliant)

### Quality Checklist
- ✅ No hardcoded product data
- ✅ Metafield-gated ratings (no fake reviews)
- ✅ Responsive images with srcset
- ✅ Semantic HTML + JSON-LD
- ✅ Performance optimized (CSS vars, lazy loading)

See `docs/theme-audit-2026-06.md` for full audit report.

---

## Common Tasks

### Add a New Section
```bash
# Create sections/my-section.liquid
{% render 'my-snippet' %}

# Add to config/settings_schema.json if editable via Theme Editor
```

### Modify Cart Logic
```bash
# Edit assets/theme.js
# Key functions:
#  - normalizeCartQuantity()  — Enforces qty caps
#  - changeCartLine()         — Cart item updates
#  - syncCartFromResponse()   — Syncs with Shopify API
```

### Update Product Display
```bash
# Edit sections/main-product.liquid or snippets/product-card-commerce.liquid
# Reads from: product.metafields.supplier.*
```

### Check Supplier Metafield Data
In Liquid, access via:
```liquid
{{ product.metafields.supplier.max_order_qty }}
{{ variant.metafields.supplier.status }}
{{ variant.metafields.supplier.last_checked_at }}
```

---

## Python Scripts (Admin API)

Located in `/scripts/` (not in this repo; see CLAUDE.md for details):

- `import-cj-category-products.py` — Import products from CJDropshipping
- `set-cj-inventory-one.py` — Update inventory quantities
- `publish-products-online-store.py` — Publish draft products
- `create-home-collections.py` — Create smart collections

These scripts require `.env` file with credentials (not checked in).

---

## Troubleshooting

### Theme dev server won't sync
See `docs/shopify-theme-dev-troubleshooting.md` — stop `node` on port 9292 and restart `theme dev`.

### Cart quantity not capping
Check:
1. Variant has `supplier.max_order_qty` metafield
2. HTML input has `max="{{ max_qty }}"` attribute (from Liquid)
3. `normalizeCartQuantity()` is being called (assets/theme.js:L173)

### Supplier metafields not showing
Verify:
1. Metafield exists on variant (Admin → Products → variant → Metafields)
2. Namespace is `supplier`
3. Key matches template code (e.g., `max_order_qty`)

---

## Resources

- **Shopify Liquid Docs:** https://shopify.dev/api/liquid
- **Shopify Theme Architecture:** https://shopify.dev/themes/architecture
- **Supplier Intelligence Platform:** See `docs/supplier-intelligence-platform-prd.md`
- **Knowledge Graph:** Run `graphify query "..."` for cross-file insights

---

## Development Workflow

1. **Explore:** `graphify query "How does X work?"`
2. **Design:** Read relevant docs, sketch changes
3. **Code:** Edit source files
4. **Test:** Run `shopify theme dev`, preview changes
5. **Validate:** Run `shopify theme check`
6. **Push:** `git commit && git push` (auto-deploys with GitHub Actions or manual `shopify theme push`)

---

## Contributing

This theme is actively developed. To contribute:

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes (ensure `shopify theme check` passes)
4. Open a pull request with clear description

See `CLAUDE.md` for Claude Code development guidance.

---

## License

Licensed under the Shopify Theme License. See Shopify Theme Store terms for commercial use.

---

## Support

For issues, questions, or feature requests:
- Check `docs/` directory for detailed guides
- Review `CLAUDE.md` for project context
- Explore the knowledge graph: `graphify query "..."`
- Email: support@activepaw.co.uk

---

**Active Paw** — Making pet care simpler, one checkout at a time. 🐾

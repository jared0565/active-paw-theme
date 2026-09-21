# Active Paw - Shopify Theme

## What is Active Paw?

**Active Paw** ([activepaw.co.uk](https://activepaw.co.uk)) is a UK-based online pet store selling pet accessories, toys, grooming tools, and health products. The catalogue is fully demand-driven - it grows and self-optimises based on what real visitors search for and interact with, without any manual product curation.

This repository contains the **Shopify Liquid storefront theme** - the visitor-facing half of the system. The backend intelligence lives in [`pawscout-worker`](https://github.com/jared0565/pawscout-worker).

| Repo | Role |
|---|---|
| `active-paw-theme` (**this repo**) | Shopify theme: search grid, ghost cards, preview modal, performance beacons. |
| [`pawscout-worker`](https://github.com/jared0565/pawscout-worker) | Cloudflare Worker: supplier search, quality gates, pricing, import pipeline, fulfilment automation, merchant console. |

---

## Why it was built

Traditional pet stores require constant manual effort to stay stocked: finding products, writing listings, managing prices, retiring dead stock. Active Paw was built to eliminate that entirely. The founding idea is simple - **let customer demand decide what gets listed**. If visitors are searching for it, import it automatically. If nothing sells for 30 days, archive it automatically.

The theme's role in that system is to be the demand surface: it captures what visitors are looking for, shows them supplier products even before they're listed in the store, and signals back to the worker what's getting attention.

---

## What it does

### Search backfill (the core feature)

When Shopify's native search returns fewer than 12 results for a query, the theme silently calls PawScout and fills the remaining slots with quality-gated supplier "ghost cards" - real products with prices and images, not yet listed in Shopify.

```
Visitor searches → Shopify returns N results
                        │
                        └─ N < 12 → theme calls /apps/pawscout/search
                                     → ghost cards fill the grid to 12
```

Ghost cards look identical to real product cards. The only difference: clicking one opens a preview modal instead of going directly to a product page.

### Import on first interest

Clicking a ghost card opens an instant preview modal (served from cached supplier data - no network wait). The background import runs simultaneously:

1. PawScout creates the Shopify product, uploads vision-vetted images, sets the GBP price, publishes it.
2. The modal polls `/proxy/import-status` every 2 seconds.
3. When the import completes, the CTA flips from "View details" to "Add to cart" - the real product page is live.

No manual action required. A product goes from "searched for but not listed" to "buyable" within seconds of the first genuine visitor interest.

### Performance beacons

For already-imported products, the theme sends JS-only `view` and `atc` (add-to-cart) signals to PawScout. These are JS-only (not server-rendered links), which filters out most crawlers and bots - signals reflect real human engagement. The worker uses these to drive the 30-day performance cull: products with no qualifying events in 30 days are automatically archived.

### Content surfaces (blog guides)

The theme renders the worker-authored buying guides at `/blogs/guides`. The article template carries the full AI-citation pack: a quick-answer block near the top, a visible FAQ section rendered from the article's `faq_json` metafield plus matching FAQPage JSON-LD for search engines, and a "Shop this guide" product block wired to the guide's merchandised picks. Guides are drafted by the worker and published by the owner; the theme just renders what is published. Each card on the guides index carries a "Read guide" button (a real anchor styled as a button, added 2026-07-19 - it was previously an inert span).

The "Shop this guide" block **composes itself at render time** (2026-07-19): the guide's curated picks (the `blog.related_products` metafield) are filtered to products that are live and available, then topped up from the guide's funnel collection - deduped, available only - until 4 cards show. An archived pick can never leave the block thin or dead, even minutes after the worker's profitability agent retires a product; the worker's nightly article-health pass separately keeps the curated list itself congruent and re-points dead product links inside the guide body.

### Supplier-aware PDP and cart

Product and cart templates read the product-level `supplier.*` metafields the PawScout worker writes (status, last check, demand, origin, delivery ranges; spec in `docs/shopify-supplier-metafields.md`) through one snippet, `snippets/supplier-availability.liquid`, which also sets the quantity cap: tracked Shopify inventory first, then a conservative fallback of 20. Supplier data counts only while its last check is within 3 days. Availability display never calls supplier APIs from the browser - everything comes Shopify-side from metafields.

### Affiliate sign-up surface

The theme footer carries an **Affiliates** link to `/apps/pawscout/affiliate/apply`. The application form and the partner-terms page are served by the worker over the App Proxy as Liquid (`Content-Type: application/liquid`), so Shopify renders them inside the live theme layout - real header, footer, and styling - even though the theme itself has no template for them. The programme, bot-gating, automated screening, partner dashboard, and commission logic all live in [`pawscout-worker`](https://github.com/jared0565/pawscout-worker); the theme's only job is the footer entry point.

---

## How it became helpful

The theme's integration with PawScout evolved through several real problems:

**"Ghost card shows a cat, product shows a dog."** CJ's search thumbnail (`productImage`) and detail gallery (`productImageSet`) are populated independently by the supplier. The search card faithfully showed what CJ's search API returned - sometimes a cat photo - while the product detail showed the actual dog image from the gallery. Fixed by PawScout caching the vision-vetted hero image after the first preview, and the theme swapping the raw CJ thumbnail for it on subsequent search appearances.

**"The modal loads slowly on first open."** The preview modal used to fetch supplier detail data on click. Now the data is cached by PawScout's warehouse on first search, so the modal opens from cache with no perceptible delay.

**"Products we don't sell appear in backfill."** Before the pet-relevance guard was added to the worker, LLM outages let kitchen tools and garden products slip through quality gates. The theme itself is stateless on this - but the fix in the worker means ghost cards now always show genuine pet products regardless of LLM availability.

---

## Sample use case

**A visitor searches "dog grooming brush" on activepaw.co.uk.**

1. Shopify finds 6 matching products - not enough to fill the 12-card grid.
2. The theme's `main-search.liquid` calls `/apps/pawscout/search?q=dog+grooming+brush&have=6&limit=6`.
3. PawScout returns 6 ghost cards: priced in GBP, with vision-vetted images, all passing quality gates.
4. The theme unhides the backfill grid below the native results - the visitor sees 12 cards, the last 6 labelled implicitly by their "View" CTA instead of "Add to cart".
5. The visitor clicks "Self-Cleaning Slicker Brush for Dogs, £14.99". The preview modal opens instantly.
6. In the background, the import runs: Shopify product created, hero image uploaded, published. 8 seconds later the modal CTA flips to "Add to cart".
7. The visitor adds it to their cart. PawScout records the `atc` beacon - this product is now safe from the 30-day cull for another month.
8. When the order is paid, PawScout's fulfilment pipeline creates the CJ order, receives the tracking number, and writes it back to Shopify - the buyer gets Shopify's standard shipping email with a live tracking link.

---

## Theme structure

```
assets/
  pawscout.js           Search backfill, ghost cards, preview modal, import polling, beacons
layout/
  theme.liquid          Loads pawscout.js; passes shop/proxy config to the script
sections/
  main-search.liquid    Hidden backfill grid (data-pawscout-search); revealed when PS has results
  main-product.liquid   Emits <meta name="pawscout-pid"> for beacon registration
  main-blog.liquid      Guides index cards; "Read guide" anchor-button CTA
  main-article.liquid   Guide article: quick answer, FAQ + FAQPage JSON-LD, and the
                        render-time "Shop this guide" bundle (live+available picks,
                        funnel top-up to 4)
  site-footer.liquid    Footer; carries the "Affiliates" link to the worker apply page
```

All storefront calls go through the Shopify App Proxy at `/apps/pawscout/*`. If the proxy is unconfigured or the worker is down, every PS call silently no-ops - the store falls back to plain Shopify search with no errors.

---

## Branch setup

> **Current state (July 2026):** the live theme is connected to the `claude/search-supplier-suggestions` branch, **not** `master`, and the live theme carries edits that are not in this repo. Always `shopify theme pull` and reconcile before any push (a targeted `--only` push can clobber live-only work). A full repo/live re-sync is still outstanding. The two-branch model below describes the original setup.

This repo uses two branches:

| Branch | Purpose |
|---|---|
| `master` | Full development repo: theme + docs + tooling. Develop here. |
| `shopify-deploy` | Theme folders only (no `docs/`). Auto-syncs to Shopify via GitHub integration. |

> ⚠️ Never merge `master` into `shopify-deploy` directly - `master` contains a large `docs/` folder that will exceed Shopify's 50MB theme size limit. Use the sync command below.

**To ship theme changes to the live store:**

```bash
git checkout shopify-deploy
git checkout master -- assets config layout locales sections snippets templates
git commit -m "Sync theme from master"
git push origin shopify-deploy
```

Shopify picks up the push automatically. Every push to `shopify-deploy` is live within seconds.

---

## PawScout integration setup

For the backfill and import features to work, the **App Proxy** must be configured in the Shopify Partner Dashboard:

- **Subpath prefix:** `apps` · **Subpath:** `pawscout`
- **Proxy URL:** `https://pawscout.activepaw.co.uk/proxy`

Without this, `pawscout.js` degrades gracefully - all calls return no-op responses and the store runs as a standard Shopify theme.

See the [worker README](https://github.com/jared0565/pawscout-worker) for the full backend setup.

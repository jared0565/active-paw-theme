# Active Paw — Shopify Deploy Branch

⚠️ **This is the deployment branch.** It is connected to Shopify via the GitHub integration and contains **only the theme files** (no docs, no dev tooling) to stay under Shopify's 50MB theme size limit.

**Every push to this branch syncs to the live store within seconds.**

## Rules for collaborators

1. **Do NOT develop here.** All feature work happens on `master` (or a feature branch off it).
2. **Never merge `master` into this branch** — `master` contains a 67MB `docs/` folder that will break the Shopify sync with a "Theme is too large" error.
3. **To ship theme changes**, copy only the theme folders from `master` into this branch:

   ```bash
   git checkout shopify-deploy
   git checkout master -- assets config layout locales sections snippets templates
   git commit -m "Sync theme from master"
   git push origin shopify-deploy
   ```

   Shopify picks up the push automatically.

## What lives where

| Branch | Purpose |
|---|---|
| `master` | Full development repo: theme + docs + tooling. Start here. |
| `shopify-deploy` | **This branch.** Theme folders only. Auto-syncs to Shopify. |

Full project documentation, supplier metafield specs, and contribution guidelines are on [`master`](../../tree/master).

## PawScout integration

This theme is the storefront half of [`pawscout-worker`](https://github.com/jared0565/pawscout-worker) (supplier search backfill, on-demand product imports, performance beacons):

- `assets/pawscout.js` — search-grid backfill with supplier "ghost" cards, the instant preview modal (real product is created in the background on click), and JS-only view/add-to-cart beacons. Loaded from `layout/theme.liquid`.
- `sections/main-search.liquid` — hidden backfill grid (`data-pawscout-search`) revealed when supplier matches exist; first results page only; 12-product display cap.
- `sections/main-product.liquid` — emits `<meta name="pawscout-pid">` for products tagged `cj-pid-*` so beacons can keep performing products alive through the 30-day cull.

All storefront calls go through the Shopify App Proxy at `/apps/pawscout/*` (configured in the Partner Dashboard — see the worker README). If the proxy isn't configured or the worker is down, everything degrades gracefully to plain store search.

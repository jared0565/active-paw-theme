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

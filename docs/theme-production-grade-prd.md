# Active Paw theme: production-grade programme

Survey, PRD and task list for the theme repository. Status: APPROVED DIRECTION, written 2026-09-19 by the theme agent; the owner answered the six open questions the same day and section 5 records the decisions. Every measurement below is first-hand from that day unless it says otherwise.

## 1. Direction

The owner's direction, set on 2026-09-18 and relayed by the worker side (channel round 227):

1. "We will just develop ActivePaw+PawScout into a fully production-grade e-commerce system first. It will serve as the model for the next project."
2. "The goal is to make both PawScout and ActivePaw production-grade. And ActivePaw must work even without PawScout, and PawScout must work as an independent application where other shopify stores can subscribe to without data bleeding among the stores where it will be installed."

Process ordered for both repos: a PRD, then a task list, then implementation by multiple agents. The four rules both sides build to (round 227): every live call is optional; Shopify-held data carries its own freshness; the worker assumes no particular theme; no shared secrets and no shared code.

## 2. Survey

### 2.1 What stands between an edit and the live theme

- **Source of truth is ambiguous.** The live theme (id 202067018066) is named `active-paw-theme/shopify-deploy` and Shopify's GitHub integration writes "Update from Shopify" commits to the `shopify-deploy` branch, which is also the repository's default branch. The owner deploys by running `shopify theme push` from `claude/search-supplier-suggestions`. The two branches differ in 13 theme files (4,460 insertions, 6,741 deletions). Whoever pushes from the wrong branch overwrites live with stale files.
- **No continuous integration.** The repository has no workflows. It is private and branch protection is not available on the current plan.
- **The gates that exist are machine-local.** Aramid's pre-commit and pre-push hooks (gitleaks, semgrep, ruff, eslint, pytest) and Graphite's rebuild hooks live in the gitignored `.githooks/` on one machine; a clone must run `bootstrap-agent-tooling.py` to get them. `.shopifyignore` is also machine-local.
- **Checks that run.** `shopify theme check` reports 6 warnings (a manifest asset that only exists on Shopify, one asset preload, four unused assigns, one orphaned snippet). Unit tests: 37, all for scripts and tooling, none for Liquid. Playwright: `tests/independence.cjs` (committed) and `output/playwright/storewide-event-check.cjs` (gitignored). Nothing runs them before a push.
- **Preview and rollback.** A preview copy is made by hand: `themeDuplicate` plus `themeFilesUpsert` through the Shopify connector, or `shopify theme push --unpublished`. There is no named rollback copy per push; three unnamed "Copy of" themes from June and July sit in the admin.
- **Reconcile.** Live files are compared to the branch by md5 through the Admin API when someone remembers to. `config/settings_data.json` is tracked, so Theme Editor changes on live diverge from git silently until the next reconcile.

### 2.2 What fails silently

- Feed and proxy failures are silent by design (rule 1) and unobserved: no client error reporting, no synthetic check. The only detector is the independence run, started by hand.
- Stale supplier data renders positive labels: `unknown_stale` maps to "Ready to order", and no read looks at the age of `supplier.last_checked_at`.
- "Fulfilled by CJ" is customer-visible in Product details on live PDPs, against the rule in `sections/main-product.liquid` that internal sourcing is never surfaced.
- The search page shifts by 494 px after load when the worker adds its three ghost cards (control run).
- `assets/theme.js` is one 1,192-line file with 63 top-level bindings and four IIFEs, minified by Shopify's CDN. One syntax error breaks the JavaScript of every page at once, and until eslint joined the gate nothing checked it.
- The footer's Affiliates link is worker-rendered through the app proxy and dead-ends when the worker is down.

### 2.3 What a second developer could not safely change

- The quantity-cap rule is written three times (`sections/main-product.liquid`, `sections/main-cart.liquid`, `snippets/cart-drawer-contents.liquid`).
- The collection handle list `pet-cleaning, pet-accessories, pet-health, pet-toys` is written four times across three files.
- The contact email is a literal in two files; the hero badge's default link is a literal in two files.
- Copy is 163 literal English lines in markup with zero locale lookups, so wording has no single home.
- The theme change process, the connector preview path and the Stop-hook rebuild live in agent memory files and channel rounds more than in the repository.

### 2.4 Independence, measured

`node tests/independence.cjs` against the live store with the worker domain and `/apps/` aborted: 71 of 72 checks passed, 0 failures; the one non-pass is the informational affiliate page. Home, collection, product, search, blog, article, contact, cart and checkout were complete, with no layout shift and no console error from theme code. The full touchpoint inventory is in channel round 230 (reply to 227).

## 3. PRD

### 3.1 Goal

The Active Paw theme is production-grade: one source of truth, a guarded path from edit to live with preview and rollback, automated checks on every push, honest rendering when PawScout data is absent or stale, and no customer-visible dependency on the worker. Everything it shows stays true if the worker disappears.

### 3.2 Non-goals

- No new merchandising features.
- No multi-store or multi-brand theme work; the theme serves Active Paw.
- No worker-side changes; anything found there goes to the worker agent through the channel.
- No rewrite of `theme.js` into modules or a build step. The theme stays build-free.

### 3.3 Requirements

Each requirement has an acceptance test that a reviewer can run.

**R1. One source of truth for the live theme.** Decision (section 5a): `shopify-deploy` is the live branch and stays connected to Shopify's GitHub integration, which deploys every push to it. `claude/search-supplier-suggestions` is merged into it once, with the merge result equal to the live theme file for file (the live theme already matches that branch), and then deleted. Work happens on feature branches merged by pull request; nobody pushes the live theme with the CLI again except to a preview.
Acceptance: `shopify theme pull` into a clean checkout of `shopify-deploy` produces no diff; the repository documents `shopify-deploy` as the only live branch; the old branch no longer exists.

**R2. Guarded path to live.** With Shopify deploying on push, the guard is the pull request: CI (R3) must be green, merging is the owner's "go", and rollback is `git revert` of the merge pushed to the same branch, which Shopify redeploys. Every deployed merge is tagged `release-<date>-<n>` so the rollback target has a name. Theme Editor changes on live come back as Shopify's own commits on the same branch, so they are never lost.
Acceptance: the runbook in `docs/RUNBOOK-THEME-DEPLOY.md` describes branch, PR, merge, tag and revert; one revert has been rehearsed on a preview theme connected to a throwaway branch; the first tagged release exists.

**R3. Continuous integration.** Decision (section 5e): fast checks (theme check, eslint, pytest, about 2 minutes) on every push to any branch. On pull requests into `shopify-deploy`, CI also pushes the branch to an unpublished preview theme with a Theme Access token, runs the independence run against it in blocked and control modes, and deletes the preview. After each push to `shopify-deploy`, the independence run runs once against live.
Acceptance: the workflow goes red on a planted failing test and green on the branch head; the post-deploy run has passed once against live.

**R4. Honesty under stale data.** One snippet decides the availability label and detail from `supplier.status`, `supplier.available_qty`, `supplier.max_order_qty` and `supplier.last_checked_at`. `unknown_stale`, and any status whose `last_checked_at` is older than 3 days (decision, section 5b: two missed nightly runs), render the conservative default. The delivery window falls back to the static band under the same rule.
Acceptance: a preview theme with fixture products (fresh, stale, `unknown_stale`, no metafields) renders the expected label for each, checked by Playwright.

**R5. No internal sourcing on customer surfaces.** Remove "Fulfilled by" from Product details and delete the orphaned `snippets/product-details.liquid`.
Acceptance: `grep -r "Fulfilled by" sections snippets` is empty; the live PDP no longer shows it.

**R6. Affiliate entry point on Shopify.** Decision (section 5c): a Shopify page (`/pages/affiliates`) explains the programme and carries the Apply button to the worker form plus an email route. The footer always links to this page. When the feed is unreachable the Apply button is hidden and the page stays complete.
Acceptance: the independence run passes the affiliate page in blocked mode with the page complete and the Apply button absent; in control mode the Apply button links to the worker form.

**R7. No layout shift on worker success.** The supplier row on the search page reserves its space or renders below the native grid's fold.
Acceptance: the control run's main-height delta for the search page is within 2 px, or the shift is entirely below the first viewport.

**R8. One place per fact.** The quantity-cap rule, the collection handle list, the contact email and the hero badge's default link each exist once (a snippet or a theme setting).
Acceptance: each grep count is 1; the PDP, cart page and drawer still agree on caps (Playwright on the preview).

**R9. Observability.** A scheduled workflow runs the independence run against live daily and opens an issue on failure; theme check reports zero warnings.
Acceptance: the schedule has run green at least once; `shopify theme check` prints 0 warnings.

**R10. Documentation.** The runbook, the contract (touchpoints, payload fields, fallbacks) and a refreshed `TASKS.md` live in the repository, not only in agent memory.
Acceptance: a new developer can deploy a one-line change to a preview using only the repository.

**R11. Delivery claim held as a setting, UK only.** Decision (section 5f): the default availability detail "Free UK delivery on every order. Tracking details are sent after dispatch." becomes a theme setting and renders only when the visitor's market country is GB; other markets read "Delivery options are shown at checkout."
Acceptance: the setting exists in `config/settings_schema.json`; a GB visit shows the line and a non-GB market visit shows the neutral line (Playwright on the preview).

### 3.4 Phases

1. **Deploy safety** (R1, R2, R3, R10). Nothing else ships until an edit has a guarded path to live.
2. **Honesty and independence** (R4, R5, R6, R7, R11). Fixes to what customers see; each verified on a preview then merged by the owner.
3. **Structure** (R8). Consolidation with no visible change; verified by the same Playwright runs.
4. **Observability** (R9). The daily run and zero-warning theme check.
5. **Storewide events before Black Friday** (added 2026-11-14). The feed-driven seal, announcement item and welcome offer, fixed and tested before the first real running event on 27 November 2026. Tasks T20 to T38 in section 4.

Phase 2's fixes are small and safe on their own; R5 can ship first as a single-line removal.

### 3.5 Decisions the draft rested on

All six were answered by the owner on 2026-09-19; see section 5. No assumption remains open.

## 4. Task list

Ordered. Each task names its files and its acceptance check. Tasks marked (owner) need the owner's action. The merge in T2 is itself a live deploy, so it waits for the owner's "go" like every deploy before it.

### Phase 1: deploy safety

- [x] T1 (owner) Decisions a to f recorded in section 5 (2026-09-19).
- [x] T2 Make `shopify-deploy` the one live branch. Done 2026-09-19 10:31 UTC: merge c1e2d93 (tree identical to afe355d, both histories as parents) pushed by the owner; Shopify redeployed within the minute (live `layout/theme.liquid` checksum f1903bdf matches the file); CI run 35437647493 green; tag `release-2026-09-19-1`; independence run against live afterwards: blocked 71/72 with 0 hard failures, control 68/69 with one console error on the worker's affiliate page (reported to pawscout-agent, round 235); the old branch is deleted. Original task text follows. Pre-flight: md5 of every live theme file equals the working branch, so the merge changes nothing on the storefront. Merge `claude/search-supplier-suggestions` into `shopify-deploy` with the working branch's content winning for every theme file, owner says "go", push (Shopify deploys), tag `release-2026-09-<d>-1`, run the independence run against live, then delete the old branch. Acceptance: R1. Pre-flight 2026-09-19: `shopify theme pull --live` into a detached worktree of ddb7de0 left `git status` empty, and a planted local change was overwritten on re-pull, so the probe fires. Since then the branch adds three theme check comment lines to `layout/theme.liquid` (whitespace only in the rendered page); every other theme file is identical to live. **Phase 1 to 4 deployed 2026-09-19 17:10 to 17:20 UTC** by the owner's merge script: PRs #1, #2, #10 (replacing #3, which GitHub closed when its base branch was deleted after #2 merged), #4, #5, #6, #7 and #9, one merge commit and one tag each (release-2026-09-19-2 to -9), theme-ci green before each next merge, live pulled and found identical to the branch, independence run against live 80/80 in blocked mode.
- [x] T3 `.github/workflows/theme-ci.yml` runs theme check, eslint and the unit tests on every push (commit 25810c5, fix fed8103, 2026-09-19). Acceptance shown: run 35433334488 went red on a failing unit test (a Windows-only path fixture), run 35433567778 is green on the branch head, 26 seconds end to end.
- [x] T4 Done 2026-09-19: the Theme Access app is installed, the owner created the password and stored it as the repository secret `SHOPIFY_CLI_THEME_TOKEN`. Proven by the first real preview run (T5).
- [x] T5 Done 2026-09-19 (PR #9 `feat/t5-preview-job`, stacked on #7): `.github/workflows/theme-preview.yml` runs on every pull request: pushes the branch to an unpublished preview theme, runs `tests/independence.cjs` on it in blocked mode (gate) and control mode (informational), keeps the results 14 days, and deletes the preview on success, failure or cancellation. Without the `SHOPIFY_CLI_THEME_TOKEN` secret (T4) the job warns and passes; run 35456558183 shows that path. The post-deploy half is the T17 workflow (`workflow_run` after theme-ci on `shopify-deploy`). Acceptance R3 is met in full once T4 lands and one pull request run pushes a real preview. **Acceptance R3 met in full 2026-09-19 21:51 UTC:** run 35458099218 (attempt 2, pull request #11) pushed preview theme 207796928850, passed blocked 89/89 and control 86/86 with 0 hard failures, and deleted the preview; only the live theme remains.
- [x] T6 `docs/RUNBOOK-THEME-DEPLOY.md` and `docs/theme-worker-contract.md` written 2026-09-19. `tests/independence.cjs` gained `PREVIEW_THEME_ID`: one visit sets Shopify's preview cookie and every theme page asserts `Shopify.theme.id`; verified against preview theme 207761965394 (blocked 79/80 with 0 hard failures, control 76/77, then deleted). Revert rehearsed on the git side only: `git revert -m 1 --no-commit c1e2d93` in a throwaway worktree gave a tree identical to 994d44a; a throwaway branch connected to a preview theme through Shopify's GitHub integration needs the owner in admin and was not done. The runbook records that c1e2d93 itself must never be reverted (the pre-merge branch held stale June sync-backs). Acceptance: R2 and R10, with that one rehearsal caveat.
- [x] T7 Done 2026-09-19 (owner's merge script, last step): theme copies 203969134930 (19 July) and 207749579090 (created 08:05 UTC that day; its seven files that differed from live were byte-identical to commit 994d44a, the old `shopify-deploy` tip) deleted. Only the live theme 202067018066 remains.
- [x] T19 Sparse markets look deliberate. Rewritten and done 2026-09-20 (branch `feat/t19-sparse-markets-spec-follows-writer`). The 2026-09-19 diagnosis below was wrong about the cause, and "publish or deactivate" is neither: the worker removes products from the AU, EU and US+CA catalogues on purpose unless they can be delivered there, and the owner keeps the markets open to be filled over time (pawscout-agent, channel round 245). The theme's job is that a sparse market never looks broken. Measured on live first, with the `localization` cookie: GB home 35 products in 5 blocks; US, AU and DE 16 products, and the Pet Toys block rendered its heading, a "View collection" link to an empty collection, and the merchant hint "Add products to this collection to populate the section." to customers. **One premise of the task did not survive measurement:** `products_count` does NOT ignore the market. Diagnostics on a preview for GB, US, AU and DE show `collection.products`, `products_count`, `all_products_count` and `paginate.items` all scoped to the visitor's market (Pet Toys 11 for GB, 0 for the rest, on every one of them; the all-products collection 41 against 19), so the header and footer lists already skipped Pet Toys and the product page's related-products walk was already market-aware; it needed no change for markets. Changed: `sections/category-showcase.liquid` renders a block's cards first and leaves the whole block out when there are none (the merchant hint now shows in the Theme Editor only); `sections/main-collection.liquid` decides by the products on the page and says "No products from <collection> are available for your delivery country (<country>) at the moment." with a route to all products; `sections/main-product.liquid` shows the related heading only above at least one card; `assets/theme.css` gives the empty state an ink heading and a button at its own width. Verified on preview 207842148690 (deleted afterwards): GB identical to live (5 blocks, same cards, same related products, same article bundle); US, AU and DE 4 blocks, no hint, no link to an empty collection from the home page, no dead product link, the message names the country. `tests/independence.cjs` now walks the home page and one collection as a sparse-market visitor (US by default): against live both new checks fail (the control), against the preview blocked 108/108 and control 105/105. The same day, on the owner's instruction, the two leftovers were closed on the same branch: the announcement bar and the trust strip now render one market-aware delivery promise (`snippets/delivery-promise.liquid`; GB "Free UK delivery", every other market "Delivery to <country> / Rates and times at checkout", wording in Theme settings > Delivery), and the accent moved from #f05a28 to #d24000 (same OKLCH hue and chroma, lightness 0.659 to 0.579) because 10 of the 13 accent pairings on live failed WCAG AA, white on the button at 3.39 to 1; all 13 pass on preview 207844966738 (deleted afterwards), independence blocked 112/112 and control 109/109. Known limit: the market follows the `localization` cookie, not the visitor's IP address, and the theme has no country selector, so a visitor abroad who has not changed country still sees the GB promise; whether to add a selector is the owner's call. Original 2026-09-19 text follows. Diagnosed 2026-09-19: the Australia, European Union and United States and Canada markets are ACTIVE, each has its own catalogue with autoPublish on, and shipping zones with a "Standard international" rate exist for their countries, yet product pages 404 for visitors in those markets. Cause: imported products are published only to the Online Store and Google & YouTube publications, not to the four market publications (measured on `plush-travel-car-booster-seat-and-bed-for-dogs-and-cats`, 10893028131154; only the three earliest products are in every catalogue). Two options: (a) sell there, so the worker publishes every imported product to the market publications at import time and backfills the catalogue (recommended to pawscout-agent in channel round 240; the worker is the operational Admin API actor); or (b) deactivate the three markets, after which the theme shows only the UK experience. The theme is ready for either. The `/localization` form is the only way a visitor changes market (no web presences). **Country selector added 2026-09-20 (owner decision, branch `feat/country-selector`, design-improvements Entry 27):** that form now exists in the footer as a native select over the 31 countries of the active markets, the announcement bar's delivery title links to it, and the five delivery sentences the first sweep missed (footer chip, two home lines, two cart drawer lines) plus the ghost preview note follow the visitor's country. Verified on preview 207854010706 for GB, US, AU and DE, with and without JavaScript, then deleted; independence blocked 128/129 and control 125/126 with 0 hard failures, all nine new checks failing against live as their control. **Follow-up 2026-09-21 (branch `feat/ghost-price-currency`, design-improvements Entry 28):** prices built in JavaScript follow the visitor's currency (add-on cards showed a pound sign on dollar amounts), a supplier price in another currency is labelled in words ("GBP 12.99", owner ruling on channel round 257), and "Free UK delivery on every order" was checked against the shipping profiles and one walked checkout (FREE for a £8.99 China-origin item). Two findings left for their owners: four collection descriptions in the store admin end with a UK delivery sentence that every market reads, and the header row overflows the viewport on windows from 901 to about 1200 px wide, on live today.

### Phase 2: honesty and independence

- [x] T8 Done 2026-09-19: `snippets/supplier-availability.liquid` is the one place that decides label, detail, cap, urgency and freshness; the product page, cart page and cart drawer capture its output. A supplier check older than 3 days, or `unknown_stale`, drops every supplier field (status, quantities, delivery window, the "Availability updated" line); tracked Shopify inventory stays authoritative. The status values the worker actually writes (`available`, `out_of_stock`, measured on all 50 active products) are mapped alongside the documented ones. Verified on preview 207763407186 against live: two fresh products unchanged; two stale products (stamped 14 Sep and 14 Aug) lose the date line, the delivery window falls back to the static band (4-12 became 3-10 on the 14 Sep one) and the hidden estimate is gone; cart note unchanged; independence blocked 80/81 with 0 hard failures. Fixtures not available on live: `unknown_stale`, a product with no metafields, a low-stock quantity of 10 or fewer, a variant Shopify does not track. Asked pawscout-agent for them (round 238); R4's fixture acceptance is partial until then. **Closed 2026-09-20 (round 245):** three of those four fixtures are states the worker can never produce (it never writes `unknown_stale` or `max_order_qty`, and it tracks every variant it manages), so R4 closes on the states that occur, all live and all checked on preview 207842148690 against live with identical output: fresh `available`, fresh `low_stock`, fresh `out_of_stock`, and stale by age (stamps of 10 July, 14 August and 14 September). The reader now follows the writer: `snippets/supplier-availability.liquid` dropped the branches nothing can reach (`max_order_qty`, variant-level supplier fields, `unknown_stale`, the five older status names, the `supplier_max` cart note), and the spec, `CLAUDE.md` and the contract doc describe the eight product-level keys and three statuses the worker writes (confirmed on all 41 active products through the Admin API).
- [x] T9 Done 2026-09-19: "Fulfilled by" and its two assigns removed from `snippets/product-details-modal.liquid`; orphaned `snippets/product-details.liquid` deleted; the four unused assigns cleared (theme check now reports one warning, the hero preload, for T18). `tests/independence.cjs` asserts "product details never name the supplier" on the product page from now on. Measured on preview 207762719058: the same 8 product pages show "Fulfilled by CJ" on live and nothing on the preview; blocked run 80/81 with 0 hard failures, control 77/78. Acceptance: R5.
- [x] T10 Theme side done 2026-09-19: `templates/page.affiliates.json` renders the page body plus the new `sections/affiliate-apply.liquid` (Apply button to `/apps/pawscout/affiliate/apply`, shipped hidden; email route to sales@activepaw.co.uk, the address the worker's own page publishes); `theme.js` shows the button only once the storewide feed has answered; the footer links to `/pages/affiliates`. `tests/independence.cjs` asserts the page in blocked mode (complete, button hidden, email present) and in control mode (button visible, linking to the worker form) as soon as the page exists, and measures the worker form until then. **Owner step:** in admin create the page, title "Affiliates", handle `affiliates`, theme template `page.affiliates`, body copied from the worker's page (programme name, 2% rising to 5%, 5% for the audience, the three steps). Until then the footer link 404s on any preview or live theme carrying this change, so merge this pull request only after the page exists. Acceptance R6 is met when the blocked run passes the page. **Owner step done 2026-09-19 (by the agent, on the owner's instruction):** page "Affiliates" created through the Admin API (Page 179229753682, handle `affiliates`, template `page.affiliates`, published), body copied from the worker's page. `/pages/affiliates` returns 200 on live; until #6 deploys it renders with the default page template and no Apply card. Live since release-2026-09-19-7: the footer links to `/pages/affiliates`, the page renders the Apply card with the button hidden server-side and the email route present.
- [x] T11 Closed by measurement 2026-09-19, no layout change: on the thin search "sisal" (2 native, 3 ghost cards land) the ghost row inserts at 922 px on a 1280x900 viewport and the footer sits at 1100 px, both below the first viewport; on 390x844 the footer is at 1702 px. Cumulative layout-shift score is 0 on both viewports (PerformanceObserver, buffered): appended content grows the page but moves nothing on screen. On a taller desktop viewport the footer would move by one row, at most a CLS near 0.04, under the 0.1 threshold. `tests/independence.cjs` now measures CLS on every page in control mode and fails above 0.05 (blocked mode keeps the main-height rule). Acceptance: R7, second branch.
- [x] T12 Done with T8 (2026-09-19): `snippets/delivery-info.liquid` no longer reads the metafield itself; the caller passes the synced range only when the supplier check is fresh, and the hidden "Estimated delivery" line-item property follows the same rule.
- [x] T13 Done 2026-09-19: a Delivery block in `config/settings_schema.json` holds `delivery_detail_uk` (default: the current line) and `delivery_detail_other` (default: "Delivery options and times are shown at checkout."). `snippets/supplier-availability.liquid` picks one by `localization.country.iso_code`; `snippets/delivery-info.liquid` shows the free-delivery row and the estimate (a CJ-to-UK lane) to GB visitors only and the neutral line to the rest. Wiring proved on preview 207764619602 with a marker value in `settings_data.json`: the GB banner read the marker. Independence on the preview: blocked 80/81 with 0 hard failures. **Not verifiable yet, owner item:** the AU, EU and US markets are enabled on the store but every product page returns 404 for them (measured with the `/localization` form on live for AU, US and DE), so no non-GB visitor can reach the page that carries the line. Either assign the catalogue to those markets or disable them; R11's non-GB half is reviewed in code only until then. **Closed 2026-09-20:** the markets are open by design (round 245), and the non-GB half is now observed, not only reviewed: for US, AU and DE the product page, the announcement bar and the trust strip all show the neutral line on preview 207844966738, and the independence run asserts on every run that a non-GB visitor is never told about UK delivery.

### Phase 3: structure

- [x] T14 Done 2026-09-19: the list is the theme setting `home_collection_handles` (new "Collections" block in `config/settings_schema.json`, default the four handles in priority order), read in one place, `snippets/collection-handles.liquid`. `sections/main-product.liquid` splits that output; `sections/category-showcase.liquid` derives a block's default collection and anchor from its title (the home template sets every block's collection explicitly, so nothing changes on live); `sections/main-search.liquid` reads its keyword rules from the sibling setting `search_offer_keywords` (`handle: keyword, keyword; ...`) and accepts only handles from the list. No handle literal is left in any Liquid or JavaScript file. Verified on preview 207775727954 against live with the worker blocked: home blocks (ids, headings, card counts, view links), three product pages' related collections, six search terms and the term "fountain water" (the one that renders the Liquid suggestion block: the same three suggested products on both) all identical. Acceptance R8 met for the list.
- [x] T15 Done 2026-09-19: `contact_email` (Contact form block, default contact@activepaw.co.uk) feeds `sections/site-footer.liquid` and `sections/main-page-contact.liquid`. The hero badge's default link now exists once, as the hero section's own "Badge link URL" setting; `snippets/hero-event-badge.liquid` falls back to `routes.all_products_collection_url` instead of carrying a second copy. The welcome modal's browse destination is likewise decided once in Liquid (`settings.welcome_redirect`, else the all-products route); `assets/theme.js` no longer holds its own `/collections/all` fallbacks and only writes an href it was given. Verified on the same preview: footer and contact-page mailto, badge href, badge data href and welcome redirect identical to live. Acceptance R8 met.
- [x] T16 `TASKS.md` points here and retires the superseded items (commit 9999885).

### Phase 4: observability

- [x] T17 Done 2026-09-19: `.github/workflows/independence-daily.yml` runs `tests/independence.cjs` against live at 06:17 UTC daily, on demand, on every push that touches the workflow or the script, and once after each deploy (`workflow_run` on theme-ci completing on `shopify-deploy`, after a two-minute wait for Shopify's redeploy). Blocked mode is the gate; the control run is recorded but cannot fail the job; results and screenshots are kept as an artifact for 14 days. On failure the job opens the issue "Independence run failed against live" (label `independence`) or comments on the open one. A run from any branch other than `shopify-deploy` is a dry run: that branch's script is newer than what is deployed, so the run warns, cannot fail the job and opens no issue. Evidence, both paths exercised for real on 2026-09-19: run 35452979345 (before the guard) failed on the T9 assertion against live, which waits on pull request #3, and opened issue #8 (closed with that reason); run 35453341902 (with the guard) reported blocked 71/73 and control 68/70 against live (the T9 assertion, plus the worker's affiliate console error in control), emitted the dry-run warning, opened no issue and finished green. Scheduled runs use the live branch's own script, so they only fail when live is broken. **Post-deploy, first real day:** the `workflow_run` runs for the last two merges were cancelled by the workflow's own concurrency group (pending runs in a group replace each other when merges land minutes apart), so the group is removed; run 35457784390 (dispatched from shopify-deploy after the last merge): blocked 80/80 and control 77/77, 0 hard failures; the affiliates page is now the Shopify page, so the worker form's console error no longer appears in the run.
- [x] T18 Done 2026-09-19: the hero background preload uses `preload_tag` (`sections/hero-commerce.liquid`); `shopify theme check` reports 69 files, no offences locally. CI is the authority: at the same CLI 4.8.0 its rule set found two more warnings (`UnrecognizedRenderSnippetArguments`: `sections/main-search.liquid` passed `show_purchase_action` to `product-card-commerce`, which never reads it; a planted bogus argument produced no local warning, so the local rule is inert). The dead argument is removed; theme-ci run 35453341836 is green at `--fail-level warning`, so a new warning fails the build. Acceptance R9 met with T17.

### Deployed after phase 4

Every pull request below was merged by the owner into `shopify-deploy` (the merge is the deploy), tagged, and followed by a green post-deploy independence run against live. Read from GitHub and the tags on 2026-09-24, 2026-10-01 and 2026-11-14; the change behind each is the named entry in `docs/design-improvements.md`.

| PR | Merged (UTC) | Merge commit | Tag | Post-deploy run | What |
|---|---|---|---|---|---|
| #11 | 2026-09-20 01:03 | `70be8ce` | `release-2026-09-20-1` | 35480393130 | Docs: phases 1 to 4 live; the daily run loses the concurrency group that cancelled post-deploy runs |
| #12 | 2026-09-21 06:40 | `7382d5f` | `release-2026-09-21-1` | 35569546711 | T19 sparse markets; the metafield spec follows the writer; accent contrast |
| #13 | 2026-09-21 07:24 | `551bf27` | `release-2026-09-21-2` | 35572876806 | Country selector; every delivery sentence follows the visitor's country (Entry 27) |
| #14 | 2026-09-21 07:27 | `cf61ec2` | `release-2026-09-21-3` | 35573073134 | Prices built in JavaScript follow the visitor's currency (Entry 28) |
| #15 | 2026-09-21 11:01 | `6714422` | `release-2026-09-21-4` | 35591915874 | No page scrolls sideways; icon buttons keep their names (Entry 29) |
| #17 | 2026-09-23 00:53 | `8b0b0f3` | `release-2026-09-23-1` | 35804058594 | The product page shows the product's own delivery figure (Entry 30) |
| #19 | 2026-09-24 06:47 | `79ba5f3` | `release-2026-09-24-1` | 35966224773 | A page load the storefront refuses with a 5xx is asked once more after 15 s and recorded (Entry 31) |
| #20 | 2026-10-01 13:55 | `af0d421` | `release-2026-10-01-1` | 36872352859 | Dev tooling: wrangler 4.145.0 brings undici 7.29.1; ARAMID.md follows the aramid 0.19 template (Entry 32) |
| #21 | 2026-10-01 13:57 | `aac6786` | `release-2026-10-01-2` | 36872682416 | The search check compares the page with itself; Shopify's telemetry CORS line is platform (Entry 33) |
| #22 | 2026-10-01 14:00 | `1f4b72c` | `release-2026-10-01-3` | 36873032318 | An item stocked only overseas says so, on its card and in its preview (Entry 34); the worker serves overseas cards only once the owner turns its `OVERSEAS_STOREFRONT` switch on |
| #23 | 2026-10-01 14:03 | `3dc94aa` | `release-2026-10-01-4` | 36873399941 | A refused background request is waited out and retried; a local item's preview gives the market's delivery line; card titles are exactly two lines (Entries 35 to 37) |
| #24 | 2026-10-01 17:18 | `4948305` | `release-2026-10-01-5` | 36898537565 | Docs: this table names #19 to #23 (Entry 38) |
| #25 | 2026-11-14 11:44 | `acdc3d6` | `release-2026-11-14-1` | 43591463041 | Dev tooling moves past seven npm advisories that refused every push (Entry 39) |
| #26 | 2026-11-14 11:45 | `3037a90` | `release-2026-11-14-2` | 43591561978 | The contact page's trading address drops "Office 19589" (Entry 40) |
| #27 | 2026-11-14 15:25 | `695ba11` | `release-2026-11-14-3` | 43610125529 | Phase 5 pull request A: the storewide event surfaces hold their claims (Entries 41 to 43) |

Number 16 is an issue, not a pull request: a daily run that failed on the browser's message about a Shopify response header, now classified as platform text; closed. Open: issue #18, the storefront answering 503 to one page load from the GitHub runner (three times on 2026-09-23, a different page each time). Since #19 the run asks for a 5xx page once more after 15 s and records the refusal with the headers that say who refused it; the first record (run 35966224773, 2026-09-24) was a 503 with `retry-after: 73`, an `x-request-id` and no `cf-mitigated`, which points at Shopify throttling the runner rather than an edge block. Since #23 the background requests are retried and recorded the same way. The issue stays open until a few more records agree.

### Phase 5: storewide events before Black Friday

Added 2026-11-14 from an audit of the storewide event feature. PawScout's `/public/event` feed drives the hero seal (`snippets/hero-event-badge.liquid`), the announcement bar item (`snippets/announcement-event.liquid`) and the welcome offer modal (`snippets/welcome-modal.liquid`), all through `loadStorewideEvent()` in `assets/theme.js`. The first real running event is Black Friday to Cyber Monday, 27 November 00:00 UTC to 30 November 23:59:59 UTC. Before this phase no automated check covered the running state.

**Baselines, so every task has its control.** Measured on live (theme 202067018066) on 2026-11-14. Where a probe served a stand-in feed, it did so inside its own browser only, and it clicked nothing.

- **Bar:** with the real Black Friday values, the bar grows from 49 to 80 px at 1440 and 1280, and from 66 to 95 px at 1100. With no event it is already 66 px at 1100 and 960, because benefit lines wrap below about 1220 px. The tag icon sits on its own row above the text. One layout shift of 0.37 to 0.38 lands at 0.5 to 0.6 s; an idle feed gives 0. At 390 px the marquee stays 43 px. Phone layout shift with a running event was not measured.
- **Consent:**
  - On a first visit from the UK, Shopify's cookie banner sits over the welcome modal at 390 and 1280. At 1280 it covers the modal's bottom, including "Maybe later". On a 390x844 phone the banner is 481 px tall.
  - While it shows, `window.Shopify.customerPrivacy` is undefined; only `Shopify.loadFeatures` exists.
  - From reading the code: the modal's focus trap keeps keyboard users from reaching the banner's buttons.
- **Payload:** a `chips` value that is a string throws `TypeError: event.chips.forEach is not a function`, and the modal never opens.
- **Seal:** `templates/index.json` sets no `badge_*` keys, so live shows the schema default "Stay cool! / Shop the summer range", linking to `/collections/keep-them-cool` (200, 6 products). It shows whenever the feed is unreachable. It also shows on every home view until the feed answers; in one run, from 360 ms to 589 ms, with first paint at 452 ms.
- **Feed:** `Cache-Control: public, max-age=120` (measured). The 10-minute server cache comes from a code comment and was not measured. The theme reads neither `endsAt` nor `startsAt`, although contract §3 lists both.
- **Discount, read through the Admin API:** `BLACKFRIDAY`, 15%, all items, no minimum, all buyers, once per customer, scheduled for exactly the event window.
- **Kill switches:** the seal has one (`badge_enabled`) and the modal has one (`welcome_enabled`). The bar item is rendered unconditionally, so turning it off takes a deploy.

**Dates:**

| By | What |
|---|---|
| Wed 18 Nov | Owner answers T20 |
| Fri 20 Nov | Pull request A open |
| Tue 24 Nov | Pull request A merged |
| Fri 27 to Mon 30 Nov | Deploy freeze, except reverts and the T21 switch |

#### Owner decisions

- [x] T20 (owner) Four decisions, each named by the task it gates. **Answered 2026-11-14:**
  - (a) takeover, with the design left to the agent ("surprise me"); built in T22;
  - (b) **B**: the seal stays hidden until the feed answers;
  - (c) **yes**: customers with past orders see the offer modal;
  - (d) **keep** "everything".

  The same day, the owner set a standing rule: every claim and piece of information a visitor reads must be defensible and match the code. The options as they were put:
  - (a) The desktop bar while an event runs, which gates T22:
    - **Takeover (recommended):** the event line replaces the three benefits for the event's days, on one line, with the offer and code first, so a cut only loses the tail.
    - **Keep the benefits:** a fixed slot needs short copy and breaks on the next long event name.
  - (b) The seal default, which gates T28:
    - **A:** evergreen copy and link replace the summer stamp.
    - **B:** the seal stays hidden until the feed confirms a running or next event, so there is no seal while the worker is down.
  - (c) Do customers with past orders see the event offer modal? This gates T29. `BLACKFRIDAY` is open to all buyers.
  - (d) Keep "% off everything", or drop "everything"? This gates T33. "Everything" is true for `BLACKFRIDAY` and for every discount scheduled today (all items, no minimum).

#### Pull request A: must ship before 27 November

- [x] T21 Kill switch for the bar item. Add the setting `event_bar_enabled` (default on) to `sections/announcement-bar.liquid`, and render `announcement-event` only when it is on. This is the rollback during the event that needs no deploy. Acceptance: on a preview with a stand-in running event, the item is absent with the setting off and present with it on.
  - **Done in pull request A (Entry 41).** Measured on preview 212371767634 on 2026-11-14:
    - with `event_bar_enabled: false` pushed to the preview only, the line is not rendered and the three benefits show;
    - with the key absent, which is how live stores it today, the line shows.
  - The preview's settings were then restored to the committed file.
- [x] T22 Bar layout and layout shift (design from T20a). Files: `snippets/announcement-event.liquid`, `assets/theme.js` (text order: offer and code first), `assets/theme.css`.
  - Root cause, from the code: `.announcement p { flex-wrap: wrap }` lets the link drop under the icon. The event item needs `nowrap`, with an ellipsis on its text only.
  - Copy length alone is not a fix, because the event name comes from the worker.
  - A takeover held at 48 px would shrink the bar at 1100 and 960, where idle is 66 px, and that shrink is a layout shift too. So either match the idle height at each width, or fix the wrap below 1220 px in this task.
  - **Acceptance:** within ONE page load with a stand-in running event, at 1440, 1280, 1100, 960 and 390 px:
    - the bar height equals the idle bar height at that width;
    - layout shift is under 0.05 (0.37 to 0.38 today);
    - the item is one line, with the icon beside the text;
    - the code's text box is fully visible;
    - all of this also holds for a 40-character event name.
  - **Done in pull request A (Entry 41).** The design is a takeover laid over the bar: an absolute line over benefits that stay laid out but invisible. It differs from the plan in three ways:
    - the styles live in the snippet's own style block, not in `assets/theme.css`;
    - the wrap is sidestepped rather than fixed, because the line no longer sits inside `.announcement p`;
    - when the line does not fit, whole parts drop in a set order (end, then name, then "with code"); only an offer and code that overflow on their own get an ellipsis.
  - Measured on preview 212371767634 on 2026-11-14, against live on the same day:
    - **Height.** The bar is as tall with the event as without it at all six widths checked (1440, 1280, 1100, 960, 390 and 320 px: 49, 49, 66, 66, 43 and 43 px). Live grew it, for example from 49 to 96 px at 1280 with the 13-character stand-in code.
    - **Layout shift.** 0 with the feed answering 2 s after load; live measured 0.3872. This was measured in one page load at 1280 px only. At the other widths, the equal heights are the evidence.
    - **Layout.** One line, the icon beside the text, and the code whole at every width, also with a 41-character name.
    - **Offer.** Not cut from 360 px up; at 320 px it fits whole too.
    - **Contrast.** Offer 15.20:1, code 17.89:1, other text 13.36:1.
- [x] T23 Consent first: the welcome modal and the install pill open only when Shopify's consent banner is not waiting for an answer. File: `assets/theme.js`.
  - **Step 1, a spike recorded in the pull request:** confirm in Shopify's docs how a theme loads the Customer Privacy API (`Shopify.loadFeatures` exists on live; the feature name to request is unconfirmed), and whether a decision event exists.
  - **Rule:**
    - load the API;
    - if `shouldShowBanner()` is true, skip this page view, mark nothing as seen, and let the next page view try again;
    - if the API has not answered within 2 s, skip as well;
    - open on a decision event only if step 1 confirms one exists.
  - **Accepted trade-off, to be written down:** this fails closed, so no modal opens wherever Shopify's consent script is blocked.
  - **Acceptance:**
    - First UK visit at 390 and 1280: with the banner up there is no modal, no pill and no focus trap.
    - Banner region with consent already given, or a stub reporting no banner: the modal opens after 3 s.
    - Consent script blocked: no modal and no console error.
  - The pill part rests on code reading. The pill is fixed to the bottom on phones, which is where the banner sits, but headless Chromium never offers installation, so the collision itself is not measured.
  - **Done in pull request A (Entry 42).**
  - **Spike.** Shopify's docs were searched and live was measured on 2026-11-14:
    - `Shopify.loadFeatures([{ name: 'consent-tracking-api', version: '0.2' }])` loads the API (59 ms; the script is served from the shop's own `/cdn/shopifycloud/consent-tracking-api/v0.2/`);
    - the decision event exists: `visitorConsentCollected` fires on the answer;
    - `shouldShowBanner()` stays true after an answer.
  - **Rule as built,** which differs from the plan: "waiting" means `shouldShowBanner()` with no answer yet, and while it waits the offer opens on the visitor's answer within the same page view, instead of skipping the view.
  - Measured on preview 212371767634, as a UK visitor:
    - **1280 px** (`event-consent`): with the banner waiting, the offer stays closed past its 3 s trigger and opens after the answer.
    - **390 px:** the same, read by eye from screenshots (closed while the banner waits, open after Decline).
    - **Consent script blocked** (`event-consent-blocked`: Shopify's banner and API script blocked): the offer stays closed and the page's own code logs no error.
  - Not measured: the no-banner branch runs only where no banner shows, so the US CI runner is its reading of record. The pill's part rests on code reading, as above.
- [x] T24 Feed hardening. File: `assets/theme.js`.
  - Read every string field through one `asText()` helper: name, code, headline, subline, endsLabel, `next.name` and its labels.
  - Use `chips` only when `Array.isArray`, keep string entries only, at most 6.
  - Wrap each surface's paint in try/catch, so one bad field cannot silently disable a surface.
  - **Acceptance:** a stand-in with `chips` as a string opens the modal with the settings chips and raises no page error (today: a `TypeError` and no modal). A `headline` sent as an object falls back and never shows "[object Object]".
  - **Done in pull request A (Entry 43).** The helper is `eventText`, with `eventTime` and `eventChips` beside it, and `paintEventSafely` guards each surface. The labels are no longer read at all (T25).
  - Standing check `event-bad-fields`, with `chips` as a string, `headline` as an object, and `subline` and `name` as numbers. On the preview the modal opens with its own heading and the settings chips, prints nothing malformed, and raises no page error. On live the same stand-in raises the `TypeError` and no modal opens.
- [x] T25 End-time guard. File: `assets/theme.js`.
  - A running event whose `endsAt` has passed (device clock, 60 s grace) counts as not running on all three surfaces.
  - A `next` whose `endsAt` has passed is not shown.
  - The call-to-action path re-checks before requesting `/discount/<code>`.
  - An open page removes the bar item and the seal's offer when `endsAt` passes.
  - The guard only ever hides, never shows. A fast device clock hides a live offer early; that is the accepted direction. A server timestamp needs `generatedAt` from the worker (T37), because the feed's `Date` header is not readable cross-origin.
  - **Acceptance:**
    - `endsAt` one minute in the past: no surface shows the offer.
    - `endsAt` 90 s ahead: the item is present, and is gone after about 90 s without a reload.
  - **Done in pull request A (Entry 43),** with two deviations:
    - **No 60 s grace.** The guard hides at `endsAt` itself, because the code stops working at that moment and a grace period would state a dead code. A device clock running fast still hides early, the accepted direction.
    - **25 s instead of 90 s** in the "ends while open" check, to keep the run short.
  - Times shown are built from `endsAt` and `startsAt` in the visitor's own time zone; the worker's `endsLabel` and `startsLabel` are not printed.
  - Every way to follow the offer reads the clock again at the click: the bar link, the offer's browse link, a chip and the search form.
  - Standing checks, all passing on the preview:
    - `event-ended`: an end 60 s past shows nothing.
    - `event-ends-now`: the bar line, the open offer and the seal's offer are gone at the end without a reload.
    - `event-next`: a planned event's dates come from its timestamps.
    - `event-new-york`: the end reads 18:59 for a visitor in New York.
    - `event-new-york` and `event-chip-after-end`: past the end, before the end timer has run, the bar link and a chip go on without the code.
- [x] T26 Tests in `tests/independence.cjs`.
  - **Stand-in visits** for the running, next and idle states, through a PAGE route (it outranks blocked mode's context abort, as the prices stand-in does). They assert:
    - the T22 checks at five widths;
    - the T24 and T25 cases;
    - the modal opening after 3 s in the no-banner case;
    - the seal states.
  - **Consent:** the CI runner is in the US, where the banner does not show. Spike a seam that stubs the consent API without Shopify's own script overwriting it, for example by blocking that script and defining the API in an init script. If no clean seam exists:
    - CI asserts the fail-closed path;
    - a local UK run is the reading of record for the real banner.
  - **Control mode:** a type check of the REAL feed: `active` boolean; `code`, `name` and `endsLabel` strings when active; `endsAt` parseable; `chips` an array when present; `next.name` a string.
  - **Budget:** under about 60 s added (the preview job takes 5m26s today).
  - Each new running-state check must FAIL against live today. That is the control.
  - **Done in pull request A:**
    - `eventSurfaces` and `eventBarWidths` run 12 visits: next, ended, bad fields, ends now, running, New York, chip after the end, consent, consent blocked, idle, widths and long name; plus, in control mode, a shape check of the real feed.
    - `ONLY=events` runs just these.
  - **Measured 2026-11-14, events only, blocked mode:**
    - **Preview 212371767634:** 59 of 59 pass.
    - **Live, the control:** 24 of 46 fail, run before the seal's running-state check was added. Every failure is a behaviour this pull request changes. The checks that pass on live cover behaviour live already has: no error from theme code, the idle and planned states, the offer's browse link, and opening after the answer.
  - **Consent seam:** the real banner is used, with no stub. The branch taken is recorded, so a UK machine reads "banner waiting" and the US runner "no banner waiting". The fail-closed path has its own check that blocks Shopify's scripts.
  - **Over budget:** the events-only run took 112 to 120 s on this machine, about twice the 60 s budget, mostly page loads plus the 27 s wait in `event-ends-now`. The jobs' limits are 25 minutes (preview) and 20 minutes (daily); the CI time is read from this pull request's run.
- [x] T27 Records.
  - `docs/theme-worker-contract.md` §2 row 1 and §3 say what the theme reads after T24 and T25, plus the consent gate and the kill switch.
  - One `docs/design-improvements.md` entry per change.
  - The pull request lists the preview's measurements against the baselines above.
  - **Done in pull request A:**
    - The contract's §2 row 1 and §3 are rewritten. §3 also states the worker's obligations behind each claim: "everything" means all items with no minimum; `pctOff` is the discount's; `endsAt` is the discount's end.
    - The changes are recorded in Entries 41 to 43.
    - The pull request carries a table of every sentence a visitor can read, with its source and how it was checked.
    - Corrected on the way: comments that stated an unmeasured "10 minutes server-side" cache, and one that said Shopify's redirect strips query strings.

#### Pull request B: after the owner's answers

- [x] T28 Seal (T20b). Files: `snippets/hero-event-badge.liquid`, and the `sections/hero-commerce.liquid` schema defaults.
  - The blocked-mode assertion in `tests/independence.cjs` (`/stay cool/`) changes in the same commit, because today it asserts the stale copy.
  - The seal is `position: absolute` (`assets/theme.css`), so showing it late should not shift layout. Measure it anyway.
  - **Acceptance:** with the feed blocked, no summer copy shows. With the real feed, nothing stale shows at first paint.
  - **Done in pull request B (Entry 44).**
    - The seal is rendered hidden and empty; theme.js reveals it after painting a running or a planned event.
    - The four settings that fed the old copy are removed. "Show event badge" stays.
  - **Preview 212381401426:**
    - at DOMContentLoaded, with the feed 2 s late, the seal is hidden and empty (live shows "Stay cool! Shop the summer range" there);
    - at 390 px the planned event appears with layout shift 0;
    - the blocked home check now asserts "hidden and empty".
- [ ] T29 Customers with orders (T20c). Files: `snippets/welcome-modal.liquid`, `assets/theme.js`.
  - If the answer is yes, the modal renders for them too. Its eyebrow "Welcome to <brand>" no longer fits, so it becomes neutral during events.
  - Longer term, eligibility comes from the feed (T37).
  - **Acceptance:** on a preview, a logged-in test customer with an order sees the modal. The owner provides the test customer.
  - **Built in pull request B (Entry 45); the acceptance is still owed, so this stays open.** What was built:
    - the modal renders for every customer;
    - the eyebrow is the brand, replaced by the event's name;
    - a signed-in customer whose orders already used the running code is not offered it, because `BLACKFRIDAY` is once per customer. Liquid lists `discount_code` applications from the first 20 orders.
  - **Checked so far:** by reading the code, plus `event-running` (the eyebrow) and `event-code-used` (with a stand-in list of used codes).
  - **Still owed:**
    - Seen with a real signed-in customer with an order: needs the owner's test customer. The Admin API counts 0 orders.
    - That `title` holds the code: inferred from Shopify's docs, not yet seen on an order.
    - Not covered: a guest who used the code in another browser.
  - **Contract:** §3 obligation 6, "open to all buyers".
- [x] T30 Modal focus. On open, focus the dialog (`tabindex="-1"`, as the details modal does), not the search input; today the input takes focus at every width (measured). Raising the phone keyboard is inferred, not observed. **Acceptance:** after opening, `document.activeElement` is the dialog, and Tab reaches the input.
  - **Done in pull request B (Entry 46).**
  - The shared Tab trap also treats focus on the dialog like focus on its first control, so Shift+Tab no longer leaves a modal. Reading the code, the details modal had the same gap.
  - `event-running` on the preview checks three things: focus is on the dialog, Shift+Tab from the dialog stays inside, and Tab twice from the dialog reaches the search field.
- [x] T31 Preconnect to the worker origin.
  - Assign the origin once in Liquid in `layout/theme.liquid`, and use it for both `data-storewide-event-src` and `<link rel="preconnect" ... crossorigin>`. The contract allows one worker URL in the theme.
  - **Acceptance:** the origin literal appears once. On the same probe, the seal repaint comes earlier than today's 589 ms (informational).
  - **Done in pull request B (Entry 47).**
    - The origin literal appears once in the theme's files.
    - The blocked home check asserts one matching anonymous preconnect.
  - **Informational,** with the real feed in a fresh browser per run, 5 runs per arm alternated: the seal was painted at a median of 536 ms on the preview (497 to 579) against 611 ms on live (470 to 771).
    - The ranges overlap.
    - The arms differ in more than the preconnect, because a preview page is rendered fresh, so this is not proof of a gain.
- [x] T32 Seasonal leftovers.
  - The welcome chips default and value still say "Cooling mats". Make them evergreen, with copy from the owner.
  - Remove the orphan `welcome_ends` and `welcome_ends_date` from `config/settings_data.json`. Pull first, because Shopify writes that file.
  - Replace the badge link default `/collections/keep-them-cool` if T20b chose A.
  - **Done in pull request B (Entry 48).**
    - The chips default is now "Grooming, Teeth cleaning, Cat toys, Litter boxes". It is a proposal: each term found matching products on live search, and the owner can change it in the Theme Editor.
    - The orphan settings are removed; live's copy of the file was pulled first and equalled the repo's.
    - The badge link setting is gone with T28 (option B): the seal links to all products.
  - **Left to the owner:** the home page's "Keep Them Cool" block, with badge "Summer" (`templates/index.json`, written by the Theme Editor).
- [x] T33 The "everything" wording (T20d), in `assets/theme.js`. Keep it or drop it as decided. Longer term, it follows a scope field in the feed (T37).
  - **Kept, in pull request A.**
  - The claim rests on a written condition: `docs/theme-worker-contract.md` §3 says the worker reports an event as running only for a discount on all items with no minimum. The code comments at both places that print "everything" point to it.
  - `BLACKFRIDAY` meets the condition (read through the Admin API on 2026-11-14). The scope field (T37) remains the longer-term check.

#### Around the event

- [ ] T34 (owner) Merge pull request A by Tue 24 Nov, and pull request B as its answers allow. Pull request A (#27) merged 2026-11-14 15:25 UTC as `695ba11`, `release-2026-11-14-3`. Deploy freeze from Fri 27 to Mon 30 Nov, except reverts. T21's setting is the off switch.
  - Since the answers of 2026-11-14, pull request B must also merge by Tue 24 Nov. Until T29 ships, customers with past orders do not see the offer modal, so "customers will see the offer modal regardless" holds during Black Friday only once B is live.
- [ ] T35 (owner) Start check: soon after 00:00 UTC on Fri 27 Nov, run `gh workflow run independence-daily.yml --ref shopify-deploy`, because the scheduled run is not until 06:17 UTC. Then look at the real bar, seal and modal at desktop and phone width.
- [ ] T36 End check: after 23:59:59 UTC on Mon 30 Nov, confirm that all three surfaces stop offering the code within about 2 minutes (T25) and that the code is refused.

#### Worker side, routed through the owner

- [ ] T37 (owner) Decide what to ask the worker for. Not posted on the agent channel by the theme agent:
  - `generatedAt`, the server time of each answer, for T25;
  - Black Friday `chips`, `headline` and `subline`, if wanted;
  - a scope field, for the wording in T33;
  - an eligibility field (all buyers or first order only), for T29;
  - whether `BLACKFRIDAY` applies in every market. This was not checked, and the feed is the same for every market.

#### Later, not before Black Friday

- [ ] T38 Render the event from Shopify data instead of a browser fetch. The worker writes the running and next event into a shop metafield at start and end, and Liquid renders all three surfaces with the page.
  - **What it removes:** the stale-copy flash, the late insertion, the 3 s timeout and the cross-origin call.
  - **Open questions:**
    - how Shopify's page cache reacts to a metafield write (unverified);
    - whether the worker's scheduler fires on time at the start and end.
  - Needs the owner and the worker.

## 5. Decisions (owner, 2026-09-19)

a. **Live branch:** one branch, `shopify-deploy`, with Shopify's GitHub integration connected; Shopify deploys every push to it. The working branch is merged in once and deleted. Rollback is a git revert.
b. **Staleness threshold:** 3 days without a supplier check; after that the theme stops trusting `supplier.status` and the delivery window.
c. **Affiliates:** a Shopify page is the entry point; the footer always links to it; the Apply button to the worker form is hidden when the worker is unreachable; an email route is always present.
d. **Old theme copies:** delete the 21 June and 4 July copies now; keep the 19 July copy until the first tagged release, then delete it.
e. **CI budget:** fast checks on every push to any branch; the full independence run on pull requests into the live branch and once after each deploy.
f. **Delivery claim:** true for the UK; it becomes a theme setting shown to UK visitors only, with a neutral line for other markets.

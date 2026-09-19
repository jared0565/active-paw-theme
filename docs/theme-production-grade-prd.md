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
- [ ] T19 (owner decision) Non-GB markets. Diagnosed 2026-09-19: the Australia, European Union and United States and Canada markets are ACTIVE, each has its own catalogue with autoPublish on, and shipping zones with a "Standard international" rate exist for their countries, yet product pages 404 for visitors in those markets. Cause: imported products are published only to the Online Store and Google & YouTube publications, not to the four market publications (measured on `plush-travel-car-booster-seat-and-bed-for-dogs-and-cats`, 10893028131154; only the three earliest products are in every catalogue). Two options: (a) sell there, so the worker publishes every imported product to the market publications at import time and backfills the catalogue (recommended to pawscout-agent in channel round 240; the worker is the operational Admin API actor); or (b) deactivate the three markets, after which the theme shows only the UK experience. The theme is ready for either. The `/localization` form is the only way a visitor changes market (no web presences).

### Phase 2: honesty and independence

- [x] T8 Done 2026-09-19: `snippets/supplier-availability.liquid` is the one place that decides label, detail, cap, urgency and freshness; the product page, cart page and cart drawer capture its output. A supplier check older than 3 days, or `unknown_stale`, drops every supplier field (status, quantities, delivery window, the "Availability updated" line); tracked Shopify inventory stays authoritative. The status values the worker actually writes (`available`, `out_of_stock`, measured on all 50 active products) are mapped alongside the documented ones. Verified on preview 207763407186 against live: two fresh products unchanged; two stale products (stamped 14 Sep and 14 Aug) lose the date line, the delivery window falls back to the static band (4-12 became 3-10 on the 14 Sep one) and the hidden estimate is gone; cart note unchanged; independence blocked 80/81 with 0 hard failures. Fixtures not available on live: `unknown_stale`, a product with no metafields, a low-stock quantity of 10 or fewer, a variant Shopify does not track. Asked pawscout-agent for them (round 238); R4's fixture acceptance is partial until then.
- [x] T9 Done 2026-09-19: "Fulfilled by" and its two assigns removed from `snippets/product-details-modal.liquid`; orphaned `snippets/product-details.liquid` deleted; the four unused assigns cleared (theme check now reports one warning, the hero preload, for T18). `tests/independence.cjs` asserts "product details never name the supplier" on the product page from now on. Measured on preview 207762719058: the same 8 product pages show "Fulfilled by CJ" on live and nothing on the preview; blocked run 80/81 with 0 hard failures, control 77/78. Acceptance: R5.
- [x] T10 Theme side done 2026-09-19: `templates/page.affiliates.json` renders the page body plus the new `sections/affiliate-apply.liquid` (Apply button to `/apps/pawscout/affiliate/apply`, shipped hidden; email route to sales@activepaw.co.uk, the address the worker's own page publishes); `theme.js` shows the button only once the storewide feed has answered; the footer links to `/pages/affiliates`. `tests/independence.cjs` asserts the page in blocked mode (complete, button hidden, email present) and in control mode (button visible, linking to the worker form) as soon as the page exists, and measures the worker form until then. **Owner step:** in admin create the page, title "Affiliates", handle `affiliates`, theme template `page.affiliates`, body copied from the worker's page (programme name, 2% rising to 5%, 5% for the audience, the three steps). Until then the footer link 404s on any preview or live theme carrying this change, so merge this pull request only after the page exists. Acceptance R6 is met when the blocked run passes the page. **Owner step done 2026-09-19 (by the agent, on the owner's instruction):** page "Affiliates" created through the Admin API (Page 179229753682, handle `affiliates`, template `page.affiliates`, published), body copied from the worker's page. `/pages/affiliates` returns 200 on live; until #6 deploys it renders with the default page template and no Apply card. Live since release-2026-09-19-7: the footer links to `/pages/affiliates`, the page renders the Apply card with the button hidden server-side and the email route present.
- [x] T11 Closed by measurement 2026-09-19, no layout change: on the thin search "sisal" (2 native, 3 ghost cards land) the ghost row inserts at 922 px on a 1280x900 viewport and the footer sits at 1100 px, both below the first viewport; on 390x844 the footer is at 1702 px. Cumulative layout-shift score is 0 on both viewports (PerformanceObserver, buffered): appended content grows the page but moves nothing on screen. On a taller desktop viewport the footer would move by one row, at most a CLS near 0.04, under the 0.1 threshold. `tests/independence.cjs` now measures CLS on every page in control mode and fails above 0.05 (blocked mode keeps the main-height rule). Acceptance: R7, second branch.
- [x] T12 Done with T8 (2026-09-19): `snippets/delivery-info.liquid` no longer reads the metafield itself; the caller passes the synced range only when the supplier check is fresh, and the hidden "Estimated delivery" line-item property follows the same rule.
- [x] T13 Done 2026-09-19: a Delivery block in `config/settings_schema.json` holds `delivery_detail_uk` (default: the current line) and `delivery_detail_other` (default: "Delivery options and times are shown at checkout."). `snippets/supplier-availability.liquid` picks one by `localization.country.iso_code`; `snippets/delivery-info.liquid` shows the free-delivery row and the estimate (a CJ-to-UK lane) to GB visitors only and the neutral line to the rest. Wiring proved on preview 207764619602 with a marker value in `settings_data.json`: the GB banner read the marker. Independence on the preview: blocked 80/81 with 0 hard failures. **Not verifiable yet, owner item:** the AU, EU and US markets are enabled on the store but every product page returns 404 for them (measured with the `/localization` form on live for AU, US and DE), so no non-GB visitor can reach the page that carries the line. Either assign the catalogue to those markets or disable them; R11's non-GB half is reviewed in code only until then.

### Phase 3: structure

- [x] T14 Done 2026-09-19: the list is the theme setting `home_collection_handles` (new "Collections" block in `config/settings_schema.json`, default the four handles in priority order), read in one place, `snippets/collection-handles.liquid`. `sections/main-product.liquid` splits that output; `sections/category-showcase.liquid` derives a block's default collection and anchor from its title (the home template sets every block's collection explicitly, so nothing changes on live); `sections/main-search.liquid` reads its keyword rules from the sibling setting `search_offer_keywords` (`handle: keyword, keyword; ...`) and accepts only handles from the list. No handle literal is left in any Liquid or JavaScript file. Verified on preview 207775727954 against live with the worker blocked: home blocks (ids, headings, card counts, view links), three product pages' related collections, six search terms and the term "fountain water" (the one that renders the Liquid suggestion block: the same three suggested products on both) all identical. Acceptance R8 met for the list.
- [x] T15 Done 2026-09-19: `contact_email` (Contact form block, default contact@activepaw.co.uk) feeds `sections/site-footer.liquid` and `sections/main-page-contact.liquid`. The hero badge's default link now exists once, as the hero section's own "Badge link URL" setting; `snippets/hero-event-badge.liquid` falls back to `routes.all_products_collection_url` instead of carrying a second copy. The welcome modal's browse destination is likewise decided once in Liquid (`settings.welcome_redirect`, else the all-products route); `assets/theme.js` no longer holds its own `/collections/all` fallbacks and only writes an href it was given. Verified on the same preview: footer and contact-page mailto, badge href, badge data href and welcome redirect identical to live. Acceptance R8 met.
- [x] T16 `TASKS.md` points here and retires the superseded items (commit 9999885).

### Phase 4: observability

- [x] T17 Done 2026-09-19: `.github/workflows/independence-daily.yml` runs `tests/independence.cjs` against live at 06:17 UTC daily, on demand, on every push that touches the workflow or the script, and once after each deploy (`workflow_run` on theme-ci completing on `shopify-deploy`, after a two-minute wait for Shopify's redeploy). Blocked mode is the gate; the control run is recorded but cannot fail the job; results and screenshots are kept as an artifact for 14 days. On failure the job opens the issue "Independence run failed against live" (label `independence`) or comments on the open one. A run from any branch other than `shopify-deploy` is a dry run: that branch's script is newer than what is deployed, so the run warns, cannot fail the job and opens no issue. Evidence, both paths exercised for real on 2026-09-19: run 35452979345 (before the guard) failed on the T9 assertion against live, which waits on pull request #3, and opened issue #8 (closed with that reason); run 35453341902 (with the guard) reported blocked 71/73 and control 68/70 against live (the T9 assertion, plus the worker's affiliate console error in control), emitted the dry-run warning, opened no issue and finished green. Scheduled runs use the live branch's own script, so they only fail when live is broken. **Post-deploy, first real day:** the `workflow_run` runs for the last two merges were cancelled by the workflow's own concurrency group (pending runs in a group replace each other when merges land minutes apart), so the group is removed; run 35457784390 (dispatched from shopify-deploy after the last merge): blocked 80/80 and control 77/77, 0 hard failures; the affiliates page is now the Shopify page, so the worker form's console error no longer appears in the run.
- [x] T18 Done 2026-09-19: the hero background preload uses `preload_tag` (`sections/hero-commerce.liquid`); `shopify theme check` reports 69 files, no offences locally. CI is the authority: at the same CLI 4.8.0 its rule set found two more warnings (`UnrecognizedRenderSnippetArguments`: `sections/main-search.liquid` passed `show_purchase_action` to `product-card-commerce`, which never reads it; a planted bogus argument produced no local warning, so the local rule is inert). The dead argument is removed; theme-ci run 35453341836 is green at `--fail-level warning`, so a new warning fails the build. Acceptance R9 met with T17.

## 5. Decisions (owner, 2026-09-19)

a. **Live branch:** one branch, `shopify-deploy`, with Shopify's GitHub integration connected; Shopify deploys every push to it. The working branch is merged in once and deleted. Rollback is a git revert.
b. **Staleness threshold:** 3 days without a supplier check; after that the theme stops trusting `supplier.status` and the delivery window.
c. **Affiliates:** a Shopify page is the entry point; the footer always links to it; the Apply button to the worker form is hidden when the worker is unreachable; an email route is always present.
d. **Old theme copies:** delete the 21 June and 4 July copies now; keep the 19 July copy until the first tagged release, then delete it.
e. **CI budget:** fast checks on every push to any branch; the full independence run on pull requests into the live branch and once after each deploy.
f. **Delivery claim:** true for the UK; it becomes a theme setting shown to UK visitors only, with a neutral line for other markets.

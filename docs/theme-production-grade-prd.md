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
- [ ] T2 Make `shopify-deploy` the one live branch. Pre-flight: md5 of every live theme file equals the working branch, so the merge changes nothing on the storefront. Merge `claude/search-supplier-suggestions` into `shopify-deploy` with the working branch's content winning for every theme file, owner says "go", push (Shopify deploys), tag `release-2026-09-<d>-1`, run the independence run against live, then delete the old branch. Acceptance: R1. Pre-flight 2026-09-19: `shopify theme pull --live` into a detached worktree of ddb7de0 left `git status` empty, and a planted local change was overwritten on re-pull, so the probe fires. Since then the branch adds three theme check comment lines to `layout/theme.liquid` (whitespace only in the rendered page); every other theme file is identical to live.
- [x] T3 `.github/workflows/theme-ci.yml` runs theme check, eslint and the unit tests on every push (commit 25810c5, fix fed8103, 2026-09-19). Acceptance shown: run 35433334488 went red on a failing unit test (a Windows-only path fixture), run 35433567778 is green on the branch head, 26 seconds end to end.
- [ ] T4 (owner) Create a Theme Access token for the store and add it to the repository secrets, with the store domain, for the preview job.
- [ ] T5 Add the pull-request job (push preview, independence run in both modes, delete preview) and the post-deploy job (independence run against live). Acceptance: R3.
- [ ] T6 Write `docs/RUNBOOK-THEME-DEPLOY.md` (branch, PR, merge, tag, revert, preview) and `docs/theme-worker-contract.md` (from channel round 230). Rehearse one revert on a throwaway branch connected to a preview theme. Acceptance: R2 and R10.
- [ ] T7 (owner) Delete the 21 June and 4 July theme copies now; delete the 19 July copy after the first tagged release (decision 5d). Measured 2026-09-19 09:00 UTC: the 21 June and 4 July copies are already gone; the 19 July copy (theme id 203969134930) remains; a new unpublished copy (id 207749579090) appeared at 08:05 UTC the same day and is not the theme agent's.

### Phase 2: honesty and independence

- [ ] T8 Extract `snippets/supplier-availability.liquid` returning label, detail, cap and urgency for a variant; use it from `sections/main-product.liquid`, `sections/main-cart.liquid` and `snippets/cart-drawer-contents.liquid`; map `unknown_stale` and a `last_checked_at` older than 3 days to the conservative default. Acceptance: R4 fixtures.
- [ ] T9 Remove "Fulfilled by" from `snippets/product-details-modal.liquid`; delete the orphaned `snippets/product-details.liquid`; clear the four unused assigns theme check reports. Acceptance: R5.
- [ ] T10 Create the Shopify page `/pages/affiliates` (programme copy, Apply button to the worker form, email route); point the footer at it; hide the Apply button in `theme.js` when the feed verdict is null. Acceptance: R6.
- [ ] T11 Reserve the supplier row's space on `sections/main-search.liquid` or place it below the native grid's fold. Acceptance: R7.
- [ ] T12 Apply the 3-day staleness rule to the delivery window in `snippets/delivery-info.liquid`. Acceptance: part of R4.
- [ ] T13 Move the default availability detail into a theme setting and gate it on the GB market; neutral line elsewhere. Files: `config/settings_schema.json`, `sections/main-product.liquid`. Acceptance: R11.

### Phase 3: structure

- [ ] T14 Move the collection handle list to one place (a theme setting or one snippet); update `sections/category-showcase.liquid`, `sections/main-product.liquid`, `sections/main-search.liquid`. Acceptance: R8.
- [ ] T15 Move the contact email and the hero badge's default link to theme settings. Acceptance: R8.
- [x] T16 `TASKS.md` points here and retires the superseded items (commit 9999885).

### Phase 4: observability

- [ ] T17 Add the daily scheduled independence run against live with issue-on-failure. Acceptance: R9.
- [ ] T18 Bring `shopify theme check` to zero warnings (manifest link, asset preload, unused assigns, orphaned snippet). Acceptance: R9.

## 5. Decisions (owner, 2026-09-19)

a. **Live branch:** one branch, `shopify-deploy`, with Shopify's GitHub integration connected; Shopify deploys every push to it. The working branch is merged in once and deleted. Rollback is a git revert.
b. **Staleness threshold:** 3 days without a supplier check; after that the theme stops trusting `supplier.status` and the delivery window.
c. **Affiliates:** a Shopify page is the entry point; the footer always links to it; the Apply button to the worker form is hidden when the worker is unreachable; an email route is always present.
d. **Old theme copies:** delete the 21 June and 4 July copies now; keep the 19 July copy until the first tagged release, then delete it.
e. **CI budget:** fast checks on every push to any branch; the full independence run on pull requests into the live branch and once after each deploy.
f. **Delivery claim:** true for the UK; it becomes a theme setting shown to UK visitors only, with a neutral line for other markets.

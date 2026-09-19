# Active Paw theme: production-grade programme

Survey, PRD and task list for the theme repository. Status: DRAFT for the owner's review, written 2026-09-19 by the theme agent. Every measurement below is first-hand from that day unless it says otherwise. Decisions the owner has not yet made are listed in section 5 and are stated as assumptions where the plan depends on them.

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

**R1. One source of truth for the live theme.** Decide the branch that is live (assumption: `claude/search-supplier-suggestions` is renamed or merged so that the live branch and Shopify's connected branch are the same branch). Reconcile the 13 differing files once, then keep them equal.
Acceptance: `shopify theme pull` into a clean checkout of the branch produces no diff; the repository documents exactly one branch as live.

**R2. Guarded deploy.** A script for the owner that refuses to push when the tree is dirty, theme check fails, eslint fails, the unit tests fail, or the branch is not reconciled with live; that makes a named rollback copy (`rollback-<date>-<sha>`) before every push; and that prints the exact command to publish the rollback. The owner still says "go".
Acceptance: each refusal is demonstrated once against a planted condition; a rollback copy exists after a real push; the runbook in `docs/RUNBOOK-THEME-DEPLOY.md` matches the script.

**R3. Continuous integration.** A GitHub workflow on every push: theme check, eslint, pytest, and the independence run against a preview theme created from the branch. Repository minutes are a budget, so the independence run may be limited to pushes on the live branch.
Acceptance: the workflow goes red on a planted failing test and green on the branch head.

**R4. Honesty under stale data.** One snippet decides the availability label and detail from `supplier.status`, `supplier.available_qty`, `supplier.max_order_qty` and `supplier.last_checked_at`. `unknown_stale`, and any status whose `last_checked_at` is older than N days (assumption: N = 7 until the owner rules), render the conservative default. The delivery window falls back to the static band under the same rule.
Acceptance: a preview theme with fixture products (fresh, stale, `unknown_stale`, no metafields) renders the expected label for each, checked by Playwright.

**R5. No internal sourcing on customer surfaces.** Remove "Fulfilled by" from Product details and delete the orphaned `snippets/product-details.liquid`.
Acceptance: `grep -r "Fulfilled by" sections snippets` is empty; the live PDP no longer shows it.

**R6. Affiliate fallback.** A Shopify page holds the affiliate explanation and a mailto; the footer link points at the worker page when the feed answered and at the Shopify page otherwise.
Acceptance: the independence run passes the affiliate page in blocked mode.

**R7. No layout shift on worker success.** The supplier row on the search page reserves its space or renders below the native grid's fold.
Acceptance: the control run's main-height delta for the search page is within 2 px, or the shift is entirely below the first viewport.

**R8. One place per fact.** The quantity-cap rule, the collection handle list, the contact email and the hero badge's default link each exist once (a snippet or a theme setting).
Acceptance: each grep count is 1; the PDP, cart page and drawer still agree on caps (Playwright on the preview).

**R9. Observability.** A scheduled workflow runs the independence run against live daily and opens an issue on failure; theme check reports zero warnings.
Acceptance: the schedule has run green at least once; `shopify theme check` prints 0 warnings.

**R10. Documentation.** The runbook, the contract (touchpoints, payload fields, fallbacks) and a refreshed `TASKS.md` live in the repository, not only in agent memory.
Acceptance: a new developer can deploy a one-line change to a preview using only the repository.

### 3.4 Phases

1. **Deploy safety** (R1, R2, R3, R10). Nothing else ships until an edit has a guarded path to live.
2. **Honesty and independence** (R4, R5, R6, R7). Fixes to what customers see; each verified on a preview then pushed by the owner.
3. **Structure** (R8). Consolidation with no visible change; verified by the same Playwright runs.
4. **Observability** (R9). The daily run and zero-warning theme check.

Phase 2's fixes are small and safe on their own; if the owner prefers, R5 can ship first as a single-line removal.

### 3.5 Assumptions made in this draft

- The live branch and the Shopify-connected branch become one branch (R1).
- Staleness threshold N = 7 days (R4).
- The affiliate fallback is a Shopify page owned by this repo (R6).
- The independence run in CI targets a preview theme created per run and deleted afterwards (R3); creation needs a CLI or Admin API token available to the workflow.

## 4. Task list

Ordered. Each task names its files and its acceptance check. Tasks marked (owner) need the owner's action or decision.

### Phase 1: deploy safety

- [ ] T1 (owner) Decide the live branch (section 5, question a).
- [ ] T2 Reconcile: diff the live theme against the chosen branch by md5, resolve the 13 files, push once with the owner's go, confirm `shopify theme pull` is clean. Files: the 13 differing theme files. Acceptance: R1.
- [ ] T3 Write `scripts/theme-deploy.mjs` (Node, uses the Shopify CLI): reconcile check, theme check, eslint, pytest, named rollback copy, push with `--json`, publish-rollback command printed. Acceptance: R2 refusals demonstrated.
- [ ] T4 Write `docs/RUNBOOK-THEME-DEPLOY.md` and `docs/theme-worker-contract.md` (from channel round 230). Acceptance: R10.
- [ ] T5 Add `.github/workflows/theme-ci.yml`: theme check, eslint, pytest on every push; independence run against a preview on the live branch only. Acceptance: R3.
- [ ] T6 (owner) Delete the three unnamed "Copy of" themes once the rollback copy convention exists.

### Phase 2: honesty and independence

- [ ] T7 Extract `snippets/supplier-availability.liquid` returning label, detail, cap and urgency for a variant; use it from `main-product.liquid`, `main-cart.liquid` and `cart-drawer-contents.liquid`; map `unknown_stale` and stale `last_checked_at` to the conservative default. Acceptance: R4 fixtures.
- [ ] T8 Remove "Fulfilled by" from `snippets/product-details-modal.liquid`; delete `snippets/product-details.liquid`; clear the four unused assigns theme check reports. Acceptance: R5.
- [ ] T9 Create the affiliate Shopify page (copy from the worker page, mailto), and switch the footer link on the feed verdict in `theme.js`. Acceptance: R6.
- [ ] T10 Reserve the supplier row's space on `sections/main-search.liquid` or move it below the fold. Acceptance: R7.
- [ ] T11 Apply the delivery-window staleness rule in `snippets/delivery-info.liquid`. Acceptance: part of R4.

### Phase 3: structure

- [ ] T12 Move the collection handle list to `config/settings_schema.json` (a text setting) or one snippet; update `category-showcase.liquid`, `main-product.liquid`, `main-search.liquid`. Acceptance: R8.
- [ ] T13 Move the contact email and the badge default link to theme settings. Acceptance: R8.
- [ ] T14 Refresh `TASKS.md` to point here and retire the superseded platform items. Acceptance: R10.

### Phase 4: observability

- [ ] T15 Add the daily scheduled independence run with issue-on-failure. Acceptance: R9.
- [ ] T16 Bring `shopify theme check` to zero warnings (manifest link, asset preload). Acceptance: R9.

## 5. Questions for the owner

a. Which branch is the live theme's source of truth, and should Shopify's GitHub integration stay connected to it (Shopify then deploys on push) or be disconnected in favour of the CLI push you run today?
b. Staleness threshold: after how many days without a supplier check should the theme stop trusting `supplier.status` and the delivery window? The draft assumes 7.
c. Affiliate fallback: a Shopify page with the same copy and a mailto, or hide the link when the worker is unreachable?
d. May the three unnamed "Copy of" themes from June and July be deleted?
e. CI minutes: the repository is private, so every push costs minutes. Is a per-push run acceptable, or only on the live branch?
f. The default availability detail reads "Free UK delivery on every order." Confirm it is true for every product and market, or it becomes a setting.

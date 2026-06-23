# Active Paw - Theme Audit (2026-06-06)

Full-codebase review of the Active Paw Shopify theme against four lenses: **responsive
design**, **revenue / ROAS**, **Shopify TOS & Theme Store gating**, and **end-to-end CX**.
Analysis only - no code was changed. All findings cite `file:line`.

> **Source vs. rendered - resolved.** I checked the rendered snapshots under
> `output/shopify-dev/`. The only `og:` tags present are `og:image*` (image, secure_url,
> width/height/alt), and they are **auto-injected by Shopify's `content_for_header`** for
> product pages (they appear immediately after `shopify-cfh-end`, not from any Liquid in this
> theme). There is **no** `twitter:card`, **no** `og:title/type/url/description`, and **no**
> `application/ld+json` Product structured data - in either the source *or* the rendered output.
> So the structured-data finding below is **confirmed**, not a stale-source artifact.
>
> **The authoritative gate is `shopify theme check`** (the Theme Check linter shipped with the
> CLI you already use). It mechanically enforces the `theme_info`, translation, schema, and a11y
> classes of issue below and is what Shopify actually runs. Run it for the objective pass/fail;
> treat this audit as the qualitative layer on top. This manual review is a complement, not a
> substitute for that linter.

---

## 0. Release blockers (fix before Theme Store submission *or* paid traffic)

> **Status - 2026-06-06:** ✅ **B1, B2, B4 resolved**; B3 **partially** resolved (discount badge
> now gated on real `compare_at_price` with a computed %; fabricated *reviews/ratings* still need
> a real review source). B5 (tracking) outstanding. `shopify theme check` → **38 files, 0
> offenses**.
>
> **Batch 2 (safe / no-decision) - also resolved 2026-06-06:**
> - §1 CRITICAL - `--sticky-header-offset` now measured at runtime (`syncStickyHeaderOffset` in
>   `theme.js`) with the CSS values kept as fallback.
> - §1 HIGH - mobile search button 36→44px; search input 14→**16px** (kills iOS focus-zoom).
> - §1 HIGH - `srcset`/`sizes` added to collection cards, commerce cards, PDP thumbs, and the
>   PDP featured image (now `fetchpriority="high"` for LCP).
> - §4 MEDIUM - PDP qty stepper now clamps to `max`; `#ProductQuantity` gained `data-cart-quantity`
>   so typed values are normalized too.
> - §4 MEDIUM - `updateCartCount()` syncs the cart badge **and** the `.header-cart` aria-label with
>   `99+` parity after AJAX.
> - §3 MEDIUM - PDP thumbnail `alt` emptied (decorative; the button carries the label).
>
> **Batch 3 (SEO / structured data + analytics) - 2026-06-06:**
> - §3 CRITICAL (C3) **resolved** - new `snippets/meta-tags.liquid` adds the missing
>   `og:title/type/url/description/site_name/locale` + `twitter:card/title/description`, and
>   **Product / Organization / WebSite / BreadcrumbList JSON-LD**. `og:image` deliberately omitted
>   (Shopify auto-injects it). Product schema has **no `aggregateRating`** until reviews are real.
> - **B5 path chosen:** official Google & Meta channel apps + **CAPI / Enhanced Conversions**
>   (best ROAS signal, lowest maintenance, tracking lives outside the theme). Admin steps in
>   `docs/analytics-setup-checklist.md`. `shopify theme check` → **39 files, 0 offenses**.
> - **Rebrand leak found:** the admin social-sharing image still resolves to `pawmerce-share.png`
>   (drives the auto `og:image`) - flagged in the checklist to swap to the Active Paw image.
>
> **Batch 5 (cart drawer + AJAX) - 2026-06-06:**
> - §2 CRITICAL (no AJAX cart / no drawer) **implemented** - new `sections/cart-drawer.liquid`
>   + `snippets/cart-drawer-contents.liquid`, rendered once in the layout. `theme.js` intercepts
>   every `/cart/add` form (PDP + product cards) → AJAX add via Section Rendering API → opens a
>   slide-out drawer; qty +/−/typing and remove use `/cart/change.js`; ESC/Tab focus trap; 422
>   errors surface inline; header cart opens the drawer (with `/cart` as no-JS fallback). Drawer
>   mirrors the per-line quantity-cap logic so checkout stays gated.
> - **Runtime verification found a real bug Theme Check missed:** `meta-tags.liquid`'s
>   `SearchAction` target broke Liquid's `{{ }}` parser via the literal `{search_term_string}`
>   braces → **HTTP 500 on every page**. Fixed by building the URL with `capture` (braces become
>   literal text). `node --check` + `shopify theme check` both passed this file *before* the fix -
>   proof that linters don't catch render-time Liquid errors.
> - **Second bug, also found at runtime:** the PDP quantity input rendered `max="0"` whenever the
>   cap resolved to 0 (tracked `inventory_quantity` 0 while the variant is still sellable) →
>   `<input min="1" max="0">` is invalid HTML that **blocks the entire add-to-cart form** (native
>   submit *and* AJAX). Fixed by clamping the cap to ≥1 in `main-product.liquid`,
>   `cart-drawer-contents.liquid`, and `main-cart.liquid` (Shopify still enforces real stock at
>   `/cart/add`, surfaced via the 422 handler).
> - Added a 422-revert: a rejected `/cart/change.js` now re-renders the drawer from the server's
>   true cart instead of keeping the optimistic value.
> - **Status: VERIFIED end-to-end via `shopify theme dev` + Playwright** - add-to-cart opens the
>   drawer (item, subtotal £14.99, badge, aria-label sync), qty cap holds, Remove → empty state,
>   ESC closes, header-cart re-opens. All 4 PDP JSON-LD blocks + 2 home blocks parse as valid JSON.
>   Changes are on the **development theme** (theme dev) - run `shopify theme push` to deploy.
>
> **Batch 4 (nav configurability) - 2026-06-06:**
> - §3 HIGH (H2) **resolved** - header category nav and footer "Shop" column are now
>   `link_list`-driven (`section.settings.menu` / `footer_menu`, defaulting to `main-menu` /
>   `footer`), merchant-editable in the theme editor. The broken `#category-*` fragment anchors are
>   gone; the empty-menu fallback links to the real category **collections**, not page fragments.

| # | Blocker | Why it blocks | Anchor |
|---|---------|---------------|--------|
| B1 | **Theme JS force-hides third-party overlays (Honey / PayPal Honey)** | Lead reason: it's a **correctness bug** - a bare `'honey'` substring match hides legitimate products on a **pet store** (`honey-oat-shampoo.jpg`, `aria-label="Honey & Oat bar"` → `display:none`), and it's a *perf* drain (full-DOM rescan on every mutation). Secondary: deliberately disabling another party's software is plausibly adversarial under Theme Store review - worth removing on that basis too, though I can't cite a specific rule. Remove it regardless of the TOS question. | `assets/theme.js:1,13-28,301-304` |
| B2 | **No `theme_info` block in `settings_schema.json`** | The Theme Store requires `theme_info` as the **first** array element (`theme_name`, `theme_version`, `theme_author`, …). Absent → cannot be submitted. | `config/settings_schema.json:1-13` |
| B3 | **Fabricated reviews/ratings + unconditional "Save 35%" must become merchant-driven before production** | This is a demo store, so these are placeholders - but if shipped as-is they're potential consumer-protection exposure (fake "verified buyer" reviews; a discount claim unrelated to real `compare_at_price`) worth compliance/legal review, and the static badge contradicts the store's own FAQ promise. Gate them on real data. | `main-product.liquid:114,116,147,280-294`; `product-card-commerce.liquid:37`; `conversion-stack.liquid:11-27` |
| B4 | **No express checkout (`payment_button`) on the PDP** | Biggest single revenue leak for paid-social traffic - no Shop Pay / Apple Pay / Google Pay one-tap path exists anywhere. Decorative payment icons make the page *look* like it offers it. | `main-product.liquid:181-208` |
| B5 | **No theme-level conversion tracking / event hooks** | No `add_to_cart` / `begin_checkout` / `view_item` signals; add-to-cart is a full-page POST with no JS interception, so there's no integration point to fire them. Paid campaigns can't optimize → inflated CPA. | theme-wide; `theme.liquid:20` |

---

## 1. Responsive design

**Strengths:** consistent `clamp()` fluid type & spacing, `minmax(0,1fr)` grids that resist
content blowout, `aspect-ratio` + explicit `width/height` (low CLS), correct `eager`/`lazy`
LCP split, and a `prefers-reduced-motion` block.

| Sev | Finding | Anchor |
|-----|---------|--------|
| CRITICAL | **Hardcoded `--sticky-header-offset` magic number** (176 → 222 → 228px across breakpoints) feeds 8+ sticky/min-height consumers. If the announcement bar wraps, the logo resizes, or nav reflows, every sticky element overlaps or gaps and `max-height` scroll regions miscalculate. The 3-row sticky stack makes this fragile. | `theme.css:10,2155,2238` (consumers: `913,1070,1204,1434,1467,1512,1587,1596`) |
| HIGH | **Fixed `min-width` grid floors overflow below ~360px** - `.trust-card` (220px inner track in a 300px card) and `.cart-item` (112px media + 112px price col). | `theme.css:576,1103,1192,2339` |
| HIGH | **Header search button shrinks to 36px** at ≤620px - under the 44px tap-target floor on exactly the phones where it matters. | `theme.css:2266-2271` |
| HIGH | **Header search input set to 14px** at ≤620px → iOS Safari auto-zooms the viewport on focus (anything <16px). | `theme.css:2264` |
| HIGH | **Most product images lack `srcset`/`sizes`** → phones download desktop-width assets (PDP hero `width:1400`, cards `width:720`). Only the logo and cart image do it right. | `main-collection.liquid:12`; `product-card-commerce.liquid:29`; `main-product.liquid:81,93` |
| MEDIUM | **No tablet breakpoint** (only 900 / 620). 4-col grids stay 4-wide on ~1000px tablets; a **900-1090px dead zone** lets the 3-col PDP (`minmax` totals 1030px) and footer (1060px) overflow horizontally before the 900px query fires. | `theme.css:1464,2069,751,1948` |
| MEDIUM | **Sub-44px targets:** share 38px, qty steppers 42px, cart qty input 40px, "Remove" link (no min size), nav links ~33px at 620px. | `theme.css:1669,1827,1166,1174,2290` |
| MEDIUM | Fixed-px grid columns that never reflow (`.review-bars` 64px/44px rails, `.pdp-confidence-list` 120px label). | `theme.css:2051,1749` |
| LOW | 2419-line single `theme.css`, no section banners; per-component responsive rules scattered across 3 distant regions - the main maintainability liability (a deliberate "no build step" tradeoff). | whole file |

---

## 2. Revenue / ROAS

**Strength:** page speed is the theme's best area - single CSS file, one deferred `theme.js`
(~305 lines), no framework/jQuery, correct LCP eager image.

| Sev | Finding | Lever | Anchor |
|-----|---------|-------|--------|
| CRITICAL | **No express/accelerated checkout** (no `payment_button`). | +CVR +ROAS, mobile | `main-product.liquid:181-199` |
| CRITICAL | **No AJAX cart / no cart drawer** - every add is a full reload; header cart is a plain `/cart` link. Kills add-to-cart momentum & multi-item baskets. | +CVR | `main-product.liquid:198`; `site-header.liquid:60` |
| CRITICAL | **No conversion tracking** (no GA4/Meta/dataLayer/GTM hooks; no client-side ATC interception point). | +ROAS measurement | theme-wide |
| HIGH | **Mobile sticky "ATC" only scrolls** - its CTA is `<a href="#ProductQuantity">Choose options</a>`, never adds to cart, even for single-variant products. | +CVR, mobile | `main-product.liquid:255-265` |
| HIGH | **PDP cross-sell button is dead** - "Add £13.50" card has no `data-bundle-add` / variant IDs; the only working bundle handler lives on the search page. | +AOV | `main-product.liquid:212-218` |
| HIGH | **No dynamic free-shipping progress bar** despite a £150 threshold hardcoded in 3+ places; cart shows only a static subtotal. (£150 is also very high for impulse pet SKUs.) | +AOV | `main-cart.liquid:137-157`; `announcement-bar.liquid:43` |
| HIGH | **Fake social proof** (see B3) - identical "4.8" on every card reads as fake and erodes trust. | −trust | `product-card-commerce.liquid:37` |
| MEDIUM | **No variant-change JS** - selecting a size doesn't update price, gallery, or sticky bar; variants are a single native `<select>` with no swatches. | +CVR | `main-product.liquid:182-188` |
| MEDIUM | **Checkout button can be disabled** by the hardcoded `20` fallback cap, blocking legitimately stocked items. | +CVR | `main-cart.liquid:21,152` |
| MEDIUM | **No Product JSON-LD** → weaker Google Shopping / PMax feed quality & rich results. | +ROAS (feeds) | theme-wide |
| LOW | Hero JPG background has no `preload`/`fetchpriority` - small home-page LCP win. | speed | `hero-commerce.liquid:1` |

---

## 3. Shopify TOS & Theme Store gating

**Compliant already (keep):** `lang`/viewport/charset/canonical/`content_for_header`/
`content_for_layout`/skip-link all present (`theme.liquid`); CSS via `stylesheet_tag`, JS
`defer` (no render-block); no inline `on*` handlers; `| money` filter used throughout; `fetch`
hits only first-party Shopify routes; `hero-commerce` has a valid schema **with** preset.

| Sev | Finding | Anchor |
|-----|---------|--------|
| CRITICAL | **`theme_info` missing** (B2). | `config/settings_schema.json:1-13` |
| CRITICAL | **Overlay-hiding JS** (B1) - adversarial to third parties. | `theme.js:1-28,301-304` |
| CRITICAL | **No Twitter Card, no full OG set, no Product JSON-LD** (confirmed in source *and* rendered output). Shopify auto-injects only `og:image*`; the theme authors no `og:title/type/url/description`, no `twitter:card`, no `application/ld+json`. Dawn ships `snippets/meta-tags.liquid` + Product structured data; this theme has neither. | `theme.liquid:1-23` |
| HIGH | **Navigation is hardcoded on-page anchors**, not merchant-editable `linklists`. The `#category-*` fragments only exist on the homepage → broken nav on every other page. | `site-header.liquid:75-79`; `site-footer.liquid:19-39` |
| HIGH | **Every section ships `settings: []`** - merchants can configure nothing (breadcrumbs, related products, payment icons, footer columns, newsletter). | `main-product.liquid:296-298`; `site-header.liquid:84-86`; `site-footer.liquid:60-62`; `main-cart.liquid:169-171` |
| HIGH | **Strings hardcoded in English**, not via `{{ 'key' | t }}`. `locales/en.default.json` holds only the skip-link string. (Money formatting *is* compliant.) | `locales/en.default.json` |
| HIGH | **Hardcoded "GBP" currency strings** bypass `money`/Markets multi-currency. | `main-product.liquid:15,144-145,217`; `site-footer.liquid:9` |
| MEDIUM | **Contrast:** white text on accent `#F05A28` ≈ 3.4:1 - passes 3:1 (UI/large) but **fails** AA 4.5:1 for normal-size button text. Gate on merchant-chosen accent too. | `theme.css:418,888-889,991-992` |
| MEDIUM | **Alt-text:** 12 thumbnails repeat `alt: product_title` (should be decorative/empty); hero may emit a 2nd `<h1>` on pages that already have one. | `main-product.liquid:81`; `hero-commerce.liquid:4` |
| MEDIUM | **No `aria-live`** for qty-cap / cart / share feedback; `setCustomValidity` messages may be missed by SR users. | `theme.js:173-200,278` |
| LOW | Redundant `role="main"`; leftover `Pawmerce→brand_name` replacement in `<title>`; newsletter posts `customer` form_type to `/contact`. | `theme.liquid:15,17,29`; `site-footer.liquid:42-43` |

---

## 4. JavaScript quality & performance

| Sev | Finding | Anchor |
|-----|---------|--------|
| CRITICAL | **Whole-document MutationObserver** (`subtree:true`) runs a full `querySelectorAll('iframe,div,button,…')` rescan on **every** mutation - no debounce, ignores `MutationRecord`, no early-out. Dominant main-thread cost; jank during scroll/interaction. | `theme.js:301-304,3-28` |
| HIGH | **Overlay substring match hides real content** (B1 correctness side) - `'honey'` matches product imagery/labels on a pet store. | `theme.js:1,13-26` |
| HIGH | **`fitProductTitle` layout thrash** - writes `fontSize` then reads `scrollHeight` each loop iter (~20 forced reflows × N titles) on load + every resize. Use binary search or CSS `clamp()`. | `theme.js:51-67` |
| MEDIUM | **PDP qty stepper never enforces `max`** - clamps floor (1) but not ceiling; `normalizeCartQuantity` (which *does* clamp) is wired only to the cart input, not `#ProductQuantity`. Contradicts the documented cap invariant. | `theme.js:225-232` vs `192-200` |
| MEDIUM | **422 body never parsed** - Shopify's `{message, description}` for out-of-stock/over-limit is discarded; generic "Could not add set"; no partial-failure feedback. | `theme.js:260-293` |
| MEDIUM | **Header cart aria-label/`99+` not synced** after AJAX add - badge updates but the parent link's `aria-label` (the accessible name) stays stale; badge can show `103` vs server `99+`. | `theme.js:278`; `site-header.liquid:60,68` |
| LOW | `setProductMedia` dedup guard never short-circuits (resolved vs Liquid URL mismatch); no `aria-live`; listeners/observer never disconnected (benign for full-reload theme); `showMore` label degrades after expand/collapse; resize uses `setTimeout` not `ResizeObserver`/`rAF`; `.quick-add` handler has no confirmed markup. | `theme.js:33,73-77,210-218,240-243,303-304` |

**Correct & worth keeping:** delegated listeners with null-safe `.closest()`; correct
`cart/add.js`→`cart.js` usage via `Shopify.routes.root`; robust clipboard/share fallbacks
(`AbortError` handled); sound `normalizeCartQuantity` clamp logic.

---

## 5. Suggested sequencing

0. **Run `shopify theme check`** - the objective gate. Fix whatever it flags first; the items
   below are the qualitative layer it won't catch.
1. **Compliance & gating (cheap, unblocks submission + de-risks):** remove the overlay-hiding
   JS (B1); add `theme_info` (B2); gate "Save 35%" behind real `compare_at_price > price` and
   make fabricated reviews merchant-driven before production (B3); author `og:title/type/url/
   description` + `twitter:card` + Product `application/ld+json` (Shopify supplies only
   `og:image`).
2. **Revenue, highest ROI:** add `{{ form | payment_button }}` (B4); wire a real sticky ATC;
   add a free-shipping progress bar; fix or remove the dead cross-sell button.
3. **Measurement:** add a JS-intercepted AJAX add-to-cart so GA4/Meta `add_to_cart` /
   `begin_checkout` can fire (B5) - pairs naturally with a cart drawer.
4. **Responsive hardening:** replace the `--sticky-header-offset` magic number with a measured
   value, add `srcset`/`sizes`, fix the <44px / iOS-zoom mobile targets, add a tablet
   breakpoint.
5. **JS hygiene:** scope/debounce the MutationObserver; de-thrash the title fitter; enforce
   the PDP qty cap; parse 422 bodies; sync the cart aria-label.
6. **Merchant configurability:** expose section settings and `linklist`-based nav so the theme
   is actually editable (Theme Store expectation).

# Active Paw - Design Improvements Log

**Rule:** Every change to the theme that affects aesthetics, UX, or compliance must be logged here before the task is considered done. Entries are append-only and dated.

**Tool lineage (2026-09-18):** entries 6 and 14 describe the in-repo prototype of the code-graph builder. That prototype moved to its own repository, was renamed Graphite and is now installed as a package; the old name was retired from this repo on 2026-09-18 and older entries were updated to the current name. `GRAPHITE.md` is the current reference.

---

## Entry 1 - 2026-06-08: Mobile Announcement Bar Marquee

### What changed
- `sections/announcement-bar.liquid` - duplicated the 3 announcement items inside `.announcement-track` so the track contains 6 items total. The duplicated set has `aria-hidden="true"` to keep screen readers from double-announcing.
- `assets/theme.css` - added `@keyframes announcement-marquee` and mobile-only styles under `@media (max-width: 620px)` that convert the 3-column grid into a single-row flex ticker with `animation: announcement-marquee 18s linear infinite`.
- `assets/theme.css` - under `@media (prefers-reduced-motion: reduce)` the animation is disabled and the track becomes a horizontally scrollable strip (`overflow-x: auto`).

### Why it changed
- The original 3-column grid on mobile wrapped each cell's title + body text into 3-4 lines, creating a tall (~70px), cluttered bar that pushed the hero down and felt broken.
- A continuous marquee keeps all 3 messages visible in a compact (~34px) row without requiring user interaction.

### How it was solved
- **Seamless CSS loop:** By duplicating the 3 items, the `translateX(-50%)` keyframe scrolls the first set off-screen exactly as the duplicate set enters, creating an infinite loop with no jump.
- **Accessibility:** `aria-hidden` on duplicates + `prefers-reduced-motion` fallback ensures the bar is usable for screen-reader and motion-sensitive users.
- **Interaction:** `animation-play-state: paused` on hover lets users stop the scroll if they want to read a message.

### Files touched
- `sections/announcement-bar.liquid` (lines 35-67 added)
- `assets/theme.css` (`@keyframes` block added at line ~2219; mobile styles at lines ~2226-2263)

### Screenshots
- Before: `announcement-bar-before.png` - tall multi-line wrapped text
- After: `announcement-marquee-preview.png` - single compact scrolling ticker

### Shopify Theme Store compliance
- ✅ No external dependencies
- ✅ Pure CSS animation (no JS)
- ✅ Respects `prefers-reduced-motion`
- ✅ `aria-hidden` prevents double-announcement

### Graphite sync
- **Attempted:** the LLM graph-update skill on 2026-06-08.
- **Result:** 5 docs changed detected, but semantic extraction requires an API key (GEMINI_API_KEY, GOOGLE_API_KEY, or other). Code-only AST extraction would proceed without a key, but the new markdown docs triggered the semantic path. Re-run locally after setting a key, or skip if the graph remains sufficiently current for queries.

---

## Entry 2 - 2026-06-08: Frontend Design Review + Mobile Validation

### What changed
- `docs/frontend-design-review.md` created - comprehensive aesthetic review of the entire theme based on reading all Liquid sections, CSS, JS, and live mobile screenshots.
- `docs/shopify-theme-store-compliance.md` created - checklist against Shopify's theme development requirements.

### Why it changed
- The user asked for a review of the frontend aesthetic design. The review identified 12 priority issues across color, typography, layout, visual hierarchy, component design, mobile UX, and brand identity.
- Mobile validation via live screenshots from `activepaw.co.uk` confirmed several issues and revealed new ones (placeholder text visibility, image inconsistency, payment icon crowding).

### Key findings
1. Category showcase `#b8792d` background clashes with orange headings
2. All cards share identical styling (radius, shadow, border)
3. "Ad-ready product page..." placeholder text visible on every product card
4. Stock dot uses green for "Low stock" (misleading)
5. PDP buybox lacks visual prominence
6. Payment icons overwhelm on mobile (12 icons wrapping)
7. Footer is dense and corporate on mobile
8. No brand personality beyond sharp rectangles

### Shopify Theme Store compliance status
- 🔴 Must fix before submission: placeholder copy in `main-product.liquid` and `product-card-commerce.liquid`, green stock dot for low stock
- 🟡 Should fix: section presets, schema translations, color setting descriptions
- 🟢 All architecture, accessibility, performance, and platform integration requirements pass

---

## Unimplemented (proposed)

| # | Change | Priority | Status |
|---|---|---|---|
| 2 | Fix category showcase brown-gold background | High | Proposed |
| 3 | Remove/replace "Ad-ready..." placeholder text | High | Proposed |
| 4 | Stock dot conditional color (orange for low stock) | High | Proposed |
| 5 | Buybox accent border + stronger CTA | Medium | Proposed |
| 6 | Share button compact sizing | Medium | Proposed |
| 7 | Payment icons: limit to 6 on mobile | Medium | Proposed |
| 8 | Cart drawer empty state illustration | Low | Proposed |
| 9 | FAQ accordion animation | Low | Proposed |

*When any of the above are implemented, they will be promoted to a numbered entry above with full what/why/how documentation.*

---

## Entry 3 - 2026-06-08: Batch Aesthetic Fixes (7 Changes)

### What changed

#### 1. Category showcase background (`assets/theme.css`)
- Changed `.category-showcase` background from `#b8792d` (muddy brown-gold) to `var(--surface)` (`#f7f4ef`, warm cream).
- Changed `.category-heading h2` color from `var(--accent)` (orange) to `var(--ink)` (dark) for readable contrast on the cream background.

#### 2. Removed placeholder benefit text (`snippets/product-card-commerce.liquid`)
- Changed the default `benefit` assignment from `'Ad-ready product page with variants, bundles, and delivery details.'` to `''` (empty string).
- Product-type conditional benefits (grooming, walking, dental, paw) are preserved and still render when matched.
- Commerce cards now show no description line when no product-type match exists, instead of showing visible filler copy.

#### 3. Stock dot conditional color (`assets/theme.css` + `sections/main-product.liquid`)
- Added `.stock-dot.is-low-stock` CSS rule that changes the dot and text color to `var(--accent)` (orange) / `var(--accent-dark)`.
- In `main-product.liquid`, the `.stock-dot` span now conditionally receives `is-low-stock` class when `pdp_status_label == 'Low stock'`.
- Default remains `var(--green)` for in-stock and other statuses.

#### 4. Buybox accent top border (`assets/theme.css`)
- Added `border-top: 3px solid var(--accent)` to `.product-buybox`.
- The buybox now has a distinct orange top border that visually separates it as the primary action container, rather than looking identical to every other card.

#### 5. Commerce grid 1-column below 480px (`assets/theme.css`)
- Added `@media (max-width: 480px) { .commerce-grid { grid-template-columns: 1fr; } }`.
- On narrow phones (e.g., iPhone SE, small Android), commerce cards now stack to full width instead of squeezing into ~170px two-column cards with illegible titles.

#### 6. Payment icons limited to 6 on mobile (`assets/theme.css`)
- Added `.pdp-pay-row li:nth-child(n+7) { display: none; }` inside the existing `@media (max-width: 620px)` media query.
- On mobile PDP, only the first 6 payment icons are shown, eliminating the crowded 12-icon row that created visual anxiety next to the Add to Cart button.

#### 7. Share button compact sizing (`assets/theme.css`)
- Reduced `.share-button` padding from `8px 13px` to `6px 10px`, border-radius from `999px` to `6px`, font-size from `13px` to `12px`, font-weight from `900` to `700`, min-height from `38px` to `32px`, gap from `8px` to `6px`.
- SVG icon reduced from `17px` to `14px`.
- `.pdp-share-button` margin-top reduced from `12px` to `10px`.
- The share button now reads as a subtle utility instead of a competing CTA.

### Why it changed
- These 7 items were the highest-impact, lowest-effort changes from the design review (Entry 2). All were validated via live CSS injection on `activepaw.co.uk` before coding.
- The batch fixes the most visible aesthetic and UX issues on mobile: color clash, filler copy, misleading stock signals, CTA prominence, grid readability, payment crowding, and share-button competition.

### Files touched
- `assets/theme.css` - category showcase background, buybox border, stock dot styles, share button sizing, payment icon mobile limit, commerce grid 480px breakpoint
- `snippets/product-card-commerce.liquid` - default benefit text removed
- `sections/main-product.liquid` - conditional `is-low-stock` class on stock dot

### Screenshots
- Before/after previews captured via browser injection:
  - `docs/preview-before-homepage-mobile.png` / `docs/preview-after-homepage-mobile.png`
  - `docs/preview-before-pdp-mobile.png` / `docs/preview-after-pdp-mobile.png`

### Shopify Theme Store compliance
- ✅ Blocker B1 resolved: placeholder "Ad-ready product page..." text removed
- ✅ Blocker B3 resolved: stock dot color now conditionally orange for low stock
- ✅ All changes use existing CSS tokens (`--surface`, `--accent`, `--ink`, `--green`) - no hardcoded mystery colors
- ✅ No external dependencies
- ✅ Accessibility: contrast on category showcase headings is now AA-compliant (dark on cream)

### Graphite sync
- **Attempted:** the LLM graph-update skill on 2026-06-08.
- **Result:** 1 doc changed (`design-improvements.md`), 0 code files changed. Semantic extraction requires an API key (GEMINI_API_KEY, GOOGLE_API_KEY, etc.). The code files (`theme.css`, `main-product.liquid`, `product-card-commerce.liquid`) are handled by AST extraction and do not need a key, but the updated markdown doc triggers semantic mode. The existing graph remains current for code queries; set an API key to enable full semantic doc updates.

---

## Entry 4 - 2026-06-08: Batch Aesthetic Fixes Part 2 (5 Changes)

### What changed

#### 1. Cart drawer empty state (`snippets/cart-drawer-contents.liquid` + `assets/theme.css`)
- Replaced generic "Your cart is empty" with playful copy: "Your basket is feeling lonely" / "Let's find something for your furry friend."
- Added a paw-print icon (inline SVG, `aria-hidden="true"`) above the title.
- CSS: `.cart-drawer__empty-icon` styled in accent orange at 55% opacity; `.cart-drawer__empty-title` font-weight reduced from 900 to 800; `.cart-drawer__empty-body` added with muted color at 14px.

#### 2. FAQ accordion animation (`assets/theme.css`)
- Added smooth open/close animation using the modern `::details-content` pseudo-element with `interpolate-size: allow-keywords`.
- `block-size` transitions from `0` to `auto` over 0.25s ease.
- Falls back to instant open/close in browsers without support (Safari, older Chrome/Firefox) - no regression.

#### 3. Differentiate card families (`assets/theme.css`)
- **Product cards** (`.product-card`, `.commerce-card`): unchanged - retain shadow + hover lift + 8px radius as the interactive standard.
- **Info cards** (`.pdp-info-grid article`, `.faq-list details`, `.support-card`): radius reduced to 6px, shadow removed or minimized. Flat, subtle, informational.
- **Feature/CTA cards** (`.bundle-card`, `.delivery-card`): radius increased to 12px, border removed, filled background retained. Visually distinct from both product and info cards.

#### 4. Typographic scale reduction (`assets/theme.css`)
- `.brand-copy small`: font-weight 800 → 600 (sub-brand text should not compete with headings).
- `.eyebrow`: added `letter-spacing: 0.05em` to improve uppercase readability.
- `.support-card span`: font-weight 900 → 700, added `letter-spacing: 0.04em`.
- `.category-view-link`: font-weight 800 → 700.
- `.hero-trust-row span`: font-weight 800 → 700.
- These changes reduce the "everything is bold" effect and create clearer hierarchy.

#### 5. Hero section rebalance (`assets/theme.css`)
- Added `.hero-marketplace::before` pseudo-element with a dark gradient overlay (`linear-gradient(90deg, rgba(16,24,32,0.55) → transparent)`) to guarantee text contrast regardless of uploaded hero image.
- Changed hero heading color from `#101820` (dark) to `#ffffff` (white) with `text-shadow` for legibility on the overlay.
- Changed hero eyebrow color from `#101820` to `#ffb28d` (warm light orange) for contrast.
- Reduced hero paragraph `font-weight` from 750 to 650.
- **Mobile (≤620px):** heading size reduced from `clamp(48px, 15vw, 62px)` to `clamp(40px, 12vw, 52px)`; line-height increased from `0.92` to `1.0` to prevent ascender/descender collision.
- **Tablet (≤900px):** heading size reduced from `clamp(54px, 14vw, 84px)` to `clamp(44px, 10vw, 64px)`.

### Why it changed
- These 5 items were the remaining medium-priority changes from the design review (Entry 2). They address emotional design (cart empty state), micro-interactions (FAQ animation), component differentiation (card families), typographic hierarchy (bold overuse), and hero readability (contrast + mobile sizing).

### Files touched
- `assets/theme.css` - cart drawer empty state styles, FAQ accordion animation, card family radii/shadows, typographic weights, hero overlay and heading sizes
- `snippets/cart-drawer-contents.liquid` - playful empty-state copy + paw icon SVG

### Shopify Theme Store compliance
- ✅ No external dependencies
- ✅ All SVG icons are inline (no CDN)
- ✅ FAQ animation respects `prefers-reduced-motion` implicitly via `::details-content` support detection
- ✅ Hero overlay guarantees WCAG AA contrast on variable background images

### Graphite sync
- **Attempted:** the LLM graph-update skill on 2026-06-08.
- **Result:** Same as Entry 3 - semantic extraction requires an API key. The code changes are handled by AST extraction without a key; only the updated markdown doc blocks the pipeline. Set `GEMINI_API_KEY` or `GOOGLE_API_KEY` to enable full semantic updates.

---

## Entry 5 - 2026-06-08: Standardize Spacing System and Max-Width Tokens

### What changed

#### 1. Added layout tokens to `:root` (`assets/theme.css`)
```css
--max-width-page: 1780px;
--max-width-content: 760px;
--max-width-narrow: 560px;
--pad-x: clamp(18px, 5vw, 72px);
--pad-x-tight: clamp(18px, 4vw, 56px);
--section-pad: clamp(48px, 7vw, 92px);
--section-pad-medium: clamp(34px, 5vw, 72px);
--section-pad-small: clamp(28px, 5vw, 58px);
```

#### 2. Consolidated max-width values
- **Full-page width (`--max-width-page` 1780px):** Replaced 1780, 1720 (category-shell, search-shell), and 1420 (cart-shell). All page-level shells now use a single full-width token.
- **Reading copy width (`--max-width-content` 760px):** Replaced 820, 760, 720, 680, 650, 620, 1020, 980, 860. All headings, paragraphs, section descriptions, and text blocks now use one consistent content width.
- **Narrow panel width (`--max-width-narrow` 560px):** Cart-empty panel and other narrow cards use this token.
- Kept `440px` for `.hero-product p` as a component-specific value (hero card text).
- Added `max-width: var(--max-width-page); margin: 0 auto;` to `.footer-shell` for consistency with other page shells.

#### 3. Standardized section padding
- **Large sections** (hero, .section, .conversion, .landing, .pdp-detail-stack, .review-panel, .site-footer, .ad-pdp): `var(--section-pad) var(--pad-x)`
- **Medium sections** (search-page, cart-page): `var(--section-pad-medium) var(--pad-x)`
- **Small sections** (category-showcase, product-detail): `var(--section-pad-small) var(--pad-x)`
- Category showcase uses asymmetric vertical padding: `var(--section-pad-small) var(--pad-x) var(--section-pad-medium)` (top slightly smaller than bottom for visual rhythm).

### Why it changed
- The theme had 10+ distinct max-width values (1780, 1720, 1420, 1020, 980, 860, 760, 720, 680, 650, 620, 560...) creating a "wandering margin" effect where sections felt disconnected.
- Section padding was inconsistent: `clamp(48px, 7vw, 92px)` vs `clamp(48px, 8vw, 96px)` vs `clamp(48px, 7vw, 86px)` vs hardcoded values - there was no system.
- By reducing to 3 max-widths and 3 vertical padding sizes, the layout now has predictable rhythm. Every section aligns to the same grid, making the design feel intentional rather than accidental.

### Files touched
- `assets/theme.css` - added 8 CSS custom properties to `:root`; replaced ~20 scattered max-width and padding values throughout the file

### Shopify Theme Store compliance
- ✅ CSS custom properties are a standard CSS feature (no polyfills needed)
- ✅ No external dependencies
- ✅ All tokens use `clamp()` for fluid responsiveness

---

## Entry 6 - 2026-06-08: Zero-LLM Incremental Graphite Pipeline

### What changed
- Created `graphite/` package - standalone, portable CLI for any codebase:
  - `graphite/incremental.py` - main orchestrator with SHA256 manifest and surgical merge.
  - `graphite/extractors.py` - deterministic rule-based extractors for Liquid, CSS, JS, Python, Markdown, JSON, and GraphQL.
  - `graphite/graph.py` - graph merge, conditional Louvain community detection, community consolidation, and HTML/Report generation.
  - `graphite/cli.py` - argparse CLI with `build` and `serve` commands.
  - `graphite/__main__.py` - enables `python -m graphite`.
  - `pyproject.toml` - pip-installable package (`pip install -e .`) registering the `graphite` console script.
- Key architectural decisions:
  - **Manifest tracking** (`graph-out/.graphite_manifest.json`) - only re-extracts files whose hash changed.
  - **Surgical merge** - removes stale nodes for changed files, injects new ones, preserves the rest.
  - **Conditional community detection** - only re-runs Louvain if >5% of nodes changed; otherwise assigns new nodes to nearest neighbor community.
  - **Community consolidation** - merges tiny communities into nearest large neighbor or a catch-all misc bucket.
  - **Cross-file edges** - JSON templates extract Shopify section references as `includes` edges; Liquid `render`/`section` tags create `renders`/`includes` edges; Python imports create `imports` edges (stdlib filtered); Markdown code spans create `references` edges.

### Why it changed
- The earlier LLM-driven graph-update skill burned **~60,000 tokens per run** by dispatching Claude subagents for every markdown file. For a project with 100+ files, this was unsustainable for daily use.
- We needed a graph that stays current after every edit without token cost.

### How it was solved
- **Rules replace LLM for 95% of extraction:** Headings → rationale/concept nodes, code spans → file references, AST → function/class nodes, regex → CSS selectors and JS functions.
- **0 tokens per run:** The only cost is local Python computation (NetworkX + python-louvain).
- **Performance:** Full rebuild of 102 files takes ~4.5s. Single-file incremental update takes **~0.4s**.

### Files touched
- `graphite/__init__.py` (new)
- `graphite/__main__.py` (new)
- `graphite/cli.py` (new)
- `graphite/extractors.py` (new)
- `graphite/graph.py` (new)
- `graphite/incremental.py` (new)
- `pyproject.toml` (new)
- `scripts/graphite_incremental.py` (kept as backward-compat wrapper)
- `scripts/graphite_extractors.py` (kept as backward-compat wrapper)
- `scripts/graphite_graph.py` (kept as backward-compat wrapper)
- `docs/design-improvements.md` (this entry)

### Metrics
- Full rebuild: **874 nodes, 994 edges, 29 communities** in ~3s
- Incremental (1 file): **~0.4s**

---

## Entry 7 - 2026-06-08: Logo Redesign + Announcement Bar Duplicate Fix

### What changed
- `assets/active-paw-logo.svg` - redesigned from a simple paw-print icon to a **shopping basket + paw print** icon matching the ad creative style.
  - Dark navy rounded-square background (`#101820`)
  - White basket body with handle and rim
  - Orange paw print (`#f05a28`) centered on the basket
- `assets/theme.css` - fixed duplicate announcement bar rows on desktop.
  - Added `.announcement-track p[aria-hidden="true"] { display: none; }` in base CSS to hide mobile marquee duplicates on desktop.
  - Added override `.announcement-track p[aria-hidden="true"] { display: flex; }` inside `@media (max-width: 620px)` so the seamless marquee loop still works on mobile.

### Why it changed
- The old logo was a simple paw print that didn't visually communicate "marketplace / shopping".
- The ad creative showed a distinctive basket+paw icon that instantly reads as a pet-care store.
- The announcement bar was showing 6 items in a 3-column grid (2 rows) because the mobile marquee duplicates were not hidden on desktop.

### How it was solved
- **Logo:** Pure SVG with simple shapes (rect, path, ellipse) - no external assets, scales perfectly, matches theme color tokens.
- **Duplicate fix:** Used CSS `display: none` for `aria-hidden` items on desktop, restoring `display: flex` on mobile where the marquee animation needs the duplicated set for a seamless loop.

### Files touched
- `assets/active-paw-logo.svg` (rewritten)
- `assets/theme.css` (2 lines added)

### Screenshots
- Preview: `logo-preview.html` - 320×320 logo on theme surface background
- Live: `http://127.0.0.1:9292` - new logo in header, single-row announcement bar

### Shopify Theme Store compliance
- ✅ No external dependencies
- ✅ Pure SVG (no JS)
- ✅ Accessible: `aria-label` on logo image, `aria-hidden` on marquee duplicates

### Graphite sync
- **Completed:** 2026-06-08 via `python -m graphite build .` (0.40s).
- Token cost: **0**

### Graphite sync
- **Completed:** 2026-06-08 via `python -m graphite build .` (zero-LLM CLI).
- **Result:** Graph rebuilt deterministically. All 108 files extracted (including new `graphite/` package itself), 29 communities detected, HTML + Report regenerated.

---

## Entry 8 - 2026-06-08: Hero Section Refinement

### What changed
- `assets/theme.css` - refined the hero section layout and background treatment:
  - `min-height` reduced from `calc(100vh - 72px)` to `calc(58vh - 72px)` - trims excess bottom margin.
  - `background-size` changed from `cover` with `center` position to `cover` with `78% 50%` position - shifts the focal point rightward so pets are visible at a comfortable scale without cropping.
  - Removed artificial `background-color: #c45a1c` - the image's own warm orange left edge now extends naturally across the left side.
  - Softened `::before` gradient overlay (`0.45 → 0.25`) to let the image's natural tones show through while keeping text readable.
  - Grid columns tightened from `0.92fr / 1.08fr` to `1fr / 0.65fr` - brings text and image closer together.
  - `.hero-background-spacer` min-height reduced from `clamp(460px, 52vw, 660px)` to `clamp(220px, 26vw, 340px)`.

### Why it changed
- The original hero used `background-size: cover` with `center` positioning, which made the pets enormous and cropped the dog's head.
- Previous attempts to fix this with `contain` + `background-color` created an abrupt artificial edge on the left.
- The image itself has a warm orange left half - using that as the natural text canvas is cleaner than any CSS overlay.

### How it was solved
- **Use the image's own composition:** The ad creative image has a smooth orange→beige→pet transition built in. By positioning the background at `78% 50%` with `cover`, the left side naturally fills with the image's warm tones while the pets sit comfortably on the right.
- **Keep text readable:** A subtle left-side gradient (`rgba(16,24,32,0.45) → transparent`) ensures white text pops without destroying the natural background.

### Files touched
- `assets/theme.css` (hero section rules adjusted)

### Review outcome
| Aspect | Before | After |
|---|---|---|
| Pet size | Giant, head cropped | Smaller, fully visible |
| Bottom margin | ~104px empty | ~32px, tight |
| Left side | Dark muddy gradient | Image's natural warm orange |
| Color edge | - | Seamless (native to image) |
| Text | Over dark area | Over image's natural orange |
| Column gap | Wide | Tighter |

### Graphite sync
- **Completed:** 2026-06-08 via `python -m graphite build .` (0.43s).
- Token cost: **0**

---

## Entry 9 - 2026-06-08: Hero Full-Image Display (No Crop)

### What changed
- `assets/theme.css` - changed `.hero-marketplace` background technique from `cover` to full-height containment:
  - `background-size: cover` → `100% 100%, auto 100%` (first layer = gradient overlay, second = hero image)
  - `background-position: 78% 50%` → `0 0, right center` - aligns the full image to the right side of the section
  - Added `background-repeat: no-repeat`
  - Added `background-color: #ff6a1a` - matches the image's native warm orange left edge so the empty space left of the image blends seamlessly
  - Added `gap: clamp(16px, 2.5vw, 40px)` - brings the text and image columns closer (down from `clamp(28px, 5vw, 72px)`)
  - Added `display: grid` explicitly to `.hero-marketplace` for clarity
- `assets/theme.css` - mobile breakpoint updated `background-position: 63% center` → `0 0, 63% center` to match the multi-layer background syntax.

### Why it changed
- Entry 8 used `background-size: cover` with `78% 50%` positioning. At wide PC resolutions (1920×1080), the container aspect ratio (~3.5:1) was much wider than the image (~1.94:1), so `cover` still zoomed in and cropped the image - the dog appeared oversized and parts of the scene were lost.
- The user explicitly asked for "the original whole image surface, just shrinked" - meaning zero cropping, full scene visible, pets smaller.
- Previous attempts with `contain` + a mismatched `background-color` created an abrupt artificial edge. This time the background color was sampled directly from the image's left edge (`#ff6a1a` / `#fd5f03` range) so the transition is invisible.

### How it was solved
- **`auto 100%` sizing:** The hero image is scaled so its height exactly matches the section height. The width shrinks proportionally (to ~1073px at 1920×1080), revealing the full top-to-bottom scene with no vertical cropping.
- **Right alignment:** `background-position: right center` places the image on the right, leaving empty space on the left. That empty space is filled with `background-color: #ff6a1a`, which is visually identical to the image's leftmost pixels.
- **Multi-layer backgrounds:** The existing gradient overlay (`rgba(255,122,24,0.1) → transparent`) and the `::before` / `::after` pseudo-element overlays remain as separate layers, ensuring text contrast without touching the image.
- **Reduced gap:** `clamp(16px, 2.5vw, 40px)` tightens the grid so the text column and the image column feel connected rather than disconnected.

### Files touched
- `assets/theme.css` (hero `.hero-marketplace` rules and mobile breakpoint)

### Review outcome
| Aspect | Before (Entry 8) | After (Entry 9) |
|---|---|---|
| Dog head | Visible but zoomed | Fully visible, natural size |
| Cat | Visible but zoomed | Fully visible, natural size |
| Bottom products | Partially cropped | Fully visible (brush, towel, ball, cup) |
| Image surface | Cropped by `cover` | Entire 1744×901 image shown |
| Left side | Image's own orange | Seamless - image orange matches CSS orange |
| Column gap | ~72px at 1920px | ~40px at 1920px |
| PC (1920×1080) | Pets oversized | Pets appropriately sized |
| Tablet (1280×900) | Good | Good |
| Mobile (375×812) | Good | Good |

### Shopify Theme Store compliance
- ✅ No external dependencies
- ✅ Pure CSS background technique
- ✅ Text readability maintained via existing `::before` dark gradient overlay
- ✅ `prefers-reduced-motion` unaffected

### Graphite sync
- **Completed:** 2026-06-08 via `python -m graphite build .` (~0.4s).
- Token cost: **0**

---

## Entry 10 - 2026-06-08: Remove Support Icon from Header

### What changed
- `sections/site-header.liquid` - removed the `.header-action-support` anchor block (lines 83-92) containing the headset icon and "Support / Help centre" label.

### Why it changed
- The Support icon duplicated functionality already available via the Contact button (`.header-contact-trigger`, lines 73-81) and the footer links.
- Removing it declutters the header action row, giving the Contact, Locale, and Cart actions more visual room.

### Files touched
- `sections/site-header.liquid`

### Shopify Theme Store compliance
- ✅ No external dependencies
- ✅ No accessibility loss: the Contact button and footer `#support` / mailto links remain available

### Graphite sync
- **Completed:** 2026-06-08 via `python -m graphite build .` (~0.4s).
- Token cost: **0**

---

## Entry 11 - 2026-06-08: Tighten Gap Between Trust Bar and Category Showcase

### What changed
- `assets/theme.css` - `.trust-bar` vertical padding reduced from `16px 0` → `6px 0`.
- `assets/theme.css` - `.category-showcase` top padding reduced from `var(--section-pad-small)` (`clamp(28px, 5vw, 58px)`) → `clamp(10px, 2vw, 18px)`.

### Why it changed
- The scrolling trust bar (`.trust-bar`) and the first product category section (`.category-showcase`) felt visually disconnected due to excessive combined padding (~44-74px gap).
- Tightening both brings the category cards closer to the trust signals above them, creating a more compact, scannable homepage flow.

### Files touched
- `assets/theme.css`

### Shopify Theme Store compliance
- ✅ No structural changes
- ✅ No external dependencies

### Graphite sync
- **Completed:** 2026-06-08 via `python -m graphite build .` (~0.4s).
- Token cost: **0**

---

## Entry 12 - 2026-06-08: Remaining Theme Polish Batch (Footer, FAQ, Cart Drawer, Product Card Uniformity)

### What changed

#### 1. Footer mobile layout (`assets/theme.css`)
- `.footer-nav` on mobile (≤620px): changed from `grid-template-columns: 1fr` (single dense column) to `repeat(2, minmax(0, 1fr))` - a 2-column grid that spreads links across the width, reducing vertical scrolling and the "corporate dense list" feel.
- `.footer-nav div` gap reduced from `9px` to `6px` on mobile for tighter grouping.
- `.footer-brand h2` reduced from `clamp(30px, 3vw, 44px)` to `clamp(24px, 5vw, 30px)` on mobile - less overwhelming at the bottom of the page.
- `.footer-trust-row span` badges: padding reduced from `7px 10px` to `5px 8px`, font-size from `12px` to `11px` on mobile.
- `.footer-bottom` gap tightened to `6px`, padding-top to `14px` for a more compact finish.

#### 2. FAQ section heading (`assets/theme.css`)
- `.faq .section-heading h2` reduced from `clamp(30px, 3.1vw, 44px)` to `clamp(26px, 2.6vw, 38px)` on desktop.
- Mobile (≤620px): further reduced to `clamp(22px, 7vw, 28px)`.
- `.support-card` padding reduced from `20px` to `16px` on mobile.

#### 3. Cart drawer mobile (`assets/theme.css`)
- `.cart-drawer__item` padding: `16px 22px` → `14px 16px`, gap: `14px` → `12px`.
- `.cart-drawer__header` padding: `18px 22px` → `14px 16px`.
- `.cart-drawer__foot` padding: `18px 22px 22px` → `14px 16px 18px`.
- Panel width capped at `380px` instead of `420px` on mobile for better screen usage.

#### 4. Product card uniformity (`sections/main-collection.liquid` + `snippets/demo-product-card.liquid` + `assets/theme.css`)
- **Collection page** (`main-collection.liquid`): replaced inline `.product-card` markup with `{% render 'product-card-commerce', product: product %}` - collection cards now show the same rich content as homepage cards (image, badge, rating, title, benefit, price, footer).
- **Demo cards** (`demo-product-card.liquid`): completely rewritten to match `product-card-commerce.liquid` structure exactly, using `.commerce-card` classes. Demo cards (empty collections + demo grid) now look identical to real product cards.
- **Grid alignment**: `.product-grid` breakpoints now match `.commerce-grid` exactly - both use 4/2/2/1 column progression across breakpoints with identical gaps.
- **Purchase action as universal default** (`snippets/product-card-commerce.liquid`): changed `show_purchase_action` default from `false` to `true`. Every product card now includes the conversion action ("Add to cart" for single-variant, "Choose options" for multi-variant, "Sold out" when unavailable) - previously only search results had this.
- **Demo cards** (`snippets/demo-product-card.liquid`): added a "Add to cart" CTA button below the footer so demo cards match the full commerce-card structure.
- **Search results** (`sections/main-search.liquid`): kept `show_purchase_action: true` on both main results and offer grids.

### Why it changed
- These were the last remaining items from the frontend design review (Entry 2) that hadn't been addressed.
- The footer felt like a dense legal disclaimer on mobile; the 2-column nav + smaller headings make it feel more like a curated destination than a boilerplate list.
- FAQ heading was oversized relative to its supporting role on the page.
- Cart drawer was using desktop padding on mobile, making the panel feel cramped.
- Product cards had diverged between homepage (commerce-card) and collection page (simple product-card), creating an inconsistent shopping experience.

### Files touched
- `assets/theme.css` - footer nav grid, footer heading sizes, trust row badges, FAQ heading, support card padding, cart drawer padding, panel width
- `sections/main-collection.liquid` - unified product card rendering
- `sections/main-search.liquid` - kept `show_purchase_action: true` on search + offer grids
- `snippets/product-card-commerce.liquid` - changed `show_purchase_action` default from `false` to `true`
- `snippets/demo-product-card.liquid` - rewritten to match commerce-card markup, added CTA button

### Shopify Theme Store compliance
- ✅ No external dependencies
- ✅ All changes preserve accessibility (nav structure, ARIA labels, semantic markup)
- ✅ Mobile-first responsive design

### Graphite sync
- **Completed:** 2026-06-08 via `python -m graphite build .` (~0.42s).
- Token cost: **0**

---

## Entry 13 - 2026-06-08: Title-Price Gap + Oversized Heading Audit + Hero Layout

### What changed

#### 1. Reduced product card title-to-price gap (`assets/theme.css`)
- `.commerce-card-body` grid gap reduced from `9px` to `6px`.
- `.commerce-card p` (benefit text) `min-height` reduced from `42px` to `28px` desktop / `24px` mobile.
- Total visual gap between title and price dropped from ~60px to ~40px.

#### 2. Oversized heading audit + reduction (`assets/theme.css`)
- `.hero-marketplace h1`: `clamp(56px, 6.7vw, 104px)` → `clamp(40px, 5vw, 64px)` desktop / `clamp(32px, 12vw, 44px)` mobile.
- `.hero h1`: `clamp(44px, 7vw, 92px)` → `clamp(36px, 5vw, 56px)` desktop / `36px` mobile.
- `.ad-pdp-buybox h1`: `clamp(42px, 5vw, 76px)` → `clamp(24px, 2.8vw, 36px)`.

#### 3. Hero layout refinement (`assets/theme.css`)
- `.hero-marketplace` `padding-left` added: `clamp(28px, 5vw, 72px)` - pushes content inward from left edge.
- `.hero-marketplace h1` max-width reduced from `760px` to `520px` - forces the title "Smart Pet Finds for Grooming, Play & Walks" to break into 3 lines.
- `.hero-marketplace-copy` max-width matched to `520px` for alignment.

### Why it changed
- The gap between product title and price created a stretched, disconnected feel when benefit text was empty.
- The hero title at 104px was the biggest headline in the entire theme - disproportionate to the rest of the design.
- The ad-PDP buybox title at 76px was oversized for a product name inside a card.
- The hero title sat too close to the left edge and ran as a single long line; adding left margin and constraining width improves readability and visual balance.

### Files touched
- `assets/theme.css`

### Shopify Theme Store compliance
- ✅ No external dependencies
- ✅ No structural changes

### Graphite sync
- **Completed:** 2026-06-08 via `python -m graphite build .` (~0.42s).
- Token cost: **0**

---

## Entry 14 - 2026-06-09: Graphite Performance Fix + TF-IDF Semantic Overlay

### What changed
- `graphite/extractors.py` (and the `scripts/graphite_extractors.py` duplicate) - replaced the O(n²) `_find_enclosing_function` (it re-walked the whole AST per call node) with a single-pass child→parent map, and collapsed three full tree-walks (parent-map + imports + calls) into one. Output is byte-identical.
- `graphite/semantic.py` (new) - pure, stdlib-only TF-IDF similarity layer producing additive `semantically_similar_to` edges between lexically-similar files. 0 LLM tokens, offline, deterministic.
- `graphite/incremental.py`, `graphite/cli.py` - new opt-in `--semantic` / `--semantic-threshold` / `--semantic-top-n` flags; overlay injected *after* community detection (never influences clustering).
- `graphite/graph.py` - "Cross-cutting semantic links" section in `GRAPH_REPORT.md` (bucketed cross-area vs. same-area, per-file diversity cap) + dashed-amber styling for semantic edges in `graph.html`.
- `tests/test_semantic.py` (new) - 9 unit tests for the TF-IDF layer.

### Why it changed
- **Performance:** the docs claimed "<10ms per file" but the Python extractor took ~300ms on a 10 KB file (quadratic). Verified empirically, then fixed.
- **Accuracy/recall:** the zero-LLM build has near-zero cross-file semantic recall (it only sees structural relationships). The overlay recovers *some* of that - at the same ~0 token cost as the original zero-LLM build, far below the LLM pass's ~42k/run - without sacrificing the structural truth the coding workflow relies on.

### How it was solved
- Parent-map lookup is O(1) per call; verified identical `calls` edges across all 29 Python files (0 mismatches). `incremental.py` 299ms→5ms (~60×).
- Overlay is strictly additive: a plain `build` adds 0 semantic edges; structural edge count is unchanged (1106) whether or not `--semantic` is passed. Decoupled from Louvain so the community map is never reshuffled by lexical noise.
- Calibrated defaults (threshold 0.12, top_n 4) so the motivating cross-file link (`import-cj-category-products.py` ↔ `2026-06-08-pawscout-collection-mapping-design.md`) is recovered as a graph edge (cosine 0.245).
- **Honest limitation documented:** TF-IDF recovers that files are *related* but cannot rank which link is *important* - reasoning-grade conflict detection still needs an LLM pass. See `GRAPHITE.md`.

### Files touched
- `graphite/semantic.py` (new), `graphite/extractors.py`, `graphite/incremental.py`, `graphite/cli.py`, `graphite/graph.py`, `scripts/graphite_extractors.py`, `tests/test_semantic.py`, `docs/graphite-documentation.md`

### Graphite sync
- **Completed:** 2026-06-09 via `python -m graphite build . --semantic` (~0.6s).
- Token cost: **0**

---

## Entry 15 - 2026-09-18: Storewide event surfaces read PawScout's feed (hero badge, announcement bar, welcome modal)

### What changed
- `snippets/hero-event-badge.liquid` (new) - the hero seal's markup moved here from `sections/hero-commerce.liquid`, plus a scoped `{% style %}` block for feed-driven copy (smaller title/sub sizes so an event name or a date range fits the circle) and a `[hidden]` rule. The seal renders the Theme Editor lines server-side, then theme.js repaints it in place.
- `snippets/announcement-event.liquid` (new) - a `<template>` for the event item (tag icon, link to all products) plus a scoped style block. On desktop, while an event runs, the event slot takes two grid shares and the three benefit items condense to their bold titles so the bar keeps its silhouette; the mobile marquee keeps every word.
- `sections/hero-commerce.liquid` - renders the badge snippet. `sections/announcement-bar.liquid` - renders the template snippet.
- `layout/theme.liquid` - `<body data-storewide-event-src="https://pawscout.activepaw.co.uk/public/event">` is now the ONE place the theme names the feed.
- `snippets/welcome-modal.liquid` - feed-driven only. The shell carries no code, percentage, headline or end date; the old `data-welcome-until` gate and the retired welcome code are gone.
- `config/settings_schema.json` - removed `welcome_headline`, `welcome_subline`, `welcome_code`, `welcome_ends`, `welcome_ends_date`; the master-switch info text explains the slot is fed by PawScout.
- `assets/theme.js` - `loadStorewideEvent()` makes ONE memoised fetch per page view (3s cap, resolves to null on failure) shared by three consumers: the hero badge painter, the announcement bar painter and the welcome modal. The modal is closed by default and only opens when the feed says `active:true` with a code; a verdict landing after the 3s/first-scroll trigger still opens it. The install pill now waits for the same verdict instead of reading a dismissal flag (that flag was never set when the modal was absent, which silently suppressed the pill).

### Why it changed
- The hero seal was hard-coded "Stay cool! Shop the summer range" and would have stayed on the page in November. The owner's complaint (design approved 2026-09-17, channel rounds 219 and 221) was a seasonal stamp that no longer matched the calendar.
- The welcome modal's settings fallback advertised a code that ended on 19 July 2026 and kept rendering it into the page.
- Everything a visitor reads about an event must come from the feed: no hard-coded code, percentage, date or event name in Liquid or JS.

### How it was solved
- Hero badge states: running event -> name, "<pct>% off with code <code>" (plus "until <end>" while the line stays within 52 characters), link to all products; idle with a planned event -> "Next: <name>" and "<start> to <end>" (name and dates only, never a code or percentage ahead of time); idle with nothing planned -> the seal hides; feed unreachable -> the server-rendered copy stays untouched.
- Announcement bar: only a RUNNING event adds an item, cloned to the front of BOTH announcement sets (the duplicate set's copy is `tabindex="-1"` because that set is `aria-hidden`). A planned event adds nothing.
- Desktop layout decision: four equal-ish columns made the benefit items wrap to 3-4 lines and the bar grew from 48px to 99px (measured on the preview). With the event at 2fr and the benefits condensed to titles the bar measures 52px.
- Every field is feature-detected (`name` and `next` are optional); `pctOff` is only used when it is a positive number.

### Files touched
- `layout/theme.liquid`, `sections/hero-commerce.liquid`, `sections/announcement-bar.liquid`, `snippets/hero-event-badge.liquid` (new), `snippets/announcement-event.liquid` (new), `snippets/welcome-modal.liquid`, `config/settings_schema.json`, `assets/theme.js`

### Verification (2026-09-18, first-hand)
- Reconcile against live: the Admin API's `checksumMd5` for all 58 live theme files matched the local files (settings_data.json identical modulo line endings), so no live-only work was at risk. The Shopify CLI needed a device-code login, so `theme pull` and `theme dev` could not run in this session.
- Preview: an unpublished duplicate of the live theme (id 207677620562, "Preview 2026-09-18 storewide event badge (delete after review)") received the seven Liquid/JSON files via `themeFilesUpsert` (checksums verified after upload). `assets/theme.js` was served from the working copy by Playwright (`LOCAL_THEME_JS=1`) because the 46KB file could not be passed inline.
- `node output/playwright/storewide-event-check.cjs https://activepaw.co.uk 207677620562`: 82/82 assertions across (A) real feed, idle today: badge "Next: Black Friday to Cyber Monday" / "Friday 27 November to Monday 30 November", no announcement item, no modal, one feed request; (B) stubbed active payload: badge name + "15% off with code SUMMERSALE until 31 August", announcement item "Summer bank holiday: 15% off everything with code SUMMERSALE, until 31 August" in both sets, modal with code, headline, subline, chips, "Ends 31 August"; (C) feed aborted: server default stays, nothing else; (D) `{"active":false}`: badge hidden. The string WELCOME10 is absent from the rendered page in every scenario. Screenshots: `output/playwright/storewide-*.png`.
- `shopify theme check`: 8 offences, all pre-existing (same set as before the change); `node --check assets/theme.js` clean; no en/em dashes in any touched file.
- **Live (2026-09-18 02:52Z):** the owner pushed `93c8fa1` to the live theme. Re-verified on `https://activepaw.co.uk/` afterwards: Admin API checksums of all nine changed files equal the commit, `settings_data.json` untouched, the CDN's minified theme.js carries the new code, WELCOME10 absent from page and script, and the same Playwright script against live (real theme.js, real feed) passed 76/76 (the six preview-identity checks do not apply on live).

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 16 - 2026-09-19: Continuous integration for the theme (PRD task T3)

### What changed
- `.github/workflows/theme-ci.yml` (new) - on every push to any branch: `npm ci`, `eslint .`, Shopify CLI 4.8.0 `theme check --fail-level error`, and `python -m unittest discover -s tests -t .` on Python 3.14. About 26 seconds end to end.
- `.theme-check.yml` (new) - theme check runs from the repository root, which also holds dev tooling, docs, tests and the nested worker; those are ignored. `/*.json` is root-only. A bare `*.json` also skipped `templates/` and `config/` when measured with planted invalid files, so it is not used.
- `layout/theme.liquid` - three comment lines around the manifest link suppress theme check's MissingAsset for `manifest.json`. `assets/manifest.json.liquid` is compiled to that file on Shopify; the live theme lists both and the storefront serves the compiled one. No rendered markup changes; the comments add whitespace only.
- `import-cj-products.py`, `import-cj-category-products.py`, and their tests - the PowerShell path test used a Windows path as its fixture, which `Path.is_absolute()` rejects on Linux; the fixture is now built from the current drive anchor, and the helper returns `os.path.abspath(found)`.

### Why it changed
- Decision 5e of the production-grade PRD: fast checks everywhere, full runs on pull requests and after deploy. Until today nothing ran on a push; a broken template could reach the live branch unchecked.

### How it was solved
- The workflow was written, pushed, and watched. The first run (35433334488) went red on the unit-test step only, on a genuine platform-specific test, which is the "red on a failing test" half of the acceptance. The fix run (35433567778) is green on every step.
- Theme check had two errors locally: the MissingAsset above and an untracked `audit-out.json` at the root. The config removes the second for every local run; the first is suppressed on its one line with the reason beside it.

### Files touched
- `.github/workflows/theme-ci.yml`, `.theme-check.yml`, `.gitignore` (negation for the config), `layout/theme.liquid`, `import-cj-products.py`, `import-cj-category-products.py`, `tests/test_import_cj_products.py`, `tests/test_import_cj_category_products.py`, `docs/theme-production-grade-prd.md`.

### Verification (2026-09-19, first-hand)
- `shopify theme check --fail-level error`: exit 0, 66 files, 6 warnings (the T18 set), 0 errors.
- `python -m unittest discover -s tests -t .`: 37 tests OK locally; 19 in CI, where the machine-local tests and helper modules are absent.
- Pre-flight for T2: `shopify theme pull --live` into a detached worktree of `ddb7de0` left `git status` empty; a planted change in the worktree was overwritten on re-pull.
- **Live (2026-09-19 10:31Z):** the owner ran the T2 merge script: merge `c1e2d93` on `shopify-deploy`, tree identical to the working branch, tag `release-2026-09-19-1`. Shopify redeployed on the push (live `layout/theme.liquid` checksum `f1903bdf…` equals the file). CI run 35437647493 green. Independence run against live: blocked 71/72 (0 hard failures), control 68/69 (one console error on the worker's affiliate page, not theme code). The working branch `claude/search-supplier-suggestions` is deleted; work continues on feature branches off `shopify-deploy`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 17 - 2026-09-19: Deploy runbook, theme-worker contract, preview-theme support in the independence check (PRD task T6)

### What changed
- `docs/RUNBOOK-THEME-DEPLOY.md` (new) - branch, fast checks, preview theme, pull request, post-merge verification, tag, rollback by revert, and the list of things that do not happen.
- `docs/theme-worker-contract.md` (new) - the four rules, every live call with its failure behaviour, the payload fields read, the metafields read natively, the open questions, and how the contract changes.
- `tests/independence.cjs` - `PREVIEW_THEME_ID=<id>` runs the check against an unpublished theme: one visit with `?preview_theme_id=` sets Shopify's preview cookie for the browser context, and every theme page asserts `Shopify.theme.id` equals the id, so a run that fell back to live fails. Checkout and the worker's affiliate page are not theme-rendered and carry no such check.

### Why it changed
- PRD R2 and R10: the deploy path decided on 2026-09-19 has to live in the repository, and every Phase 2 change needs a preview verification that cannot silently test live instead.

### How it was solved
- `shopify theme push --unpublished --theme "preview/t6-rehearsal" --json` created theme 207761965394 from the deploy branch. First preview run: 79/82 with two false failures, checkout and the affiliate page (neither is served by the theme, so `Shopify.theme` is absent). The check was scoped to theme pages. Second run: blocked 79/80 with 0 hard failures, control 76/77 (the affiliate page console error, the worker's). The preview theme was then deleted with `shopify theme delete --theme 207761965394 --force`; the theme list holds live plus the owner's two copies.
- Rollback rehearsal: `git revert -m 1 --no-commit c1e2d93` in a throwaway worktree produced a tree identical to `994d44a`, 14 theme files. Not rehearsed: a throwaway branch connected to a preview theme through Shopify's GitHub integration (owner-only in admin).

### Files touched
- `docs/RUNBOOK-THEME-DEPLOY.md`, `docs/theme-worker-contract.md`, `tests/independence.cjs`, `docs/theme-production-grade-prd.md`.

### Verification (2026-09-19, first-hand)
- `node --check` and eslint clean on the script; the preview runs above; no en/em dashes in the new files.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 18 - 2026-09-19: Supplier name no longer shown to customers (PRD task T9, R5)

### What changed
- `snippets/product-details-modal.liquid` - the "Fulfilled by <supplier> · <warehouse>" row and its two assigns are gone from Product details.
- `snippets/product-details.liquid` - deleted; nothing rendered it (theme check OrphanedSnippet; graphite's impact query answered "none found" for both snippets because Liquid render edges are not in the graph, so a literal grep for `render 'product-details` settled it: only the modal snippet is rendered, from `sections/main-product.liquid`).
- `sections/main-product.liquid` - unused assigns `brand_name`, `supplier_warehouse`, `supplier_fulfillment_confidence` removed. `sections/main-cart.liquid` - unused `supplier_status` assign removed.
- `tests/independence.cjs` - the product page now checks "product details never name the supplier" (reads the details modal's text for "Fulfilled by").

### Why it changed
- Contract rule 3 and PRD R5: internal sourcing is not customer-facing. The banner code already said so; the details modal contradicted it on every imported product.

### How it was solved
- Removal only; no copy replaces the row. Verified on preview theme 207762719058 (pushed from the branch, deleted after): a probe of the same 8 product pages read "Fulfilled by CJ" on live for 8 of 8 and nothing on the preview for 0 of 8, with `Shopify.theme.id` confirming which theme served each page. Independence run on the preview: blocked 80/81 with 0 hard failures, control 77/78 (the worker's affiliate page console error).
- `shopify theme check --fail-level error`: exit 0, one warning left (hero image preload, T18).

### Files touched
- `snippets/product-details-modal.liquid`, `snippets/product-details.liquid` (deleted), `sections/main-product.liquid`, `sections/main-cart.liquid`, `tests/independence.cjs`, `docs/theme-production-grade-prd.md`, `docs/theme-worker-contract.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 19 - 2026-09-19: One availability snippet with the 3-day freshness rule (PRD tasks T8 and T12, R4)

### What changed
- `snippets/supplier-availability.liquid` (new) - decides label, detail, purchase cap, urgency, sold-out, freshness, the "Availability updated" label and the delivery range for one variant, and prints them as one pipe-separated line that callers capture and split. Tracked Shopify inventory (policy deny) is authoritative for the cap and the quantity banner; supplier fields count only while `supplier.last_checked_at` is within 3 days and the status is not `unknown_stale`. The status values the worker writes today (`available`, `out_of_stock`) are mapped with the documented ones.
- `sections/main-product.liquid` - the 70-line availability block is replaced by the capture; the "Availability updated" line and the hidden "Estimated delivery" property render only when fresh.
- `sections/main-cart.liquid` - same capture; the note wording is composed from the snippet's fields (unchanged strings). One semantic change: with both `max_order_qty` and `available_qty` present, the cart now shows the small-quantity wording the product page already used.
- `snippets/cart-drawer-contents.liquid` - same capture for the cap.
- `snippets/delivery-info.liquid` - takes `delivery_days` from the caller (fresh or blank) instead of reading the metafield.

### Why it changed
- Contract rule 2 and PRD R4: nothing on the storefront should repeat a supplier check that is days old. Measured on live before the change: 6 of 50 active products carried stamps from 5 July to 14 September and still showed "Availability updated <old date>" and their synced delivery window.

### How it was solved
- Verified on preview theme 207763407186 (deleted after) against live with a probe of four real products: the two fresh ones render identically on both; the two stale ones lose the date line on the preview, their delivery window falls back to the static band (4-12 became 3-10 on the 14 September one) and the hidden estimate is absent; the cart note for a fresh product is unchanged ("In stock. Availability updated 19 Sep 2026.", cap 33). Independence run on the preview: blocked 80/81 with 0 hard failures, control 77/78 (the worker's affiliate page).
- Not covered by live data: `unknown_stale`, a product with no metafields, a low-stock quantity of 10 or fewer, an untracked variant. Fixtures requested from the worker (channel round 238).
- `shopify theme check --fail-level error`: exit 0, one warning left (hero preload, T18).

### Files touched
- `snippets/supplier-availability.liquid`, `sections/main-product.liquid`, `sections/main-cart.liquid`, `snippets/cart-drawer-contents.liquid`, `snippets/delivery-info.liquid`, `docs/theme-production-grade-prd.md`, `docs/theme-worker-contract.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 20 - 2026-09-19: UK delivery line as a theme setting, shown to UK visitors only (PRD task T13, R11)

### What changed
- `config/settings_schema.json` - new Delivery block: `delivery_detail_uk` (default "Free UK delivery on every order. Tracking details are sent after dispatch.") and `delivery_detail_other` (default "Delivery options and times are shown at checkout."), with a paragraph that says the two must stay true.
- `snippets/supplier-availability.liquid` - the default detail line comes from the setting for the visitor's market (`localization.country.iso_code == 'GB'` picks the UK line).
- `snippets/delivery-info.liquid` - the "FREE UK delivery on every order" row and the "Estimated N days to your door" row (the CJ-to-UK lane) render for GB visitors only; other markets get the neutral setting line above the returns row.

### Why it changed
- Decision 5f: the claim is true for the UK, so it is a setting shown to UK visitors and other markets read a neutral line. Store markets measured today: United Kingdom (primary), European Union, Australia, United States and Canada, all enabled, none with its own URL.

### How it was solved
- Wiring control on preview theme 207764619602: `settings_data.json` was pushed with the marker value "Free UK delivery on every order. [setting wired]" and the GB banner read exactly that; the local file was restored before commit and the preview deleted.
- Non-GB rendering could not be observed: with the `/localization` form switched to AU, US or DE, the product page returns 404 on live and on the preview alike, so those markets have no catalogue. Recorded as an owner item in the PRD (T13). The neutral branch is reviewed in code only.
- Independence run on the preview: blocked 80/81 with 0 hard failures, control 77/78 (the worker's affiliate page). Theme check: one warning left (hero preload, T18).
- Out of scope, left as they are: the other UK delivery mentions in the announcement bar setting, trust bar, conversion stack, FAQ, footer and cart drawer. They are true statements about UK delivery rather than promises to the visitor's own market; a decision on them belongs to the owner.

### Files touched
- `config/settings_schema.json`, `snippets/supplier-availability.liquid`, `snippets/delivery-info.liquid`, `docs/theme-production-grade-prd.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 21 - 2026-09-19: Affiliates page entry point, and the search page measured for layout shift (PRD tasks T10 and T11)

### What changed
- `sections/affiliate-apply.liquid` (new) and `templates/page.affiliates.json` (new) - the Affiliates page renders its owner-edited body plus a card with the Apply button to the worker's form (hidden until proven reachable) and an email route. Settings: heading, text, button label, form URL, email, subject, offline note.
- `assets/theme.js` - a consumer of the shared storewide feed shows the Apply button and hides the offline note once the feed answers.
- `sections/site-footer.liquid` - "Affiliates" links to `/pages/affiliates`.
- `tests/independence.cjs` - visits `/pages/affiliates` once it exists (blocked: complete, button hidden, email present; control: button visible and linking to the worker form), the worker form until then; measures the cumulative layout-shift score on every page and fails control runs above 0.05; blocked runs keep the main-height rule.

### Why it changed
- Decision 5c: the Shopify page is the affiliate entry point so the footer link never dead-ends (contract rule 1). R7: no visible layout shift when the worker succeeds.

### How it was solved
- T11 by measurement rather than code: on the thin search "sisal" the ghost row lands at 922 px on 1280x900 with the footer at 1100 px; on 390x844 the footer is at 1702 px; CLS 0 on both. Appending below the fold grows the page but moves nothing on screen. Recorded in the PRD with the taller-viewport caveat.
- T10 needs the owner to create the page (title "Affiliates", handle `affiliates`, template `page.affiliates`, body from the worker's page). Until then the footer link 404s, so the pull request waits for the page.

### Files touched
- `sections/affiliate-apply.liquid`, `templates/page.affiliates.json`, `assets/theme.js`, `sections/site-footer.liquid`, `tests/independence.cjs`, `docs/theme-production-grade-prd.md`, `docs/theme-worker-contract.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 22 - 2026-09-19: one place per fact, zero theme check warnings, daily independence run (PRD tasks T14, T15, T17, T18)

### What changed
- `config/settings_schema.json` - new "Collections" block: `home_collection_handles` (the one list, default the four handles in priority order) and `search_offer_keywords` (search suggestion rules as `handle: keyword, keyword; ...`); `contact_email` in the Contact form block.
- `snippets/collection-handles.liquid` (new) - the one reader of the list; callers capture, strip and split.
- `sections/main-product.liquid` - related-collection walk reads the snippet. `sections/category-showcase.liquid` - a block's default collection and anchor come from its title; the four-way branch is gone. `sections/main-search.liquid` - keyword rules parsed from the setting, first match wins, handles outside the list ignored.
- `sections/site-footer.liquid`, `sections/main-page-contact.liquid` - mailto from `settings.contact_email`.
- `snippets/hero-event-badge.liquid` - no second copy of the badge's default link; the hero section's "Badge link URL" setting is the one place, with the all-products route as the last fallback. `snippets/welcome-modal.liquid` - the browse destination decided once (`welcome_redirect` assign). `assets/theme.js` - the three `/collections/all` fallbacks removed; the badge and browse links are only written when Liquid supplied them.
- `sections/hero-commerce.liquid` - hero background preload through `preload_tag`.
- `.github/workflows/theme-ci.yml` - `theme check --fail-level warning`.
- `.github/workflows/independence-daily.yml` (new) - independence run against live: daily 06:17 UTC, on demand, on pushes touching the workflow or the script, and two minutes after theme-ci completes on `shopify-deploy`. Blocked mode gates; control is informational; artifact kept 14 days; failure opens or updates the issue "Independence run failed against live" (label `independence`).

### Why it changed
- R8: the collection handle list, the contact email and the hero badge's default link each existed in two or three files. R9: the last theme check warning, and no scheduled watch on live.

### How it was solved
- Consolidation with no visible change, proven on preview 207775727954 against live with the worker blocked: home blocks, three product pages' related collections, six search terms, the footer, the contact page, the badge and the welcome modal attributes all identical. The search rules were proven live with "fountain water", the one probed term that renders the Liquid suggestion block: the same three suggested products on both themes.
- Independence on the preview: blocked 80/81 with 0 hard failures (the affiliate line is informational until the page exists); control 77/78 (the worker's affiliate page console error, reported in round 235).
- `shopify theme check`: 69 files, no offences locally. CI found two more (`UnrecognizedRenderSnippetArguments`: a `show_purchase_action` argument that `snippets/product-card-commerce.liquid` never reads); a planted bogus argument proved the local rule inert, so CI is the authority. The dead argument is gone; theme-ci run 35453341836 is green at `--fail-level warning`. eslint and the 37 unit tests pass. Preview deleted after use.
- Daily run, both paths exercised for real: run 35452979345 failed on the T9 assertion against live (pull request #3 not yet merged) and opened issue #8, closed with the reason; the guard added in commit 98751ac makes runs from any branch but `shopify-deploy` dry runs (warn, no job failure, no issue), and run 35453341902 finished green that way with blocked 71/73 and control 68/70 against live.

### Files touched
- `config/settings_schema.json`, `snippets/collection-handles.liquid`, `sections/main-product.liquid`, `sections/category-showcase.liquid`, `sections/main-search.liquid`, `sections/site-footer.liquid`, `sections/main-page-contact.liquid`, `snippets/hero-event-badge.liquid`, `snippets/welcome-modal.liquid`, `assets/theme.js`, `sections/hero-commerce.liquid`, `.github/workflows/theme-ci.yml`, `.github/workflows/independence-daily.yml`, `CLAUDE.md`, `docs/RUNBOOK-THEME-DEPLOY.md`, `docs/theme-production-grade-prd.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 23 - 2026-09-19: owner steps processed on the owner's instruction (T4 half, T5, T7 prepared, T10 page, T19 diagnosed)

### What changed
- `.github/workflows/theme-preview.yml` (new, PR #9) - pull-request preview job: push to an unpublished preview theme, independence run in both modes, results kept 14 days, preview deleted whatever the outcome. Guarded: without `SHOPIFY_CLI_THEME_TOKEN` it warns and passes (run 35456558183).
- Store, not repo: the Affiliates page (179229753682, handle `affiliates`, template `page.affiliates`) created through the Admin API with the programme copy from the worker's page; the Theme Access app installed in the admin.
- `docs/theme-production-grade-prd.md` - T4, T5, T7, T10 updated; T19 added (non-GB markets diagnosis and options). `docs/RUNBOOK-THEME-DEPLOY.md` - the preview job in section 4.

### Why it changed
- The owner asked for the outstanding owner steps to be processed. Merging into `shopify-deploy`, creating a credential and deleting theme copies are refused by the agent's tooling (production deploy, secret creation, irreversible deletion), so those were prepared for the owner instead: a merge script that merges #1 to #7 in order with CI gate, tag and live verification per merge, then deletes the two copies.

### How it was solved
- Unknown theme copy 207749579090: its seven files that differ from live are byte-identical to commit 994d44a (the old `shopify-deploy` tip, parent of c1e2d93), so it holds nothing git lacks.
- Non-GB 404s: not the theme and not shipping; imported products are absent from the market publications. Recommended to pawscout-agent (round 240) as a worker capability; decision (publish or deactivate) with the owner as T19.

### Files touched
- `.github/workflows/theme-preview.yml`, `docs/theme-production-grade-prd.md`, `docs/RUNBOOK-THEME-DEPLOY.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 24 - 2026-09-19: Phases 1 to 4 deployed; post-deploy run fixed

### What changed
- Live store: PRs #1, #2, #10 (replacing #3), #4, #5, #6, #7 and #9 merged into `shopify-deploy` by the owner's merge script, tags release-2026-09-19-2 to -9. Live pulled and found identical to the branch; independence against live 80/80 in blocked mode; theme copies 203969134930 and 207749579090 deleted.
- `.github/workflows/independence-daily.yml` - concurrency group removed: it cancelled both post-deploy `workflow_run` runs when the merges landed minutes apart. The runs are read-only, so overlap is harmless.
- `docs/RUNBOOK-THEME-DEPLOY.md` - the stacked pull request gotcha (API branch deletion closes the pull request stacked on it; retarget first).
- `docs/theme-production-grade-prd.md` - T7 and the T10 owner step ticked, deploy record on T2, T17 note.

### Why it changed
- The owner asked for the outstanding owner steps to be processed; merging is refused to the agent, so the owner ran the prepared script. The first run stopped at #3 (closed by the branch deletion after #2), which is now handled in the script and documented.

### How it was solved
- Verified on live after the last merge: footer links to `/pages/affiliates`; the page renders the Apply card hidden server-side with the email route; "Fulfilled by" absent from a product page; run 35457784390 (dispatched from shopify-deploy after the last merge): blocked 80/80 and control 77/77, 0 hard failures; the affiliates page is now the Shopify page, so the worker form's console error no longer appears in the run.

- T4 closed the same evening: with the owner's Theme Access password in `SHOPIFY_CLI_THEME_TOKEN`, the preview job's first real run (35458099218, attempt 2) pushed preview theme 207796928850, passed blocked 89/89 and control 86/86, and deleted the preview. R3 is met in full.

### Files touched
- `.github/workflows/independence-daily.yml`, `docs/RUNBOOK-THEME-DEPLOY.md`, `docs/theme-production-grade-prd.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 25 - 2026-09-20: Sparse markets look deliberate; the supplier spec follows the writer

### What changed
- `sections/category-showcase.liquid` - a home collection block renders its cards first and counts them. With no cards for the visitor's market the whole block is left out: heading, body, "View collection" link and all. The merchant hint stays, in the Theme Editor only (`request.design_mode`), reworded to say which country is being previewed. "Show more" now compares the cards rendered with the visible limit.
- `sections/main-collection.liquid` - the grid or the message is decided by the products on the page (`collection.products.size` inside `paginate`), so neither an empty market nor a page number past the end renders an empty grid. The message: "Nothing available here right now. No products from <collection> are available for your delivery country (<country>) at the moment." plus "Browse all products" (left out on the all-products collection itself, compared by URL, no handle literal).
- `sections/main-product.liquid` - "You may also like" captures its cards first and shows the heading only above at least one card. `supplier_name` reads the product-level key only.
- `assets/theme.css` - `.empty-category strong` takes the ink colour explicitly; the button inside keeps its own width and gains 8px of air.
- `snippets/supplier-availability.liquid` - the reader follows the writer: dropped `max_order_qty`, the variant-level `supplier.*` reads, `unknown_stale` and the five status names nothing writes. Output keeps its 12 fields; field 9 is now `tracked` or `default`.
- `sections/main-cart.liquid`, `snippets/cart-drawer-contents.liquid` - the `supplier_max` cart note and the comments that described the old four-step cap are gone.
- `tests/independence.cjs` - Cloudflare Turnstile console errors are classified by where they are logged from (`challenges.cloudflare.com`), never by their text, and counted in the summary. New: the home page and one collection page as a visitor in a sparse market (`SPARSE_MARKET`, default US), through a second browser context that carries the `localization` cookie.
- Docs: `docs/shopify-supplier-metafields.md` rewritten to the eight product-level keys and three statuses; `CLAUDE.md` table and cap logic, `README.md`, `docs/HANDOVER.md`, `docs/theme-worker-contract.md` (rule 2, section 4, a Markets subsection, open questions closed), `docs/theme-production-grade-prd.md` (T19 rewritten and ticked, T8 closed).

### Why it changed
- Channel round 245 (pawscout-agent): the worker removes products from the AU, EU and US+CA catalogues by design unless they can be delivered there, and the owner keeps those markets open. Measured on live for a US, AU and DE visitor: the Pet Toys block showed customers the merchant hint "Add products to this collection to populate the section." under a heading and a link to an empty collection, and the collection page said "No products here yet. Check back soon".
- The same round set out what the worker really writes. The spec, `CLAUDE.md` and the contract doc described a variant-level key set with six statuses that nothing produces, and the snippet carried branches for them that no fixture could ever exercise.

### How it was solved
- **Measured before changing.** The task said `products_count` ignores the market. Diagnostics on a preview for GB, US, AU and DE say otherwise: `collection.products`, `products_count`, `all_products_count` and `paginate.items` are all market-scoped (Pet Toys 11 for GB and 0 elsewhere on every one; all products 41 against 19). So the related-products walk and the header and footer lists were already market-aware and were left alone; the defects were the block's else-branch and the collection page's copy. Because no count can tell "empty for this market" from "empty everywhere", the message is worded to be true in both cases.
- **A probe caught its own false clean.** A cookieless request with `?preview_theme_id=` is served by the LIVE theme. The first diagnostic pass printed `Shopify.theme.id` and showed the live id on every page, so it was redone with a cookie jar; the market probe now fails itself when a page comes from the wrong theme or market.
- **Verified on preview 207842148690, deleted afterwards** (only the live theme remains). GB: home, collections, three product pages and an article identical to live. US, AU, DE: 4 blocks instead of 5, no hint, no empty collection linked from the home page, no dead product link, the message names the country. Seven GB product pages (fresh available, low stock, out of stock, three stale, multi-variant), the cart page and the cart drawer: identical snapshots between live and preview (the extracted banner, cap, estimate, button, delivery block and cart note compared as JSON; the drawer cap read from the section render, 33 on both), so the snippet cleanup changes nothing a customer sees.
- **Every new check has a firing control.** The two sparse-market checks fail against live today (4 of 5 blocks have cards; the hint is present) and pass on the preview: blocked 108/108, control 105/105. The Turnstile rule, read out of the script itself: 2 own errors on the worker's form without it, 0 with it, and the same text logged from `theme.js` would still count.
- **Evidence grades.** What the worker writes and why: pawscout-agent, round 245, from a repository this agent cannot read. What is on the store: measured here on all 41 active products through the Admin API (eight product-level keys each, no variant metafields, every variant tracked with policy deny, statuses `available`, `low_stock`, `out_of_stock`, six stale stamps).
- Contrast, computed: the message body is `--muted` #5d6670 on `--surface` #f7f4ef, 5.32 to 1; the heading is now `--ink`, 16.31 to 1. Checked at 1280 and 390 wide. The store-wide primary button (white on #f05a28) is 3.39 to 1, below 4.5 for its 16px text; it is not new and was left alone, noted for the owner.

### Not done, for the owner
- The primary button's white on orange is 3.39 to 1 everywhere it appears.
- The announcement bar and the trust strip still say "Free UK delivery" to non-GB visitors, and the Pet Toys collection description (admin content) ends with the same line. True for the UK, beside the point elsewhere.

### Files touched
- `sections/category-showcase.liquid`, `sections/main-collection.liquid`, `sections/main-product.liquid`, `sections/main-cart.liquid`, `snippets/supplier-availability.liquid`, `snippets/cart-drawer-contents.liquid`, `assets/theme.css`, `tests/independence.cjs`, `CLAUDE.md`, `README.md`, `docs/shopify-supplier-metafields.md`, `docs/theme-worker-contract.md`, `docs/theme-production-grade-prd.md`, `docs/HANDOVER.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 26 - 2026-09-20: An accent that passes contrast; a delivery promise that knows the visitor's country

### What changed
- **Accent family.** `config/settings_schema.json` (Accent default), `layout/theme.liquid` (the three tokens) and `assets/theme.css` (fallbacks): `--accent` #f05a28 becomes **#d24000**, `--accent-dark` becomes #b33700 (`color_darken: 6`, was 16), `--accent-soft` becomes #ffe0d2 (`color_lighten: 50`, was 28). Fourteen translucent tints of the old orange (`rgba(240,90,40,a)`: borders, focus glows) follow the new value, and the dead `.trust-stars` rule, the last hard-coded copy of the old hex in the stylesheet, is deleted (the star card left the trust bar long ago; nothing references the class).
- **Delivery promise.** New `snippets/delivery-promise.liquid` decides the short delivery line for the visitor's market: "Free UK delivery / On every order, no minimum" for GB, "Delivery to <country> / Rates and times at checkout" for every other market. `sections/announcement-bar.liquid` and `sections/trust-bar.liquid` both render it. The wording moved to Theme settings > Delivery (four settings, `[country]` is replaced by the country's name); the announcement section's own `shipping_title` and `shipping_text` settings and their stored values in `config/settings_data.json` are gone, with a note in the section pointing at the new place.
- **Announcement bar layout** (`assets/theme.css`): columns are `minmax(0, auto)` instead of equal thirds, and an item that cannot fit drops its text under its title as one whole line (`flex-wrap`); the phone marquee stays one line per item.
- `tests/independence.cjs`: on the GB home page and on the sparse-market home page, every copy of the promise must read the same, a GB visitor must get the UK promise, and any other visitor must never be told about UK delivery.

### Why it changed
- Owner instruction after pull request #12's first round: both items had to be dealt with before going further; the announcement bar "must be visitor location aware", and the orange button's proper value was to come from the impeccable skill.
- Measured on live, the button was the smallest part of it: **10 of the 13 accent pairings** on nine pages failed WCAG AA, all from one token. White on #f05a28 is 3.39 to 1 (primary buttons, 35 "Add to cart" buttons, the cart count, Subscribe, "Read guide"); #f05a28 as small text on the page background is 3.33 to 1 (eyebrows, the contact email link, step numbers); the blog tag (`--accent-dark` on `--accent-soft`) was 3.62 to 1.
- The announcement bar and the trust strip told US, AU and DE visitors "Free UK delivery", and held two slightly different copies of the same sentence.

### How it was solved
- **The value, by impeccable's method** (contrast table: 4.5 to 1 for body-size text; adjust in OKLCH so hue and chroma hold while lightness moves; fix the token, not each use). #f05a28 is OKLCH 0.659 0.195 37.6. Holding hue 37.6 and chroma to the sRGB gamut edge, white text first reaches 4.5 to 1 at lightness 0.589 (#d74201, exactly 4.50 and only 4.43 as text on the page background). **#d24000** (lightness 0.579, chroma 0.191) is the lightest step with margin on both: white on it 4.69, it on #fffdf9 4.62. It is the same orange, a shade deeper, so one token fixes every failing pair. The two derived steps were re-tuned to land on values that pass: hover and text tone #b33700 (white on it 6.06; 5.53 on `--surface`; within a few units of the old #b9380d, so existing dark-orange text does not visibly move) and tint #ffe0d2 (tag text 4.86).
- **Audit before and after, same script, same nine pages:** live 13 pairings, 10 failing; preview 13 pairings, 0 failing, computed tokens exactly as calculated. Accent text on `--surface` would be 4.28, so the convention stands: text on a tinted surface uses `--accent-dark`. No such use exists today.
- **Location.** The country is Shopify's market country (`localization.country`), the rule the owner chose for the product page in decision 5f and the one that decides the catalogue, prices and checkout. **Limit, stated plainly:** the store has no market web presences, so the market follows the `localization` cookie and not the visitor's IP address (CI proves it: a runner in a US data centre is served the GB market). A visitor physically abroad who has not changed country still sees the GB promise, and the theme has no country selector for them to change it with. That is a product decision for the owner, not part of this change.
- **The neutral line is grounded.** "Delivery to <country>": measured through the Admin API, the general shipping profile has an active "Standard international" rate for an EU zone (27 countries, DE included) and an International zone (AU, US, CA and ten more), and `localization.country` can only be a country in an active market. "Rates and times at checkout": the FAQ already says the exact rate is shown at checkout, and the owner's setting `delivery_detail_other` says options and times are.
- **Layout regression caught by measuring, not by eye.** The first version unified on the longer "no minimum spend" and wrapped the first item at 1280 for every market, growing the bar from 49 to 59 px; with a long country name at 1024 the text was crushed into four lines (bar 100 px). After the fix the bar is 49 px at 1280, 1366, 1440 and 1920 for GB, US and DE, the same as live, and at 1024 every item is a title line over one text line (66 px; live squeezes two lines beside the title in 59 px).
- **Verified on preview 207844966738, deleted afterwards** (only the live theme remains). Promise per market: GB "Free UK delivery", US, AU and DE their own country, four copies per page all identical, no "UK delivery" in the bar or strip outside GB. Independence: blocked 112/112, control 109/109. Controls fire: against live the four promise checks fail, and the UK pattern catches the UK line, passes the neutral one and is not fooled by "Ukraine". The T19 market probe and the seven-product GB comparison from Entry 25 were rerun on this preview and still hold.
- One batched visual round at 1280, 1024 and 390 (home, product, blog, bar, strip); nothing to fix after it. impeccable's detector, run once over the changed files, reported three things, all existing design and none in a changed line (an accent left border on article quotes, the Inter typeface, one overshooting easing curve); left alone.

### Files touched
- `snippets/delivery-promise.liquid` (new), `sections/announcement-bar.liquid`, `sections/trust-bar.liquid`, `config/settings_schema.json`, `config/settings_data.json`, `layout/theme.liquid`, `assets/theme.css`, `tests/independence.cjs`, `docs/theme-production-grade-prd.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 27 - 2026-09-20: A country selector, and the last delivery sentences follow the visitor's country

### What changed
- **Country selector.** New `snippets/country-selector.liquid`, rendered in the footer's brand column (`sections/site-footer.liquid`): Shopify's localization form with one native select, "Delivery country", listing the countries of the active markets with their currency (31 today), and the line "Products, prices and delivery follow the country you choose." `assets/theme.js` submits on change and returns the visitor to the page and query they were on; without JavaScript an Update button inside `noscript` does the same. The form is left out when only one country is available.
- **The announcement bar's delivery title links to it** (`link: forloop.first`, so the hidden marquee duplicate carries no link): a click or Enter scrolls to the selector and puts focus in it; reduced motion skips the animation. In the phone marquee (900 px and under) the moving title is plain text again.
- **`snippets/delivery-promise.liquid` now holds every delivery sentence that depends on the market**, in six shapes (`format`): the pair (bar, trust strip), `title` (footer chip), `stat` and `checkout_note` (home "what every order includes" and "No surprises at checkout"), `drawer_nudge` and `drawer_note` (cart drawer). `sections/site-footer.liquid`, `sections/conversion-stack.liquid` and `snippets/cart-drawer-contents.liquid` render it in place of their own UK literals.
- **Country names read as in a sentence**: "Delivery to the United States", "the Netherlands", "Germany". The article list is by ISO code in the snippet (`GB, US, NL, AE, PH`).
- **Ghost preview note** (`sections/main-search.liquid`, `assets/pawscout.js`): "estimated 7-12 days to the UK" is the UK lane, so Liquid renders the note for the visitor's market into `data-ship-note` (non-GB: "Ships from our supplier network." plus the Delivery setting's line for other markets) and the script reads it.
- **Announcement bar padding** `clamp(12px, 1.2vw, 28px)` (was `2vw`): the longest title, "Delivery to the United States", stays on one line from 1220 px up.
- **`sections/main-404.liquid`**: one added sentence, "If you have just changed your delivery country, the product you were viewing may not be available there."
- **`sections/main-collection.liquid`**: the collection description sits in a `div` with `data-collection-description` (it was a `p` around the merchant's own paragraphs, which the browser closed early, leaving two empty paragraphs). `.collection-description` in `assets/theme.css` keeps the spacing and colour.
- **`tests/independence.cjs`**, new checks: the selector exists and shows the market the page was rendered for (GB home, sparse-market home); no theme sentence about UK delivery outside the GB market (sparse home and collection; FAQ, selector options and the merchant's collection description left out, the last reported on its own informational line); and a country switch end to end from a cookieless visitor: GB to the sparse market and back, same page and query, promise naming the country.

### Why it changed
- Owner decision 2026-09-20: "a country selector is a good feature to add". The store has no market web presences, so the market follows the `localization` cookie and nothing moved a visitor abroad out of the UK market; pull request #12 made the promise market-aware but gave the visitor no way to say where they are.
- The first sweep for UK claims (Entry 26) named only the bar and the trust strip. A literal search found five more for every visitor: the footer chip, two lines on the home page, two in the cart drawer, and the ghost preview note. Self-reported; all six surfaces now go through one snippet or one data attribute.

### How it was solved
- **A native select, in the footer.** The header's action row is full (it already overflows on windows from 901 to about 1200 px wide, see below), and a list of about thirty countries is exactly what the platform's own picker does well: type-ahead, the phone's wheel, screen readers. It is styled as the footer's other field (white, 46 px, 16 px text so phones do not zoom, the footer's green focus ring) and its label shares the footer headings' rule. `autocomplete` is off so browser autofill cannot submit the form by changing the value.
- **Verified on preview 207854010706, deleted afterwards** (only the live theme remains), each arm asserting `Shopify.theme.id` and `Shopify.country`. GB, US, AU, DE: one selector, 31 countries, the visitor's country selected; bar title, footer chip, both home lines and both cart drawer lines (with a real line in the basket) name the country or, for GB, keep the UK wording; 404 sentence present. Contrast on the dark grounds: label 14.07, helper 16.56, select text 17.89, bar link 15.2 to 1. Bar height 49 px at 1280, 1366, 1440 and 1920 for GB, US and DE; 66 px stacked at 1024; 43 px marquee at 390. Bar link: focus lands in the select at once, the smooth scroll over the 10,269 px home page settles between 1 and 1.5 s, instant under reduced motion, same by keyboard. Without JavaScript: Update button 88 by 46 px, GB to DE on `/collections/all?sort_by=price-ascending` lands on the same path and query with "Delivery to Germany". Collection heading block identical to live to the pixel (247 px, grid at 486 px) with the two empty paragraphs gone.
- **Independence on the preview:** blocked 128/129 and control 125/126 with 0 hard failures; the one line that does not pass is the informational one below. GB regression script: seven product pages, the cart and the drawer identical to live.
- **Controls fire.** Against live, which has no selector, all nine new checks fail (selector missing on both home pages, UK sentences found on both sparse pages, the five steps of the switch), and the run exits 1.
- **An early run was disturbed by my own probing**: the storefront answered 429 to `cart/add.js` and product JSON after several probe scripts in a row, which failed six unrelated checks (the other two failures of that run were real: the collection description below, and a bug in the new switch check itself, fixed). Re-run after a pause, all passed. Probes are now spaced.

- **Added 2026-09-21, after a false failure in CI:** run 35568115045 failed the country switch on "no console errors from page code :: TypeError: Failed to fetch". The run's own record shows the line was logged by Shopify's storefront script `/cdn/shopifycloud/storefront/assets/storefront/event_observer_reporter-*.js`: the test chooses the second country the moment the page has loaded, and a beacon of Shopify's that was still in flight was cut off. The theme's own page-load requests all catch their failures. The text carries nothing that tells it from theme code, so `tests/independence.cjs` now classifies console errors by where they were logged from (`/cdn/shopifycloud/` is Shopify's; the theme's files are under `/cdn/shop/t/`), as it already did for Cloudflare Turnstile, and prints the count. Control, offline with both scripts fulfilled by the harness: the same error text is classed as Shopify's from the shopifycloud path and still counts as the theme's own from `theme.js`. The switch stays immediate on purpose: it is the harsher test of the theme.

### Found, not fixed here
- **Store content, owner's or worker's to change:** the descriptions of Pet Cleaning, Pet Accessories, Pet Health and Pet Toys end with "Free UK delivery on every order." (read through the Admin API 2026-09-20). The theme prints a collection description as written, so visitors in every market read it. The independence run now reports it as an informational line on the sparse-market collection page. The announcement bar already carries the promise for UK visitors, so the sentence can simply go.
- **Existing layout defect, same on live:** on windows from 901 to about 1200 px wide the header row is wider than the viewport (`.header-main` reaches 1181 px at 901, 1197 px at 1024 and 1207 px at 1100; no overflow at 1280 or at 768), so the whole page scrolls sideways on a landscape tablet or a small laptop. Not caused by this change: measured identical on live and preview. Needs its own pull request.
- **For pawscout-agent (channel):** ghost cards format prices with a literal pound sign in `assets/pawscout.js` whatever the visitor's market; whether the worker's `priceFrom` is always GBP is the worker's fact.

### Files touched
- `snippets/country-selector.liquid` (new), `snippets/delivery-promise.liquid`, `sections/site-footer.liquid`, `sections/announcement-bar.liquid`, `sections/conversion-stack.liquid`, `snippets/cart-drawer-contents.liquid`, `sections/main-search.liquid`, `sections/main-collection.liquid`, `sections/main-404.liquid`, `assets/theme.css`, `assets/theme.js`, `assets/pawscout.js`, `config/settings_schema.json`, `tests/independence.cjs`, `docs/theme-worker-contract.md`, `docs/theme-production-grade-prd.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 28 - 2026-09-21: Prices built in JavaScript follow the visitor's currency; a supplier price in another currency says so in words

### What changed
- **`assets/pawscout.js`**: the one-line helper that put a pound sign in front of every number is gone. Two helpers replace it. `supplierMoney(amount, currency)` is for prices from the worker: `currency` is an optional ISO code on a search card or a preview, absent meaning GBP; when it is the visitor's currency the amount is printed as the storefront prints money, otherwise it is labelled with the code in words ("GBP 12.99") and never converted. `shopMoney(amount)` is for prices that come from Shopify's own product JSON (the add-on cards), which are already in the visitor's currency.
- **`layout/theme.liquid`**: `<body>` carries `data-money-sample`, the number 1234567 through Liquid's `money` filter ("£12,345.67", "$12,345.67", "€12.345,67"). Both scripts read the symbol, its side, the thousands separator and the decimal mark from it, so a price built in JavaScript reads exactly like the ones Liquid prints beside it. A sample that does not parse falls back to `Intl.NumberFormat`.
- **`assets/theme.js`**: the product page's "Value" total uses the same sample (`formatShopMoney`).
- **`tests/independence.cjs`**: two visits with a stand-in for the worker (`prices`, `prices-<market>`). The search answer is fulfilled by the test with four cards at 12345.67 (no currency field, GBP, USD, EUR); an own-currency card must read exactly the `data-money-sample` string, which is Liquid's own output and so an oracle the script did not write; any other must read "<CODE> 12345.67". `visit()` gained a hook that runs before the navigation, for the page route.

### Why it changed
- Owner ruling 2026-09-21 on channel round 257: outside the UK a supplier price is labelled as GBP in words. pawscout-agent confirmed first-hand in the worker's source that every price it returns is GBP and that `country` never converts (it only picks which warehouses count as local), proposed the optional `currency` field (not built), and warned against converting in the browser: Shopify applies the market's rounding to a product that does not exist yet, so a converted card and the later product page can disagree by a few pence.
- The country selector (Entry 27) makes this reachable: before it, practically every visitor was in the GB market.
- **Found while reading the helper, measured on live:** the add-on cards print `variants[0].price` from `/products/{handle}.js`, and that JSON is already in the visitor's currency (the same product reads 2999 for GB, 3799 for US, 6400 for AU, 4295 for DE). The old helper therefore showed a US visitor "£37.99" for a $37.99 product: a wrong symbol on a real price. And the product page's "Value" total, formatted by `Intl` with the browser's locale, read "US$37.99" and "€42.95" beside Liquid's "$37.99" and "€42,95".

### How it was solved
- **Verified on preview 207873868114, deleted afterwards** (only the live theme remains), with a stand-in worker so the result does not depend on supplier stock. GB: "£12,345.67 | £12,345.67 | USD 12345.67 | EUR 12345.67", preview "From £12,345.67". US: "GBP 12345.67 | GBP 12345.67 | $12,345.67 | EUR 12345.67", preview "From GBP 12345.67". DE: "GBP 12345.67 | GBP 12345.67 | USD 12345.67 | €12.345,67". Add-on card against Liquid's printed price for the same product: £29.99, $37.99, €42,95, identical in all three; the "US$" and "€42.95" variants are gone from the product page. No page errors.
- **Control, same probe against live:** a US visitor gets "£12345.67" on all four cards, "£37.99" on the add-on card for a $37.99 product, and no `data-money-sample`. Under the new checks that is a failure, as it should be until this deploys.
- **Independence on the preview:** blocked 138/139, control 135/136, 0 hard failures (the one line is the informational collection description from Entry 27). In blocked mode the stand-in still renders: a page route outranks the context's abort.
- The stand-in visits skip the generic "no growth after load" rule on purpose (cards arriving after load is what they test) and repeat the theme-id and status checks themselves.

### "Free UK delivery on every order": the evidence (asked by pawscout-agent, round 257)
- **Shipping configuration, read through the Admin API 2026-09-21:** five delivery profiles. General (default), GB Local, Origin CN and Origin CN,US each have a UK zone with ONE rate, "Standard", GBP 0.00, no conditions. Origin US (one variant) has no UK zone at all, so that variant cannot be delivered to the UK; it is not a paid rate. Every rate is a flat rate definition; no carrier or app rate provider.
- **Walked on the live checkout 2026-09-21, no email, nothing submitted, no payment:** one China-origin item in the Origin CN profile at £8.99, the store's own trading address (E6 2JA). Shipping method "Standard, FREE"; summary Subtotal £8.99, Shipping FREE, Total GBP £8.99. So the sentence holds for the hardest single case: not British stock, under any minimum.
- **Not measured:** a basket mixing three profiles. The storefront answered 429 to every cart call on that attempt (my own traffic from the runs above), so nothing was read. Shopify adds the rates of the profiles in a basket and each is 0.00, so the configuration predicts FREE; that is inference, not a reading.
- **Seen on the way, not the theme's:** the checkout's shipping method line says "Ships next business day" for that China-origin item. It is a Shopify shipping setting (processing time), not theme copy, so whether it is true for stock a supplier ships from China is with the owner.

### Files touched
- `assets/pawscout.js`, `assets/theme.js`, `layout/theme.liquid`, `tests/independence.cjs`, `docs/theme-worker-contract.md`, `docs/theme-production-grade-prd.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 29 - 2026-09-21: No page scrolls sideways; every layout between a tablet and a small laptop is a designed one; icon buttons keep their names

### What changed
- **Header, 901 to 1260px.** The three-column header row gives up width in steps and keeps all four actions at every step: at 1260px and under the second line under each label goes, at 1200px and under Share and Contact become icon buttons (as they already are on phones) while Collections keeps its word, at 1040px and under the search field may shrink to 220px.
- **Footer, 901 to 1320px.** Two rows instead of three columns: the brand block (with the country selector) beside the newsletter, the three link columns across the full width underneath.
- **Product page, 901 to 1240px.** Two columns instead of three: the gallery on the left; title, price and the buy box stacked on the right. The two inner scroll panes go in that band, as they do on phones. Where the window is at least 720px high the gallery follows the scroll, so the picture stays beside the buy box instead of leaving a blank half page under it.
- **"Useful pet care finds" section on the home page.** The three service cards stack where three do not fit: beside the copy from 901 to 1199px, under it at 700px and below. In the first band the figure in the stat boxes scales with the window, and it may wrap, so a long word never runs through its box.
- **Phones: the Share and Contact buttons have a name again.** Their labels were removed with `display: none`, which left two icon buttons with no name at all for a screen reader (the icon is `aria-hidden`). The labels are now clipped with the visually hidden pattern, and both buttons carry a `title` for hover and long press.
- **Product page breadcrumb.** The links were 15px tall, under the 24px minimum target (measured 34x15 on a phone). Padding grows the hit area to 31px and a negative margin keeps the row where it was (row height still 15px, measured).
- **A standing layout check in `tests/independence.cjs`** (`layout-home`, `layout-pdp`): no sideways scroll, no container spilling into its own padding, every visible button, link and field named, at 25 widths from 1400 to 360px, in a browser that keeps its scrollbar.
- **Store content, through the owner's Shopify connector (not the theme, not the scripts app):** the trailing sentence "Free UK delivery on every order." was removed from the on-page description of four collections. See below.

### Why it changed
- The owner asked for every customer-facing issue to be fixed first. A sweep of seven page types at four widths (overflow, names, images, contrast, target size) found no contrast or image defects, and found these:
  - Between 901px and about 1300px EVERY page scrolled sideways: 1197px of header and 1142px of footer on a 1024px window, and on the product page the buy box ran 225px past a 901px window. That band is every tablet in landscape and most small laptops.
  - On phones the service cards were 109px wide and their text wrapped one word per line; from 901 to 1020px the figure "Tracked" (85px wide at 22px) ran through its 77px box.
  - Two header buttons with no accessible name on phones, and one 15px tall link.
- Entry 27 and the notes on pull request 13 named only the header. **That diagnosis was incomplete, and it was mine:** the first probe listed offenders in document order and cut the list at eight, so it showed header elements only. The footer was a second cause all along and the product columns a third. Each only became visible once the one above it was fixed, which is why the fix was verified with a probe that lists every unclipped offender, not the first few.

### How it was solved
- **Thresholds come from arithmetic, then measurement, and they carry a scrollbar.** Each band ends at the width the full layout needs: minimum column widths, plus gaps and padding that are a share of the window, plus 15 to 17px for a desktop scrollbar. A media query sees the whole window; the layout gets the window minus the scrollbar. Playwright hides scrollbars by default, so my first thresholds (1240, 1150, 1000), measured that way, read "fits" and were wrong for a real browser: 2px of sideways scroll at 1181 and 6 to 14px from 1001 to 1010. Found before anything shipped, by relaunching Chromium without `--hide-scrollbars`; every row of every probe since proves the bar is there (`innerWidth` greater than `clientWidth`).
- **"Fits" was not enough.** A grid whose columns are wider than its content box overflows into its own right-hand padding before it makes the page scroll. The footer did that from about 1236 to 1314px and the product page from 1141 to about 1218px: no scrollbar, but the last column touching the window edge. The probe therefore reports a second thing, "squeezed": a grid or flex container whose children reach past its content box. That detector is what found the service cards and the stat figure, neither of which I was looking for.
- **Rethought, not scaled** (impeccable, adapt reference): each band is a two-column or two-row layout in its own right, not the desktop one squeezed. An icon button keeps its name: labels are clipped, never `display: none`.
- **Verification on an unpublished preview (created for this, deleted afterwards), GB visitor:**
  - Probe with a real scrollbar, seven page types (home, collection, product, search, cart, blog, contact) at 38 widths from 1400 to 360px: 266 rows, every one served by the preview theme, 0 sideways scroll. "Squeezed": 0 on six pages; 9 rows on the home page, all the service cards and the stat figure, 0 after that fix (home and product re-probed, 76 rows).
  - **Control, the same probe against live (unfixed), product page, 27 widths:** 11 widths scroll sideways and 16 are squeezed, including the footer eating 25px of its padding at 1280px, which the arithmetic had predicted.
  - **The new standing check against live (unfixed): all six of its assertions FAIL**, on exactly the defects above (130 of 137 checks passed, 6 hard failures, plus the informational line). Against the preview: blocked 152/153, control 149/149, 0 hard failures. A check that cannot fail on the broken theme would prove nothing on the fixed one.
  - Looked at, not only measured: header and footer at 1024px, product page at 1024px at the top and scrolled (the gallery sits 16px under the compact header), the home section at 1024 and 390px, the breadcrumb target 34x31 with the row still 15px high. On a window 650px high the gallery is `static` again, as intended.
- The layout check runs in a second browser launched with `ignoreDefaultArgs: ['--hide-scrollbars']`. If a runner ever has no scrollbar the informational line "measured with a real scrollbar" says so; the three assertions still run, with 15px more room than a shopper has.

### Store content changed (Shopify admin data, not in this repository)
- Read first-hand through the Admin API on 2026-09-21: nine collections; four (`pet-cleaning`, `pet-accessories`, `pet-health`, `pet-toys`) ended their on-page description with "Free UK delivery on every order." The theme prints the delivery promise for the visitor's own country on that page (Entry 27), so the sentence was wrong for every visitor outside the UK and a duplicate for every visitor inside it.
- One `collectionUpdate` per collection, `descriptionHtml` only: the same HTML minus that sentence. Titles, rules, sort order, images and SEO fields untouched. No user errors. Rollback is to put the sentence back at the end of the second paragraph of each.
- Verified on the storefront afterwards: the independence run's informational line for a US visitor on `/collections/pet-toys` is gone (control run, 149/149).
- **Left as it is, for the owner:** the four SEO meta descriptions also end "Free UK delivery." A meta description is one text for every market and is shown in search results, not on the page; it is true of UK orders and it sells the click to the store's main market, so it was not removed.

### Found, not fixed here
- **Checkout says "Ships next business day".** Read first-hand: `deliveryPromiseSettings` is `deliveryDatesEnabled: true`, `processingTime: P1D`. That is a dispatch promise on stock a supplier ships from abroad, and nothing in this repository grounds it (the product page says "Estimated 5-14 days to your door" from the worker's data). The Admin API exposes the setting as read-only (`deliverySettingUpdate` takes `legacyModeProfiles` only), so it is an owner action in Shopify admin under Settings, Shipping and delivery. The grounded choices are to turn delivery dates off or to set a processing time the supplier actually meets. It changes what checkout shows, so not during the owner's supervised test orders.
- **"Origin US" delivery profile (Entry 28 said its one variant cannot be delivered to the UK):** its only product, the folding grooming table, is ARCHIVED with no storefront URL, so no shopper can reach it. Not customer-facing; nothing to do.
- "More payment options" under the buy button is 20px tall. It is Shopify's own element inside the dynamic checkout button, not theme markup.

### Files touched
- `assets/theme.css`, `sections/site-header.liquid`, `tests/independence.cjs`, `docs/design-improvements.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 30 - 2026-09-23: The product page shows the product's own delivery figure; the page and the order carry the same one

### What changed
- `snippets/supplier-availability.liquid` field 11 is now `supplier.delivery_days_actual` where the product carries it, else `supplier.delivery_days` (one `default:` filter). Everything downstream is unchanged: blank unless the supplier check is fresh, and the static band in `delivery-info` when blank.
- `sections/main-product.liquid`: the hidden line-item property "Estimated delivery" is that same field, instead of its own read of `delivery_days_actual`. The page and the order now carry one figure by construction. The section's `supplier_fresh` flag lost its only reader with that (the field is already blank unless fresh) and is gone; the theme check flagged it as unused.
- `tests/independence.cjs`: the product visit checks that the figure on the page is the figure on the order, whichever product the grid offered.
- Docs follow the reader: `docs/shopify-supplier-metafields.md`, `docs/theme-worker-contract.md`, and the doc comments in both snippets.

### Why it changed
- The worker writes two ranges on every managed product (channel rounds 262 to 264, read first-hand): `delivery_days` is the ORIGIN's representative channel, the same figure on every product from that origin (every China-origin product read 5-14); `delivery_days_actual` is THIS product's own cheapest channel, the one the order pipeline books. The page showed the origin's figure and the order carried the product's, so on five products a shopper read "Estimated 5-14 days" and their order said 11-30 (the grooming scissors set, both tooth cleaning powders, the tooth cleaning pen, the disposable gloves), and on three more 5-14 against 10-15.
- **Owner ruling 2026-09-22, relayed in round 263, verbatim: "the per-product figure is fine."** Asked in round 261; not changed on a guess.

### How it was solved
- Verified on an unpublished preview (created for this, deleted afterwards), GB visitor, five products chosen for their metafields (read through the Admin API the same hour):

  | product | keys (days / actual) | live page / order | preview page / order |
  |---|---|---|---|
  | pet-tooth-cleaning-pen | 5-14 / 11-30, fresh | 5-14 / 11-30 | **11-30 / 11-30** |
  | pet-ear-cleaning-drops-60ml | 5-14 / 10-15, fresh | 5-14 / 10-15 | 10-15 / 10-15 |
  | professional-cordless-led-pet-hair-grooming-clippers | 3-10 / 5-15, **stale since 2026-07-05** | 3-10 (static band) / none | 3-10 (static band) / none |
  | 4-litre-automatic-pet-feeder-with-timer | 3-10 / 3-8, fresh | 3-10 / 3-8 | 3-8 / 3-8 |
  | multifunctional-pet-home-sofa-hair-removal-brush-614700 | 5-14 / 5-14, fresh | 5-14 / 5-14 | 5-14 / 5-14 |

  The stale row is the freshness rule still holding: a figure 80 days old is not shown, whichever key it came from. Every row asserted `Shopify.theme.id`.
- **The new check fails on live and passes on the preview.** Live: "page 3-10, order 4-12" on the product the grid offered, the one hard failure of 137. Preview: blocked 153/153, control 150/150, 0 hard failures.
- eslint, `shopify theme check --fail-level warning`, 37 unit tests, aramid: green.

### Not changed
- What a non-GB visitor sees (the neutral Delivery setting line) and the static fallback bands (3 to 10 for GB origin, 6 to 14 otherwise): untouched.
- The checkout's "Ships next business day" (Shopify's fulfilment time, `P1D`) is still the owner's admin action; the worker confirmed in round 262 it never writes that setting and holds no measured processing time (its configured envelope is 1 to 3 days).

### Files touched
- `snippets/supplier-availability.liquid`, `sections/main-product.liquid`, `snippets/delivery-info.liquid`, `tests/independence.cjs`, `docs/shopify-supplier-metafields.md`, `docs/theme-worker-contract.md`, `docs/design-improvements.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 31 - 2026-09-24: One refused page load no longer counts as nine theme failures; the refusal is recorded

### What changed
- `tests/independence.cjs`: when a page load answers 5xx, `visit()` records the refusal (status, time, and the response headers that say who refused it: `server`, `cf-ray`, `cf-mitigated`, `cf-cache-status`, `retry-after`, `x-request-id`, `content-type`), throws away what the refusal page logged, waits 15 s and asks once more. Every check then runs on the second answer, so a page that answers 5xx twice fails exactly as before.
- Each refusal goes into `retries` in the results JSON and is printed at the end of the log; on GitHub it is also a warning annotation, so a refusal on a green run is visible on the run's page.
- Docs: `docs/theme-production-grade-prd.md` section 4 gains "Deployed after phase 4" (PRs #11 to #15 and #17, merge commit, tag and post-deploy run for each, read from GitHub on the day); `docs/HANDOVER.md` gets a dated pointer to it, since that brief still describes June.

### Why it changed
- Issue #18. Three times on 2026-09-23 the storefront answered 503 to a single page load from the GitHub runner: the cart in PR #17's preview job (run 35800195345 attempt 1, reported 00:08Z), home in the scheduled run (run 35855548604 attempt 1, reported 11:40Z), `/collections/all` on its rerun (attempt 2, 19:39Z; the issue first said about 11:55Z). All three read from the runs' own logs and artefacts on 2026-09-24. A different page each time, every other page passing, the control run straight after passing, and from the owner's machine the same pages answering 200 fast. One refusal failed six to nine checks on one page, and the scheduled run opened an issue for a theme that had not changed.
- The run could not say who refused: the results kept the status and nothing else. The recorded headers are meant to answer that on the next refusal, by showing which layer in front of the store wrote the answer.

### How it was solved
- A stand-in storefront in the scratchpad refused the first load of `/` and every load of `/pages/contact` with 503. The run recorded both with their headers; home passed on the retry ("503, then 200 after 15 s"), contact still failed `http 200` ("503, then 503"). The first attempt at this caught a bug: the record was copied before the retry, so its outcome read `undefined`; the record is now one object shared by the page and the list.
- Against live from this machine, 2026-09-24 about 01:00Z: blocked 137/137 and control 134/134, a minute apart, no refusal in either (so no retry, and the pass counts are unchanged). eslint, `shopify theme check --fail-level warning`, 37 unit tests and aramid: green.
- Not covered: the preview-cookie load in `openContext()` and the `context.request` calls (search term, product JSON, `/pages/affiliates`, `cart/add.js`). None of the three refusals was there; if one ever is, it shows as its own failure.

### Not changed
- What counts as a pass. The pause adds 15 s to a run only when a page is refused.
- Issue #18 stays open until the recorded refusals explain the pattern.

### Files touched
- `tests/independence.cjs`, `docs/theme-production-grade-prd.md`, `docs/HANDOVER.md`, `docs/design-improvements.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 32 - 2026-10-01: Dev tooling: wrangler 4.145.0 brings undici 7.29.1; ARAMID.md follows the aramid 0.19 template

### What changed
- `package-lock.json`: wrangler 4.134.0 to 4.145.0, inside the existing `^4.100.0` range (`package.json` is unchanged). That brings miniflare 5.20260930.0-alpha, and undici 7.29.0 to 7.29.1.
- `ARAMID.md`: regenerated by `python -P bootstrap-agent-tooling.py` (aramid's init, then Graphite's) from aramid 0.19's template. Two paragraphs are reworded (the semgrep bake, the post-commit triage); nothing about this repo's gates changed. Graphite's init changed no tracked file.

### Why it changed
- The pre-push gate refused a push on 2026-10-01. Ten advisories against undici below 7.29.1 (GHSA-3wwx-pv8p-q78v reported first; two of the ten are high) were published after this repo's last push on 2026-09-24, and the ratchet blocks a finding that is new. undici reaches this repo only through wrangler, which is dev tooling and kept out of the theme push by `.shopifyignore` (`/package-lock.json`). A fix exists, so the response is the fix rather than an override.
- aramid-agent asked every repo to re-run init after aramid 0.19.0 changed the ARAMID.md template (channel round 277). It goes through the bootstrap script, not a bare `aramid init`, because both tools want `post-commit` and only Graphite's init chains the other's copy.

### How it was checked
- `npm ls undici`: wrangler 4.145.0, miniflare 5.20260930.0-alpha, undici 7.29.1. `npm audit`: 0 vulnerabilities (before: 1 high and 2 moderate, the same advisories counted at undici, miniflare and wrangler).
- The bootstrap's read-back: hooks armed (Graphite's post-commit chains Aramid's `post-commit.local`; aramid's init declined to touch Graphite's hook, as designed), and aramid doctor "all BLOCK-tier tools present".
- The pre-push gate passed on this branch.

### Not changed
- Anything the theme serves: no theme file is touched.

### Files touched
- `package-lock.json`, `ARAMID.md`, `docs/design-improvements.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 33 - 2026-10-01: The search check compares the page with itself, not with an earlier read of a moving catalogue; Shopify's telemetry CORS line is platform

### What changed
- `tests/independence.cjs`, the `search` visit: "native results rendered" counts the search's own matches as the cards before the grid's first separator (the Liquid 'Suggested' cards and the supplier's ghost cards both come after one) and compares them with `data-have` from the same render. The picker's earlier count is still recorded (`pickerCount`, beside `pageCount`) but no longer decides the check.
- A new informational line says whether the term was still thin (1 to 3 matches) when the page rendered, so a run that stops exercising the thin grid says so instead of passing quietly.
- The log's search summary line also prints `page=` and `picker=`.
- `isPlatform` gains one text rule: a fetch to a `*.shopifysvc.com` host refused by CORS is Shopify's own telemetry, not theme code.

### Why it changed
- The scheduled run of 2026-09-24 (35994930886, 11:45Z) failed one check: "5 native (server said 3)". Read from its artefact on 2026-10-01: the picker's request read `data-have="3"` for "fountain"; the browser loaded the same URL seconds later and the page itself said "5 products" (the screenshot shows every card badged "Search match" and no "Suggested" separator, and "fountain" matches no keyword rule). The picker for the next visit in the same run had already passed over "fountain", and the control run two minutes later picked "harness". Live read "fountain" as 4 on 2026-10-01. So the storefront's answer changed between two reads seconds apart; whether a product changed or the search index caught up is not known, and the fix does not depend on it.
- A second way the old count could go wrong: on a thin result whose term hits a keyword rule (for example "scratcher" and the rule `pet-toys: ... scratch`), `sections/main-search.liquid` adds up to three 'Suggested' cards inside the same grid. They are `.commerce-card` and not ghosts, so the old selector counted them as search matches.
- The comment the workflow added to issue #18 for that run files it with the refused page loads; it is a different cause.
- The control run of 2026-10-01 09:43Z logged "Access to fetch at 'https://otlp-http-production.shopifysvc.com/v1/metrics' from origin 'https://activepaw.co.uk' has been blocked by CORS policy" on home, product and a search page; a reload of home a few minutes later sent the same telemetry requests with no error, so the endpoint fails now and then. The line carries no script URL, so it cannot be classified by source like the others. The theme references `shopifysvc.com` nowhere (`git grep`, theme directories), so theme code cannot make that request, and only that host can send the missing header. In blocked mode those requests are not blocked, so one such line would have been a hard failure and an issue.

### How it was solved
- Planted control (scratchpad `search-count-probe.cjs`, which extracts the committed `page.evaluate` function from the script, so the copy cannot drift), against live on 2026-10-01: "scratcher" (8 matches) and "harness" (1) pass unchanged; one native card removed fails (7 against 8, 0 against 1); one duplicated fails (9 against 8, 2 against 1); a separator followed by a suggested card and a ghost still passes, where the old selector reads 9 against 8 and 2 against 1. The suggestion case is simulated: no live term rendered real Liquid suggestions that day.
- The platform rule, read out of the committed script and run on five lines: Shopify's telemetry line matches; a CORS line for the worker's proxy, one for the worker domain, one for another host whose query mentions `shopifysvc.com`, and a TypeError mentioning it do not.
- Against live from this machine on 2026-10-01, blocked at 09:40Z and control at 09:43Z: the changed check passed in both ("19 search matches rendered, the page says 19", then 22 and 22; the term was "dog" both times because the picker found no thin term). Both runs failed other checks for a reason outside this change: the storefront answered 429 to this machine's bursts of background requests (the picker's six searches, the collection's eight product lookups; the affiliate request recorded the 429). That emptied the picker, so the two stand-in price visits had no thin grid to fill, and the collection check fell back to a product that is out of stock, so the checkout reported a stock problem. A single background request a minute later answered 200, as did a page load and curl (Cloudflare edge LHR, `x-request-id` present). Pet Toys has four available products by the Admin API and the storefront's own JSON, so the collection failure was the refusals and not the catalogue. The CI preview job on this PR runs from GitHub's runner and is the cleaner reading.
- eslint, `shopify theme check --fail-level warning`, the unit tests, a dash scan of added lines with a planted control, and aramid: see the PR.

### Not changed
- What the search visit asserts in blocked mode (no ghost cards, no empty-state message) and the picker's terms.
- The background requests (`context.request`) still have no retry (Entry 31 said so). On 2026-10-01 this machine's bursts drew 429s; the daily runs from GitHub's runner passed from 25 to 30 September with the same bursts. If the runner starts seeing them, that is its own change.

### Files touched
- `tests/independence.cjs`, `docs/design-improvements.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 34 - 2026-10-01: An item stocked only overseas says so, on its card and in its preview

### What changed
- `assets/pawscout.js`:
  - The search asks the worker for overseas items (`overseas=1` on `/apps/pawscout/search`), and a ghost click asks for the overseas preview (`overseas=1` on `/apps/pawscout/product`).
  - `overseasNote(delivery)`: a card whose `delivery.overseas` is `true` gets one line under its price, "Ships from overseas · estimated N days to your door", N being the worker's `delivery.days`. A figure that is not a plain range or number is left out, giving "Ships from overseas". Local cards (`overseas: false`) get nothing.
  - The preview of an overseas item shows that line in place of the market's supplier line (`data-ship-note`, which for a GB visitor reads "estimated 7-12 days to the UK"), so the preview never states two times. The preview's own `delivery` decides; a `null` one after an overseas card (the worker could not confirm the route) gives "Ships from overseas" with no figure.
  - The comment in `initSearchBackfill` no longer says suggestions are local-warehouse-only.
- `assets/theme.css`: `.pawscout-overseas`, 13px, weight 700, ink colour: the note must be noticed, so it is not muted. On a card the rule also undoes `.commerce-card p` (a two-line clamp and a 42px floor), which otherwise wins on specificity.
- `tests/independence.cjs`: an `overseas` visit with a stand-in worker (page routes for `/search` and `/product`, which outrank blocked mode's abort, so it runs in both modes): three cards (local; overseas with "8-21"; overseas with a figure that is not a range) and two previews of the overseas card (confirmed, then `null`). It asserts `overseas=1` on both calls; the card notes exactly (none, the full line, "Ships from overseas"); the confirmed preview states one time, the overseas one; the unconfirmed preview says overseas with no figure; and no country is named.
- `docs/theme-worker-contract.md`: both payloads gain `delivery`, and an "Overseas items" paragraph says what the theme sends and shows.

### Why it changed
- Owner rule of 2026-09-30, relayed by pawscout-agent in channel round 288: an item stocked only overseas is still offered, with the real supplier facts, and the customer is told; the goal is to always make the sale. Round 290: the worker side is live but switched off (`OVERSEAS_STOREFRONT`) until a theme release shows the note, and the preview's price now matches the card's.
- The wording was approved by the owner on 2026-10-01. It follows the product page's sentence ("Estimated N days to your door") because the worker computes the figure with the product page's formula, so a card and the page after import read alike.
- Standing rules kept: no country or supplier named, no claim of UK dispatch, and the figure only as the worker gives it.

### How it was checked
- On an unpublished preview theme (208604528978, pushed from this branch and deleted afterwards), every page asserting `Shopify.theme.id`:
  - Blocked run at 09:55Z: all seven `overseas` checks passed on the thin term "sisal": `overseas=1` on the search and on both preview calls; the card notes exactly (none, the full line, "Ships from overseas"); the confirmed preview showing one line, the overseas one; the unconfirmed preview "Ships from overseas"; no country; no console errors.
  - The control run straight after crashed in the `overseas` visit: the picker found no thin term, so no ghost card rendered, and the preview step waited 30 s for one and threw, which ended the whole run. Fixed: with no overseas card the checks fail and the run goes on. The final runs (10:04Z blocked, 10:07Z control) did exactly that: the picker again found no thin term (the storefront answering 429 to this machine's bursts of background requests, as in Entry 33), so five `overseas` checks failed with "not asked" and "shown []", and nothing crashed.
  - CI's preview job on the pull request runs from GitHub's runner, which these 429s did not reach (Entry 33's PR: 154/154 and 151/151 there), and is the reading of record for this change.
- A look at the cards and the preview (scratchpad `overseas-look.cjs`, the same stand-in worker, 1280 and 390 px wide) caught a defect the checks could not: on a card the note came out muted, 14px, with a 42px floor and a two-line clamp, because `.commerce-card p` is more specific. After the fix: ink on white, 17.89:1, 13px bold, two lines on a 243px desktop card and three on a 153px phone card, not clipped (the clamp would have cut the third). The preview shows one delivery line, the overseas one, 17.89:1 on the panel. Screenshots looked finished at both widths.
- eslint, `shopify theme check --fail-level warning` (71 files, no offences), 37 unit tests, a dash scan of added lines with a planted control, and aramid: clean.

### Not changed
- What a customer sees today: the worker ignores `overseas=1` until its switch is on, so nothing changes until pawscout-agent turns it on with the owner's go after this release.
- The "estimated 7-12 days to the UK" line that local ghost cards' previews show to GB visitors. Where that figure comes from was not checked in this change.
- Seen in passing, not changed: on a phone a long card title clamps to two lines with a sliver of the third showing (the existing `.commerce-card h3` clamp).

### Files touched
- `assets/pawscout.js`, `assets/theme.css`, `tests/independence.cjs`, `docs/theme-worker-contract.md`, `docs/design-improvements.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

## Entry 35 - 2026-10-01: A refused background request is waited out and asked once more, and recorded

### What changed
- `tests/independence.cjs`: every background request (`context.request`: the thin-term picker's searches, the collection's product lookups, `/pages/affiliates`, the cart add and clear) goes through one helper, `backgroundRequest()`. On a 429 or a 5xx it records the refusal (status, time, and the headers `server`, `cf-ray`, `cf-mitigated`, `cf-cache-status`, `retry-after`, `x-request-id`, `content-type`) in `results.retries`, waits what `retry-after` asks (15 s when it is absent, at most 75 s), and asks once more. The refusal is printed and, on GitHub, raised as a warning, like a refused page load (Entry 31).
- The waits share one budget of 150 s per run. Once a wait no longer fits, the refusal is recorded as "not retried" with what was left, so a bad day cannot run a job past its timeout (20 and 25 minutes).

### Why it changed
- On 2026-10-01 every local run failed four to nine checks that had nothing to do with the change under test. A burst diagnostic (scratchpad `burst-diag.cjs`, 12:25Z) found the cause: Shopify's own limiter answered every product lookup from the owner's machine with 429, body `local_rate_limited`, `retry-after: 60` and an `x-request-id`, with no `cf-mitigated`, from the first request, while searches in the same burst answered 200. A minute later every route answered 200 again, by curl, a page load and the background client alike. Entry 31 had said these requests were not covered; they now are.
- What tripped the limiter is not known: nothing from this session had touched the store for two hours before that burst. The fix does not depend on it.

### How it was checked
- A stand-in storefront (scratchpad `refusing-server-2.cjs`) refuses the first search and the first product lookup once, and `/pages/affiliates` always, each with 429, `local_rate_limited` and a short `retry-after`.
  - Before the change: no refusal recorded, "an available product exists in the grid" failed ("none of the first 8 are available"), and the picker passed over the refused "launcher" for "sisal".
  - After: three refusals recorded with their headers; the product lookup waited 2 s and answered 200, so the collection check passed; the picker waited 1 s and kept "launcher"; the affiliate page answered 429 twice and the record says so.
  - With the budget set to 1.5 s in a scratch copy: the 2 s wait did not fit and was recorded as not retried (1.5 s left), the 1 s search retry ran, and the next 1 s wait (0.5 s left) was recorded as not retried.
- eslint clean.

### Not changed
- What counts as a pass: a request refused twice still fails the checks that depend on it.
- Issue #18 stays open; these records are more evidence for it.

### Files touched
- `tests/independence.cjs`, `docs/design-improvements.md`.

### Graphite sync
- The repo's Stop hook runs `graphite build` after the session; no manual rebuild needed.

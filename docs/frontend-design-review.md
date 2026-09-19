# Active Paw - Frontend Design Review Report

**Date:** 2026-06-08
**Scope:** Aesthetic design review (no code changes)
**Theme:** Active Paw Shopify Theme (`assets/theme.css`, `assets/theme.js`, all Liquid sections)

---

## 1. Color Palette - Cohesive but Under-Utilized

### What works
- The core palette is well-chosen: warm cream (`#fffdf9`), deep ink (`#101820`), and burnt orange (`#f05a28`) create a premium pet-care feel.
- `--accent-dark` (`#ba3d1a`) provides a sensible hover state.
- `--green` (`#1f7a5a`) for stock/availability signals is a good functional choice.

### What needs improvement
- **Surface token is barely used.** `--surface: #f7f4ef` appears in the body background fallback and a few panels, but the site overwhelmingly relies on `#fffdf9` and white. This makes the design feel flatter than intended - there is not enough tonal variation between page background and card backgrounds.
- **The dark conversion section is visually jarring.** `.conversion` (`#101820`) with lime-green stats (`#b8ff9f`) feels like a different brand. The lime green clashes with the warm orange accent used everywhere else. Consider using a warm amber or muted peach for stats on dark backgrounds to stay in the same emotional register.
- **Category showcase background (`#b8792d`) is problematic.** This muddy brown-gold clashes with the clean cream-and-orange palette. It sits between the warm orange and the surface cream without harmonizing with either. The heading text inside it is forced to use `--accent` (orange) on brown, which reduces contrast and feels muddy.
- **No mid-tone gray.** Everything is either `#fffdf9` (warm white), `white`, or `#101820` (near-black). There is no neutral gray for secondary backgrounds or dividers. `--line: #ded8cf` is warm, which is fine, but it cannot serve as a background tone.

**Recommendation:** Replace the category showcase brown with `--surface` or a very light tint of `--accent` (like `#fff4ee`). Add a `--surface-elevated` token for cards vs. page background separation.

---

## 2. Typography - Functional but Lacks Character

### What works
- Inter is a safe, readable sans-serif.
- Clamp-based fluid sizing on headings (`clamp(44px, 7vw, 92px)`) is modern and responsive.
- `--pdp-title-max` dynamic sizing logic ( Liquid + JS ) is clever.

### What needs improvement
- **Only one font family is used.** Every single text element - headings, body, labels, badges, nav, buttons - uses Inter (or the system fallback stack). This creates a monotonous, flat hierarchy. A secondary display typeface (even just a different weight distribution) would give the brand personality.
- **Font weight is over-relied on for hierarchy.** The design uses `font-weight: 800` and `900` constantly - headings, nav links, badges, labels, button text, card titles, footer headings. When everything is bold, nothing is bold. Reserve `800+` for CTAs and primary headings only.
- **The `h1` hero sizing is oversized on desktop.** `clamp(44px, 7vw, 92px)` with `line-height: 0.96` creates extremely tight leading that can cause ascenders/descenders to collide on longer words, especially in the marketplace hero variant where the title is dark text on a light background (no text-shadow safety net).
- **Small text sizes are inconsistent.** Body text ranges from `12px` to `18px` across the theme with no clear scale system. There appear to be at least 7 distinct text sizes below `16px`, which fragments the rhythm.
- **No uppercase/text-transform discipline.** The eyebrow uses uppercase + `letter-spacing: 0`, which looks cramped. Footer headings use uppercase with tight spacing. Category nav buttons use uppercase. This scattered use of uppercase feels like a crutch for weak hierarchy rather than a deliberate design choice.

**Recommendation:** Introduce a typographic scale (e.g., 12/14/16/20/26/34/42/56px). Reserve uppercase for one element type only (eyebrows or footer labels). Consider adding a serif or rounded display font for H1/H2 to contrast with the utilitarian sans-serif body.

---

## 3. Layout & Spacing - Generous but Inconsistent

### What works
- Max-width containers (`1780px`, `1720px`, `1420px`) are sensible for large screens.
- Section padding uses `clamp()` for fluid responsiveness - good modern CSS.
- The sticky header offset variable synced via JS is a nice touch.

### What needs improvement
- **Too many max-width values.** There are at least 4 different max-widths (1780, 1720, 1420, 1020, 980, 860, 760, 720, 680, 650, 620...) across the theme. This creates a "wandering margin" effect where different sections feel disconnected. Pick 2-3 widths and stick to them: one for full-bleed content (1780), one for reading copy (720), and one for narrow panels (560).
- **Vertical rhythm is not systematized.** Section padding ranges from `clamp(28px, 5vw, 58px)` to `clamp(48px, 7vw, 92px)` to `clamp(48px, 7vw, 86px)` to hardcoded values. There is no base unit or grid. The result is that some sections feel cramped while others feel too airy in an unpredictable way.
- **The category showcase blocks have no max-width container.** They stretch edge-to-edge within `1720px`, but the `.category-shell` margin auto only constrains the outer wrapper. Inside, `.category-block` has no inner max-width, so on ultrawide monitors the product grids stretch uncomfortably wide.
- **Footer 3-column grid is unbalanced.** `.footer-shell` uses `0.95fr / 1.35fr / 0.8fr` which gives the middle nav column disproportionate width. The newsletter form (right column) feels cramped while the nav center column has too much whitespace between its 3 sub-columns.

**Recommendation:** Establish a spacing system (e.g., 8px base, increments of 8/16/24/32/48/64/96). Reduce max-width tokens to 3 values. Give category blocks a sensible inner padding or max-width.

---

## 4. Visual Hierarchy - Weak on the Homepage

### What works
- The PDP (product detail page) has a strong hierarchy: gallery → summary → buybox is a proven pattern.
- The cart page layout (items left, summary right sticky) is clean and conventional.

### What needs improvement
- **The hero section is text-heavy and image-light.** The marketplace hero uses a CSS background image (`--hero-bg`) plus a background spacer div, but the actual product visual is minimal. On first load, a user sees large dark text and two buttons, but no product imagery above the fold. For a pet-care store, emotional product photography is critical.
- **The trust bar is visually weak.** It sits between the hero and the content with a thin top/bottom border and a subtle gradient, but it does not read as a distinct trust signal. The marquee animation is subtle, which is fine, but the cards inside look like plain white boxes with small text. They do not command attention.
- **Category showcase headings are small relative to the section padding.** `clamp(24px, 2.6vw, 36px)` for collection titles inside a block with `clamp(24px, 3.4vw, 40px)` padding means the heading gets visually swallowed by its own container.
- **The routine builder (landing section) gets lost.** It has the same background as the FAQ section (`--surface`), so the transition between them is invisible. The section heading is only marginally larger than the FAQ heading, making it feel like a continuation rather than a distinct value proposition.
- **Conversion stack (dark section) breaks the warm flow.** After the warm cream hero and trust bar, the sudden `#101820` dark section is a tonal whiplash. The testimonials inside it use the same card structure as the light sections but inverted, which is not enough to make them feel special.

**Recommendation:** Make the hero more visual - consider a split layout with a strong product image on the right. Give the trust bar more visual weight (darker border, icon size increase, or a subtle background tint). Vary section backgrounds more deliberately: alternate between warm cream, pure white, and one accent-tinted surface.

---

## 5. Component Design - Polished but Repetitive

### What works
- Cards (`.product-card`, `.commerce-card`) have consistent hover states (`translateY(-3px)`, shadow lift, border color shift).
- Buttons have clear primary/secondary hierarchy.
- The cart drawer is well-structured with a clear panel, overlay, and focus management.
- The contact modal has a clean dialog shape with rounded corners (`18px`) and a soft shadow.

### What needs improvement
- **All cards use the exact same radius, shadow, and border treatment.** `.product-card`, `.commerce-card`, `.cart-item`, `.cart-summary-card`, `.search-offer`, `.routine-paths a`, `.faq-list details`, `.support-card`, `.pdp-info-grid article`, `.review-bars`, `.quote-card` - all share `border-radius: 8px`, a `1px solid` border, and a subtle shadow. This creates a "samey" visual landscape where nothing stands out. The user cannot tell at a glance what is interactive vs. decorative vs. informational.
- **The quantity control is the only element with `overflow: hidden` + squared internal buttons.** This creates an awkward "pill with square buttons inside" shape. The `-` and `+` buttons have `border-radius: 0` inside a rounded container. It looks like a design oversight.
- **Badges are all the same green pill.** The product media badge, commerce media badge, and stock dot all use near-identical styling: rounded pill, green background or text, `font-size: 12px`. Consider different badge styles for different meanings (e.g., outline for "in stock", filled for "sale", dot-only for "new").
- **The "Show more" button uses a `+` symbol in a circle.** This is fine, but the styling (`background: var(--ink)`, white text) makes it look like a primary CTA rather than a secondary toggle. It competes with "Add to cart" buttons visually.
- **Share button is oddly prominent on PDP.** It sits directly under the product title, above the price, and uses a full pill shape with an icon. On most e-commerce sites, share is a small icon tucked near the title or in a utility row. Its current placement and size draw disproportionate attention.

**Recommendation:** Create 3 distinct card families: (1) product cards (shadow + hover lift), (2) info cards (flat, no shadow, subtle border), (3) feature cards (filled background, no border). Redesign the quantity stepper to be a cohesive pill or fully squared. Move the share button to a more subdued utility position.

---

## 6. Mobile Design - Functional but Compressed

### What works
- Breakpoints at `900px` and `620px` are sensible.
- The sticky mobile ATC bar is a good pattern.
- Header collapses gracefully: search drops below brand, actions compress.

### What needs improvement
- **The announcement bar becomes horizontally scrollable on mobile.** The 3-column grid collapses to a scrollable track, but the borders between items and the tight padding make it feel like a bug rather than an intentional carousel. Users may not realize it scrolls.
- **Mobile hero heading is huge.** `clamp(48px, 15vw, 62px)` with `line-height: 0.92` on narrow screens means the heading can take up 3-4 lines and push everything else below the fold.
- **Product grid collapses to 2 columns on tablet but 1 column is missing on small mobile.** At `620px`, `.product-grid` goes to `1fr` (single column) but `.commerce-grid` stays at `repeat(2, 1fr)` with `gap: 12px`. Commerce cards at 50% width on a 375px phone are extremely narrow - roughly 170px per card with padding. Product titles in `-webkit-line-clamp: 2` become almost illegible at that width.
- **The PDP on mobile stacks to a single column but keeps the sticky buybox logic hidden.** The `.mobile-sticky-atc` appears, but it shows "Choose options" as a button linking to `#ProductQuantity` - which is a confusing affordance if the user is already on the PDP. It should say "Add to cart" or reflect the actual variant state.
- **Cart drawer on mobile is full-width but the overlay is very dark (`rgba(16,24,32,0.5)`).** On a phone, the drawer + dark overlay can feel oppressive. Consider a lighter overlay or a bottom-sheet pattern instead of a side drawer on narrow screens.

**Recommendation:** Make the announcement bar a true single-row swipeable carousel with snap points, or stack vertically. Reduce mobile hero heading size by ~20%. Force commerce grid to 1 column below `480px`. Consider a bottom-sheet cart for mobile.

---

## 7. Micro-Interactions & Motion - Sparse but Acceptable

### What works
- Card hover lifts (`translateY`, shadow, border-color`) feel smooth.
- The trust marquee animation is gentle.
- Focus-visible styles are present (orange outline) - good for accessibility.

### What needs improvement
- **No page transition or loading states.** AJAX cart updates happen silently. While functional, a brief skeleton or shimmer on the drawer re-render would make the app feel more responsive.
- **The "Quick add" button feedback is abrupt.** It instantly swaps text to "Added to demo cart" and back after 1.6s. No fade, no color change, no checkmark icon. This feels like a 2010-era interaction.
- **No skeleton screens for images.** Product images in grids load lazily with no placeholder color transition. The `background: linear-gradient(...)` on `.product-media` is a good start, but there is no progressive fade-in when the image actually loads.
- **Accordion animations are missing.** The FAQ `<details>` elements open/close instantly with no height animation. This is jarring in a modern theme.
- **Share button feedback is slow.** The 2.2s timeout before reverting the label feels too long. Most users will have already moved on.

**Recommendation:** Add `opacity` transitions to lazy-loaded images. Animate FAQ accordions with `grid-template-rows` or `max-height` transitions. Add a brief checkmark SVG morph to the quick-add button.

---

## 8. Photography & Imagery - The Biggest Gap

### What works
- The hero background image concept is there.
- Product thumbnails have sensible aspect ratios (`4/3` and `1/1`).

### What needs improvement
- **No photography direction in the CSS.** The theme relies entirely on uploaded product images. If the merchant uploads inconsistent image styles (lifestyle vs. packshot vs. transparent PNG), the grid will look messy. There is no CSS safeguard like `background-color` behind images or a consistent treatment.
- **Placeholder SVG (`product-shampoo-glide.svg`) is used everywhere.** This is fine for development, but in production it means out-of-stock or draft products show the same generic shampoo bottle. A more neutral geometric placeholder or a branded pattern would be better.
- **The product gallery on PDP uses `object-fit: contain` with a beige gradient background.** This is a good choice for variable image sizes, but the gradient (`#fbfaf7` to `#efeae2`) is visible around every image, making white-background product shots look like they have a beige vignette.
- **No lifestyle imagery on the homepage.** Beyond the hero background, there are no emotional lifestyle photos of pets, happy owners, or product-in-use scenes. For a pet brand, this is a massive missed opportunity.

**Recommendation:** Add a CSS image treatment class (subtle rounded corners, consistent shadow, optional border) to normalize uploaded photography. Replace the PDP gallery background with pure white or `--surface`, not a warm gradient. Consider adding a lifestyle image section to the homepage template.

---

## 9. Brand Identity & Emotional Design - Neutral, Not Warm

### What works
- The brand name "Active Paw" and the paw iconography are clear.
- The orange accent is energetic and pet-appropriate.

### What needs improvement
- **The design feels like a generic SaaS template, not a pet brand.** There are no organic shapes, no playful curves, no paw motifs beyond the logo, no warm hand-drawn elements. Every single component is a sharp-cornered rectangle (`border-radius: 8px`) with a 1px border. A pet brand should feel friendly and approachable - this feels clinical.
- **Copy tone is utilitarian, not emotional.** Headings like "Useful pet care finds, bundled for everyday routines" and "Shop by the routine, not by guessing single items" are informative but lack warmth. Compare to: "Happy paws start here" or "Everything your best friend needs."
- **No brand pattern or texture.** The surface is flat cream. There is no subtle dot pattern, paw-print watermark, or organic wave shape to break up the flat planes.
- **The footer is overly corporate.** Dark background, 3-column grid, newsletter form - it looks like a B2B software footer. A pet brand footer could use warmer typography, maybe a mascot illustration, or a "Made with love for pets" sign-off.

**Recommendation:** Introduce organic shapes or a subtle brand pattern. Consider slightly larger border radii (12-16px) for primary containers to soften the edges. Add a playful illustration or mascot to the footer or empty states.

---

## 10. Accessibility (Visual/Aesthetic) - Mostly Good, Some Gaps

### What works
- Skip link is present and styled.
- Focus-visible outlines are visible and on-brand (`rgba(240,90,40,0.42)`).
- Color contrast on primary text appears solid (dark on light).
- Reduced motion media query is respected.

### What needs improvement
- **The `.hero-marketplace` variant has dark text (`#101820`) on a variable background image.** If the uploaded hero image is light in the text area, contrast is fine - but if it is medium-toned or busy, the text could fail WCAG AA. There is no text-shadow or overlay gradient guaranteed to cover the text region.
- **The review panel (dark background) uses `color: rgba(255,255,255,0.74)` for paragraph text.** At `font-size: 13px` and `font-weight: 750`, this is borderline for WCAG AA contrast. The `0.74` alpha on white over `#101820` gives roughly a 4.2:1 ratio, which is at the threshold.
- **The `.category-showcase` background (`#b8792d`) with orange headings (`--accent`) fails contrast.** Orange on brown-gold is likely below WCAG AA for large text.
- **The trust bar gradient fade edges can obscure the first/last card text** if the card text happens to align with the fade zone. This is a minor issue but worth noting.

**Recommendation:** Add a guaranteed dark gradient overlay behind the marketplace hero text. Increase review panel paragraph alpha to `0.82+`. Fix the category showcase background or heading color.

---

## 11. PDP (Product Detail Page) - Strong Structure, Weak Personality

### What works
- The 3-column layout (gallery / summary / buybox) is excellent for desktop.
- Sticky buybox and sticky thumbs are user-friendly.
- The confidence list and delivery banner are well-placed.

### What needs improvement
- **The buybox is visually heavy but not delightful.** It is a white card with a border and shadow, which is the same treatment as every other card on the site. The most important CTA on the entire site ("Add to cart") should feel special - consider a filled accent background, a subtle glow, or a larger radius.
- **The bundle card is static and fake.** "Silk Coat Detangling Spray" with "Add GBP13.50" is hardcoded. Visually, it looks identical to the delivery card below it. If this is meant to be a cross-sell, it needs visual prominence (accent border, icon, or different background).
- **The "Everything buyers need" info grid is generic filler.** Four cards with numbers `01-04` and generic text ("Everyday use", "Easy care") do not add value. They look like Lorem Ipsum placeholders. Either populate them with real product data or remove them.
- **The review panel is visually disconnected.** It sits at the bottom of the PDP with a dark background, but the meter bars (`<meter>`) are unstyled browser defaults, which look primitive against the polished UI.

**Recommendation:** Style the buybox as a premium feature - accent tint top border, larger shadow, or subtle background pattern. Redesign the info grid to either be dynamic or removed. Style `<meter>` elements or replace them with custom CSS bars.

---

## 12. Cart & Checkout Flow - Clean but Unremarkable

### What works
- Cart drawer is well-structured.
- Quantity stepper inside the drawer is a nice touch.
- Sticky summary on desktop is convenient.

### What needs improvement
- **The cart drawer empty state is generic.** "Your cart is empty" with a "Shop all products" button. No illustration, no suggested products, no playful copy. For a pet brand: "Your basket is feeling lonely - let's find something for your furry friend."
- **The cart item cards are plain.** White box, border, small image. There is no visual delight in reviewing your selections.
- **The mobile sticky ATC bar is purely functional.** It shows the title and price in small text with a small button. No urgency messaging, no stock indicator, no "Free shipping over GBP150" nudge.

**Recommendation:** Add a small illustration or icon to the empty cart drawer. Add a progress bar toward free shipping in the drawer footer ("Add GBP{remaining} more for free shipping").

---

## Appendix: Mobile Validation (Live Screenshots)

*Screenshots captured on 2026-06-08 from the live store at `activepaw.co.uk` using iPhone 14 Pro (393×852) and iPad (768×1024) emulation.*

### Confirmed findings

#### 1. Category showcase brown-gold is worse on mobile than desktop
- **Screenshot:** `tablet-homepage-categories.png`
- The `#b8792d` background behind orange "Pet Cleaning" headings creates genuinely poor contrast. On the tablet screenshot the heading is hard to read against the warm brown. On mobile the same issue persists but the narrower viewport makes it even more cramped.

#### 2. Commerce grid at 2 columns is cramped on mobile
- **Screenshot:** `mobile-homepage-categories.png`, `mobile-homepage-footer.png`
- Product titles truncate aggressively: "800ml Dogs Water Bottle Portable Hig..." and "Pet Dog Water Bottl Feeder Bowl Portab...". At ~170px per card, the 2-line clamp leaves barely any readable text. The hardcoded benefit text ("Ad-ready product page...") is visible and looks like filler.
- **New finding:** Product images have wildly inconsistent backgrounds (white studio shots vs. transparent PNGs vs. colored scenes) which makes the 2-column grid look messy and uncurated.

#### 3. Hero heading is oversized on mobile
- **Screenshot:** `mobile-homepage-hero.png`
- "Smart Pet Finds for Grooming, Play & Walks" dominates the entire first viewport. The dog photo is partially visible behind the text. While the specific photo used has enough light area for the dark text to be readable, this is a accident of the current image - a different hero photo could cause a serious contrast failure.
- **New finding:** The hero is actually more image-rich than the static code review suggested (there is a golden retriever background), but the text overlay still obscures the emotional imagery.

#### 4. PDP issues visible on mobile
- **Screenshot:** `mobile-pdp.png`, `mobile-pdp-buybox.png`
- **Stock dot color bug confirmed:** The "Low stock" label uses a green dot (`var(--green)`), which sends a mixed signal. Low stock should use orange or red.
- **Share button prominence confirmed:** The pill-shaped "Share" button sits directly under the title and is almost as visually heavy as the Add to Cart button. It competes for attention.
- **Mobile sticky ATC confusion confirmed:** The sticky bar at the bottom shows "Choose options" even though the user is already on the PDP and the main buybox shows "Add to cart". This is redundant and confusing.
- **Quantity stepper is actually acceptable on mobile:** The rounded pill shape in the cart drawer looks better than the squared-off CSS suggested. However, the PDP quantity stepper (in the buybox) still shows squared buttons inside a rounded container.

#### 5. Cart drawer empty state is generic
- **Screenshot:** `mobile-cart-drawer-empty.png`
- Pure white panel with "Your cart is empty", small text, and an orange "Shop all products" button. No illustration, no suggested products, no playful pet-brand copy. The full-width drawer on mobile makes the emptiness feel even more stark.

#### 6. Populated cart drawer is functional but plain
- **Screenshot:** `mobile-cart-drawer-populated.png`
- The item layout is clean: image, title, variant, quantity stepper, price, remove link. But there is no free-shipping progress bar ("Add £140.82 more for free shipping"), which is a missed conversion opportunity.
- The quantity stepper in the drawer uses a rounded pill shape that actually looks cohesive, unlike the PDP stepper.

#### 7. Tablet (768px) layout is the best-looking breakpoint
- **Screenshot:** `tablet-homepage.png`
- The hero image, announcement bar, and header all look balanced at this width. The 2-column product grid has enough room for readable titles. The search bar dropping to its own row works well.
- **New issue at tablet:** The announcement bar text is tiny at this width. "UK mainland over GBP150" and "Simple returns before checkout" are compressed into narrow columns with wrapping that breaks the readability.

#### 8. Footer on mobile is dense and corporate
- **Screenshot:** `mobile-homepage-conversion-footer.png`
- The dark footer with stacked SHOP / HELP / ROUTINES columns creates a wall of text. The trust pills are small and cramped. The newsletter input and subscribe button are functional but not inviting.

### New mobile-specific issues discovered during screenshot review

1. **Product image inconsistency is glaring in grids.** Some products have white backgrounds, some have transparent PNGs showing the page background, some have lifestyle photos with colored backdrops. The CSS does not normalize this, so the grid looks like a marketplace scraper rather than a curated brand store.

2. **The "Ad-ready product page..." benefit text is visible and embarrassing.** It appears under every product title in the commerce grid. On mobile it is fully visible because the 2-line clamp on the title leaves room for the description. This text is a development placeholder that made it to production.

3. **Payment icons on PDP are overwhelming on mobile.** Amex, Apple Pay, Diners, Discover, G Pay, Klarna, Maestro, Mastercard, PayPal, Shop Pay, UnionPay, Visa - 12 tiny icons in a wrapping row. On a 393px screen this creates a crowded, anxious feeling right next to the "Add to cart" button.

4. **The trust bar marquee is invisible on mobile.** The gradient fade edges cover a significant portion of the narrow viewport, and the cards are so narrow that the marquee effect is lost. It just looks like a row of small white pills.

---

## Summary: Priority Matrix

| Priority | Issue | Effort |
|---|---|---|
| **High** | Category showcase brown background clashes with palette | Low |
| **High** | All cards look identical - no component differentiation | Medium |
| **High** | Hero is text-heavy, lacks emotional product imagery | Medium |
| **High** | PDP buybox CTA needs visual prominence | Low |
| **High** | Mobile commerce grid too narrow at 2 columns | Low |
| **High** | Remove/replace "Ad-ready product page..." placeholder text | Low |
| **Medium** | Typography is monotonous (one font, overuse of bold) | Medium |
| **Medium** | Spacing system is inconsistent across sections | Medium |
| **Medium** | No organic shapes or brand personality beyond rectangles | Medium |
| **Medium** | PDP payment icon row is overwhelming on mobile | Low |
| **Medium** | Cart drawer empty state is generic | Low |
| **Low** | FAQ accordions have no animation | Low |
| **Low** | Share button placement is overly prominent | Low |
| **Low** | Stock dot uses green for "Low stock" (should be orange/red) | Low |

---

## Overall Verdict

The Active Paw theme is **technically solid and commercially functional** - it has all the right e-commerce patterns, responsive behavior, and accessibility basics. However, from an **aesthetic and emotional design** perspective, it currently reads as a well-built but generic Shopify theme. It lacks the warmth, playfulness, and visual distinctiveness that a pet-care brand needs to stand out. The biggest wins would come from:

1. **Softening the visual language** (more organic shapes, varied card treatments, a secondary typeface).
2. **Fixing the color harmony** (remove the brown-gold category section, align dark sections with the warm palette).
3. **Adding emotional imagery** (lifestyle photos, brand illustrations, better empty states).
4. **Differentiating the components** so users can instantly recognize products, info, and CTAs by shape alone.

The foundation is strong. The polish and personality are what is missing.

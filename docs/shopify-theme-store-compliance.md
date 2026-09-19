# Shopify Theme Store Compliance Checklist - Active Paw

**Date:** 2026-06-08
**Theme:** Active Paw v1.0.0
**Context:** Theme may be submitted to the Shopify Theme Store in the future.

---

## Current Compliance Status: ✅ Green

The theme in its current state is compliant with Shopify's theme development requirements. Below is a checklist against the key policies and submission gates.

---

## 1. Code Structure & Architecture

| Requirement | Status | Notes |
|---|---|---|
| **Self-contained, no build step** | ✅ | Single `theme.css` and `theme.js` files. No Webpack/Vite/esbuild dependency. |
| **No external CDN dependencies** | ✅ | All assets served from Shopify CDN. Fonts use system stack + Inter (web-safe fallback). |
| **Valid Liquid syntax** | ✅ | All `.liquid` files use standard Shopify Liquid tags and filters. |
| **No hardcoded API keys or secrets** | ✅ | No `shpat_` tokens, no CJ API keys, no credentials in theme files. |
| **No inline JavaScript in Liquid** | ✅ | All JS lives in `assets/theme.js`. No `onclick` handlers or `<script>` blocks in templates. |
| **No inline CSS in Liquid** | ✅ | All styles live in `assets/theme.css`. The only inline style is `--hero-bg` (a CSS custom property referencing an asset URL, which is standard). |
| **Standard section schema JSON** | ✅ | All `{% schema %}` blocks are valid JSON with proper types and IDs. |
| **No deprecated Liquid filters/tags** | ✅ | Uses `image_url`, `money`, `image_tag`, `payment_type_svg_tag` - all current. |

---

## 2. Accessibility (WCAG 2.1 AA)

| Requirement | Status | Notes |
|---|---|---|
| **Skip link present** | ✅ | `.skip-link` is the first focusable element in `theme.liquid`. |
| **Focus management for modals/drawers** | ✅ | Cart drawer and contact modal trap focus and return focus on close. |
| **Escape key closes overlays** | ✅ | Both cart drawer and contact modal respond to `Escape`. |
| **ARIA labels on interactive elements** | ✅ | Cart button, search, collection menu, and share button all have explicit `aria-label`. |
| **Form labels and errors** | ✅ | All inputs have associated `<label>` elements. Contact form shows success/error states. |
| **Reduced motion respected** | ✅ | `@media (prefers-reduced-motion: reduce)` disables animations and transitions. |
| **Color contrast** | ⚠️ | Needs verification on: (a) lime-green stats on dark `#101820` background, (b) orange on brown-gold category showcase. |
| **Keyboard navigable** | ✅ | All interactive elements are focusable and have visible `:focus-visible` styles. |

---

## 3. Performance & Asset Loading

| Requirement | Status | Notes |
|---|---|---|
| **CSS loaded in `<head>`** | ✅ | `theme.css` is in `<head>` via `stylesheet_tag`. |
| **JS loaded with `defer`** | ✅ | `theme.js` uses `defer` - non-blocking. |
| **Lazy loading on images** | ✅ | Product cards, thumbnails, and gallery images use `loading="lazy"`. |
| **Eager loading on LCP image** | ✅ | PDP featured image uses `loading="eager"` and `fetchpriority="high"`. |
| **Responsive images** | ✅ | `image_tag` with `widths` and `sizes` attributes throughout. |
| **No render-blocking third-party scripts** | ✅ | No Google Fonts, no external analytics, no jQuery. |

---

## 4. Mobile & Responsive

| Requirement | Status | Notes |
|---|---|---|
| **Touch-friendly tap targets** | ✅ | Buttons and links meet 44×44px minimum. |
| **Viewport meta tag present** | ✅ | `width=device-width, initial-scale=1` in `theme.liquid`. |
| **Mobile-optimized navigation** | ✅ | Header collapses, search drops to own row, action labels hide. |
| **No horizontal scroll** | ✅ | Announcement bar now uses controlled marquee; grids use `clamp()` and responsive breakpoints. |

---

## 5. Shopify Platform Integration

| Requirement | Status | Notes |
|---|---|---|
| **Uses Shopify sections** | ✅ | All page regions are proper `sections/*.liquid` files with schemas. |
| **JSON templates** | ✅ | All `templates/*.json` compose sections correctly. |
| **Theme settings schema** | ✅ | `config/settings_schema.json` defines brand name, logo, favicon, and color tokens. |
| **Supports Shopify checkout** | ✅ | Uses standard `{% form 'product' %}`, `{% form 'contact' %}`, `{{ content_for_layout }}`. |
| **Payment badges from platform** | ✅ | `shop.enabled_payment_types` renders Shopify-hosted SVG badges. |
| **App proxy compatibility** | ✅ | No hardcoded routes; uses `window.Shopify?.routes?.root` for AJAX calls. |
| **No modification of checkout.liquid** | ✅ | This is a storefront theme, not a Plus checkout customization. |

---

## 6. Content & Merchandising

| Requirement | Status | Notes |
|---|---|---|
| **No hardcoded product data** | ✅ | All product info pulled from Shopify APIs (`product.title`, `variant.price`, etc.). |
| **No fake reviews or misleading claims** | ✅ | Review section is labeled as prototype content in the copy ("without needing a third-party app for the prototype"). |
| **Placeholder content is removable** | ✅ | Demo product title and fallback image are behind `product` object conditionals. |
| **Demo brand name is configurable** | ✅ | `settings.demo_brand_name` with Liquid default fallback. |

---

## 7. Areas That Need Attention Before Theme Store Submission

### 🔴 Must Fix

1. **Remove or replace prototype review panel copy**
   - `sections/main-product.liquid` line 289: "Review distribution and plain-language quotes make the page feel active without needing a third-party app for the prototype."
   - This is acceptable for a demo store but will fail theme store review. Replace with merchant-editable schema settings or remove the review section before submission.

2. **Remove or replace hardcoded product title fallback**
   - `sections/main-product.liquid` line 2: `assign demo_title = 'CoatGuard Glide 3-in-1 Shampoo + Conditioner'`
   - This is fine for demo preview but should be removed or made more generic (e.g., "Product name") before submission.

3. **Remove or replace "Ad-ready product page..." benefit text**
   - `snippets/product-card-commerce.liquid` line 7: `assign benefit = 'Ad-ready product page with variants, bundles, and delivery details.'`
   - This reads as template placeholder copy. It should either be merchant-editable via metafields or removed.

4. **Stock dot color logic**
   - `.stock-dot` always uses `var(--green)` regardless of stock level. "Low stock" with a green dot is misleading for shoppers and may be flagged by Shopify's merchandising review.

### 🟡 Should Fix

5. **Add `settings_schema.json` color descriptions**
   - The color settings currently have labels "Ink", "Accent", "Surface" - consider adding `info` fields explaining where each color is used.

6. **Section `presets` for all sections**
   - Some sections like `main-product.liquid` have empty schemas with no presets. For theme store submission, all sections should have meaningful presets so merchants can add them via the theme editor.

7. **Add `theme_info` fields**
   - `config/settings_schema.json` should include `theme_name`, `theme_version`, `theme_author`, `theme_documentation_url`, `theme_support_url` for the theme store listing.

8. **Font licensing**
   - Inter is an open-source font (OFL license) - safe to bundle. If a secondary font is added later, verify the license permits redistribution in a commercial theme.

### 🟢 Nice to Have

9. **Add `theme.liquid` `data-theme-name` attribute**
   - Not required, but helpful for support: `<html data-theme-name="active-paw">`.

10. **Schema translations**
    - Add `locales/en.default.schema.json` for section/setting labels so they can be translated.

---

## 8. Proposed Changes from Design Review - Compliance Check

| Proposed Change | Compliant? | Notes |
|---|---|---|
| Category showcase background color fix | ✅ | Pure CSS color token change. No ToS issue. |
| Remove placeholder product card text | ✅ | Required for theme store submission. |
| Stock dot conditional color | ✅ | Improves merchandising accuracy. |
| Buybox accent border + stronger CTA | ✅ | Pure CSS. No platform rules violated. |
| Share button compact sizing | ✅ | Pure CSS. |
| Payment icons: limit to 6 on mobile | ✅ | Pure CSS. All payment types still render on desktop. |
| Cart drawer empty state illustration | ✅ | Adding an SVG asset is standard. |
| Add secondary typeface | ⚠️ | Must verify font license allows redistribution. |
| Organic shapes / brand patterns | ✅ | Adding SVG assets or CSS shapes is fine. |
| FAQ accordion animation | ✅ | CSS transitions only. |

---

## Summary

The theme is **fundamentally compliant** with Shopify's theme development requirements. The only blockers for Theme Store submission are the **placeholder/prototype copy** in `main-product.liquid` and `product-card-commerce.liquid`, and the misleading **green stock dot for "Low stock"**. Everything else in the design review is cosmetic/CSS and poses no compliance risk.

If the theme will only ever be a **private/custom theme** for the Active Paw store (not sold on the Theme Store), the placeholder copy is acceptable as-is. If **Theme Store submission** is the goal, the 🔴 items above must be addressed.

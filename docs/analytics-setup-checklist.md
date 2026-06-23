# Analytics & ROAS tracking - setup checklist

**Chosen stack:** official Shopify sales-channel apps with server-side **Conversions API (CAPI)**
+ **Enhanced Conversions** - best ROAS signal for the least ongoing maintenance, because the
tracking lives outside the theme (Shopify + the apps maintain it; nothing in `theme.js` to break
when sections change).

> **Do NOT** paste GA4/Meta pixel snippets into theme files or the checkout. It violates Shopify's
> checkout/script policy and is a Theme Store rejection risk. All tracking below is configured in
> **admin**, not in code.

## What the theme already does (done in code, 2026-06-06)
- Emits **Product**, **Organization**, **WebSite**, and **BreadcrumbList** JSON-LD via
  `snippets/meta-tags.liquid` → improves Google Shopping / PMax feed quality and rich results.
  - *Note:* Product schema intentionally has **no `aggregateRating`** - add it only once ratings
    come from a real review source (otherwise it's fabricated structured data and a Google penalty risk).
- Emits `og:title/type/url/description/site_name/locale` + `twitter:card/title/description`.
  Shopify auto-injects `og:image`, so the theme omits it to avoid duplicates.

## Admin steps

### 1. Google & YouTube channel (GA4 + Google Ads + Merchant Center)
- [ ] Shopify admin → **Settings → Apps and sales channels → Shopify App Store** → install **Google & YouTube**.
- [ ] Connect your Google account; link **Google Analytics 4**, **Google Ads**, and **Merchant Center**.
- [ ] Turn on **Enhanced Conversions** in Google Ads (hashed first-party data → better match rates).
- [ ] Confirm the **product feed** is syncing to Merchant Center (the JSON-LD above supports this).

### 2. Meta (Facebook & Instagram) channel (Pixel + CAPI)
- [ ] Install the **Facebook & Instagram** channel.
- [ ] Connect your Meta **Business account** + **Pixel/dataset**.
- [ ] Enable the **Conversions API** (server-side) - this is the part that recovers iOS/ad-blocker
      losses and is the main ROAS lever. Browser pixel + CAPI are auto-deduplicated by Meta.

### 3. (Optional foundation) GA4 via Customer Events
- [ ] If you want GA4 independent of the Google channel: admin → **Settings → Customer events →
      Add custom pixel**, paste the GA4 base tag, and subscribe to standard events
      (`product_viewed`, `product_added_to_cart`, `checkout_started`, `checkout_completed`).
      The Google channel (step 1) usually makes this unnecessary.

### 4. Fix the social sharing image (rebrand leak)
- [ ] Admin → **Online Store → Preferences → Social sharing image**. It currently resolves to
      `pawmerce-share.png`. Upload the **Active Paw** share image so link previews aren't Pawmerce-branded.
      (This is the source of the auto-injected `og:image`.)

## Verify (after setup)
- [ ] **Meta Events Manager → Test Events** - see `Purchase`, `InitiateCheckout`, `AddToCart` fire,
      with both *browser* and *server* sources deduplicated.
- [ ] **GA4 → DebugView** (or Google Tag Assistant) - confirm `view_item`, `add_to_cart`,
      `begin_checkout`, `purchase`.
- [ ] **Shopify admin → Settings → Customer events** - confirm the app pixels are listed/active.
- [ ] **Google Rich Results Test** + **Schema Markup Validator** on a live product URL - confirm the
      Product / Breadcrumb JSON-LD parses with no errors.
- [ ] **Merchant Center → Diagnostics** - product feed has no disapprovals.

## Maintenance note
Because steps 1–2 are app-managed, ongoing upkeep is near-zero: the apps handle pixel/CAPI updates.
The only theme-side tracking surface is the JSON-LD in `snippets/meta-tags.liquid` - re-run
`shopify theme check` and Google's Rich Results Test if you edit product data or that snippet.

# Theme to worker contract

What the Active Paw theme takes from the PawScout worker, how, and what happens when the worker is not there. Everything below was measured on 2026-09-19 (channel round 230) unless marked *planned*. Change either side only through the owner (section 6; before 2026-10-04 this went through the shared agent channel), and update this file in the same pull request.

## 1. Rules

Set by the owner on 2026-09-18 (channel round 227):

1. **Every live call is optional.** A page must be complete with the worker unreachable: no empty region, no open dialog, no layout shift, no error from theme code.
2. **Shopify-held data carries its own freshness.** The theme trusts worker-written metafields only while `supplier.last_checked_at` is within 3 days (decision 5b, implemented 2026-09-19 in `snippets/supplier-availability.liquid`). The worker does not advance the stamp on a failed check (round 245), so age alone shows a failure. Stale data renders the conservative default: no status, no delivery window, no "Availability updated" line. Tracked Shopify inventory is never subject to this rule.
3. **The worker assumes no theme.** Nothing the worker serves depends on the theme being present.
4. **No shared secrets or code.** The theme holds no token; the browser calls the worker only on public routes and through the Shopify app proxy.

The independence run (`node tests/independence.cjs`, blocked mode) is the acceptance test for rule 1. It aborts every request to the worker domain and to `/apps/` at the network layer and walks home, collection, product, search, blog, article, contact, affiliate, cart and checkout, then the home page and one collection page as a visitor in a sparse market (US unless `SPARSE_MARKET` says otherwise). Results: `output/playwright/independence-<mode>.json`.

## 2. Live calls from the browser

| # | Theme location | Endpoint | Fires | On failure or timeout |
|---|---|---|---|---|
| 1 | `layout/theme.liquid` `body[data-storewide-event-src]`; `assets/theme.js` `loadStorewideEvent()` | `GET https://pawscout.activepaw.co.uk/public/event` | once per page view, every template, one memoised fetch shared by the hero seal, the announcement bar line, the welcome offer, the home collection card pills and the install pill. The worker answers with `Cache-Control: public, max-age=120` (measured 2026-11-14), so a browser may reuse an answer for two minutes | 3 s abort; a non-2xx, non-object or aborted response resolves to null. "Running" means `active:true` with a non-empty `code` and an `endsAt` that has not passed. The hero seal is rendered hidden with no copy of its own and shows only a running event or the next planned one, so it stays hidden while the feed is unreachable (PRD T28, 2026-11-14). The bar line shows only for a running event, and only while the announcement bar's "Show the running storewide event" setting is on (the off switch during an event, no deploy needed). The pill on each home collection card reads "<pctOff>% off with code" only for a running event with a `pctOff`, and only while that same setting renders the bar line; with no answer, or no `pctOff`, it keeps its block's own badge or none (PRD T39, 2026-11-15). The welcome offer opens only for a running event and only once Shopify's cookie banner is not waiting for an answer, for every customer except a signed-in one whose orders already used the event's code (PRD T29); it fails closed when Shopify's consent API cannot be read within 2 s. The install pill waits for both verdicts, then 4.5 s. Every surface stops stating the offer when `endsAt` passes on an open page (2026-11-14, PRD phase 5) |
| 2 | `assets/pawscout.js` `initSearchBackfill` | `GET /apps/pawscout/search` | search page, when `[data-pawscout-search]` exists and native results are fewer than 4 | promise catch; nothing appended |
| 3 | `assets/pawscout.js` `openPreview`, `renderPreview` | `GET /apps/pawscout/product`, `GET /apps/pawscout/import-status` | only after a ghost card click | modal shows "This product is no longer available. Please try another match."; import-status polls 20 times at 1.5 s then "Taking longer than usual" |
| 4 | `assets/pawscout.js` `sendEvent`; hook in `sections/main-product.liquid` (`meta[name=pawscout-pid]` from a `cj-pid-*` tag) | `POST /apps/pawscout/event` via `navigator.sendBeacon`, fetch keepalive fallback | product pages of imported products: `view` on load, `atc` on a cart add | wrapped in try; invisible |
| 5 | `assets/pawscout.js` `fetchAddonProducts`; slots `[data-pawscout-pdp-addons]` in `sections/main-product.liquid` and `[data-pawscout-cart-addons]` in `snippets/cart-drawer-contents.liquid` | `GET /apps/pawscout/addons`, then Shopify `/products/{handle}.js` | product page load; cart drawer open | promise catch returns an empty list; slots stay hidden or empty |
| 6 | `sections/affiliate-apply.liquid` on `/pages/affiliates` (footer links there); `assets/theme.js` shows the button | link to `/apps/pawscout/affiliate/apply` (worker-rendered through the app proxy) | Apply button on the affiliates page, shown only after the `/public/event` fetch resolved non-null | button stays hidden; the page, its copy and the email route (sales@activepaw.co.uk) stand on their own (T10, 2026-09-19) |

One worker URL in the theme (`layout/theme.liquid`), one proxy prefix (`assets/pawscout.js`). Everything else the theme fetches or navigates to is Shopify's own:
- `/cart/add.js`, `/cart.js`, `/cart/change.js`, `?sections=cart-drawer` and `/contact`.
- `/discount/<code>?redirect=<path>`, followed as a navigation by every link that offers an event's code. It applies the code and keeps the redirect's query string (measured 2026-11-14).
- Shopify's Customer Privacy API, loaded through `Shopify.loadFeatures` (`consent-tracking-api` 0.2) only when the welcome offer or the install pill might open.

## 3. Payload fields the theme reads

- `/public/event` (since 2026-11-14, PRD phase 5).
  - **Fields read:** `active`, `name`, `code`, `pctOff`, `endsAt`, `headline`, `subline`, `chips`, and `next{name,startsAt,endsAt}`.
  - **No longer read:** `endsLabel` and `startsLabel`. Every date and time a visitor reads is built from `endsAt` and `startsAt` in the visitor's own time zone, because the code stops at 23:59:59 UTC, which is 18:59 in New York.
  - **Field checks, one field at a time.** A field that fails is dropped on its own; one bad field never removes a whole surface.
    - Text fields must be non-empty strings.
    - Timestamps must be ISO 8601 strings `Date.parse` can read.
    - `chips` must be an array of strings; at most 6 are shown.
  - **What keeps the visitor-facing claims true.** These are the worker's obligations. Each is checked against the Shopify discount where it was read.
    1. **The word "everything."** The bar line and the offer say "<pct>% off everything", so an event is reported running only for a discount on all items with no minimum. The same condition carries "<pct>% off with code" on every home collection card (PRD T39). Owner decision, 2026-11-14: keep the word. `BLACKFRIDAY`, read through the Admin API on 2026-11-14, applies to all items with no minimum, to all buyers, once per customer. The store sells no gift cards: 0 of its 318 products, by `productsCount(query: "gift_card:true")`, with `gift_card:false` returning all 318 as the control. A gift card added to the catalogue would need checking against this word before it is published. "Once per customer" is a condition of the discount that no surface states.
    2. **`pctOff`** equals the discount's percentage (15 for `BLACKFRIDAY`). It is compared with the live feed at the event's start (PRD T35).
    3. **`endsAt`** equals the discount's end. The live feed's `next.endsAt`, 2026-11-30T23:59:59.000Z, equalled `BLACKFRIDAY`'s `endsAt` on 2026-11-14. A running payload without `endsAt` shows no end time, and the theme cannot hide it when the event ends.
    4. **`code`** is the discount code itself: the theme sends it through `/discount/<code>`.
    5. **`name`, `headline`, `subline` and `chips` are shown word for word.**
       - Where shown: the name on the bar and the seal, the headline and subline in the offer, and the chips as search shortcuts in the offer.
       - The theme cannot check them. They are the worker's own claims about the discount and must hold for it; for example, a headline may not promise more than `pctOff` or a scope narrower than the discount's.
       - On 2026-11-14 the live feed sent `active: false` and `next{key, name, startsAt, endsAt, startsLabel, endsLabel}` only. No running payload, headline, subline or chips had been seen yet (PRD T35 reads the first one).
    6. **Open to all buyers.** Since PRD T29 (owner decision 2026-11-14), the offer is shown to customers who have ordered before as well as to new ones, so an event is reported running only for a discount any buyer can use, never a first-order-only one.
       - `BLACKFRIDAY` is open to all buyers, once per customer (Admin API, 2026-11-14).
       - The theme withholds the offer from a signed-in customer whose orders already used the code. It reads Liquid's `order.discount_applications` of type `discount_code`. That their `title` is the code is inferred from Shopify's docs (the older `discount` object gives the same value for `code` and `title`) and has not been seen on an order: `ordersCount` read 0 through the Admin API on 2026-11-14.
       - A guest who used the code on another browser can still be offered it, because checkout knows a guest only by email.
  - **Markets.** The feed is the same for every market. `DiscountCodeBasic` has no market field (schema read 2026-11-14), so the code applying in every market is inferred from the schema and has not been seen at a checkout.
- `/apps/pawscout/search`: `ok`, `products[{pid,title,image,price,url,currency?,delivery{overseas,days}}]`.
- `/apps/pawscout/product`: `ok`, `product{pid,title,images,priceFrom,variants[{name}],descriptionText,url,currency?,delivery{overseas,days}|null}`.
- **Overseas items (rounds 288 and 290, owner rule 2026-09-30: an item stocked only overseas is still offered, and the customer is told):** the theme sends `overseas=1` on `/search` and on the ghost click's `/product`, because it shows the note. On a card or preview whose `delivery.overseas` is `true` it prints "Ships from overseas · estimated N days to your door", N being `delivery.days` (the worker's door-to-door band, the product page's formula), and drops the figure when it is not a plain range or number. On a preview the note replaces the market's supplier line (`data-ship-note`), so the preview never states two times; a `null` preview `delivery` after an overseas card (the worker could not confirm the route) prints "Ships from overseas" with no figure. Local cards (`overseas: false`) carry no note. No country or supplier is named. The worker ignores `overseas=1` until its `OVERSEAS_STOREFRONT` switch is on, which it turns on with the owner's go once this theme release is live.
- **Prices (round 257, owner ruling 2026-09-21):** every price the worker returns is GBP; `country` on `/search` only picks which supplier warehouses count as local and never converts. `currency` is an OPTIONAL ISO 4217 code the worker has proposed and not built; the theme treats absent as `GBP`. `assets/pawscout.js` prints a worker price as the storefront prints money when `currency` is the visitor's currency (`Shopify.currency.active`), and otherwise as the code in words, for example "GBP 12.99". The theme never converts: Shopify applies the market's rounding to the product page, which the browser cannot reproduce. Prices from Shopify's own `/products/{handle}.js` (add-on cards) are already in the visitor's currency and are printed from `data-money-sample` on `<body>`.
- `/apps/pawscout/import-status`: `ok`, `state`, `url`.
- `/apps/pawscout/addons`: `ok`, `addons[handle]`.
- `/apps/pawscout/event` request body: `{pid,event}`.

A field the worker stops sending must be treated by the theme as absent, never as an error. A field the theme starts or stops reading is announced to the worker before the theme change merges; since 2026-10-04 that goes through the owner (see section 6).

## 4. Worker-written Shopify data the theme reads natively

Namespace `supplier`. The spec (`docs/shopify-supplier-metafields.md`) follows the writer since 2026-09-20: one writer, eight keys, always on the PRODUCT, three status values (pawscout-agent, round 245, from the worker's code). Measured by the theme agent on 2026-09-20 through the Admin API on all 41 active products: exactly those eight keys at product level, no variant metafields at all, every variant Shopify-tracked with policy deny. So the banner and the cap come from Shopify inventory, and `supplier.status` would label a variant only if someone switched its tracking off.

| Key | Theme use | When absent or stale |
|---|---|---|
| `supplier.status` | `snippets/supplier-availability.liquid`, only while fresh and only when Shopify does not track the variant: `available` "In stock"; `low_stock` "Low stock" plus urgency; `out_of_stock` "Currently unavailable"; anything else "Ready to order" | "Ready to ship" |
| `supplier.available_qty` | not read: one product-wide figure cannot cap a variant, and for `out_of_stock` it keeps the supplier's real figure (the status is the signal, round 245) | |
| `supplier.last_checked_at` | gates every other supplier field (3 days); "Availability updated <date>" on the product page and cart page only while fresh | everything supplier-derived is ignored |
| `supplier.demand` | "Selling fast" badge on `selling_fast` | nothing |
| `supplier.delivery_days_actual`, `supplier.delivery_days` | while fresh: delivery range on the product page (`snippets/delivery-info.liquid`) and a hidden line-item property "Estimated delivery: N days", both from `delivery_days_actual` (the product's own channel) where present, else `delivery_days` (the origin's); owner ruling 2026-09-22 | 6 to 14 days, or 3 to 10 when `supplier.origin` is GB; no line-item property |
| `supplier.origin` | picks that static band | 6 to 14 days |
| `supplier.name` | switches the "Tracked delivery" copy only; never rendered to the customer (the "Fulfilled by <name>" row in Product details was removed 2026-09-19, PRD T9, and the independence run asserts its absence) | "Care add-ons" copy |
| `article.metafields.blog.faq_json`, `blog.related_products` | `sections/main-article.liquid`: FAQ with schema, "Shop this guide" | sections omitted |

Never written by the worker and, since 2026-09-20, never read by the theme: `max_order_qty`, `sku`, `warehouse`, `cj_product_id`, `cj_variant_id`, `fulfillment_confidence`, variant-level `supplier.*`, and the status values `in_stock`, `supplier_available`, `backorder_possible`, `unavailable`, `unknown_stale`.

Products, collections, discounts, redirects and markets are read natively; nothing in the theme knows they came from the worker except the `cj-pid-*` tag.

### Markets

The worker owns per-market publication (round 245, section 5): it removes a product from the Australia, European Union and United States and Canada catalogues unless the product can be delivered there, nightly and every 15 minutes, so those markets are sparse by design and the owner keeps them open. The theme never publishes to a market. It reads the market natively: `collection.products`, `products_count`, `all_products_count` and `paginate.items` are all scoped to the visitor's market (measured on a preview for GB, US, AU and DE on 2026-09-20; Pet Toys reads 11 for GB and 0 for the others on every one of them). What the theme does with a sparse market (PRD T19): a home collection block with no products for the visitor is left out whole, an empty collection page says so and offers the products that are available, the header and footer collection lists already skip empty collections, and the related products heading appears only above at least one card. The independence run asserts the first two in a sparse market on every run. **How a visitor reaches a market (2026-09-20):** the store has no market web presences, so the market follows Shopify's `localization` cookie and never the visitor's address; the footer's country selector (`snippets/country-selector.liquid`, Shopify's localization form over `localization.available_countries`) is the one way a visitor changes it, and the announcement bar's delivery title links to it. Every delivery sentence that depends on the market comes from `snippets/delivery-promise.liquid`; only a GB visitor is told about UK delivery, and the ghost preview note follows the same rule through `data-ship-note` on the search host. The worker already receives the visitor's country on `/apps/pawscout/search` (`country`), and that value now changes when the visitor uses the selector. The independence run switches country end to end on every run and fails if a theme sentence outside the GB market is about UK delivery; a collection description is store content and is reported, not failed.

## 5. Open questions on the channel

None. Round 245 answered the three that stood here: the worker never writes `unknown_stale` and does not advance `last_checked_at` on a failed check; nothing drives `fulfillment_confidence`, which is not written; the affiliate form's `%c%d font-size:0;color:transparent NaN` console lines are Cloudflare Turnstile's (confirmed 2026-09-20: every such line is logged from `challenges.cloudflare.com`), and the independence run classifies them by that source.

## 6. Changing this contract

1. Give the owner the proposed change with the field, the fallback and the date it takes effect; the owner relays it to the worker. (Until 2026-10-04 this was posted on the shared agent channel. The operator rule of that date limits the channel to bug reports and improvement suggestions addressed to a tool, so contract changes go through the owner.)
2. Theme side: change the code, run the independence script in blocked and control modes against a preview theme, update this file, open the pull request.
3. Worker side: keep the old field or route alive until the theme pull request that stops using it has deployed (`shopify-deploy` merge with a `release-` tag).

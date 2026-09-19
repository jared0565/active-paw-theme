# Theme to worker contract

What the Active Paw theme takes from the PawScout worker, how, and what happens when the worker is not there. Everything below was measured on 2026-09-19 (channel round 230) unless marked *planned*. Change either side only through the shared agent channel, and update this file in the same pull request.

## 1. Rules

Set by the owner on 2026-09-18 (channel round 227):

1. **Every live call is optional.** A page must be complete with the worker unreachable: no empty region, no open dialog, no layout shift, no error from theme code.
2. **Shopify-held data carries its own freshness.** The theme trusts worker-written metafields only while `supplier.last_checked_at` is recent. *Planned (PRD T8, T12, decision 5b):* older than 3 days, or `supplier.status` equal to `unknown_stale`, renders the conservative default.
3. **The worker assumes no theme.** Nothing the worker serves depends on the theme being present.
4. **No shared secrets or code.** The theme holds no token; the browser calls the worker only on public routes and through the Shopify app proxy.

The independence run (`node tests/independence.cjs`, blocked mode) is the acceptance test for rule 1. It aborts every request to the worker domain and to `/apps/` at the network layer and walks home, collection, product, search, blog, article, contact, affiliate, cart and checkout. Results: `output/playwright/independence-<mode>.json`.

## 2. Live calls from the browser

| # | Theme location | Endpoint | Fires | On failure or timeout |
|---|---|---|---|---|
| 1 | `layout/theme.liquid` `body[data-storewide-event-src]`; `assets/theme.js` `loadStorewideEvent()` | `GET https://pawscout.activepaw.co.uk/public/event` | once per page view, every template, one memoised fetch shared by the hero badge, announcement bar, welcome modal and install pill | 3 s abort; a non-2xx, non-object or aborted response resolves to null. Hero badge keeps its server-rendered Theme Editor copy (hidden only on a real `{active:false}` with no `next`); the announcement item is added only on `active:true`; the welcome modal opens only on `active:true` with a code; the install pill waits for the verdict then 4.5 s |
| 2 | `assets/pawscout.js` `initSearchBackfill` | `GET /apps/pawscout/search` | search page, when `[data-pawscout-search]` exists and native results are fewer than 4 | promise catch; nothing appended |
| 3 | `assets/pawscout.js` `openPreview`, `renderPreview` | `GET /apps/pawscout/product`, `GET /apps/pawscout/import-status` | only after a ghost card click | modal shows "This product is no longer available. Please try another match."; import-status polls 20 times at 1.5 s then "Taking longer than usual" |
| 4 | `assets/pawscout.js` `sendEvent`; hook in `sections/main-product.liquid` (`meta[name=pawscout-pid]` from a `cj-pid-*` tag) | `POST /apps/pawscout/event` via `navigator.sendBeacon`, fetch keepalive fallback | product pages of imported products: `view` on load, `atc` on a cart add | wrapped in try; invisible |
| 5 | `assets/pawscout.js` `fetchAddonProducts`; slots `[data-pawscout-pdp-addons]` in `sections/main-product.liquid` and `[data-pawscout-cart-addons]` in `snippets/cart-drawer-contents.liquid` | `GET /apps/pawscout/addons`, then Shopify `/products/{handle}.js` | product page load; cart drawer open | promise catch returns an empty list; slots stay hidden or empty |
| 6 | `sections/site-footer.liquid` | link to `/apps/pawscout/affiliate/apply` (worker-rendered through the app proxy) | footer on every page | no fallback today: the link dead-ends. *Planned (PRD T10, decision 5c):* the footer links to the Shopify page `/pages/affiliates`, which carries the Apply button to this route and an email route; the button is hidden when the feed verdict is null |

One worker URL in the theme (`layout/theme.liquid`), one proxy prefix (`assets/pawscout.js`). Everything else the theme fetches is Shopify's own: `/cart/add.js`, `/cart.js`, `/cart/change.js`, `?sections=cart-drawer`, `/contact`, `/discount/<code>`.

## 3. Payload fields the theme reads

- `/public/event`: `active`, `name`, `code`, `pctOff`, `endsAt`, `endsLabel`, `headline`, `subline`, `chips`, `next{key,name,startsAt,endsAt,startsLabel,endsLabel}`.
- `/apps/pawscout/search`: `ok`, `products[{pid,title,image,price,url}]`.
- `/apps/pawscout/product`: `ok`, `product{pid,title,images,priceFrom,variants[{name}],descriptionText,url}`.
- `/apps/pawscout/import-status`: `ok`, `state`, `url`.
- `/apps/pawscout/addons`: `ok`, `addons[handle]`.
- `/apps/pawscout/event` request body: `{pid,event}`.

A field the worker stops sending must be treated by the theme as absent, never as an error. A field the theme starts reading is announced on the channel before the theme change merges.

## 4. Worker-written Shopify data the theme reads natively

Namespace `supplier`, variant level with product-level fallback for `name`, `status`, `warehouse`, `last_checked_at`, `fulfillment_confidence`. Full type spec: `docs/shopify-supplier-metafields.md`.

| Key | Theme use | When absent |
|---|---|---|
| `supplier.status` | `sections/main-product.liquid`: `in_stock` "In stock"; `low_stock` "Low stock" plus urgency; `supplier_available` "In stock"; `backorder_possible` "Available to order"; `unavailable` "Currently unavailable"; anything else, `unknown_stale` included, "Ready to order" today (*planned:* conservative default) | "Ready to ship" |
| `supplier.available_qty`, `supplier.max_order_qty` | purchase cap after tracked Shopify inventory (`main-product.liquid`, `main-cart.liquid`, `snippets/cart-drawer-contents.liquid`); a number shown only at 10 or fewer, "Only N left" at 3 or fewer | cap 20 |
| `supplier.last_checked_at` | "Availability updated <date>" line on the product page and cart; today display only (*planned:* gates status and delivery window at 3 days) | line omitted |
| `supplier.demand` | "Selling fast" badge on `selling_fast` | nothing |
| `supplier.delivery_days_actual`, `supplier.delivery_days` | delivery range on the product page (`snippets/delivery-info.liquid`) and a hidden line-item property "Estimated delivery: N days" | 6 to 14 days, or 3 to 10 when `supplier.origin` is GB |
| `supplier.name`, `supplier.warehouse` | switches the "Tracked delivery" copy; also rendered as "Fulfilled by <name>" in Product details today (*planned, PRD T9:* removed, never customer-facing) | "Care add-ons" copy |
| `supplier.fulfillment_confidence` | assigned, never rendered (open question to the worker, round 230 finding 6) | |
| `article.metafields.blog.faq_json`, `blog.related_products` | `sections/main-article.liquid`: FAQ with schema, "Shop this guide" | sections omitted |

Products, collections, discounts, redirects and markets are read natively; nothing in the theme knows they came from the worker except the `cj-pid-*` tag.

## 5. Open questions on the channel

- Does the worker write `unknown_stale`, after how long, and does `last_checked_at` still advance on a failed check? (round 230 finding 1, restated in round 232)
- Should `fulfillment_confidence` drive anything, or stop being written? (finding 6)
- The affiliate apply page logs `%c%d font-size:0;color:transparent NaN` twice in a normal browser (finding 4, round 235).

## 6. Changing this contract

1. Post the proposed change on the channel to the other agent with the field, the fallback and the date it takes effect.
2. Theme side: change the code, run the independence script in blocked and control modes against a preview theme, update this file, open the pull request.
3. Worker side: keep the old field or route alive until the theme pull request that stops using it has deployed (`shopify-deploy` merge with a `release-` tag).

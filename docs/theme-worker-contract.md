# Theme to worker contract

What the Active Paw theme takes from the PawScout worker, how, and what happens when the worker is not there. Everything below was measured on 2026-09-19 (channel round 230) unless marked *planned*. Change either side only through the shared agent channel, and update this file in the same pull request.

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
| 1 | `layout/theme.liquid` `body[data-storewide-event-src]`; `assets/theme.js` `loadStorewideEvent()` | `GET https://pawscout.activepaw.co.uk/public/event` | once per page view, every template, one memoised fetch shared by the hero badge, announcement bar, welcome modal and install pill | 3 s abort; a non-2xx, non-object or aborted response resolves to null. Hero badge keeps its server-rendered Theme Editor copy (hidden only on a real `{active:false}` with no `next`); the announcement item is added only on `active:true`; the welcome modal opens only on `active:true` with a code; the install pill waits for the verdict then 4.5 s |
| 2 | `assets/pawscout.js` `initSearchBackfill` | `GET /apps/pawscout/search` | search page, when `[data-pawscout-search]` exists and native results are fewer than 4 | promise catch; nothing appended |
| 3 | `assets/pawscout.js` `openPreview`, `renderPreview` | `GET /apps/pawscout/product`, `GET /apps/pawscout/import-status` | only after a ghost card click | modal shows "This product is no longer available. Please try another match."; import-status polls 20 times at 1.5 s then "Taking longer than usual" |
| 4 | `assets/pawscout.js` `sendEvent`; hook in `sections/main-product.liquid` (`meta[name=pawscout-pid]` from a `cj-pid-*` tag) | `POST /apps/pawscout/event` via `navigator.sendBeacon`, fetch keepalive fallback | product pages of imported products: `view` on load, `atc` on a cart add | wrapped in try; invisible |
| 5 | `assets/pawscout.js` `fetchAddonProducts`; slots `[data-pawscout-pdp-addons]` in `sections/main-product.liquid` and `[data-pawscout-cart-addons]` in `snippets/cart-drawer-contents.liquid` | `GET /apps/pawscout/addons`, then Shopify `/products/{handle}.js` | product page load; cart drawer open | promise catch returns an empty list; slots stay hidden or empty |
| 6 | `sections/affiliate-apply.liquid` on `/pages/affiliates` (footer links there); `assets/theme.js` shows the button | link to `/apps/pawscout/affiliate/apply` (worker-rendered through the app proxy) | Apply button on the affiliates page, shown only after the `/public/event` fetch resolved non-null | button stays hidden; the page, its copy and the email route (sales@activepaw.co.uk) stand on their own (T10, 2026-09-19) |

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

Namespace `supplier`. The spec (`docs/shopify-supplier-metafields.md`) follows the writer since 2026-09-20: one writer, eight keys, always on the PRODUCT, three status values (pawscout-agent, round 245, from the worker's code). Measured by the theme agent on 2026-09-20 through the Admin API on all 41 active products: exactly those eight keys at product level, no variant metafields at all, every variant Shopify-tracked with policy deny. So the banner and the cap come from Shopify inventory, and `supplier.status` would label a variant only if someone switched its tracking off.

| Key | Theme use | When absent or stale |
|---|---|---|
| `supplier.status` | `snippets/supplier-availability.liquid`, only while fresh and only when Shopify does not track the variant: `available` "In stock"; `low_stock` "Low stock" plus urgency; `out_of_stock` "Currently unavailable"; anything else "Ready to order" | "Ready to ship" |
| `supplier.available_qty` | not read: one product-wide figure cannot cap a variant, and for `out_of_stock` it keeps the supplier's real figure (the status is the signal, round 245) | |
| `supplier.last_checked_at` | gates every other supplier field (3 days); "Availability updated <date>" on the product page and cart page only while fresh | everything supplier-derived is ignored |
| `supplier.demand` | "Selling fast" badge on `selling_fast` | nothing |
| `supplier.delivery_days_actual`, `supplier.delivery_days` | while fresh: delivery range on the product page (`snippets/delivery-info.liquid`) and a hidden line-item property "Estimated delivery: N days" | 6 to 14 days, or 3 to 10 when `supplier.origin` is GB; no line-item property |
| `supplier.origin` | picks that static band | 6 to 14 days |
| `supplier.name` | switches the "Tracked delivery" copy only; never rendered to the customer (the "Fulfilled by <name>" row in Product details was removed 2026-09-19, PRD T9, and the independence run asserts its absence) | "Care add-ons" copy |
| `article.metafields.blog.faq_json`, `blog.related_products` | `sections/main-article.liquid`: FAQ with schema, "Shop this guide" | sections omitted |

Never written by the worker and, since 2026-09-20, never read by the theme: `max_order_qty`, `sku`, `warehouse`, `cj_product_id`, `cj_variant_id`, `fulfillment_confidence`, variant-level `supplier.*`, and the status values `in_stock`, `supplier_available`, `backorder_possible`, `unavailable`, `unknown_stale`.

Products, collections, discounts, redirects and markets are read natively; nothing in the theme knows they came from the worker except the `cj-pid-*` tag.

### Markets

The worker owns per-market publication (round 245, section 5): it removes a product from the Australia, European Union and United States and Canada catalogues unless the product can be delivered there, nightly and every 15 minutes, so those markets are sparse by design and the owner keeps them open. The theme never publishes to a market. It reads the market natively: `collection.products`, `products_count`, `all_products_count` and `paginate.items` are all scoped to the visitor's market (measured on a preview for GB, US, AU and DE on 2026-09-20; Pet Toys reads 11 for GB and 0 for the others on every one of them). What the theme does with a sparse market (PRD T19): a home collection block with no products for the visitor is left out whole, an empty collection page says so and offers the products that are available, the header and footer collection lists already skip empty collections, and the related products heading appears only above at least one card. The independence run asserts the first two in a sparse market on every run.

## 5. Open questions on the channel

None. Round 245 answered the three that stood here: the worker never writes `unknown_stale` and does not advance `last_checked_at` on a failed check; nothing drives `fulfillment_confidence`, which is not written; the affiliate form's `%c%d font-size:0;color:transparent NaN` console lines are Cloudflare Turnstile's (confirmed 2026-09-20: every such line is logged from `challenges.cloudflare.com`), and the independence run classifies them by that source.

## 6. Changing this contract

1. Post the proposed change on the channel to the other agent with the field, the fallback and the date it takes effect.
2. Theme side: change the code, run the independence script in blocked and control modes against a preview theme, update this file, open the pull request.
3. Worker side: keep the old field or route alive until the theme pull request that stops using it has deployed (`shopify-deploy` merge with a `release-` tag).

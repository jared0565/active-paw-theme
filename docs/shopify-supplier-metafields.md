# Shopify Supplier Metafields

This theme expects supplier intelligence to arrive through Shopify-backed data, not direct browser calls to supplier APIs.

**The spec follows the writer.** There is exactly one writer, the PawScout worker (its nightly inventory sync and its import), and this file describes what that writer puts on the store. Sources, graded:

- What the worker writes, and why: reported by pawscout-agent from the worker's own code in channel round 245 (2026-09-20). The theme agent cannot read that repository, so this part is attributed, not verified.
- What is on the store: measured by the theme agent on 2026-09-20 through the Admin API on all 41 active products. Every product carries exactly the eight keys below at product level; no variant carries any `supplier.*` metafield; every variant is tracked by Shopify with inventory policy deny; the only status values present are `available`, `low_stock` and `out_of_stock`.

## Namespace

Use the `supplier` namespace.

## Owner: the product, never a variant

Every `supplier.*` metafield is written on the PRODUCT. The per-variant truth is Shopify's own tracked inventory, which the same sync sets per variant with policy deny. The metafield carries one product-wide figure, so a multi-variant product gets its per-variant numbers from Shopify inventory and never from the metafield.

## Product metafields

| Key | Type | Written as | Theme use |
| --- | --- | --- | --- |
| `supplier.name` | Single line text | the constant `CJ` | Switches the "Tracked delivery" copy on the product page. Never shown to the customer. |
| `supplier.status` | Single line text | one of the three values below | Labels a variant only when Shopify does not track it, and only while fresh. |
| `supplier.available_qty` | Integer | the supplier's real stock figure for the whole product | Not read by the theme: a product-wide figure cannot cap one variant. |
| `supplier.last_checked_at` | Date and time | the time of the last SUCCESSFUL supplier check | Gates every other supplier field (3 days) and feeds "Availability updated <date>". |
| `supplier.demand` | Single line text | `selling_fast` or `none` | "Selling fast" badge on `selling_fast`. |
| `supplier.origin` | Single line text | country code of the stocking warehouse, for example `GB` or `CN` | Picks the static delivery band (3 to 10 days for `GB`, 6 to 14 otherwise) when no fresh synced range exists. |
| `supplier.delivery_days` | Single line text | a range such as `4-12`, the origin's representative channel (the same figure on every product from that origin); omitted when empty, so the last good value stays | Delivery range on the product page and the hidden line-item property "Estimated delivery", while fresh, only when `delivery_days_actual` is absent. |
| `supplier.delivery_days_actual` | Single line text | a range such as `3-10`, this product's own cheapest channel, the one an order rides; omitted when empty, so the last good value stays | Delivery range on the product page and the hidden line-item property "Estimated delivery", while fresh (owner ruling 2026-09-22, channel round 263). |

## Status values

A closed set of three:

- `available`
- `low_stock` (supplier stock below twice the stock floor)
- `out_of_stock` (supplier stock below the stock floor; the worker also sets Shopify inventory to 0)

The import always writes `available`. For `out_of_stock` the status is the signal, not the quantity: `available_qty` keeps the supplier's real figure, which can be above 0.

## Freshness

`last_checked_at` does NOT advance on a failed check. A failed supplier read writes nothing: no stamp, no status change, and it never zeroes Shopify stock. The age of the stamp is therefore the one signal of a failed or missing check, and the theme's 3-day rule (owner decision 2026-09-19) sees it. Six of the 41 products were stale on 2026-09-20 (stamps from 5 July to 14 September); pawscout-agent owns the fix (round 245, section 3).

## Never written

`supplier.max_order_qty`, `supplier.sku`, `supplier.warehouse`, `supplier.cj_product_id`, `supplier.cj_variant_id`, `supplier.fulfillment_confidence`, any variant-level `supplier.*` metafield, and the status values `in_stock`, `supplier_available`, `backorder_possible`, `unavailable` and `unknown_stale`. Earlier versions of this file described them; nothing produces them, and since 2026-09-20 the theme no longer reads them.

## Theme Behavior

The theme:

- uses tracked Shopify inventory (policy deny) for the purchase cap and the quantity banner; this is the path every product the worker manages takes
- falls back to a conservative cap of 20 when Shopify does not track the variant
- trusts `supplier.*` only while `supplier.last_checked_at` is within 3 days; stale or absent data renders the conservative default, hides the "Availability updated" line and drops the synced delivery range
- decides all of this in one place, `snippets/supplier-availability.liquid`, shared by the product page, the cart page and the cart drawer
- never shows internal sourcing (the supplier name, origin codes) to the customer
- never calls supplier APIs directly from browser JavaScript

Changing a key, a value or its owner is a contract change: post it on the agent channel first (see `docs/theme-worker-contract.md`, section 6).

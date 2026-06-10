# Shopify Supplier Metafields

This theme expects supplier intelligence to arrive through Shopify-backed data, not direct browser calls to supplier APIs.

## Namespace

Use the `supplier` namespace.

## Variant Metafields

Variant metafields drive purchasable availability and cart limits.

| Key | Type | Purpose |
| --- | --- | --- |
| `supplier.name` | Single line text | Supplier display name, e.g. `CJDropshipping`. |
| `supplier.cj_product_id` | Single line text | Source CJ product ID. |
| `supplier.cj_variant_id` | Single line text | Source CJ variant ID. |
| `supplier.sku` | Single line text | Supplier SKU. |
| `supplier.warehouse` | Single line text | Preferred source warehouse or region. |
| `supplier.status` | Single line text | Normalized availability status. |
| `supplier.available_qty` | Integer | Supplier-verified available quantity. |
| `supplier.max_order_qty` | Integer | Safe maximum quantity per cart line. |
| `supplier.last_checked_at` | Date and time | Last supplier availability check. |
| `supplier.fulfillment_confidence` | Single line text | Display-safe confidence label, e.g. `High`, `Medium`, `Limited`. |

## Product Metafields

Product metafields are optional fallbacks for product-level display.

| Key | Type | Purpose |
| --- | --- | --- |
| `supplier.name` | Single line text | Supplier display name when variant-level value is absent. |
| `supplier.status` | Single line text | Product-level supplier status. |
| `supplier.warehouse` | Single line text | Product-level warehouse or region. |
| `supplier.last_checked_at` | Date and time | Product-level supplier check timestamp. |
| `supplier.fulfillment_confidence` | Single line text | Product-level confidence label. |

## Status Values

Recommended normalized statuses:

- `in_stock`
- `low_stock`
- `supplier_available`
- `backorder_possible`
- `unavailable`
- `unknown_stale`

## Theme Behavior

The theme should:

- use tracked Shopify inventory first when inventory policy denies overselling
- use `supplier.max_order_qty` when present
- use `supplier.available_qty` when max order quantity is absent
- fall back to a conservative cap when no trusted quantity exists
- show supplier status and last-checked timestamp only when Shopify metafields provide them
- never call supplier APIs directly from browser JavaScript


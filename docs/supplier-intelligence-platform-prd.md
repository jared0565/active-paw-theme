# PRD: Supplier Intelligence Platform for Shopify

## Status

Future project. Not part of the current Active Paw theme flow.

## Summary

Build a supplier intelligence platform that connects Shopify stores to supplier catalogs, starting with CJDropshipping. The platform helps merchants search supplier inventory, validate product quality, normalize product details, import approved products into Shopify, and enforce availability-aware order limits.

The goal is to expand product coverage without damaging storefront trust.

## Problem

Dropshipping catalogs can contain products with weak titles, poor descriptions, unclear variants, uncertain stock, inconsistent warehouse availability, and unreliable fulfillment details.

If these products are surfaced directly to shoppers, the store risks:

- showing unavailable products
- overselling quantities suppliers cannot fulfill
- publishing low-quality product pages
- making unsupported shipping or quality claims
- damaging trust through inconsistent product details
- hurting SEO/AEO/GEO performance with thin supplier copy

## Goals

- Pull supplier product and inventory data into a controlled backend workflow.
- Verify supplier availability before products become searchable or purchasable.
- Normalize supplier data into high-quality Shopify product records.
- Gate product publishing with strict quality, margin, compliance, and fulfillment rules.
- Keep Shopify as the commerce source of truth for storefront, cart, checkout, orders, and inventory.
- Support future multi-supplier expansion.

## Non-Goals

- Do not build MCP for the initial version.
- Do not require a custom AI model for version one.
- Do not let the storefront call supplier APIs directly.
- Do not allow unreviewed supplier products to be purchased.
- Do not replace Shopify checkout or inventory records.

## Primary Users

- Store owner/operator
- Product curator
- Fulfillment operator
- Future platform admin

## Customer-Facing Outcomes

- Search results only show products that meet quality and availability gates.
- Product pages show clear availability, supplier status, shipping confidence, and order quantity limits.
- Cart prevents unrealistic quantities based on Shopify and supplier-backed limits.
- Storefront remains trustworthy even when products originate from supplier catalogs.

## Core Workflow

1. Shopper searches in Shopify.
2. Storefront shows existing Shopify products first.
3. If search results are weak, backend may query supplier catalog.
4. Backend creates supplier product candidates.
5. Candidate passes through normalization and validation.
6. Passing candidates are imported into Shopify as draft or active products based on rules.
7. Shopify search surfaces the product only after it is approved/published.
8. Inventory sync keeps Shopify quantities/metafields fresh.
9. Cart and product pages use Shopify data plus supplier status to cap order quantity.

## Supplier Data Requirements

Each imported candidate should include:

- supplier name
- supplier product ID
- supplier variant ID
- supplier SKU
- Shopify product ID after import
- Shopify variant ID after import
- warehouse/country data
- supplier stock quantity
- sourceability status
- supplier cost
- estimated shipping cost or shipping class
- estimated delivery window
- last checked timestamp

## Product Normalization

The platform should normalize:

- title
- short summary
- full description
- feature bullets
- benefits
- use cases
- pet type
- routine/category
- variants/options
- image alt text
- SEO title
- SEO meta description
- tags
- collections
- metafields
- recommended add-ons
- bundle group

AI may assist later, but version one can use deterministic templates and rule-based cleanup.

## Quality Gates

Hard gates:

- valid supplier identity
- valid variant/SKU mapping
- current stock or confirmed sourceability
- known fulfillment route
- acceptable margin
- acceptable delivery estimate
- no restricted or risky product type
- no counterfeit/IP-sensitive terms
- sufficient product images
- understandable variants
- no unsupported claims
- not a near-duplicate of an existing product

Scoring:

- `90-100`: eligible for auto-publish
- `75-89`: import as draft for review
- `<75`: reject or hold
- unknown inventory/supplier status: never auto-publish

## Availability Logic

Availability states:

- `in_stock`
- `low_stock`
- `supplier_available`
- `backorder_possible`
- `unavailable`
- `unknown_stale`

Cart/order max quantity should use:

- tracked Shopify inventory when available
- supplier verified quantity when synced
- conservative fallback cap when supplier status is stale or unavailable

## Shopify Integration

Use Shopify Admin API to:

- create products
- create/update variants
- update inventory
- update metafields
- assign collections
- publish/unpublish products
- store supplier mapping data

Use Shopify storefront/theme only to:

- display Shopify-backed data
- request backend availability checks when needed
- enforce frontend quantity guardrails

## Backend Components

- Supplier API adapter: CJ first
- Product candidate store
- Mapping store
- Availability cache
- Normalization engine
- Quality gate engine
- Pricing/margin engine
- Shopify Admin API client
- Audit log
- Retry/dead-letter handling
- Admin review UI or review queue

## Security Requirements

- Never expose supplier API tokens in theme JavaScript.
- Never expose Shopify Admin API tokens to the browser.
- Validate all backend inputs.
- Rate limit storefront-triggered supplier checks.
- Cache supplier responses to avoid abuse and API throttling.
- Log publish/import decisions.
- Use least-privilege Shopify app scopes.

## MVP Scope

- CJ product/variant mapping.
- CJ inventory lookup.
- Shopify metafields for supplier status.
- Product candidate import as draft.
- Rule-based title/description cleanup.
- Basic product quality score.
- Manual approval before publish.
- Cart quantity cap driven by Shopify/supplier data.

## Future Enhancements

- Multi-supplier support.
- AI-assisted product normalization.
- AEO/GEO content generation with strict claim validation.
- MCP/admin agent interface.
- Bulk supplier search and import queue.
- Margin simulation.
- Fulfillment risk dashboard.
- Supplier reliability scoring.

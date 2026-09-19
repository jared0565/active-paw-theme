# Active Paw Pricing Strategy Audit

**Date:** 2026-07-08
**Context:** The store has had zero sales to date. The owner has compared prices against other sellers in the niche and believes Active Paw is too expensive. This audit tests that belief against (a) how our prices are actually built, (b) real margins on the live catalogue, (c) current UK competitor prices, and (d) the published evidence on pricing strategy for small dropship stores.

**One-line answer:** The premise is half right. On the commodity items a shopper can price-check, we do sit at or above the marketplace floor, so those look expensive. But our margins are mostly healthy to generous, not thin, so a blanket price cut is the wrong fix. It would give away good margin and still lose to Amazon. The real levers are: reprice the third of the catalogue that is frozen above our own current rule, stop leading with commodities we cannot win on, fix a freight rule that craters our cheapest items, trim an "ads tax" baked into prices for ads we are not running, and above all fix traffic and trust, which is the actual reason for zero sales.

---

## 1. How our prices are actually built

All retail prices are set by one function in the worker (`pawscout-worker/src/pricing.ts`, `retailPriceGbp`). The live parameters (from `tenant_config.pricing`) are:

| Parameter | Value | Meaning |
|---|---|---|
| `multiplier` | **2.2x** | retail = landed cost x 2.2 |
| `floor` | 2.2x | hard minimum multiplier (equal to multiplier, so always 2.2x) |
| `minMarginGbp` | **£6** | absolute minimum markup per unit |
| `maxMarginGbp` | **£30** | absolute maximum markup per unit |
| `fxUsdToGbp` | 0.78 | USD to GBP conversion |
| `fxBufferPct` | 2% | safety padding added on top of FX |

The formula, in plain terms:

```
cost(GBP)   = supplier_cost(USD) x 0.78 x 1.02      (FX + 2% buffer)
retail(GBP) = cost x 2.2 + freight, then:
              - never less than cost + freight + £6   (min margin)
              - never more than cost + freight + £30  (max margin cap)
              - rounded UP to the nearest .99
freight is BAKED INTO the sticker (pass-through) so UK delivery can be free.
```

Two design decisions matter for this audit:

1. **The 2.2x multiplier is an "ads-funded" number.** The code comment states the multiplier is sized so that, after ads at ~33% of revenue (target ROAS 3), payment fees ~2.5%, FX ~1.5%, refunds ~3% and fixed ~2%, a thin net margin survives. In other words, **a third of every price exists to pay for advertising.**

2. **Freight is baked into every sticker** (owner decision 2026-07-03) so that UK delivery can be free storewide. The freight is passed through, not multiplied. This is a trust and positioning choice, and it is a good one in principle, but it has a sharp edge on cheap items (Section 2).

---

## 2. What the numbers actually say (real margins, live catalogue)

The live catalogue is **163 products** (median price £17.99, mean £34.12, range £6.99 to £137.99). Behind them: 172 products imported, 41 archived, and **110 import attempts that failed** (more than a third of all attempts, usually cost-gate rejections, which is itself a signal that CJ commodity costs frequently do not clear our own margin gates).

Real net margins, computed from **actual live price minus actual supplier cost minus actual freight** (freight read per item from the CJ detail record), expressed as net percentage of ex-VAT revenue after a ~9% overhead stack and with **zero ad spend** (which matches reality, see Section 4):

| Price band | Products | Avg price | Avg cost | Avg freight | **Avg net margin** | Worst |
|---|---|---|---|---|---|---|
| Cheap (under £10) | 23 | £8.90 | £1.01 | **£3.64** | **25.4%** | **-130.7%** |
| Middle (£10 to £35) | 92 | £17.72 | £5.36 | £2.51 | **37.6%** | 9.0% |
| Big-ticket (£35+) | 48 | £77.66 | £27.98 | £1.84 | **43.6%** | 2.5% |

(Net margin base: net profit as a percentage of ex-VAT revenue. The cheap-band worst case of -130% is an indicative outlier, not a headline: it rests on per-item freight read from the CJ record, and whether that exact freight was baked into that one sticker is uncertain. Treat the band averages as robust; the single worst case is directional.)

Four findings, all different from the "everything is too expensive" story:

**Finding A. The margin is mostly healthy, even generous.** The middle band (the bulk of the catalogue) nets ~37.6% and the big-ticket band ~43.6%, both above the owner's stated 20 to 30% target, and both computed with zero ad spend. That headroom is the "ads tax": we are pricing as if a third of revenue goes to ads that are not running. Example: a £137.99 stainless-steel litter box costs £48.17 and nets ~49%. These are not thin margins.

**Finding B. The cheap end is the real wound, and freight is the cause.** Items under £10 carry an average £3.64 of freight on an average £1.01 of product. Free-shipping-baked-in means the sticker has to absorb that freight, but on a sub-£10 item there is almost nothing left, and some items are sold at a loss (worst case -130% net). Example: the £6.99 cleaning-gloves item has £0.78 of product cost and £4.38 of freight, netting ~2.5%. These items are the worst of both worlds: fragile or negative margin **and** visibly dearer than Amazon on near-identical goods.

**Finding C. The big-ticket items have the highest paper margin but are the LEAST defensible, not a moat (corrected).** An earlier version of this audit called big-ticket the store's moat, on the basis of its ~43.6% net margin. That was wrong, and it is worth being blunt about why: margin measures what we keep IF someone pays our price, not whether anyone will. These items (stainless-steel litter boxes, cat trees, grooming tables) are **PawHut products** (a manufacturer-owned brand, Aosom) or generic equivalents, resold via CJ at ~2.9x our cost. PawHut sells the identical goods direct to UK shoppers for roughly half our price (Section 3a). Our £137.99 litter box (cost £48.17) is PawHut's own £65.99 box, and comparable PawHut variants retail for £36.99, which is **below our CJ cost**. So the high margin is illusory: it is priced above what any informed shopper will pay, and one click finds the maker cheaper. This is the same commodity trap as the cheap end, at a higher price point.

**Finding D. A third of the shelf is not even on our own current pricing rule.** Of 163 live products, 103 (63%) are priced exactly as the current 2.2x engine dictates, but **60 (37%) are frozen off it**, and 45 of those are priced **higher** than the current rule would set, by an average of about £16. The nightly reprice job (`pawscout-worker/src/jobs.ts`) only rewrites a variant when its SKU matches a live CJ cost; these 60 have SKU or cost mismatches, so they were priced once at import (under older parameters, e.g. the old 2.5x default, or manually) and never updated since. This is probably a large part of the "too expensive" impression: the visibly dear items are disproportionately the frozen ones, sitting well above even our own already-reduced rule. It is also the single most mechanical thing to fix on this list (see the quick win in Section 5), because it lowers those prices with no strategic decision required.

---

## 3. How we compare to the UK market (competitor benchmark, July 2026)

Prices below were read off live retailer pages. The UK price floor is set by the marketplaces and their private-label lines.

| Category | UK market range (budget / mid / premium) | Where Active Paw sits |
|---|---|---|
| Dog & cat beds | £12-18 / £18-50 / £55-85 | Mid-range, broadly in band |
| Harnesses & leads | £9-13 / £16-30 / £30-43 | In band |
| Litter trays / boxes | £3.50 / £13-27 / £43-50 | Our **stainless steel** boxes £114-138 sit **above** the mainstream premium (a different, premium product, but a wide gap) |
| Cat trees / scratchers | £2.59-14 / £22-40 / £70-120 | Our £115 tower is at the top of the market |
| Grooming tools | £2-10 / £11-22 / £23-28 | £6.99 items are in the budget band but competing with branded equivalents |
| Stain / odour removers | £3.99-8 / £9-17 / £19-28 | £6.99 items in band |
| Toys (chew / interactive) | £0.89-3 / £8-15 / £19-26 | Our £7.99 toys sit **above** budget toys (Zooplus £0.89-1.59) |

Key structural facts from the benchmark:

- **The floor is private-label, not dropship.** Pets at Home (Wainwright's, AVA, Pets Essentials), Zooplus (TIAKI, Cosy Kingdom) and Jollyes (Rufus & Rosie) hit the lowest prices with their own brands, bought at true wholesale. A Pets at Home open litter tray is £3.50, a budget toy is under £3. **We cannot beat that on an identical commodity, because our CJ cost is often at or above their shelf price.**
- **Even branded goods are not undercut by the marketplace.** A FURminator deshedding tool is ~£23 at both Amazon and Pets at Home. There is no room to "win on price" there either.
- **The market free-shipping threshold is ~£35 to £40** (Zooplus £39, Pets at Home £40, Amazon £35 non-Prime, Jollyes £40). We currently offer free UK delivery with no threshold, which is a stronger trust signal but is exactly what craters our cheap items (Finding B).
- **Independents win from above, not below.** The successful UK Shopify pet brands (Lords & Labradors, Charley Chau) sit **above** the marketplaces on design, materials and brand, with free-shipping thresholds of £75 to £150. That is the lane a small store realistically occupies, differentiation and premium, not price leadership.

### 3a. The big-ticket reality check: we resell PawHut at ~2x the maker's own price

The store's most expensive items are not a moat, they are the clearest example of the commodity trap. All 48 big-ticket products (£35+) are stainless-steel litter boxes, cat trees, grooming tables or feeders. Nine carry PawHut brand handles outright; the other 39 are generic versions of the same items. **PawHut is a manufacturer-owned brand (Aosom, a large direct-import group)** that sells these goods direct to UK shoppers cheaply, through its own site, Amazon, eBay, ManoMano and B&Q. We buy them via CJ and resell at ~2.9x our cost. Live PawHut prices captured 2026-07-08:

| Our item | Our price | Our CJ cost | PawHut's own direct price (closest match) | We are |
|---|---|---|---|---|
| XXL stainless-steel litter box | £137.99 | £48.17 | £65.99 (comparable enclosed variants from £36.99) | ~2.1x PawHut |
| Cat tree, 100-150cm multi-level | ~£114.99 | ~£40 | £41.99 to £49.49 | ~2.5x PawHut |
| Folding grooming table, adjustable arm | ~£122.99 | ~£43 | £51.99 to £56.99 | ~2.3x PawHut |

The gap survives strict like-for-like matching: even PawHut's largest, priciest variant of each item stays well below our price. Worse, some comparable PawHut litter-box variants retail for £36.99, **below our £48 CJ cost**, so we cannot even buy the item as cheaply as the maker sells it. There is no exclusivity or scarcity to justify the premium; the identical branded product is one click away for under half the price. Note that removing "PawHut" from our titles (the de-brand system) does not change this: the shopper recognises the product and finds the maker regardless.

**This is the single most important conclusion in the audit.** The catalogue was built by importing CJ products by category, which produces a shelf of one-click-comparable brand and commodity goods. No pricing change fixes that. Competing requires a different sourcing and curation strategy, not a different markup (see Section 5, Priority 2).

---

## 4. The real diagnosis: why zero sales

This is the part that matters most, and the published evidence is blunt about it.

**At zero sales, "our prices are too high" cannot actually be diagnosed.** Price sensitivity is read from a funnel: visitors arrive, some add to cart, some buy, and you watch how those rates move when price moves. With no traffic there is no funnel and no signal. "Too expensive" is a guess, not a measurement.

**The owner has confirmed the store has barely any traffic.** That single fact reframes everything. UK pet-care e-commerce converts at roughly 4.4% (Dynamic Yield benchmarks), which means about **1 in 23 qualified visitors buys**. With almost no visitors, zero sales is arithmetic, not a pricing failure. No price change creates sales on a shop nobody sees. (Recommendation: confirm real session numbers in Shopify Analytics, which this audit cannot see directly.)

**Where price genuinely does bite (the honest exception):** when the catalogue leads with commodity SKUs a shopper can paste into Amazon and find cheaper, even a well-targeted, trusting visitor bounces after a ten-second price check. That is real, and it applies to our cheap and some mid commodity lines. But the fix is **not** to cut price to marketplace parity (our cost often exceeds their retail, so we would sell at a loss and still look slower and less trusted). The fix is to change **what** we lead with and **how** we sell it.

**Supporting evidence (see Appendix for sources):**
- "Traffic without sales is almost always a conversion problem (clarity, trust, friction), not a price problem." Cart abandonment routinely exceeds 70%, driven by trust and friction, not price. Adding trust badges alone lifted conversion ~8.7% in one case.
- Pet-retail margins run 30 to 50% gross, 5 to 20% net. Toys, accessories and grooming are the 40 to 60% gross profit categories. Our margins are consistent with a healthy pet retailer, not an over-priced one.
- Dropshipping commodity goods is a race to the bottom precisely because everyone has the same supplier cost. The escape is differentiation, niche, bundles, brand and service.

---

## 5. Recommendations

Ordered by leverage. Each notes the expected effect and how to do it.

### Quick win (mechanical, do this week): reprice the frozen catalogue
Independent of any strategy decision, about 37% of live products are frozen above our own current pricing rule (Finding D), 45 of them by an average of ~£16. Bringing the whole catalogue onto the current parameters immediately lowers the items that most look "too expensive", with no strategic assumption changed. This means either fixing the nightly reprice coverage (the job skips variants whose SKU does not match a live CJ cost) or running a one-off backfill that reprices from the product-level cost. First step: confirm how many of the 60 frozen products are SKU-mismatched (should be repriced) versus deliberate manual overrides (should be left). This is the fastest, lowest-risk answer to the owner's complaint.

### Priority 1: Fix traffic and trust first (this is the zero-sales cause)
Nothing below matters until qualified people see the store.
- Execute the already-scoped blog / RSS / Pinterest organic plan (`docs/blog-rss-pinterest-traffic-prd.md`) to build free, buyer-intent traffic. Target long-tail terms ("stainless steel cat litter box", "orthopedic bed senior labrador"), not broad ones.
- Add trust: visible reviews (seed them with the launch offer below), a clear returns/refund policy, real UK contact details, honest per-product delivery windows, payment and security badges.
- Install and read analytics. If add-to-cart is under 4%, the problem is the offer or clarity; if cart-to-checkout is under 45%, it is friction or trust. Neither is fixed by lowering price.

### Priority 2: Stop reselling price-checkable goods; differentiate the assortment
The catalogue's real problem is not the markup, it is WHAT we sell. Both ends are undefendable: the cheap end loses to Amazon private-label, and the big-ticket end is PawHut/generic resale the maker undercuts by ~2x (Section 3a). No pricing change fixes a shelf of one-click-comparable goods.
- **Do not hero the big-ticket resale items.** They are not a moat. Deprioritise or drop the PawHut and generic litter boxes, cat trees and grooming tables where the maker sells the identical item for half. At best they are catalogue filler, never the value proposition.
- **Move toward private-label, own-brand or niche-exclusive products** where there is no maker to undercut you. This is the most durable moat and what the successful small pet brands do, but it is also the least frictionless option: private-label via CJ means minimum order quantities, packaging cost, quality control and lead times. Treat it as a direction to test, not a switch to flip. The first question to answer is narrow: can we source an unbranded or custom-packaged product in one category at a cost that leaves real room below the branded price?
- **Build differentiated bundles / systems** the maker does not sell (a "cat litter care system", a "new kitten set"), ideally anchored on items that are NOT brand-checkable so there is no one-click comparison. Bundles lift average order value ~20 to 30% and answer the "too expensive" complaint without cutting margin: a £15 kit has no direct comparison.
- **Prune or bundle the freight-cratered cheap items** (Finding B). Any item sold at a loss under free shipping should be dropped or folded into a kit.

### Priority 3: Trim the "ads tax" on the sellable middle
- The 2.2x multiplier funds ads at 33% of revenue that are not being spent. On the middle band that leaves ~37.6% net, well above the 20 to 30% target. **Lowering the multiplier from 2.2x toward ~1.9x cuts middle-band prices ~13% while still netting ~30%.** That is a one-line config change (`tenant_config.pricing.multiplier`). The nightly job then re-prices every variant it can match to a live CJ cost, which today is only ~63% of the catalogue; the frozen 37% (Finding D and the quick win above) will not move until their reprice coverage is fixed, so do the quick win first or the multiplier change reaches only two-thirds of the shelf.
- Model this per item rather than blanket, and **restore the buffer if and when paid ads actually start.** The multiplier should track real ad spend, not a permanent assumption.
- Note which lever hits which band: the multiplier trim helps the **middle** band only. Cheap items are governed by the £6 minimum-margin rule (fix via Priority 2), and big-ticket prices sit above formula (Priority 4).

### Priority 4: Reconsider the two extremes of the price ladder
- **Big-ticket has deep headroom.** A £138 litter box at 49% net could come down to ~£99 and still net ~30%. If the goal is competitiveness on a considered purchase, this is the safest place to cut, because the margin absorbs it. Verify the specific stainless-steel-box market price before setting the new level (I can research this on request).
- **Cheap-item shipping.** Keep free UK delivery as a trust asset for a new store (82% of shoppers are more likely to buy with free shipping), but do not let it sell any single item at a loss. Either bundle those items (preferred) or, if cash flow needs it, introduce a market-standard free-shipping threshold (~£40) with a modest flat rate below it, which also lifts average order value.

### Priority 5: Use structural pricing tactics, not discounts, to lift conversion
- **Charm-price value lines** (.99 endings, which the round-up rule already produces) and keep **clean round prices on premium hero items**.
- **Good-better-best tiers** on the best products (standard / premium / bundle) to anchor and steer to the middle tier, lifting order value without discounting.
- **Anchor with a genuine "compare at" price** where a real reference exists (must be defensible under UK CMA/ASA rules, so only where a true RRP applies).
- **Subscribe-and-save** on any consumables (treats, dental, supplements) for repeat revenue, the most durable moat a small pet store has.

### The guardrail: do not stack the levers into a loss
A margin-trimmed price, minus a 20% launch code, minus ad cost, goes negative fast. **Sequence, do not stack:**
1. First fix traffic and trust (Priority 1) and lead with winners (Priority 2), at roughly current prices.
2. Run a time-boxed launch offer (WELCOME10, or ~20% with a hard end date) whose real job is to harvest the first orders, reviews and funnel data. Its cost is affordable only while ad spend is near zero.
3. Once there is funnel data, trim the middle-band multiplier (Priority 3) based on what the data shows, and only then consider paid ads, resizing the multiplier to the real ROAS.

---

## 6. The cheap-item tier: why "shipping" keeps surfacing, and how to make it pay

The cheapest items are where the shipping problem kept resurfacing. The cause is now verified at source, and it is not a flaw in the local-warehouse-to-local-buyer model. It is a sourcing gap.

### 6.1 The cheap items are China-sourced, and GB has no cheap stock

The live catalogue splits by warehouse: 79 products ship from a GB warehouse (avg cost $26, freight ~$0, no shipping problem), and 87 ship from China (avg cost $3.27, avg freight $6.01). Every one of the ~80 sub-$5 impulse items is China-sourced; none is GB.

Probing CJ's GB warehouse directly (countryCode=GB across eight cheap-item categories) returns nothing under ~$5.59, while China returns 100+ of each. Our own import history confirms it: the pipeline that searches GB has never surfaced a cheap local item. CJ's GB warehouse holds higher-value goods (cat trees, litter boxes); the ultra-cheap impulse items exist only in China.

So the local-to-local principle is correct and already works for everything GB stocks. The cheap tier is simply the one part of the catalogue that physically cannot be local on this supplier. That is the real, recurring "shipping" issue: a supply constraint, not a model flaw.

### 6.2 The fix: decouple shipping (cheap sticker, charged shipping)

Baking full freight into a free-delivery sticker forces a $1.44 China item to either lose money at £6.99 or price uncompetitively at £19.99. Charging shipping separately fixes it. Worked example (CJ cost $1.44, freight $3.42), priced at £1.99 product + £4.99 shipping (£6.98 total):

| Line | Amount |
|---|---|
| Customer pays | £6.98 |
| Ex-VAT revenue | £5.82 |
| VAT | -£1.16 |
| Product cost | -£1.12 |
| Freight | -£2.67 |
| Overhead (~9%) | -£0.55 |
| **Net / unit** | **~£1.48 (~25%)** |

It works because the £4.99 shipping charge covers the £2.67 freight and adds margin, instead of hiding an uncompetitive number in the sticker. Keep the product sticker impulse-cheap; charge the freight honestly. The catch is sellability: £4.99 shipping on a £1.99 item, and £6.98 delivered against Amazon at £3 to £5 with Prime, is a hard standalone sell. It works as a multipack, a niche item Amazon does not carry, or a threshold add-on.

### 6.3 The multipack, stress-tested against events and affiliate

A 3-pack (£5.97 product + £4.99 shipping) modelled with a 20% event discount and affiliate commission (8% + 2% platform fee) stacked. The result hinges entirely on whether the pack ships as one combined parcel or as N per-unit parcels:

| If the pack's freight is... | Base | -20% event | + Affiliate | -20% AND affiliate |
|---|---|---|---|---|
| £2.67 (1 combined parcel) | +£2.23 (24%) | +£1.33 (16%) | +£1.28 (14%) | +£0.48 (6%) |
| £4.27 (1.6x) | +£0.63 (7%) | -£0.27 | -£0.32 | -£1.12 |
| £8.00 (3x per-unit) | -£3.11 | -£4.01 | -£4.06 | -£4.85 |

If the pack ships combined at ~single-unit freight it survives the full stack at +£0.48. If freight scales to 1.6x, any single stressor tips it negative. Break-even freight under the full stack is £3.15: the 3-unit parcel can cost at most ~18% more than one unit's £2.67.

Counterintuitively, the single unit is the safer bet: £1.99 + £4.99 nets +£1.47 (25%) at base and +£0.60 (11%) even under -20% + affiliate, because its £4.99 shipping over-covers one unit's freight. Multipacks help conversion (better value perception) but only hold margin if freight genuinely amortises.

### 6.4 The threshold math resolves by warehouse

Free shipping on a China item is always a loss (the 3-pack loses £1.53 at base, £2.85 stacked, eating freight with no shipping revenue). So the free-shipping threshold must be warehouse-aware:
- GB items: free shipping over £X costs almost nothing (local freight ~ £0).
- China items: always charge shipping, never free, never qualify for the threshold.

This is the local-to-local principle expressed as a shipping rule.

### 6.5 Guardrails

1. Never free-ship a China item. The threshold is GB-only.
2. Exclude cheap items from affiliate discount codes. They cannot clear the system's £6 affiliate floor (a 3-pack's surviving contribution is ~£4.81), and an 8% + 2% commission on top of a 20% event is what pushes the pack negative.
3. Stack event discounts on cheap items with care: singles absorb -20%, the 3-pack only does if freight is truly combined.

### 6.6 Open item

The multipack decision hinges on one number the CJ API would not return for the sample SKU (CJDT296306301AZ): the actual combined-shipping freight for N units in one parcel. Confirm it on CJ directly (add N units to the cart, read the shipping cost). If a 3-pack ships for £3 or less, multipacks are the sweet spot. If freight scales with weight, sell singles, and treat the China-commodity tier as structurally awkward, leaning on the GB/local and niche ranges for durable margin.

---

## Appendix: method, sources, caveats

**Method.** Pricing engine read from `pawscout-worker/src/pricing.ts` and live `tenant_config.pricing`. Margins computed by joining live storefront prices (activepaw.co.uk products.json) to CJ supplier costs and per-item freight in the worker's D1 (`warehouse_products`, `product_links`), for 163 of 172 live products. Net margin = (ex-VAT revenue minus product cost minus freight) as a percentage of ex-VAT revenue, less a ~9% overhead stack (payments, FX, refunds, fixed), with zero ad spend. Freight impact is a conservative upper bound where freight is baked into the sticker.

**Caveats.** Real traffic and conversion cannot be read from the worker; "barely any traffic" is the owner's self-report and should be confirmed in Shopify Analytics. Competitor prices are a July 2026 snapshot; Argos and B&M pages could not be machine-read and are not quoted. Some published percentage figures (bundle uplift, charm-pricing lift) come from vendor sources and are directional, not settled; the established anchors are named in the sources below.

**Established / primary sources:** Anderson & Simester 2003 (charm pricing); Ariely (decoy pricing); Gourville 1998 (per-day framing); Smart Insights, IRP Commerce, Dynamic Yield (conversion benchmarks, pet ~4.4%); ConvertCart (traffic-without-sales is a conversion problem); Capital One Shopping (free-shipping behaviour); Shopify (bundling); etailpet (pet-retail margins 30-50% gross, 5-20% net); Peel Insights (first-purchase-discount LTV caveat). Competitor prices read from Pets at Home, Zooplus UK, Jollyes, Amazon UK live pages; free-shipping thresholds verified at each retailer's delivery page.

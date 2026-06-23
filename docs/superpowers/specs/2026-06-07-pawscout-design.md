# PawScout - Design Spec

**Date:** 2026-06-07
**Status:** Design approved (brainstorming) - pending spec review → implementation plan
**Model:** multi-tenant **BYOC** SaaS ("we provide the vehicle, subscribers provide the gas"). The operator's own niche stores are **tenant #1**; external store owners subscribe on the same rails.

> **⚠️ Reframed later in session (2026-06-07):** PawScout's core purpose is a **signal-driven inventory populator** for the Shopify shop - it creates *real, published, collection-assigned* products in the store, driven by **two signals**: (1) a scheduled **trending / best-seller** scan, and (2) a **visitor search** that comes up short of the results grid. The merchant can also add products manually (3rd path), still collection-assigned. **Cart / checkout / fulfillment-binding is explicitly out of scope for now** ("nothing reaches the cart that isn't real inventory with proper info"). The scheduled-**console** framing below (triage screens, alerting, trends) is **secondary / largely superseded** by this; durable carryover = the CJ-query/provider logic, App-Proxy + credential handling, reference-only data, and collection-tagging. The **visitor-search trigger** is detailed in the companion doc **`2026-06-07-pawscout-search-trigger-design.md`**.

---

## 1. What PawScout is

PawScout is a **multi-tenant SaaS** that scans suppliers for **trending / best-selling products**, filtered per store, and alerts each subscriber to new candidates. The subscriber reviews each and **lists it through the supplier's own flow** (deep link). Every subscriber connects **their own** supplier + store accounts (**Bring Your Own Credentials**); PawScout never uses its own accounts to serve others.

**CJDropshipping is the first supplier**, behind a `SupplierProvider` interface so others (AliExpress, Spocket, …) slot in later - the **Supplier Intelligence Platform** direction.

### BYOC is the core compliance + trust model
- Each subscriber supplies **their own CJ API key** (required) and **optionally their own Shopify token** (to auto-read collections). PawScout stores these **envelope-encrypted, per-tenant** (§6).
- This keeps each subscriber a legitimate first-party CJ customer - PawScout is tooling, not a reseller of access (§7).
- The operator is simply the first tenant, with their own CJ key and multiple stores.

### What PawScout is NOT (non-goals)
- Does **not** create Shopify products via the Admin API, auto-list, or auto-fulfill.
- Does **not** call supplier APIs from the browser.
- Does **not** store a copy of any supplier's catalog content (reference-only).
- Does **not** use PawScout-owned supplier accounts to serve subscribers.

---

## 2. The match signal

Per store × supplier: pull a **trending/best-selling feed**, filter by **keywords + collections + price + min-popularity**, dedupe, surface.

**CJ** - `listV2`: `searchType=2` (Trending) / `productFlag=0`; `orderBy=listing count`. **Popularity normalized** to `{ score, basis }`, `basis ∈ listings|sales|orders|rating|none`, labeled honestly per supplier.

> **Build step 0:** one live `listV2` call with a real token to confirm params + response.

---

## 3. Scope & milestones

| Milestone | Scope | Key new work |
|---|---|---|
| **M1 - Multi-tenant MVP** | Full BYOC SaaS core: subscriber auth, BYOC credential vault, per-tenant isolation, CJ provider, scanner (Queue fan-out), all 8 screens. Operator + a small **private beta** as first tenants. | The whole multi-tenant build |
| **M2 - Commercialize** | Billing/plans, public signup, CJ **partnership nod** (§7), per-tenant quotas, audit hardening, ops/support tooling. | Money + go-to-market |
| **M3 - Multi-supplier** | Additional providers (AliExpress, Spocket, …) behind §4.1, each gated on its own API ToS. | New providers |

**MVP = fully functional**, all 8 screens, robust errors. **Billing is deferred to M2** - M1 runs as a private beta (operator + invited users) to validate before charging (which is also when the CJ nod matters most). **Deployment:** Cloudflare; TypeScript scanner reimplements the Python `cj_client` logic (Python stays reference + admin one-offs). Off the local PC deliberately.

---

## 4. Architecture (M1)

Standalone SaaS on Cloudflare (NOT a Shopify-embedded app):

| Unit | Cloudflare primitive | Job |
|---|---|---|
| **Web app** | Worker (Hono) + Polaris-styled UI + **subscriber auth** | Signup/login, BYOC onboarding, the 8 screens - all tenant-scoped. |
| **Scanner** | Worker + **Cron** → **Queue** fan-out (one message per tenant×store×supplier) | Decrypts the tenant's key, calls the **provider** for trending → filters → dedupes → writes matches → alerts. Queue fan-out (a naive loop hits CJ rate limits + Worker CPU caps). |
| **Store DB** | **D1** | Tenants, stores, supplier configs, matches, runs, audit. Strict tenant scoping. |
| **Credential vault** | **D1 (ciphertext)** + master key in **Worker Secrets / CF Secrets Store** | Per-tenant **envelope-encrypted** CJ key (+ optional Shopify token). |
| **Token cache** | **KV** | Per-tenant supplier access token + expiry; refreshed when stale. |
| **Notifier** | **Resend** + in-app + optional **web-push** | Per-tenant digest; web-push for desktop alerts. |

**Rate limits isolate naturally** - each tenant uses their own CJ key, so one tenant can't exhaust another's quota. **Decoupled:** scanner runs on Cron independently of the web app.

### 4.1 The `SupplierProvider` interface (capability-driven)
```ts
interface SupplierProvider {
  id; displayName
  capabilities: { search; trending; categoryBrowse; programmaticAuth; listing: 'handoff'|'api'|'app-only' }
  authenticate(creds): Promise<Token>            // handles refresh
  search(criteria): Promise<Candidate[]>          // if capabilities.search
  getTrending(criteria): Promise<Candidate[]>     // if capabilities.trending
  getProduct(supplierProductId): Promise<ProductDetail>
  getDeepLink(supplierProductId): string          // for listing:'handoff'
}
type Candidate = { supplierProductId; title; imageUrl; cost;
  popularity: { score; basis: 'listings'|'sales'|'orders'|'rating'|'none' }; matchedKeyword }
```
CJ (M1): `{search,trending,categoryBrowse,programmaticAuth:true, listing:'handoff'}`, `basis:'listings'`. The interface **will need refinement at supplier #2** - expected, not a failure.

---

## 5. Data model (D1) - reference-only, multi-tenant

```
tenants            id PK · email · plan(beta) · status · created_at

tenant_credentials id PK · tenant_id FK · supplier · ciphertext · iv · key_version
                   UNIQUE(tenant_id, supplier)         (CJ key per tenant; envelope-encrypted)

stores             id PK · tenant_id FK · name · niche · cadence_hours(=4)
                   · shopify_domain(nullable) · shopify_token_ciphertext(nullable) · status

store_suppliers    id PK · tenant_id FK · store_id FK · supplier · enabled
                   · keywords(JSON) · collections(JSON) · price_min · price_max
                   · min_popularity · product_flag(=0)
                   UNIQUE(store_id, supplier)

matches            id PK · tenant_id FK · store_id FK · supplier · supplier_product_id
                   · matched_keyword · status(new|listed|dismissed)
                   · first_seen_at · decided_at · notified_at · run_id FK
                   UNIQUE(tenant_id, store_id, supplier, supplier_product_id)

runs               id PK · tenant_id FK · store_id FK · supplier · trigger(cron|manual)
                   · started_at · finished_at · status · products_scanned · new_matches · error

audit_log          id PK · tenant_id FK · actor · action · target · at   (security/forensics)

notify_prefs       tenant_id FK · email_to · notify_email · notify_inapp · notify_push
```

- **Every** tenant-owned table carries `tenant_id` and is reached only via the `TenantStore` (§6).
- **Dedup/lifecycle:** `INSERT … ON CONFLICT DO NOTHING`; `status` is the dedup memory.
- CJ key is **per tenant** (one CJ account manages a tenant's many stores - CJ §IV.1.4); Shopify token is **per store**.
- Reference-only: no supplier catalog content stored; details fetched live.

---

## 6. Security (full rigor - tenants are mutually untrusted + we hold their credentials)

This is the section that earned the multi-tenant complexity. Non-negotiable because a leak crosses real businesses and exposes stored credentials.

- **Tenant isolation - `TenantStore` is the only path** to tenant tables; built per-request from the authenticated tenant context; **auto-injects `WHERE tenant_id = ?`**. Lint rule bans raw `env.DB.prepare(...)` elsewhere. **A CI guard test fails the build on any unscoped query** - the load-bearing artifact.
- **Credential vault - envelope encryption:** each tenant's CJ key (and Shopify token) encrypted with a master key in Worker Secrets / **CF Secrets Store**; only ciphertext in D1. Decrypted **in-memory at scan time only**; never logged, never returned to the browser. `key_version` supports rotation. (Honest trust boundary: the Worker must decrypt to call CJ - inherent to any BYOC tool; mitigated by least-privilege, rotation, audit.)
- **Secure onboarding:** credentials enter over TLS via a guided in-app form (or a CLI for technical users); validated by a test call before storage.
- **Subscriber auth:** real signup/login (passwordless/magic-link or an auth provider); session → tenant binding; the tenant is **never** taken from a request parameter.
- **Audit log** of credential and data access (forensics + intrusion detection).
- **Parameterized `.bind()` only** · **log scrubbing** (tokens/PII) · per-tenant **quotas** (M2) · **CF edge** WAF/DDoS.

---

## 7. Supplier ToS - BYOC + partnership nod

**BYOC resolves the worst:** subscribers aren't sharing PawScout's account; each is a first-party CJ customer (clears §III.2 / §III.11 from PawScout's side).
**Residual (regardless of whose key):** CJ **§IX.3(1)** - *"utilize the platform's information content for any form of commercial purposes."* A **paid** service on CJ data still touches this. **Mitigations:** reference-only (no catalog warehousing/resale) + PawScout drives orders *to* CJ (business-aligned). **Prudent path: secure a CJ Partnership nod before charging (M2)** - BYOC + "we send you orders" makes that an easy ask. Each future supplier's ToS checked before integrating. *(Not legal advice.)*

**Also now in scope (you store others' data):** a privacy policy + a data-processing posture for subscribers (GDPR/CCPA data-subject + deletion), since PawScout holds subscriber credentials and workflow data.

---

## 8. Screens (Polaris-styled SaaS) - all 8 in MVP

1. **Signup / login + Onboarding** - create account; **connect supplier (CJ key, validated)**; add first store + niche (keywords/collections); set cadence + notifications.
2. **Portfolio overview** - the tenant's stores at a glance; counts; last/next run; store switcher.
3. **Matches / triage** - `IndexTable`: thumbnail · title · cost · margin · **popularity (basis)** · **supplier** · store tag · matched-keyword · **List in [supplier]** + **Dismiss**; bulk; tabs New/Listed/Dismissed.
4. **Store settings** - per store×supplier filters; tenant-global notifications.
5. **Run history** - time · store · supplier · trigger · scanned · new · status.
6. **Product detail** - variants, images, cost+margin, popularity, supplier/warehouse, deep link.
7. **Saved filter presets** - named profiles per store/supplier.
8. **Trends over time** - matches/listed/dismissed + popularity movement (needs §5 snapshot).

---

## 9. Errors & edge cases

| Area | Handling |
|---|---|
| **Bad/expired credential** | Validate on entry; on scan failure → run `error`, alert that tenant, surface in app, prompt re-connect |
| **Supplier down / rate-limited** | Retry w/ backoff; failed scan keeps last-good; live-fetch degrades to "details unavailable" |
| **Provider lacks capability** | Check `capabilities`, skip/fallback (no `trending` → `search`) |
| **Fan-out failure** | Per-tenant Queue message isolated; one tenant's failure doesn't block others; partial run logged |
| **Overlapping scans** | `ON CONFLICT DO NOTHING`; per-(tenant,store) run-lock |
| **Empty results** | No "0 new" email; "nothing new since X" |
| **Notification failure** | Logs + retries next cycle; never blocks scan |
| **Unsafe settings** | Validate; **≥1 keyword or collection** guardrail |
| **Secrets** | Envelope-encrypted; decrypted in-memory only; never logged/returned |

---

## 10. Stack summary

Cloudflare **Workers · Cron · Queues · D1 · KV · Secrets Store**, **CF edge** WAF · **TypeScript** · **Hono** · **Polaris** (UI) · subscriber **auth** (magic-link / provider) · **Resend** + optional web-push · **envelope encryption** for the vault. Its own repository. Shopify OAuth optional (auto-read collections).

---

## 11. Open questions / decisions for review

1. **Shopify connection model** - default is **BYOC manual token** (subscriber creates a custom app in their Shopify, pastes the token) so we avoid Shopify App Store review/OAuth. Alternative: a public **OAuth** app (smoother onboarding, but App Store review + mandatory GDPR webhooks). Confirm the default. *(Note: Shopify is optional for the core CJ loop - could be deferred entirely.)*
2. **Subscriber auth** choice - magic-link vs an auth provider (Clerk/WorkOS/Auth.js). 
3. **Billing** - confirmed deferred to M2 (private beta first)?
4. **CJ partnership** - when to approach CJ (recommended: before M2 commercialization).
5. **`listV2` params** verified with a live call (build step 0).
6. **Provider interface** - expect refinement at supplier #2.

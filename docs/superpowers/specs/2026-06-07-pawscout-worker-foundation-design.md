# PawScout Worker — Multi-Tenant Foundation (Plan 2a) — design

**Date:** 2026-06-07
**Status:** design (brainstormed, approved 2026-06-07)
**Companion docs:**
- `2026-06-07-pawscout-design.md` — the multi-tenant platform vision
- `2026-06-07-pawscout-search-trigger-design.md` — the search-trigger path (Plan 2b builds this on the 2a foundation)
- `2026-06-07-pawscout-timing-probe.md` (plan) + `pawscout-probe-report.json` — the validated latency numbers

---

## 1. Scope

**Plan 2a builds the multi-tenant BYOC foundation** the rest of PawScout sits on:
- A Cloudflare Worker skeleton.
- PawScout as **one public Shopify app**, installed per-shop via standard OAuth.
- D1 data model + an envelope-encrypted **credential vault** + a single-path **TenantStore** that enforces per-tenant isolation.
- A **minimal embedded onboarding console**: connect CJ key, map collections, set quality gates.

**Deliverable:** a merchant can install PawScout, connect their CJ key, map their collections, and configure quality gates — fully working, isolated, encrypted onboarding. *No search trigger or product creation yet.*

**Explicitly deferred to Plan 2b:** the App Proxy *endpoints*, the CJ `SupplierProvider`/search, the create pipeline, and the theme changes. (The App Proxy is *registered* on the app config in 2a; its routes land in 2b.)

**Decided during brainstorming (2026-06-07):**
- **Full multi-tenant BYOC from the start**, Active Paw as tenant #1.
- **Shopify connection = PawScout public app via OAuth** (one app, many installs) — *not* per-merchant Dev-Dashboard credentials. **BYOC narrows to the CJ key**, which is the credential the CJ ToS reasoning ([[cj-tos-byoc]]) actually depends on (each merchant's own CJ account/wallet).
- **The probe's client-credentials auth was Plan-1-only.** The production Worker uses standard per-shop OAuth, which is what App Proxy + embedded Polaris are built for. (See `shopify-custom-app-client-credentials` memory — that path was the probe's, not the Worker's.)

---

## 2. Architecture

**One public Shopify app + one shared Cloudflare Worker; tenancy keyed by shop domain.**

**Stack**
| Concern | Choice |
|---|---|
| Runtime | Cloudflare Workers |
| HTTP framework | **Hono** (TypeScript) |
| Shopify integration | **`@shopify/shopify-api`** (Workers-native; OAuth + webhook HMAC + Admin GraphQL client) |
| Embedded admin UI | **App Bridge + Polaris** (React), minimal onboarding screens only |
| Relational data | **D1** |
| Secrets (master key) | **CF Secrets** |
| Encryption | **WebCrypto `SubtleCrypto` (AES-GCM)** |
| Ephemeral state (2b) | **KV** (progressive-fill ready-state) |

**Approach choices made:** Hono + `@shopify/shopify-api` over `@shopify/shopify-app-remix` (Remix is heavier and a worse Workers fit for a mostly-backend app); **envelope encryption** over a single master key per record (per-tenant key isolation / rotation, small delta).

**Hard design rule (carried from brainstorming):** **PawScout is strictly additive to the theme.** The storefront must render and function fully with PawScout absent, uninstalled, or down. Nothing in 2a touches the theme; this rule binds 2b's theme changes.

---

## 3. Shopify app & OAuth install flow

**App configuration**
- **Scopes:** `write_products`, `read_products`, `write_publications`, `read_publications` (write implies read; these cover 2b's create/publish pipeline). Add fulfillment/order scopes only when the fulfillment module is built ([[pawscout-fulfillment]]).
- **App URL:** the Worker's embedded console route; **embedded = true**.
- **App Proxy:** registered (subpath prefix `apps`, subpath `pawscout` → the Worker); **endpoints implemented in 2b**.
- **Webhooks:** `app/uninstalled` (mandatory), plus Shopify's mandatory compliance webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) — answered minimally (PawScout stores no customer PII).
- **Distribution:** custom distribution initially (installed on Active Paw + pilot stores); App Store listing later.

**Install flow**
1. Merchant starts install → standard OAuth authorize redirect (state nonce, requested scopes).
2. OAuth callback → verify HMAC + state → exchange `code` for an **offline access token**.
3. Encrypt the token (vault, §5) → upsert `tenants` row → create default `tenant_config` → register webhooks.
4. Redirect into the embedded console.

**Session auth (console):** every embedded-console request carries an **App Bridge session token** (JWT). The Worker verifies it (signature + `dest` shop + expiry) and resolves the tenant; it exchanges/uses the stored offline token server-side for any Admin API call. The browser never receives the Admin token.

**Uninstall:** `app/uninstalled` → mark `tenants.status = 'uninstalled'`; per policy, purge `supplier_credentials` + the wrapped DEK so the CJ key cannot be recovered.

---

## 4. Data model (D1)

Every row is keyed by `shop`. **All access goes through TenantStore (§6).**

```sql
CREATE TABLE tenants (
  shop            TEXT PRIMARY KEY,           -- e.g. 4qkudm-ez.myshopify.com
  access_token_enc TEXT NOT NULL,             -- AES-GCM(offline Admin token, DEK)  [iv:ct base64]
  dek_wrapped     TEXT NOT NULL,              -- AES-GCM(per-tenant DEK, master KEK)
  scopes          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',  -- active | uninstalled
  installed_at    TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE supplier_credentials (
  shop        TEXT NOT NULL,
  supplier    TEXT NOT NULL,                  -- 'cj' (only supplier in 2a)
  api_key_enc TEXT NOT NULL,                  -- AES-GCM(CJ key, DEK) [iv:ct base64]
  label       TEXT,
  validated_at TEXT,                          -- set when a live CJ auth call succeeded
  created_at  TEXT NOT NULL,
  PRIMARY KEY (shop, supplier)
);

CREATE TABLE tenant_config (
  shop           TEXT PRIMARY KEY,
  collection_map TEXT NOT NULL DEFAULT '{}',  -- JSON: { "<category>": { "handle": "...", "tag": "cj-cat-..." } }
  gates          TEXT NOT NULL DEFAULT '{}',  -- JSON: { popularityFloor, priceMin, priceMax, relevance }
  target         INTEGER NOT NULL DEFAULT 16, -- grid target (4x4)
  updated_at     TEXT NOT NULL
);
```

`collection_map` for Active Paw is prefilled from the live TAG rules confirmed this session: `pet-cleaning→cj-cat-pet-cleaning`, `pet-accessories→cj-cat-pet-accessories`, `pet-health→cj-cat-pet-health`, `pet-toys→cj-cat-pet-toys`, fallback `more-to-love→cj-cat-more-to-love`.

---

## 5. Credential vault (envelope encryption)

BYOC CJ key **and** the Shopify offline token are encrypted at rest.

- **Master key (KEK):** a 256-bit key in **CF Secrets** (`PAWSCOUT_MASTER_KEY`), imported into WebCrypto at runtime. Never in D1, never logged.
- **Per-tenant data key (DEK):** generated at install — a random 256-bit AES-GCM key, **wrapped by the KEK** and stored in `tenants.dek_wrapped`.
- **Secrets:** each secret (CJ key, Shopify token) encrypted with the tenant DEK using AES-GCM with a fresh random 96-bit IV; stored as `base64(iv) || ':' || base64(ciphertext)`.
- **Module interface:** `vault.seal(shop, plaintext) → blob` and `vault.open(shop, blob) → plaintext`, internally unwrapping the DEK via the KEK. Decryption happens **only inside the Worker**.

**Invariants (verbatim security constraints):**
- Never expose the CJ key or the Shopify token to the browser or to theme JavaScript.
- BYOC credentials are uploaded over TLS, stored envelope-encrypted, **never logged**, **never returned to the browser**.
- A credential is stored only **after** a live validation call succeeds (§7).
- The master key (KEK) and every test KEK must be **exactly 32 bytes** (AES-256-GCM rejects other lengths).

**Hardening backlog (apply before production — surfaced by the 2a security review; greenfield, so no data migration cost):**
- **Master-key length pre-check** in `Vault.fromMasterKey` — fail with a clear error if the decoded key ≠ 32 bytes (rather than the opaque WebCrypto `DataError`).
- **AAD binding** — pass Additional Authenticated Data to AES-GCM so each ciphertext is cryptographically bound to its tenant context (`shop` for the DEK wrap, `shop:supplier` for a credential, `shop:token` for the Shopify token). This blocks cross-tenant ciphertext-transplant even if a row were mis-routed. Cheapest to add now, before any real tenant data exists; threads an `aad` arg through `seal`/`open` and their callers.

---

## 6. Tenant isolation (TenantStore)

- **TenantStore** is the **only** module that touches D1. It is constructed with a resolved `shop` and every method auto-injects `WHERE shop = ?` (and sets `shop` on writes). Consumers (OAuth handler, console routes, 2b pipeline) never see a raw `D1Database`.
- **CI guard:** a test scans `src/` for raw D1 access (`db.prepare`, `db.exec`, `.batch(`) outside `tenant-store.ts` and **fails the build** if found. This makes "forgot the tenant filter" structurally impossible to merge.
- Cross-tenant access attempts (a session for shop A requesting shop B's data) are rejected at the session-resolution layer, before TenantStore.

---

## 7. Embedded console (onboarding)

Minimal Polaris screens, all behind session-token auth:

1. **Home / status** — install state, whether CJ is connected, config completeness.
2. **Connect CJ** — paste the CJ API key → Worker calls CJ `getAccessToken` to **validate** → on success, `vault.seal` + store in `supplier_credentials` with `validated_at`; on failure, show the error and **store nothing**.
3. **Map collections** — fetch the shop's collections via Admin API; let the merchant map each supplier category → a collection handle + its smart-collection tag (`cj-cat-*`). Active Paw's mapping is prefilled.
4. **Gates** — form for `popularityFloor` (CJ `listedNum`), `priceMin`/`priceMax`, `relevance` strictness, with defaults (`listedNum ≥ 50`, price within the store's observed band, keyword-in-title relevance).

The console writes only through TenantStore; it never returns secrets to the client (it shows *"connected ✓"*, never the key).

---

## 8. Error handling

| Case | Handling |
|---|---|
| OAuth HMAC/state mismatch | Reject install; no token stored |
| Invalid CJ key | Validation call fails → surface error, store nothing |
| Admin token revoked (merchant uninstalled/re-auth) | Admin call returns 401 → mark tenant needing re-auth, prompt reinstall |
| D1 error | Fail the request; never partially write a tenant (use a transaction/batch for install) |
| Encryption error / missing master key | Hard fail at startup; never store plaintext as a fallback |
| Cross-tenant session | Reject at session resolution |

---

## 9. Testing

- **Unit:** vault `seal`/`open` round-trip (and that ciphertext ≠ plaintext, IV varies per call); TenantStore scoping (a query for shop A never returns shop B rows); OAuth callback (HMAC verify, token encrypt+store); config CRUD; CJ-key validation (mock CJ auth success/failure).
- **CI guard test:** the raw-D1-access scan (§6).
- **Integration:** full install flow against a Shopify dev store; console onboarding end-to-end (connect CJ → map → gates).
- Test runner + TS toolchain chosen in the implementation plan (likely Vitest + Wrangler for local D1/Workers).

---

## 10. Open decisions

1. **Console hosting** — serve Polaris assets from Workers static assets vs a separate Cloudflare Pages deployment. *Lean: Workers static assets to keep it one deploy.*
2. **Gating defaults** — exact `listedNum` floor and price band per category (merchant-tunable; defaults proposed in §7).
3. **DEK rotation policy** — out of scope for 2a; the wrapped-DEK design makes later rotation possible.
4. **Distribution** — custom distribution now; App Store listing (and Shopify-managed billing) later, which also interacts with the CJ-partnership question ([[cj-tos-byoc]]).

---

## 11. Relationship to other plans

- **2a is the prerequisite for 2b.** 2b adds: App Proxy endpoints (`search-signal`, `search-status`), the CJ `SupplierProvider` (listV2 search — confirmed to carry title/image/price/`listedNum`, so the hot path needs no per-product detail call), quality gating + dedup, the minimal-first create→publish→tag pipeline with async enrich, and the theme progressive-fill changes.
- The 2a `tenant_config.gates` and `collection_map` are exactly the inputs 2b's gating and tagging consume.
- Fulfillment ([[pawscout-fulfillment]]) is a separate, later module; its extra scopes are added to the app at that time, not now.

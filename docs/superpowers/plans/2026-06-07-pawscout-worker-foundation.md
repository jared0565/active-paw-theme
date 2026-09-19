# PawScout Worker - Multi-Tenant Foundation (Plan 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the PawScout Cloudflare Worker as a public Shopify app with per-shop OAuth, an envelope-encrypted credential vault, a single-path tenant-isolated D1 store, and a minimal embedded onboarding console (connect CJ key → map collections → set gates).

**Architecture:** One Hono Worker, tenancy keyed by shop domain. `@shopify/shopify-api` (cf-worker adapter) handles OAuth install/callback, App Proxy HMAC, and App-Bridge session-token verification. Secrets (the Shopify offline token + the BYOC CJ key) are sealed with WebCrypto AES-GCM under a per-tenant DEK wrapped by a master KEK from CF Secrets. All D1 access flows through a `TenantStore` that auto-scopes by shop; a CI guard test fails the build on any raw D1 access elsewhere.

**Tech Stack:** Cloudflare Workers, TypeScript, Hono, `@shopify/shopify-api`, D1, WebCrypto (`SubtleCrypto`), Vitest + `@cloudflare/vitest-pool-workers`, Wrangler. Embedded console = static HTML + App Bridge (CDN) + Polaris CSS (CDN).

---

## Scope notes (read first)

- **New repo.** Code lives in `f:\Projects\Shopify\pawscout-worker` - a *fresh git repository*, separate from the `demo-store2` theme repo. Unlike the Plan 1 probe, normal `git init` + commit steps apply here.
- **Console = minimal embedded page, not a React/Polaris SPA.** 2a delivers the secure backend + a functional embedded console (App Bridge session token → vanilla-JS forms → API). The richer Polaris React SPA is a deliberate later layer against the same stable API endpoints (YAGNI for the foundation). This is the one place this plan narrows the spec's "Polaris" - the *API contract* the SPA would need is fully built and tested here.
- **Deferred to Plan 2b** (not in this plan): App Proxy *route handlers*, the CJ `SupplierProvider`/search, the create pipeline, theme changes. The App Proxy is *declared* in the app config here; its routes 404 until 2b (safe - the theme is strictly additive).
- **Paths** below are relative to `f:\Projects\Shopify\pawscout-worker`.

---

## File Structure

| File | Responsibility | Tested |
|---|---|---|
| `package.json`, `wrangler.toml`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.dev.vars` | Project scaffold, bindings, local secrets | - |
| `migrations/0001_init.sql` | D1 schema: `tenants`, `supplier_credentials`, `tenant_config` | via store tests |
| `src/types.ts` | `Env` bindings + row/domain types | - |
| `src/vault.ts` | Envelope encryption: KEK→DEK, `seal`/`open` | `tests/vault.test.ts` |
| `src/tenant-store.ts` | **Only** D1 access path; auto-scopes by shop | `tests/tenant-store.test.ts` |
| `src/shopify.ts` | `shopifyApi()` init + cf-worker adapter | - (exercised by callback test) |
| `src/cj.ts` | Validate a CJ API key via live auth call | `tests/cj.test.ts` |
| `src/auth/install.ts` | OAuth begin | - (manual install test) |
| `src/auth/callback.ts` | OAuth callback → seal token, upsert tenant, seed config | `tests/callback.test.ts` |
| `src/auth/uninstall.ts` | `app/uninstalled` webhook → purge secrets | `tests/uninstall.test.ts` |
| `src/console/session.ts` | App-Bridge session-token verification → resolve shop | `tests/session.test.ts` |
| `src/console/routes.ts` | API: connect-cj, collections, gates (read/write config) | `tests/config.test.ts` |
| `src/console/page.ts` | Minimal embedded HTML console (App Bridge + forms) | - |
| `src/index.ts` | Hono app: wire routes, env | - (manual) |
| `tests/guard.test.ts` | CI guard: no raw D1 outside `tenant-store.ts` | self |

---

## Task 0: Project scaffold

**Files:** Create `package.json`, `wrangler.toml`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.dev.vars`.

- [ ] **Step 1: Create the project directory and init git**

```bash
mkdir -p f:/Projects/Shopify/pawscout-worker && cd f:/Projects/Shopify/pawscout-worker && git init
```

- [ ] **Step 2: `package.json`**

```json
{
  "name": "pawscout-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "migrate:local": "wrangler d1 migrations apply pawscout --local",
    "migrate:remote": "wrangler d1 migrations apply pawscout --remote"
  },
  "dependencies": {
    "@shopify/shopify-api": "^11.6.0",
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.90.0"
  }
}
```

Run `npm install`. (If a published version differs, take the latest in that major line; pin after install.)

- [ ] **Step 3: `wrangler.toml`** - D1 binding + the env vars/secrets the Worker reads.

```toml
name = "pawscout-worker"
main = "src/index.ts"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "pawscout"
database_id = "PLACEHOLDER_RUN_d1_create"   # replace with the id printed by `wrangler d1 create pawscout`
migrations_dir = "migrations"

[vars]
SHOPIFY_API_KEY = ""        # public app client id (safe to commit empty; set real value per-env)
SHOPIFY_APP_URL = "https://pawscout-worker.<your-subdomain>.workers.dev"
SHOPIFY_SCOPES = "write_products,read_products,write_publications,read_publications"
# SHOPIFY_API_SECRET and PAWSCOUT_MASTER_KEY are SECRETS (wrangler secret put), not vars.
```

- [ ] **Step 4: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "es2022",
    "moduleResolution": "bundler",
    "lib": ["es2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

Add `@cloudflare/workers-types` to devDependencies (`npm i -D @cloudflare/workers-types`).

- [ ] **Step 5: `vitest.config.ts`** (Workers pool so tests get a real `env.DB` with migrations applied)

```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          d1Databases: ['DB'],
          bindings: { PAWSCOUT_MASTER_KEY: btoa('test-master-key-32-bytes-long!!') } // 32-byte test KEK (base64)
        }
      }
    }
  }
});
```

- [ ] **Step 6: `.gitignore` and `.dev.vars`**

`.gitignore`:
```
node_modules/
.wrangler/
.dev.vars
dist/
```

`.dev.vars` (local secrets, gitignored - generate a real 32-byte key):
```
SHOPIFY_API_SECRET=replace_with_app_client_secret
PAWSCOUT_MASTER_KEY=replace_with_base64_of_32_random_bytes
```
Generate the master key: `node -e "console.log(crypto.randomBytes(32).toString('base64'))"`.

- [ ] **Step 7: D1 database id - local placeholder (real create deferred to Task 13)**

`wrangler d1 create` needs Cloudflare auth and is **not** required for Tasks 0-12: the vitest Workers pool and `wrangler dev --local` use a local in-memory D1 and ignore `database_id`. Leave the placeholder in `wrangler.toml` for now:
```toml
database_id = "local-dev-placeholder"
```
The real `npx wrangler d1 create pawscout` + pasting the printed id happens in **Task 13** (cloud), before deploy.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "chore: scaffold pawscout-worker (hono + d1 + vitest workers pool)"
```

---

## Task 1: D1 schema + types

**Files:** Create `migrations/0001_init.sql`, `src/types.ts`.

- [ ] **Step 1: `migrations/0001_init.sql`**

```sql
CREATE TABLE tenants (
  shop             TEXT PRIMARY KEY,
  access_token_enc TEXT NOT NULL,
  dek_wrapped      TEXT NOT NULL,
  scopes           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active',
  installed_at     TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE supplier_credentials (
  shop         TEXT NOT NULL,
  supplier     TEXT NOT NULL,
  api_key_enc  TEXT NOT NULL,
  label        TEXT,
  validated_at TEXT,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (shop, supplier)
);

CREATE TABLE tenant_config (
  shop           TEXT PRIMARY KEY,
  collection_map TEXT NOT NULL DEFAULT '{}',
  gates          TEXT NOT NULL DEFAULT '{}',
  target         INTEGER NOT NULL DEFAULT 16,
  updated_at     TEXT NOT NULL
);
```

- [ ] **Step 2: No command needed now - migrations are applied by the test harness**

The vitest Workers pool applies this migration automatically (`readD1Migrations('./migrations')` in `vitest.config.ts` → `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` in tests, wired in Task 3). So the SQL is validated the first time Task 3's tests run. `npm run migrate:local` (for manual `wrangler dev`) needs Cloudflare-free local D1 and is exercised in **Task 13**. Nothing to run here - just confirm the file saved.

- [ ] **Step 3: `src/types.ts`**

```ts
export interface Env {
  DB: D1Database;
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SHOPIFY_APP_URL: string;
  SHOPIFY_SCOPES: string;
  PAWSCOUT_MASTER_KEY: string; // base64, 32 bytes
}

export interface TenantRow {
  shop: string;
  access_token_enc: string;
  dek_wrapped: string;
  scopes: string;
  status: string;
  installed_at: string;
  updated_at: string;
}

export interface Gates {
  popularityFloor: number; // CJ listedNum
  priceMin: number;
  priceMax: number;
  relevance: 'loose' | 'title' | 'strict';
}

export interface TenantConfig {
  collectionMap: Record<string, { handle: string; tag: string }>;
  gates: Gates;
  target: number;
}

export const DEFAULT_GATES: Gates = { popularityFloor: 50, priceMin: 5, priceMax: 80, relevance: 'title' };

export const ACTIVE_PAW_COLLECTION_MAP: TenantConfig['collectionMap'] = {
  'pet-cleaning': { handle: 'pet-cleaning', tag: 'cj-cat-pet-cleaning' },
  'pet-accessories': { handle: 'pet-accessories', tag: 'cj-cat-pet-accessories' },
  'pet-health': { handle: 'pet-health', tag: 'cj-cat-pet-health' },
  'pet-toys': { handle: 'pet-toys', tag: 'cj-cat-pet-toys' },
  'more-to-love': { handle: 'more-to-love', tag: 'cj-cat-more-to-love' }
};
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: d1 schema + domain types"
```

---

## Task 2: Vault (envelope encryption) - TDD

**Files:** Create `src/vault.ts`, `tests/vault.test.ts`.

- [ ] **Step 1: Write the failing test** - `tests/vault.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Vault } from '../src/vault';

const KEK_B64 = btoa('test-master-key-32-bytes-long!!'); // 32 bytes

describe('Vault', () => {
  it('round-trips a secret under a fresh tenant DEK', async () => {
    const vault = await Vault.fromMasterKey(KEK_B64);
    const dekWrapped = await vault.newTenantDek();
    const blob = await vault.seal(dekWrapped, 'super-secret-cj-key');
    expect(blob).not.toContain('super-secret');
    expect(await vault.open(dekWrapped, blob)).toBe('super-secret-cj-key');
  });

  it('uses a fresh IV each seal (ciphertext differs for same input)', async () => {
    const vault = await Vault.fromMasterKey(KEK_B64);
    const dekWrapped = await vault.newTenantDek();
    const a = await vault.seal(dekWrapped, 'x');
    const b = await vault.seal(dekWrapped, 'x');
    expect(a).not.toBe(b);
  });

  it('cannot open a blob with a different tenant DEK', async () => {
    const vault = await Vault.fromMasterKey(KEK_B64);
    const dek1 = await vault.newTenantDek();
    const dek2 = await vault.newTenantDek();
    const blob = await vault.seal(dek1, 'secret');
    await expect(vault.open(dek2, blob)).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run - expect FAIL** (`npm test -- vault`) with "Cannot find module '../src/vault'".

- [ ] **Step 3: Implement `src/vault.ts`**

```ts
function b64e(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64d(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function aesGcmEncrypt(key: CryptoKey, plaintext: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return `${b64e(iv.buffer)}:${b64e(ct)}`;
}
async function aesGcmDecrypt(key: CryptoKey, blob: string): Promise<Uint8Array> {
  const [ivB64, ctB64] = blob.split(':');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(ivB64) }, key, b64d(ctB64));
  return new Uint8Array(pt);
}

export class Vault {
  private constructor(private readonly kek: CryptoKey) {}

  static async fromMasterKey(masterKeyB64: string): Promise<Vault> {
    const kek = await crypto.subtle.importKey('raw', b64d(masterKeyB64), 'AES-GCM', false, [
      'encrypt',
      'decrypt'
    ]);
    return new Vault(kek);
  }

  /** Generate a random per-tenant DEK, return it wrapped (encrypted) under the KEK. */
  async newTenantDek(): Promise<string> {
    const rawDek = crypto.getRandomValues(new Uint8Array(32));
    return aesGcmEncrypt(this.kek, rawDek);
  }

  private async unwrap(dekWrapped: string): Promise<CryptoKey> {
    const rawDek = await aesGcmDecrypt(this.kek, dekWrapped);
    return crypto.subtle.importKey('raw', rawDek, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  async seal(dekWrapped: string, plaintext: string): Promise<string> {
    const dek = await this.unwrap(dekWrapped);
    return aesGcmEncrypt(dek, new TextEncoder().encode(plaintext));
  }

  async open(dekWrapped: string, blob: string): Promise<string> {
    const dek = await this.unwrap(dekWrapped);
    return new TextDecoder().decode(await aesGcmDecrypt(dek, blob));
  }
}
```

- [ ] **Step 4: Run - expect PASS** (all 3 vault tests).

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: webcrypto envelope-encryption vault"`

---

## Task 3: TenantStore - TDD

**Files:** Create `src/tenant-store.ts`, `tests/tenant-store.test.ts`.

- [ ] **Step 1: Write the failing test** - `tests/tenant-store.test.ts` (uses the Workers pool `env.DB`)

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import { TenantStore } from '../src/tenant-store';

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe('TenantStore', () => {
  it('upserts and reads back a tenant scoped to its shop', async () => {
    const a = new TenantStore(env.DB, 'a.myshopify.com');
    await a.upsertTenant({ accessTokenEnc: 'tokA', dekWrapped: 'dekA', scopes: 's' });
    const row = await a.getTenant();
    expect(row?.shop).toBe('a.myshopify.com');
    expect(row?.access_token_enc).toBe('tokA');
  });

  it('never returns another shop\'s row', async () => {
    await new TenantStore(env.DB, 'a.myshopify.com').upsertTenant({ accessTokenEnc: 'tokA', dekWrapped: 'd', scopes: 's' });
    const b = new TenantStore(env.DB, 'b.myshopify.com');
    expect(await b.getTenant()).toBeNull();
  });

  it('reads/writes config scoped to shop', async () => {
    const a = new TenantStore(env.DB, 'a.myshopify.com');
    await a.upsertTenant({ accessTokenEnc: 't', dekWrapped: 'd', scopes: 's' });
    await a.seedConfig({ collectionMap: { x: { handle: 'x', tag: 'cj-cat-x' } }, gates: { popularityFloor: 10, priceMin: 1, priceMax: 9, relevance: 'title' }, target: 16 });
    const cfg = await a.getConfig();
    expect(cfg?.collectionMap.x.tag).toBe('cj-cat-x');
    expect(await new TenantStore(env.DB, 'b.myshopify.com').getConfig()).toBeNull();
  });

  it('stores and reads a supplier credential scoped to shop', async () => {
    const a = new TenantStore(env.DB, 'a.myshopify.com');
    await a.putSupplierCredential('cj', 'enc-blob', 'mykey');
    const c = await a.getSupplierCredential('cj');
    expect(c?.api_key_enc).toBe('enc-blob');
    expect(await new TenantStore(env.DB, 'b.myshopify.com').getSupplierCredential('cj')).toBeNull();
  });
});
```

Add the migrations binding to `vitest.config.ts` miniflare bindings so `env.TEST_MIGRATIONS` is available - append to Task 0 Step 5's config:
```ts
// inside miniflare: {...}
            bindings: {
              PAWSCOUT_MASTER_KEY: btoa('test-master-key-32-bytes-long!!')
            },
// and read migrations for applyD1Migrations:
```
Then add a `tests/apply-migrations.ts` setup or use the documented `readD1Migrations`. Concretely, at the top of `vitest.config.ts`:
```ts
import { readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
const migrations = await readD1Migrations('./migrations');
// then in miniflare.bindings add: TEST_MIGRATIONS: migrations
```

- [ ] **Step 2: Run - expect FAIL** (`npm test -- tenant-store`) with "Cannot find module '../src/tenant-store'".

- [ ] **Step 3: Implement `src/tenant-store.ts`** - the ONLY file allowed to touch D1.

```ts
import type { TenantRow, TenantConfig } from './types';

interface SupplierCredRow {
  shop: string; supplier: string; api_key_enc: string; label: string | null; validated_at: string | null; created_at: string;
}

export class TenantStore {
  constructor(private readonly db: D1Database, readonly shop: string) {}

  async upsertTenant(t: { accessTokenEnc: string; dekWrapped: string; scopes: string }): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO tenants (shop, access_token_enc, dek_wrapped, scopes, status, installed_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)
         ON CONFLICT(shop) DO UPDATE SET
           access_token_enc = ?2, dek_wrapped = ?3, scopes = ?4, status = 'active', updated_at = ?5`
      )
      .bind(this.shop, t.accessTokenEnc, t.dekWrapped, t.scopes, now)
      .run();
  }

  getTenant(): Promise<TenantRow | null> {
    return this.db.prepare(`SELECT * FROM tenants WHERE shop = ?1`).bind(this.shop).first<TenantRow>();
  }

  async setStatus(status: string): Promise<void> {
    await this.db.prepare(`UPDATE tenants SET status = ?2, updated_at = ?3 WHERE shop = ?1`)
      .bind(this.shop, status, new Date().toISOString()).run();
  }

  async seedConfig(cfg: TenantConfig): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO tenant_config (shop, collection_map, gates, target, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(shop) DO UPDATE SET collection_map = ?2, gates = ?3, target = ?4, updated_at = ?5`
      )
      .bind(this.shop, JSON.stringify(cfg.collectionMap), JSON.stringify(cfg.gates), cfg.target, new Date().toISOString())
      .run();
  }

  async getConfig(): Promise<TenantConfig | null> {
    const row = await this.db
      .prepare(`SELECT collection_map, gates, target FROM tenant_config WHERE shop = ?1`)
      .bind(this.shop)
      .first<{ collection_map: string; gates: string; target: number }>();
    if (!row) return null;
    return { collectionMap: JSON.parse(row.collection_map), gates: JSON.parse(row.gates), target: row.target };
  }

  async putSupplierCredential(supplier: string, apiKeyEnc: string, label: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO supplier_credentials (shop, supplier, api_key_enc, label, validated_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(shop, supplier) DO UPDATE SET api_key_enc = ?3, label = ?4, validated_at = ?5`
      )
      .bind(this.shop, supplier, apiKeyEnc, label, now)
      .run();
  }

  getSupplierCredential(supplier: string): Promise<SupplierCredRow | null> {
    return this.db
      .prepare(`SELECT * FROM supplier_credentials WHERE shop = ?1 AND supplier = ?2`)
      .bind(this.shop, supplier)
      .first<SupplierCredRow>();
  }

  async deleteAllSecrets(): Promise<void> {
    await this.db.batch([
      this.db.prepare(`DELETE FROM supplier_credentials WHERE shop = ?1`).bind(this.shop),
      this.db.prepare(`UPDATE tenants SET access_token_enc = '', dek_wrapped = '' WHERE shop = ?1`).bind(this.shop)
    ]);
  }
}
```

- [ ] **Step 4: Run - expect PASS** (all 4 tenant-store tests).

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: tenant-isolated D1 store"`

---

## Task 4: CI guard - no raw D1 outside TenantStore - TDD

**Files:** Create `tests/guard.test.ts`.

- [ ] **Step 1: Write the test** - `tests/guard.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('tenant isolation guard', () => {
  it('only tenant-store.ts touches D1 directly', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      if (file.endsWith('tenant-store.ts')) continue;
      const src = readFileSync(file, 'utf8');
      if (/\.(prepare|exec|batch)\s*\(/.test(src) || /\bDB\b\s*\.\s*(prepare|exec|batch)/.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders, `raw D1 access outside tenant-store.ts: ${offenders.join(', ')}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run - expect PASS** (only `tenant-store.ts` uses `.prepare(`, and it's excluded). `npm test -- guard`.

- [ ] **Step 3: Commit** `git add -A && git commit -m "test: CI guard against unscoped D1 access"`

---

## Task 5: Shopify API init (cf-worker adapter)

**Files:** Create `src/shopify.ts`.

- [ ] **Step 1: Implement `src/shopify.ts`**

```ts
import '@shopify/shopify-api/adapters/cf-worker';
import { shopifyApi, LATEST_API_VERSION, LogSeverity } from '@shopify/shopify-api';
import type { Env } from './types';

export function makeShopify(env: Env) {
  const appUrl = new URL(env.SHOPIFY_APP_URL);
  return shopifyApi({
    apiKey: env.SHOPIFY_API_KEY,
    apiSecretKey: env.SHOPIFY_API_SECRET,
    scopes: env.SHOPIFY_SCOPES.split(','),
    hostName: appUrl.host,
    hostScheme: 'https',
    apiVersion: LATEST_API_VERSION,
    isEmbeddedApp: true,
    logger: { level: LogSeverity.Warning }
  });
}

export type ShopifyApp = ReturnType<typeof makeShopify>;
```

- [ ] **Step 2: Typecheck** `npx tsc --noEmit` → expect no errors. (No unit test; exercised by Task 8's callback test and the live install.)

- [ ] **Step 3: Commit** `git add -A && git commit -m "feat: shopify-api init with cf-worker adapter"`

---

## Task 6: CJ key validation - TDD

**Files:** Create `src/cj.ts`, `tests/cj.test.ts`.

- [ ] **Step 1: Write the failing test** - `tests/cj.test.ts` (inject the fetch so no live call in tests)

```ts
import { describe, it, expect } from 'vitest';
import { validateCjKey } from '../src/cj';

describe('validateCjKey', () => {
  it('returns ok when CJ auth succeeds', async () => {
    const fakeFetch = async () => new Response(JSON.stringify({ result: true, data: { accessToken: 'tok' } }), { status: 200 });
    expect(await validateCjKey('CJemail@api@token', fakeFetch as typeof fetch)).toEqual({ ok: true });
  });

  it('returns an error when CJ rejects the key', async () => {
    const fakeFetch = async () => new Response(JSON.stringify({ result: false, message: 'bad key' }), { status: 200 });
    const r = await validateCjKey('bad', fakeFetch as typeof fetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('bad key');
  });

  it('returns an error on a non-200', async () => {
    const fakeFetch = async () => new Response('nope', { status: 500 });
    expect((await validateCjKey('x', fakeFetch as typeof fetch)).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run - expect FAIL** (`npm test -- cj`) with "Cannot find module '../src/cj'".

- [ ] **Step 3: Implement `src/cj.ts`**

```ts
const CJ_AUTH_URL = 'https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken';

export type ValidateResult = { ok: true } | { ok: false; error: string };

export async function validateCjKey(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<ValidateResult> {
  try {
    const resp = await fetchImpl(CJ_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey })
    });
    if (!resp.ok) return { ok: false, error: `CJ auth HTTP ${resp.status}` };
    const data = (await resp.json()) as { result?: boolean; message?: string };
    return data.result ? { ok: true } : { ok: false, error: data.message || 'CJ rejected the key' };
  } catch (e) {
    return { ok: false, error: `CJ auth failed: ${(e as Error).message}` };
  }
}
```

- [ ] **Step 4: Run - expect PASS** (all 3 cj tests).

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: CJ key validation"`

---

## Task 7: OAuth install begin

**Files:** Create `src/auth/install.ts`.

- [ ] **Step 1: Implement `src/auth/install.ts`**

```ts
import type { ShopifyApp } from '../shopify';

/** GET /auth?shop=foo.myshopify.com → 302 to Shopify OAuth consent. Returns a Response. */
export async function beginAuth(shopify: ShopifyApp, request: Request): Promise<Response> {
  const shop = shopify.utils.sanitizeShop(new URL(request.url).searchParams.get('shop') ?? '', true);
  if (!shop) return new Response('Missing or invalid ?shop', { status: 400 });
  return shopify.auth.begin({ shop, callbackPath: '/auth/callback', isOnline: false, rawRequest: request });
}
```

- [ ] **Step 2: Typecheck** `npx tsc --noEmit` → no errors. (Validated end-to-end by the live install in Task 13.)

- [ ] **Step 3: Commit** `git add -A && git commit -m "feat: oauth install begin"`

---

## Task 8: OAuth callback → seal token, upsert tenant, seed config - TDD

**Files:** Create `src/auth/callback.ts`, `tests/callback.test.ts`.

- [ ] **Step 1: Write the failing test** - `tests/callback.test.ts`. We test the *persistence* logic (`persistInstall`) with a fake session, not the Shopify HMAC exchange (that's library-owned and covered by the live test).

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import { persistInstall } from '../src/auth/callback';
import { Vault } from '../src/vault';
import { TenantStore } from '../src/tenant-store';

beforeEach(async () => { await applyD1Migrations(env.DB, env.TEST_MIGRATIONS); });

describe('persistInstall', () => {
  it('seals the access token, upserts the tenant, and seeds default config', async () => {
    const vault = await Vault.fromMasterKey(env.PAWSCOUT_MASTER_KEY);
    await persistInstall(env.DB, vault, { shop: 'a.myshopify.com', accessToken: 'shpat_live', scope: 'write_products' });

    const store = new TenantStore(env.DB, 'a.myshopify.com');
    const tenant = await store.getTenant();
    expect(tenant?.access_token_enc).not.toContain('shpat_live'); // sealed, not plaintext
    expect(await vault.open(tenant!.dek_wrapped, tenant!.access_token_enc)).toBe('shpat_live');

    const cfg = await store.getConfig();
    expect(cfg?.gates.popularityFloor).toBe(50); // DEFAULT_GATES
  });
});
```

- [ ] **Step 2: Run - expect FAIL** (`npm test -- callback`) with "Cannot find module '../src/auth/callback'".

- [ ] **Step 3: Implement `src/auth/callback.ts`**

```ts
import type { ShopifyApp } from '../shopify';
import { Vault } from '../vault';
import { TenantStore } from '../tenant-store';
import { DEFAULT_GATES, ACTIVE_PAW_COLLECTION_MAP, type TenantConfig } from '../types';

/** Pure-ish persistence: seal token, upsert tenant, seed config. Unit-tested. */
export async function persistInstall(
  db: D1Database,
  vault: Vault,
  session: { shop: string; accessToken: string; scope: string }
): Promise<void> {
  const dekWrapped = await vault.newTenantDek();
  const accessTokenEnc = await vault.seal(dekWrapped, session.accessToken);
  const store = new TenantStore(db, session.shop);
  await store.upsertTenant({ accessTokenEnc, dekWrapped, scopes: session.scope });

  // Seed config only if absent (don't clobber a reinstall's settings).
  if (!(await store.getConfig())) {
    const isActivePaw = session.shop.startsWith('4qkudm-ez.');
    const cfg: TenantConfig = {
      collectionMap: isActivePaw ? ACTIVE_PAW_COLLECTION_MAP : {},
      gates: DEFAULT_GATES,
      target: 16
    };
    await store.seedConfig(cfg);
  }
}

/** GET /auth/callback - completes OAuth, persists, redirects into the embedded app. Returns a Response. */
export async function handleCallback(shopify: ShopifyApp, db: D1Database, vault: Vault, request: Request): Promise<Response> {
  const { session, headers } = await shopify.auth.callback<Headers>({ rawRequest: request });
  if (!session.accessToken) return new Response('No access token from OAuth', { status: 400 });
  await persistInstall(db, vault, { shop: session.shop, accessToken: session.accessToken, scope: session.scope ?? '' });
  // Register the uninstall webhook (best-effort; safe to re-register).
  // (Webhook registration call omitted here for brevity - see Task 9 note.)
  const host = new URL(request.url).searchParams.get('host') ?? '';
  const redirect = `/app?shop=${encodeURIComponent(session.shop)}&host=${encodeURIComponent(host)}`;
  return new Response('', { status: 302, headers: [...(headers as unknown as [string, string][]), ['Location', redirect]] });
}
```

- [ ] **Step 4: Run - expect PASS** (the `persistInstall` test).

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: oauth callback persists sealed token + seeds config"`

---

## Task 9: Uninstall webhook → purge secrets - TDD

**Files:** Create `src/auth/uninstall.ts`, `tests/uninstall.test.ts`.

- [ ] **Step 1: Write the failing test** - `tests/uninstall.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import { handleUninstall } from '../src/auth/uninstall';
import { TenantStore } from '../src/tenant-store';

beforeEach(async () => { await applyD1Migrations(env.DB, env.TEST_MIGRATIONS); });

describe('handleUninstall', () => {
  it('marks the tenant uninstalled and purges secrets', async () => {
    const store = new TenantStore(env.DB, 'a.myshopify.com');
    await store.upsertTenant({ accessTokenEnc: 'enc', dekWrapped: 'dek', scopes: 's' });
    await store.putSupplierCredential('cj', 'cjenc', 'k');

    await handleUninstall(env.DB, 'a.myshopify.com');

    const t = await store.getTenant();
    expect(t?.status).toBe('uninstalled');
    expect(t?.access_token_enc).toBe('');
    expect(await store.getSupplierCredential('cj')).toBeNull();
  });
});
```

- [ ] **Step 2: Run - expect FAIL** (`npm test -- uninstall`).

- [ ] **Step 3: Implement `src/auth/uninstall.ts`**

```ts
import { TenantStore } from '../tenant-store';

export async function handleUninstall(db: D1Database, shop: string): Promise<void> {
  const store = new TenantStore(db, shop);
  await store.setStatus('uninstalled');
  await store.deleteAllSecrets();
}
```

(The HTTP webhook route - verifying the `app/uninstalled` HMAC via `shopify.webhooks.validate` and calling `handleUninstall(env.DB, shop)` - is wired in `src/index.ts`, Task 12.)

- [ ] **Step 4: Run - expect PASS.**

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: uninstall webhook purges tenant secrets"`

---

## Task 10: Console session-token middleware - TDD

**Files:** Create `src/console/session.ts`, `tests/session.test.ts`.

- [ ] **Step 1: Write the failing test** - `tests/session.test.ts`. Inject a fake decoder so we test *our* resolution logic, not the library's JWT crypto.

```ts
import { describe, it, expect } from 'vitest';
import { resolveShopFromToken } from '../src/console/session';

describe('resolveShopFromToken', () => {
  it('extracts the shop host from a decoded session token', async () => {
    const decode = async () => ({ dest: 'https://a.myshopify.com', aud: 'apikey' });
    expect(await resolveShopFromToken('Bearer x', 'apikey', decode)).toEqual({ ok: true, shop: 'a.myshopify.com' });
  });

  it('rejects a missing bearer token', async () => {
    const decode = async () => ({ dest: 'https://a.myshopify.com' });
    expect((await resolveShopFromToken(null, 'apikey', decode)).ok).toBe(false);
  });

  it('rejects an audience mismatch', async () => {
    const decode = async () => ({ dest: 'https://a.myshopify.com', aud: 'someone-else' });
    expect((await resolveShopFromToken('Bearer x', 'apikey', decode)).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run - expect FAIL** (`npm test -- session`).

- [ ] **Step 3: Implement `src/console/session.ts`**

```ts
type Decoded = { dest?: string; aud?: string };
export type ResolveResult = { ok: true; shop: string } | { ok: false; status: number; error: string };

/** Verify+decode handled by the injected `decode` (shopify.session.decodeSessionToken in prod). */
export async function resolveShopFromToken(
  authHeader: string | null,
  apiKey: string,
  decode: (token: string) => Promise<Decoded>
): Promise<ResolveResult> {
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Missing bearer token' };
  let payload: Decoded;
  try {
    payload = await decode(authHeader.slice('Bearer '.length));
  } catch (e) {
    return { ok: false, status: 401, error: `Invalid session token: ${(e as Error).message}` };
  }
  if (payload.aud && payload.aud !== apiKey) return { ok: false, status: 401, error: 'Audience mismatch' };
  const dest = payload.dest ?? '';
  const shop = dest.replace(/^https?:\/\//, '');
  if (!shop.endsWith('.myshopify.com')) return { ok: false, status: 401, error: 'Bad shop in token' };
  return { ok: true, shop };
}
```

- [ ] **Step 4: Run - expect PASS.**

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: session-token shop resolution"`

---

## Task 11: Console API routes (connect-cj, collections, gates) - TDD

**Files:** Create `src/console/routes.ts`, `tests/config.test.ts`.

These are Hono routes mounted under `/api`. Each resolves the shop (Task 10), then uses TenantStore + Vault. We TDD the **handlers** with injected deps; the live install test exercises the real session token.

- [ ] **Step 1: Write the failing test** - `tests/config.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import { connectCj, saveGates, getStatus } from '../src/console/routes';
import { Vault } from '../src/vault';
import { TenantStore } from '../src/tenant-store';

beforeEach(async () => { await applyD1Migrations(env.DB, env.TEST_MIGRATIONS); });

async function seedTenant(shop: string) {
  const vault = await Vault.fromMasterKey(env.PAWSCOUT_MASTER_KEY);
  const dek = await vault.newTenantDek();
  await new TenantStore(env.DB, shop).upsertTenant({ accessTokenEnc: await vault.seal(dek, 't'), dekWrapped: dek, scopes: 's' });
  await new TenantStore(env.DB, shop).seedConfig({ collectionMap: {}, gates: { popularityFloor: 50, priceMin: 5, priceMax: 80, relevance: 'title' }, target: 16 });
  return vault;
}

describe('console handlers', () => {
  it('connectCj validates then stores a sealed credential (never plaintext)', async () => {
    const vault = await seedTenant('a.myshopify.com');
    const okValidate = async () => ({ ok: true as const });
    const res = await connectCj(env.DB, vault, 'a.myshopify.com', 'CJkey@api@tok', okValidate);
    expect(res.ok).toBe(true);
    const cred = await new TenantStore(env.DB, 'a.myshopify.com').getSupplierCredential('cj');
    expect(cred?.api_key_enc).not.toContain('CJkey');
    expect(await vault.open((await new TenantStore(env.DB, 'a.myshopify.com').getTenant())!.dek_wrapped, cred!.api_key_enc)).toBe('CJkey@api@tok');
  });

  it('connectCj stores nothing when validation fails', async () => {
    const vault = await seedTenant('a.myshopify.com');
    const badValidate = async () => ({ ok: false as const, error: 'bad' });
    const res = await connectCj(env.DB, vault, 'a.myshopify.com', 'bad', badValidate);
    expect(res.ok).toBe(false);
    expect(await new TenantStore(env.DB, 'a.myshopify.com').getSupplierCredential('cj')).toBeNull();
  });

  it('saveGates persists gates and getStatus reports connection without leaking secrets', async () => {
    const vault = await seedTenant('a.myshopify.com');
    await saveGates(env.DB, 'a.myshopify.com', { popularityFloor: 99, priceMin: 2, priceMax: 40, relevance: 'strict' });
    const okValidate = async () => ({ ok: true as const });
    await connectCj(env.DB, vault, 'a.myshopify.com', 'CJk@api@t', okValidate);
    const status = await getStatus(env.DB, 'a.myshopify.com');
    expect(status.cjConnected).toBe(true);
    expect(status.gates.popularityFloor).toBe(99);
    expect(JSON.stringify(status)).not.toContain('CJk@api@t'); // no secret in status payload
  });
});
```

- [ ] **Step 2: Run - expect FAIL** (`npm test -- config`).

- [ ] **Step 3: Implement `src/console/routes.ts`**

```ts
import { Vault } from '../vault';
import { TenantStore } from '../tenant-store';
import type { Gates } from '../types';
import type { ValidateResult } from '../cj';

export async function connectCj(
  db: D1Database, vault: Vault, shop: string, apiKey: string,
  validate: (key: string) => Promise<ValidateResult>
): Promise<{ ok: boolean; error?: string }> {
  const v = await validate(apiKey);
  if (!v.ok) return { ok: false, error: v.error };
  const store = new TenantStore(db, shop);
  const tenant = await store.getTenant();
  if (!tenant) return { ok: false, error: 'Unknown shop' };
  const sealed = await vault.seal(tenant.dek_wrapped, apiKey);
  await store.putSupplierCredential('cj', sealed, 'cj');
  return { ok: true };
}

export async function saveGates(db: D1Database, shop: string, gates: Gates): Promise<void> {
  const store = new TenantStore(db, shop);
  const cfg = await store.getConfig();
  if (!cfg) return;
  await store.seedConfig({ ...cfg, gates });
}

export async function saveCollectionMap(db: D1Database, shop: string, map: Record<string, { handle: string; tag: string }>): Promise<void> {
  const store = new TenantStore(db, shop);
  const cfg = await store.getConfig();
  if (!cfg) return;
  await store.seedConfig({ ...cfg, collectionMap: map });
}

export async function getStatus(db: D1Database, shop: string): Promise<{ cjConnected: boolean; collectionMap: Record<string, { handle: string; tag: string }>; gates: Gates; target: number }> {
  const store = new TenantStore(db, shop);
  const cfg = await store.getConfig();
  const cred = await store.getSupplierCredential('cj');
  return {
    cjConnected: !!cred,
    collectionMap: cfg?.collectionMap ?? {},
    gates: cfg?.gates ?? { popularityFloor: 50, priceMin: 5, priceMax: 80, relevance: 'title' },
    target: cfg?.target ?? 16
  };
}
```

- [ ] **Step 4: Run - expect PASS** (all 3 config tests).

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: console API handlers (connect-cj, gates, collections, status)"`

---

## Task 12: Embedded console page + Hono wiring

**Files:** Create `src/console/page.ts`, `src/index.ts`.

- [ ] **Step 1: Implement `src/console/page.ts`** (minimal embedded HTML; App Bridge from CDN; forms call `/api/*` with the session token)

```ts
export function consolePage(apiKey: string, host: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.shopify.com/static/polaris/polaris.min.css">
<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key="${apiKey}"></script>
</head><body style="font-family:sans-serif;padding:1rem;max-width:640px">
<h1>PawScout</h1>
<section><h2>1. Connect CJ</h2>
  <input id="cj" placeholder="CJ API key" style="width:100%"><button onclick="connectCj()">Connect</button>
  <p id="cjstatus"></p></section>
<section><h2>2. Quality gates</h2>
  <label>Popularity floor <input id="pf" type="number" value="50"></label>
  <button onclick="saveGates()">Save gates</button></section>
<pre id="status"></pre>
<script>
const host=${JSON.stringify(host)};
async function token(){ const ab=window['app-bridge']; const app=ab.createApp({apiKey:${JSON.stringify(apiKey)},host}); return await ab.actions.SessionToken.getToken(app); }
async function api(path,body){ const t=await token(); const r=await fetch('/api'+path,{method:'POST',headers:{'Authorization':'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(body||{})}); return r.json(); }
async function refresh(){ const s=await api('/status'); document.getElementById('status').textContent=JSON.stringify(s,null,2); document.getElementById('cjstatus').textContent=s.cjConnected?'Connected ✓':'Not connected'; }
async function connectCj(){ const r=await api('/connect-cj',{apiKey:document.getElementById('cj').value}); if(!r.ok)alert(r.error); refresh(); }
async function saveGates(){ await api('/gates',{popularityFloor:Number(document.getElementById('pf').value),priceMin:5,priceMax:80,relevance:'title'}); refresh(); }
refresh();
</script></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
```
*(App Bridge global/API names can shift between versions - confirm the exact `getToken`/`createApp` calls against the App Bridge version the CDN serves during the live test in Task 13; the server contract the page depends on is fully tested in Tasks 10-11.)*

**Subresource Integrity note:** the two CDN assets above are loaded **without** SRI deliberately. Shopify's `app-bridge.js` is **evergreen and must be loaded unpinned** - an `integrity` hash breaks it the moment Shopify ships an update (this is Shopify's own guidance), so do **not** add SRI to it. For the Polaris stylesheet, either (a) pin a **versioned** Polaris CSS URL and add `integrity="sha384-…" crossorigin="anonymous"`, or (b) **self-host** the CSS from the Worker's static assets (preferred - removes the third-party CDN dependency entirely). Apply SRI/self-hosting to any *pinnable* third-party asset; App Bridge is the one deliberate exception.

- [ ] **Step 2: Implement `src/index.ts`** (Hono app wiring everything)

```ts
import { Hono } from 'hono';
import type { Env } from './types';
import { makeShopify } from './shopify';
import { Vault } from './vault';
import { beginAuth } from './auth/install';
import { handleCallback } from './auth/callback';
import { handleUninstall } from './auth/uninstall';
import { resolveShopFromToken } from './console/session';
import { connectCj, saveGates, saveCollectionMap, getStatus } from './console/routes';
import { consolePage } from './console/page';
import { validateCjKey } from './cj';

const app = new Hono<{ Bindings: Env }>();

app.get('/auth', (c) => beginAuth(makeShopify(c.env), c.req.raw));

app.get('/auth/callback', async (c) => {
  const vault = await Vault.fromMasterKey(c.env.PAWSCOUT_MASTER_KEY);
  return handleCallback(makeShopify(c.env), c.env.DB, vault, c.req.raw);
});

app.get('/app', (c) => consolePage(c.env.SHOPIFY_API_KEY, c.req.query('host') ?? ''));

// --- /api/* : session-token authed ---
async function shopOf(c: any): Promise<string | Response> {
  const shopify = makeShopify(c.env);
  const r = await resolveShopFromToken(c.req.header('Authorization') ?? null, c.env.SHOPIFY_API_KEY, (t) => shopify.session.decodeSessionToken(t));
  if (!r.ok) return c.json({ ok: false, error: r.error }, r.status);
  return r.shop;
}

app.post('/api/status', async (c) => { const s = await shopOf(c); if (typeof s !== 'string') return s; return c.json(await getStatus(c.env.DB, s)); });
app.post('/api/connect-cj', async (c) => {
  const s = await shopOf(c); if (typeof s !== 'string') return s;
  const { apiKey } = await c.req.json<{ apiKey: string }>();
  const vault = await Vault.fromMasterKey(c.env.PAWSCOUT_MASTER_KEY);
  return c.json(await connectCj(c.env.DB, vault, s, apiKey, (k) => validateCjKey(k)));
});
app.post('/api/gates', async (c) => { const s = await shopOf(c); if (typeof s !== 'string') return s; await saveGates(c.env.DB, s, await c.req.json()); return c.json({ ok: true }); });
app.post('/api/collections', async (c) => { const s = await shopOf(c); if (typeof s !== 'string') return s; await saveCollectionMap(c.env.DB, s, await c.req.json()); return c.json({ ok: true }); });

// --- uninstall webhook ---
app.post('/webhooks/uninstall', async (c) => {
  const shopify = makeShopify(c.env);
  const body = await c.req.text();
  const valid = await shopify.webhooks.validate({ rawBody: body, rawRequest: c.req.raw });
  if (!valid.valid) return c.text('invalid', 401);
  const shop = c.req.header('X-Shopify-Shop-Domain') ?? '';
  await handleUninstall(c.env.DB, shop);
  return c.text('ok');
});

export default app;
```

- [ ] **Step 3: Typecheck + full test run**

```bash
npx tsc --noEmit && npm test
```
Expected: tsc clean; all unit tests (vault, tenant-store, guard, cj, callback, uninstall, session, config) PASS.

- [ ] **Step 4: Commit** `git add -A && git commit -m "feat: embedded console page + hono app wiring"`

---

## Task 13: Live install verification (the deliverable)

**Files:** none (configuration + manual run).

- [ ] **Step 1: Create the public Shopify app**

In the **Shopify Partners** dashboard (or Dev Dashboard) create a **public app** `PawScout`. Set: App URL `https://<worker-url>/app`, Allowed redirect URL `https://<worker-url>/auth/callback`, App Proxy subpath `apps/pawscout` → `https://<worker-url>/proxy` (routes land in 2b), scopes `write_products,read_products,write_publications,read_publications`, `app/uninstalled` webhook → `https://<worker-url>/webhooks/uninstall`. Copy the **client id** → `SHOPIFY_API_KEY` (var) and **client secret** → secret.

- [ ] **Step 2: Set secrets + deploy**

```bash
npx wrangler secret put SHOPIFY_API_SECRET
npx wrangler secret put PAWSCOUT_MASTER_KEY   # the base64 32-byte key
npm run migrate:remote
npm run deploy
```

- [ ] **Step 3: Install on Active Paw**

Visit `https://<worker-url>/auth?shop=4qkudm-ez.myshopify.com` → approve OAuth → lands in the embedded console.
Verify: D1 `tenants` row exists for the shop with a non-empty sealed `access_token_enc` (never plaintext); `tenant_config` seeded with the Active Paw collection map + default gates.

- [ ] **Step 4: Onboard**

In the console: paste the Active Paw CJ key → "Connect" → status flips to **Connected ✓** (and `supplier_credentials` holds a sealed blob, never the raw key); set a gate value → Save → reload shows it persisted.

- [ ] **Step 5: Confirm isolation + teardown safety**

Confirm the status payload never contains the CJ key or the Shopify token. Uninstall the app from the store admin → confirm the `app/uninstalled` webhook fired and `supplier_credentials` for the shop is gone and `tenants.status='uninstalled'`.

- [ ] **Step 6: Commit any config notes**

```bash
git add -A && git commit -m "docs: live install runbook + env notes"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** §2 stack → Task 0/5; §3 OAuth/app config → Tasks 5,7,8,13; §4 D1 schema → Task 1; §5 vault → Task 2; §6 TenantStore + CI guard → Tasks 3,4; §7 console (connect-cj/collections/gates) → Tasks 11,12; §8 error handling → covered in callback (no token→400), cj (validation fails→store nothing), uninstall, session (401s); §9 testing → every TDD task + Task 13 integration. **Deviation flagged:** §7's "Polaris" is delivered as a minimal embedded page (scope note up top), with the full API contract built+tested so a React/Polaris SPA can replace the page later with zero backend change.
- **Placeholder scan:** The only intentional placeholders are the `database_id` (filled by `wrangler d1 create` in Task 0/7) and the deployed Worker URL (filled at Task 13) - both are values that can only exist after a real resource is created, and each is clearly marked. Two "confirm against live version" notes (App Bridge call names; latest dep versions) are real verification steps, not vague requirements.
- **Type consistency:** `Vault.fromMasterKey`, `vault.newTenantDek/seal/open`, `TenantStore` method names (`upsertTenant`, `getTenant`, `seedConfig`, `getConfig`, `putSupplierCredential`, `getSupplierCredential`, `setStatus`, `deleteAllSecrets`), `persistInstall`, `resolveShopFromToken`, `connectCj/saveGates/saveCollectionMap/getStatus`, `validateCjKey`, and the `Gates`/`TenantConfig`/`Env` types are used identically across every task and test.
- **Proportional testing:** TDD covers the security-critical, logic-bearing units (vault crypto round-trip, tenant scoping, install persistence, uninstall purge, session resolution, config handlers, the isolation guard). Library-owned crypto (Shopify OAuth HMAC exchange, JWT verification) and the HTML page are validated by the Task 13 live install rather than mocked.

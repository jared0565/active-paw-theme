/* Independence run: does the live theme stay complete when PawScout is unreachable?
 *
 * Usage:
 *   node tests/independence.cjs [baseUrl]            worker domain + /apps/ proxy BLOCKED
 *   BLOCK=0 node tests/independence.cjs [baseUrl]    control run, nothing blocked
 *   PREVIEW_THEME_ID=<id> node tests/independence.cjs  run against an unpublished theme
 *                                                   (one visit with ?preview_theme_id= sets
 *                                                   Shopify's preview cookie for the context;
 *                                                   every page then asserts Shopify.theme.id)
 *   SPARSE_MARKET=AU node tests/independence.cjs     the market for the sparse-market pages (default US)
 *
 * Pass (blocked mode) = every page complete, no errors from the theme's own code,
 * no empty region, server-rendered defaults kept, checkout reachable. The affiliate
 * page is worker-rendered through the app proxy and is measured, not asserted.
 * Writes output/playwright/independence-<mode>.json and one screenshot per page.
 */
/* global document, window */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = (process.argv[2] || 'https://activepaw.co.uk').replace(/\/$/, '');
const BLOCK = process.env.BLOCK !== '0';
const MODE = BLOCK ? 'blocked' : 'control';
const PREVIEW = process.env.PREVIEW_THEME_ID || '';
const OUT = path.join(__dirname, '..', 'output', 'playwright');
const WORKER_RE = /pawscout\.activepaw\.co\.uk|\/apps\//;
// Cloudflare Turnstile, the bot guard on the worker's affiliate form, probes every console
// method with "%c%d font-size:0;color:transparent NaN" (twice as an error). The lines come
// from Cloudflare's own script (channel round 245; measured 2026-09-20), so they are
// classified by where they were logged from, never by their text.
const TURNSTILE_RE = /^https:\/\/challenges\.cloudflare\.com\//;
// A market the worker keeps sparse on purpose (PRD T19): the home page must still look deliberate there.
const SPARSE_MARKET = process.env.SPARSE_MARKET || 'US';
const SETTLE_MS = 4500; // past the theme's 3 s feed cap
const THIN_TERMS = ['launcher', 'sisal', 'orthopedic', 'fountain', 'harness', 'scratcher'];

fs.mkdirSync(OUT, { recursive: true });

const results = { mode: MODE, base: BASE, preview: PREVIEW || null, at: new Date().toISOString(), pages: [] };
let hardFailures = 0;

const check = (rec, name, ok, detail, hard = true) => {
  rec.checks.push({ name, ok: Boolean(ok), detail, hard });
  if (!ok && hard) hardFailures += 1;
};

const acceptCookies = async (page) => {
  await page.evaluate(() => {
    const btn = document.querySelector('#shopify-pc__banner__btn-accept');
    if (btn) btn.click();
  }).catch(() => {});
};

const mainHeight = (page) => page.evaluate(() => {
  const main = document.querySelector('#MainContent') || document.body;
  return Math.round(main.getBoundingClientRect().height);
});

const count = (page, sel) => page.locator(sel).count();
const text = (page, sel) => page.locator(sel).first().innerText().catch(() => '');

// The delivery promise is one snippet rendered by the announcement bar and the trust strip
// (PRD R8, R11): every copy on the page must read the same, and only a GB visitor may be
// told about UK delivery. textContent, because the marquee duplicates are not all on screen.
const deliveryPromise = async (page, rec) => {
  const promises = await page.locator('[data-delivery-promise]').evaluateAll((els) => els.map((e) => `${e.textContent.trim()} / ${(e.nextElementSibling ? e.nextElementSibling.textContent : '').trim()}`));
  const country = await page.evaluate(() => (window.Shopify && window.Shopify.country) || null).catch(() => null);
  const distinct = [...new Set(promises)];
  check(rec, 'announcement bar and trust strip give one delivery promise', promises.length >= 2 && distinct.length === 1, `${promises.length} copies: ${distinct.join(' | ') || 'none'}`);
  if (country === 'GB') check(rec, 'a GB visitor gets the UK delivery promise', /\bUK\b/.test(distinct[0] || ''), distinct[0] || 'none');
  else check(rec, `a ${country} visitor is never told about UK delivery`, distinct.length > 0 && !distinct.some((t) => /\bUK\b|United Kingdom/i.test(t)), distinct.join(' | ') || 'none');
};

async function visit(context, name, url, specific, generic = true) {
  const page = await context.newPage();
  const rec = { name, url, checks: [], consoleErrors: [], codeErrors: [], blocked: [], turnstileErrorLines: 0 };
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (TURNSTILE_RE.test(m.location().url || '')) { rec.turnstileErrorLines += 1; return; }
    rec.consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => rec.codeErrors.push(String(e).slice(0, 200)));
  page.on('requestfailed', (r) => { if (WORKER_RE.test(r.url())) rec.blocked.push(r.url().slice(0, 120)); });

  let status = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    status = resp ? resp.status() : null;
  } catch (e) {
    rec.navigationError = String(e).slice(0, 160);
  }
  await acceptCookies(page);
  await page.waitForTimeout(500);
  const h0 = await mainHeight(page).catch(() => null);
  await page.waitForTimeout(SETTLE_MS);
  const h1 = await mainHeight(page).catch(() => null);
  rec.status = status;
  rec.mainHeightAtLoad = h0;
  rec.mainHeightSettled = h1;

  if (generic) {
    if (PREVIEW) { // theme pages only: checkout and the worker's affiliate page are not rendered by the theme
      const themeId = await page.evaluate(() => String((window.Shopify && window.Shopify.theme && window.Shopify.theme.id) || '')).catch(() => '');
      check(rec, 'served by the preview theme', themeId === PREVIEW, `Shopify.theme.id ${themeId || 'unknown'}`);
    }
    check(rec, 'http 200', status === 200, `status ${status}`);
    const headerCount = await count(page, 'header.site-header');
    const footerCount = await count(page, 'footer.site-footer');
    check(rec, 'header and footer rendered', headerCount === 1 && footerCount === 1);
    const mainText = await text(page, '#MainContent');
    check(rec, 'main content not empty', mainText.trim().length > 200, `${mainText.trim().length} chars`);
    check(rec, 'no open dialog', (await page.locator('[role="dialog"]:visible').count()) === 0);
    if (BLOCK) {
      check(rec, 'no layout shift after the feed window', h0 !== null && h1 !== null && Math.abs(h1 - h0) <= 2, `main ${h0}px -> ${h1}px`);
    } else {
      // Content the worker adds below the fold grows the page without moving what is on screen (PRD R7).
      const cls = await page.evaluate(() => (typeof window.__cls === 'number' ? +window.__cls.toFixed(4) : null)).catch(() => null);
      rec.cls = cls;
      check(rec, 'no visible layout shift (CLS below 0.05)', cls === null || cls < 0.05, `CLS ${cls}, main ${h0}px -> ${h1}px`);
    }
  }
  if (specific) await specific(page, rec);

  // Errors raised by the theme's own code are failures; the browser's own
  // "Failed to load resource" lines for the blocked hosts are the block itself.
  const isResource = (t) => /Failed to load resource|net::ERR_/.test(t);
  const isPlatform = (t) => /Content Security Policy|shop\.app|Monorail/.test(t); // Shopify's own Shop embed and Trekkie analytics, not theme code
  const ownErrors = rec.consoleErrors.filter((t) => !isResource(t) && !isPlatform(t));
  check(rec, 'no console errors from page code', ownErrors.length === 0 && rec.codeErrors.length === 0, [...ownErrors, ...rec.codeErrors].join(' | ') || 'none');
  rec.resourceErrorLines = rec.consoleErrors.filter(isResource).length;
  rec.platformErrorLines = rec.consoleErrors.filter(isPlatform).length;

  await page.screenshot({ path: path.join(OUT, `independence-${MODE}-${name}.png`), fullPage: false }).catch(() => {});
  results.pages.push(rec);
  await page.close();
  return rec;
}

async function pickThinSearchTerm(context) {
  for (const term of THIN_TERMS) {
    const r = await context.request.get(`${BASE}/search?q=${encodeURIComponent(term)}&type=product`);
    const html = await r.text();
    const m = html.match(/data-have="(\d+)"/);
    const have = m ? parseInt(m[1], 10) : -1;
    if (have >= 1 && have <= 3) return { term, have };
  }
  return { term: 'dog', have: null };
}

// One browser context per visitor. `country` sets Shopify's localization cookie: the store has
// no market web presences, so that cookie is the only thing that moves a visitor off the GB market.
async function openContext(browser, country) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (country) await context.addCookies([{ name: 'localization', value: country, url: `${BASE}/` }]);
  await context.addInitScript(() => {
    window.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch { /* observer unsupported: cls stays 0 and the check is skipped */ }
  });
  if (PREVIEW) {
    const p = await context.newPage();
    await p.goto(`${BASE}/?preview_theme_id=${PREVIEW}`, { waitUntil: 'load', timeout: 45000 });
    await p.close();
  }
  if (BLOCK) {
    await context.route(WORKER_RE, (route) => route.abort('failed'));
  }
  return context;
}

(async () => {
  const browser = await chromium.launch();
  const context = await openContext(browser, null);

  // Home: the hero badge must keep its server-rendered copy when the feed is unreachable.
  await visit(context, 'home', `${BASE}/`, async (page, rec) => {
    const badge = (await text(page, '[data-event-badge]')).replace(/\s+/g, ' ').trim();
    const badgeVisible = await page.locator('[data-event-badge]:visible').count();
    if (BLOCK) check(rec, 'hero badge keeps the server default', badgeVisible === 1 && /stay cool/i.test(badge), badge);
    else rec.heroBadge = badge;
    check(rec, 'no announcement event item', (await count(page, '.announcement-event')) === 0);
    check(rec, 'collection showcase cards', (await count(page, '.category-showcase .commerce-grid > *')) > 0);
    check(rec, 'product cards on the home page', (await count(page, '.commerce-grid .commerce-card')) > 0);
    await deliveryPromise(page, rec);
  });

  // Collection, and the first product in it.
  let productUrl = null;
  await visit(context, 'collection', `${BASE}/collections/pet-toys`, async (page, rec) => {
    const cards = await count(page, '.commerce-grid .commerce-card');
    check(rec, 'collection grid has products', cards > 0, `${cards} cards`);
    const hrefs = await page.locator('a[href^="/products/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href').split('?')[0]))]);
    for (const href of hrefs.slice(0, 8)) {
      const r = await context.request.get(`${BASE}${href}.js`);
      const p = r.ok() ? await r.json() : null;
      if (p && p.available) { productUrl = href; break; }
    }
    check(rec, 'an available product exists in the grid', Boolean(productUrl), productUrl || 'none of the first 8 are available');
  });

  let variantId = null;
  await visit(context, 'product', `${BASE}${productUrl || '/products/automatic-ball-launcher-for-dogs'}`, async (page, rec) => {
    check(rec, 'add-to-cart form present', (await count(page, 'form[action*="/cart/add"]')) > 0);
    variantId = await page.locator('form[action*="/cart/add"] [name="id"]').first().inputValue().catch(() => null);
    check(rec, 'variant id resolvable', Boolean(variantId), variantId || 'none');
    const banner = (await text(page, '.pdp-delivery-banner')).replace(/\s+/g, ' ').trim();
    check(rec, 'availability banner rendered', banner.length > 0, banner.slice(0, 120));
    const addonsHidden = await page.locator('[data-pawscout-pdp-addons][hidden]').count();
    if (BLOCK) check(rec, 'add-on row stays hidden', addonsHidden === 1);
    else rec.addonRowHidden = addonsHidden === 1;
    // Rule 3 of the contract: internal sourcing is never customer-visible (PRD R5).
    const detailsText = await page.locator('[data-details-modal]').first().evaluate((el) => el.textContent || '').catch(() => '');
    check(rec, 'product details never name the supplier', !/Fulfilled by/i.test(detailsText), detailsText.replace(/\s+/g, ' ').trim().slice(0, 100));
    rec.pawscoutPid = await page.locator('meta[name="pawscout-pid"]').getAttribute('content').catch(() => null);
  });

  // Search: a thin native grid is exactly where the proxy would add ghost cards.
  const thin = await pickThinSearchTerm(context);
  await visit(context, 'search', `${BASE}/search?q=${encodeURIComponent(thin.term)}&type=product`, async (page, rec) => {
    const native = await count(page, '.search-results-grid .commerce-card:not(.pawscout-ghost)');
    const ghosts = await count(page, '.pawscout-ghost');
    rec.searchTerm = thin.term;
    rec.nativeCount = native;
    rec.ghostCount = ghosts;
    check(rec, 'native results rendered', native > 0 && (thin.have === null || native === thin.have), `${native} native (server said ${thin.have})`);
    if (BLOCK) check(rec, 'no supplier ghost cards', ghosts === 0, `${ghosts} ghost cards`);
    check(rec, 'no empty-state message', (await count(page, '.search-empty')) === 0);
  });

  let articleUrl = null;
  await visit(context, 'blog', `${BASE}/blogs/guides`, async (page, rec) => {
    const n = await count(page, '.blog-grid > *');
    check(rec, 'blog grid has articles', n > 0, `${n} entries`);
    articleUrl = await page.locator('a[href^="/blogs/guides/"]').first().getAttribute('href').catch(() => null);
  });

  await visit(context, 'article', `${BASE}${articleUrl || '/blogs/guides'}`, async (page, rec) => {
    const body = await text(page, '#MainContent');
    check(rec, 'article body rendered', body.trim().length > 500, `${body.trim().length} chars`);
    rec.shopThisGuideCards = await count(page, '.commerce-grid .commerce-card');
  });

  await visit(context, 'contact', `${BASE}/pages/contact`, async (page, rec) => {
    check(rec, 'contact form present', (await count(page, 'form[action^="/contact"]')) > 0);
  });

  // Affiliate entry point (PRD T10, decision 5c): the Shopify page /pages/affiliates
  // carries the programme copy, an email route and the Apply button to the worker's
  // form; the button is hidden until the feed verdict proves the worker reachable.
  // Until the owner creates the page, the worker-rendered form is measured instead.
  const affPage = await context.request.get(`${BASE}/pages/affiliates`);
  if (affPage.status() === 200) {
    await visit(context, 'affiliate', `${BASE}/pages/affiliates`, async (page, rec) => {
      const apply = page.locator('[data-affiliate-apply]');
      const applyCount = await apply.count();
      const applyVisible = applyCount ? await apply.first().isVisible() : false;
      check(rec, 'apply button present in markup', applyCount === 1, `${applyCount} button(s)`);
      if (BLOCK) check(rec, 'apply button stays hidden without the worker', !applyVisible);
      else check(rec, 'apply button shown and links to the worker form', applyVisible && /\/apps\/pawscout\/affiliate\/apply/.test((await apply.first().getAttribute('href')) || ''));
      check(rec, 'email route present', (await count(page, 'a[href^="mailto:"]')) > 0);
    });
  } else {
    await visit(context, 'affiliate', `${BASE}/apps/pawscout/affiliate/apply`, async (page, rec) => {
      check(rec, 'affiliate page renders (worker dependency, informational)', rec.status === 200, `status ${rec.status}; /pages/affiliates not created yet (${affPage.status()})`, false);
    }, false);
  }

  // Cart and checkout with a real line in the basket, then clear it.
  if (variantId) {
    const add = await context.request.post(`${BASE}/cart/add.js`, { form: { id: variantId, quantity: '1' } });
    await visit(context, 'cart', `${BASE}/cart`, async (page, rec) => {
      check(rec, 'cart/add.js accepted the line', add.ok(), `status ${add.status()}`);
      check(rec, 'cart line rendered', (await count(page, '.cart-items')) > 0);
      check(rec, 'checkout button present', (await count(page, 'button[name="checkout"]')) > 0);
    });
    await visit(context, 'checkout', `${BASE}/checkout`, async (page, rec) => {
      const where = page.url().replace(BASE, '').slice(0, 70);
      check(rec, 'checkout reachable', /\/checkouts\//.test(page.url()) && rec.status === 200, where);
      check(rec, 'checkout has no stock problem', !/stock-problems/.test(page.url()), where);
    }, false);
    await context.request.post(`${BASE}/cart/clear.js`).catch(() => {});
  }

  // A sparse market (PRD T19). The worker keeps products out of a market's catalogue unless
  // they can be delivered there, so a collection can be empty for that visitor. Both checks
  // hold however full the market is: a block either shows products or is left out, and a
  // collection page shows either a grid or the message, never an empty grid.
  const sparse = await openContext(browser, SPARSE_MARKET);
  const cc = SPARSE_MARKET.toLowerCase();
  await visit(sparse, `home-${cc}`, `${BASE}/`, async (page, rec) => {
    rec.country = await page.evaluate(() => (window.Shopify && window.Shopify.country) || null).catch(() => null);
    check(rec, `visitor is in the ${SPARSE_MARKET} market (informational)`, rec.country === SPARSE_MARKET, `Shopify.country ${rec.country}`, false);
    const blocks = await count(page, '.category-block');
    const filled = await count(page, '.category-block:has(.commerce-card)');
    check(rec, 'every collection block on show has products', blocks > 0 && blocks === filled, `${filled} of ${blocks} blocks have cards`);
    check(rec, 'no merchant hint on the storefront', (await count(page, '.category-showcase .empty-category')) === 0);
    await deliveryPromise(page, rec);
  });
  await visit(sparse, `collection-${cc}`, `${BASE}/collections/pet-toys`, async (page, rec) => {
    const cards = await count(page, '.commerce-grid .commerce-card');
    const message = (await text(page, '.empty-category')).replace(/\s+/g, ' ').trim();
    rec.cards = cards;
    check(rec, 'a grid of products or the empty message, never neither', cards > 0 || message.length > 0, cards > 0 ? `${cards} cards` : message.slice(0, 120));
    if (cards === 0) check(rec, 'empty message offers the products that are available', (await count(page, '.empty-category a[href]')) === 1);
  });
  await sparse.close();

  await browser.close();

  const file = path.join(OUT, `independence-${MODE}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
  let total = 0;
  let passed = 0;
  for (const p of results.pages) {
    for (const c of p.checks) {
      total += 1;
      if (c.ok) passed += 1;
      const mark = c.ok ? 'ok  ' : (c.hard ? 'FAIL' : 'info');
      console.log(`${mark} ${p.name.padEnd(10)} ${c.name}${c.detail ? ` :: ${c.detail}` : ''}`);
    }
    if (p.blocked.length) console.log(`     ${p.name.padEnd(10)} blocked requests: ${p.blocked.length}`);
    if (p.resourceErrorLines) console.log(`     ${p.name.padEnd(10)} browser resource-load error lines: ${p.resourceErrorLines}`);
    if (p.platformErrorLines) console.log(`     ${p.name.padEnd(10)} Shopify platform console errors (not theme code): ${p.platformErrorLines}`);
    if (p.turnstileErrorLines) console.log(`     ${p.name.padEnd(10)} Cloudflare Turnstile console errors (not theme code): ${p.turnstileErrorLines}`);
    if (p.name === 'search') console.log(`     ${p.name.padEnd(10)} term=${p.searchTerm} native=${p.nativeCount} ghost=${p.ghostCount}`);
  }
  console.log(`\n${MODE}: ${passed}/${total} checks passed, ${hardFailures} hard failure(s); details in ${file}`);
  process.exit(BLOCK && hardFailures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

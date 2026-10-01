/* Independence run: does the live theme stay complete when PawScout is unreachable?
 *
 * Usage:
 *   node tests/independence.cjs [baseUrl]            worker domain + /apps/ proxy BLOCKED
 *   BLOCK=0 node tests/independence.cjs [baseUrl]    control run, nothing blocked
 *   PREVIEW_THEME_ID=<id> node tests/independence.cjs  run against an unpublished theme
 *                                                   (one visit with ?preview_theme_id= sets
 *                                                   Shopify's preview cookie for the context;
 *                                                   every page then asserts Shopify.theme.id)
 *   SPARSE_MARKET=AU node tests/independence.cjs     the market for the sparse-market pages and the
 *                                                   country switch (default US)
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
// Shopify's own storefront scripts (analytics, the event reporter) are served under
// /cdn/shopifycloud/; the theme's files are under /cdn/shop/t/. When a test navigates away, a
// beacon of theirs that is still in flight logs "TypeError: Failed to fetch" with nothing in the
// text to tell it from theme code (CI run 35568115045, 2026-09-21), so these too are classified
// by where they were logged from.
const SHOPIFY_PLATFORM_SRC_RE = /\/cdn\/shopifycloud\//;
// A market the worker keeps sparse on purpose (PRD T19): the home page must still look deliberate there.
const SPARSE_MARKET = process.env.SPARSE_MARKET || 'US';
const SETTLE_MS = 4500; // past the theme's 3 s feed cap
const THIN_TERMS = ['launcher', 'sisal', 'orthopedic', 'fountain', 'harness', 'scratcher'];
// The storefront has refused a single page load from the GitHub runner with 503 (issue #18: the
// cart on 2026-09-23 at 00:08Z, home at 11:40Z, /collections/all at 19:39Z), a different page
// each time while every other page passed, so one refusal failed six to nine checks at once. A
// theme change cannot do that to one page in one run, so a 5xx is asked for once more after a
// pause. The refusal is recorded with the headers that say who refused it, and a page that
// answers 5xx twice still fails every check as before.
const RETRY_PAUSE_MS = 15000;
const REFUSAL_HEADERS = ['server', 'cf-ray', 'cf-mitigated', 'cf-cache-status', 'retry-after', 'x-request-id', 'content-type'];

fs.mkdirSync(OUT, { recursive: true });

const results = { mode: MODE, base: BASE, preview: PREVIEW || null, at: new Date().toISOString(), retries: [], pages: [] };
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

// The footer's country selector is the one way a visitor leaves the GB market (the store has
// no market web presences), so it must be there and must show the market the page was rendered for.
const countrySelector = async (page, rec) => {
  const state = await page.evaluate(() => {
    const selects = [...document.querySelectorAll('[data-country-select]')];
    return { n: selects.length, value: selects[0] ? selects[0].value : null, options: selects[0] ? selects[0].options.length : 0, country: (window.Shopify && window.Shopify.country) || null };
  }).catch(() => ({ n: 0, value: null, options: 0, country: null }));
  check(rec, 'country selector shows the market the page was rendered for', state.n === 1 && state.options > 1 && state.value === state.country, `${state.n} selector(s), ${state.options} countries, selected ${state.value}, Shopify.country ${state.country}`);
};

// Outside the GB market no sentence of the THEME'S may be about UK delivery. The FAQ is left
// out: it answers "Do you deliver outside the UK?" for everyone. So are the selector's own
// options. The collection description is the merchant's text in the store admin, which the
// theme prints as written, so it is reported on its own line and does not fail the theme.
const noUkDeliveryClaim = async (page, rec) => {
  const found = await page.evaluate(() => {
    const sentences = (root) => (root.textContent.match(/[^.\n]*\bUK\b[^.\n]*/g) || [])
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => /deliver|dispatch|shipping|ships|days/i.test(s))
      .slice(0, 4);
    const body = document.body.cloneNode(true);
    const description = body.querySelector('[data-collection-description]');
    const merchant = description ? sentences(description) : [];
    body.querySelectorAll('.faq, select, script, style, noscript, template, [data-collection-description]').forEach((n) => n.remove());
    return { theme: sentences(body), merchant };
  }).catch(() => ({ theme: ['page not readable'], merchant: [] }));
  check(rec, 'no UK delivery sentence outside the GB market', found.theme.length === 0, found.theme.join(' | ') || 'none');
  if (found.merchant.length) check(rec, 'collection description (store content) makes no UK delivery claim (informational)', false, found.merchant.join(' | '), false);
};

async function visit(context, name, url, specific, generic = true, before = null) {
  const page = await context.newPage();
  if (before) await before(page);
  const rec = { name, url, checks: [], consoleErrors: [], codeErrors: [], blocked: [], turnstileErrorLines: 0, platformSourceErrorLines: 0 };
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (TURNSTILE_RE.test(m.location().url || '')) { rec.turnstileErrorLines += 1; return; }
    if (SHOPIFY_PLATFORM_SRC_RE.test(m.location().url || '') || SHOPIFY_PLATFORM_SRC_RE.test(m.text())) { rec.platformSourceErrorLines += 1; return; }
    rec.consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => rec.codeErrors.push(String(e).slice(0, 200)));
  page.on('requestfailed', (r) => { if (WORKER_RE.test(r.url())) rec.blocked.push(r.url().slice(0, 120)); });

  let status = null;
  try {
    let resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    status = resp ? resp.status() : null;
    if (status >= 500) {
      const h = resp.headers();
      const refused = { page: name, url, status, at: new Date().toISOString(), pauseMs: RETRY_PAUSE_MS, headers: {} };
      for (const k of REFUSAL_HEADERS) if (h[k]) refused.headers[k] = h[k].slice(0, 120);
      rec.refused = refused;
      results.retries.push(refused);
      // What the refusal page logged is not the page under test.
      rec.consoleErrors = [];
      rec.codeErrors = [];
      rec.blocked = [];
      rec.turnstileErrorLines = 0;
      rec.platformSourceErrorLines = 0;
      refused.retryStatus = null;
      await page.waitForTimeout(RETRY_PAUSE_MS);
      resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      status = resp ? resp.status() : null;
      refused.retryStatus = status;
    }
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
  // Shopify's own Shop embed and Trekkie analytics, and the browser's complaint about a response
  // header ("Invalid 'X-Frame-Options' header ... 'ALLOW-FROM ...' is not a recognized directive",
  // once, daily run 35601692288 on 2026-09-21; live sends DENY): a theme cannot set a header.
  // The same holds for a request to Shopify's own service host refused by CORS ("Access to fetch
  // at 'https://otlp-http-production.shopifysvc.com/v1/metrics' ... blocked by CORS policy", on
  // three pages of a control run on 2026-10-01 and absent on a reload): the theme never calls
  // shopifysvc.com, and only that host can send the missing header.
  const isPlatform = (t) => /Content Security Policy|shop\.app|Monorail|Invalid 'X-Frame-Options' header|^Access to fetch at 'https:\/\/[a-z0-9-]+\.shopifysvc\.com\//.test(t);
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

// Supplier prices, with a stand-in for the worker. Every worker price is GBP (channel round 257)
// and `currency` is optional, absent meaning GBP. A visitor whose currency it is sees it printed
// as the storefront prints money; anyone else sees the code in words, never a converted amount.
// The oracle is Liquid's own money filter: every stand-in card costs 12345.67, the amount the
// layout renders into data-money-sample, so an own-currency card must read exactly that string.
// The answer is fulfilled here, so the rule is exercised whether or not the worker has stock
// for the market, and in blocked mode too (a page route outranks the context's abort).
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const STUB_CARDS = [undefined, 'GBP', 'USD', 'EUR'].map((currency) => ({ pid: `stand-in-${currency || 'none'}`, title: `Stand-in supplier match (${currency || 'no currency field'})`, image: PIXEL, price: 12345.67, currency }));
async function supplierPrices(context, name) {
  const thin = await pickThinSearchTerm(context);
  const standIn = (page) => page.route(/\/apps\/pawscout\/search/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, products: STUB_CARDS }) }));
  await visit(context, name, `${BASE}/search?q=${encodeURIComponent(thin.term)}&type=product`, async (page, rec) => {
    const seen = await page.evaluate(() => ({
      currency: (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || null,
      sample: (document.body.getAttribute('data-money-sample') || '').trim(),
      prices: [...document.querySelectorAll('.pawscout-ghost .commerce-price-row strong')].map((e) => e.textContent.trim()),
    }));
    rec.searchTerm = thin.term;
    // The cards arrive after load on purpose, so the generic no-growth rule does not apply here;
    // the two generic checks that do are repeated.
    if (PREVIEW) {
      const themeId = await page.evaluate(() => String((window.Shopify && window.Shopify.theme && window.Shopify.theme.id) || '')).catch(() => '');
      check(rec, 'served by the preview theme', themeId === PREVIEW, `Shopify.theme.id ${themeId || 'unknown'}`);
    }
    check(rec, 'http 200', rec.status === 200, `status ${rec.status}`);
    const expected = STUB_CARDS.map((c) => ((c.currency || 'GBP') === seen.currency ? seen.sample : `${c.currency || 'GBP'} 12345.67`));
    check(rec, 'the layout says how the storefront prints money', /12\D?345\D67/.test(seen.sample), `data-money-sample "${seen.sample}"`);
    check(rec, `supplier prices for a ${seen.currency} visitor: own currency as the store prints it, any other as its code in words`, seen.prices.length === STUB_CARDS.length && seen.prices.every((p, i) => p === expected[i]), `shown ${seen.prices.join(' | ') || 'none'} :: expected ${expected.join(' | ')}`);
  }, false, standIn);
}

// Layout: no page may scroll sideways, no container may spill into its own padding, and every
// visible control needs a name. All three were found by hand on 2026-09-21 (header, footer,
// product columns and service cards between 901 and about 1300px; two icon buttons with no
// name on phones), so they are a standing check now. It runs in a browser of its own that
// KEEPS its scrollbar: Playwright hides scrollbars, and a media query sees the whole window
// while the layout gets about 15px less, so a row that "fits" in the default browser scrolls
// sideways in a shopper's. One load per page, then resized, so the store sees two requests.
const LAYOUT_WIDTHS = [1400, 1321, 1320, 1280, 1261, 1260, 1241, 1240, 1201, 1200, 1160, 1100, 1041, 1040, 1024, 960, 901, 900, 768, 701, 700, 621, 620, 390, 360];
const measureLayout = () => {
  const de = document.documentElement;
  const client = de.clientWidth;
  const css = (e) => window.getComputedStyle(e);
  const label = (e) => `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;
  const clippedAbove = (e) => {
    for (let n = e.parentElement; n && n !== de; n = n.parentElement) {
      const s = css(n);
      if (s.overflowX !== 'visible' || s.position === 'fixed') return true;
    }
    return false;
  };
  const out = { inner: window.innerWidth, client, scroll: de.scrollWidth, spill: [], squeezed: [], unnamed: [] };
  for (const e of document.querySelectorAll('body *')) {
    const s = css(e);
    if (s.display === 'none' || s.position === 'fixed') continue;
    const box = e.getBoundingClientRect();
    if (box.width === 0 || clippedAbove(e)) continue;
    if (box.right > client + 1 && out.spill.length < 3) out.spill.push(`${label(e)} to ${Math.round(box.right)}`);
    if (!/grid|flex/.test(s.display) || s.overflowX !== 'visible') continue;
    const limit = box.right - (parseFloat(s.paddingRight) || 0) - (parseFloat(s.borderRightWidth) || 0);
    let reach = 0;
    for (const c of e.children) {
      const k = css(c);
      if (k.display === 'none' || k.visibility === 'hidden' || k.position === 'absolute' || k.position === 'fixed') continue;
      const q = c.getBoundingClientRect();
      if (q.width > 0) reach = Math.max(reach, q.right);
    }
    if (reach > limit + 1.5 && out.squeezed.length < 3) out.squeezed.push(`${label(e)} by ${Math.round(reach - limit)}px`);
  }
  // A name a screen reader gets: clipped text counts, display:none and aria-hidden text do not.
  const shown = (e) => {
    const box = e.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    for (let n = e; n && n !== de; n = n.parentElement) {
      const s = css(n);
      if (s.display === 'none' || s.visibility === 'hidden' || n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  };
  const named = (e) => {
    if ((e.getAttribute('aria-label') || '').trim() || (e.getAttribute('title') || '').trim()) return true;
    const by = (e.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    if (by.some((id) => { const n = document.getElementById(id); return n && n.textContent.trim(); })) return true;
    if ([...e.querySelectorAll('img[alt]')].some((i) => i.alt.trim())) return true;
    const walker = document.createTreeWalker(e, window.NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent.trim()) continue;
      let silent = false;
      for (let n = t.parentElement; n && n !== e.parentElement; n = n.parentElement) {
        const s = css(n);
        if (s.display === 'none' || s.visibility === 'hidden' || n.getAttribute('aria-hidden') === 'true') { silent = true; break; }
      }
      if (!silent) return true;
    }
    if (e.tagName === 'INPUT' || e.tagName === 'SELECT') {
      const l = (e.id && document.querySelector(`label[for="${e.id}"]`)) || e.closest('label');
      return Boolean((l && l.textContent.trim()) || e.getAttribute('placeholder') || e.value);
    }
    return false;
  };
  for (const e of document.querySelectorAll('a[href], button, [role="button"], select, input:not([type="hidden"])')) {
    if (shown(e) && !named(e) && out.unnamed.length < 5) out.unnamed.push(label(e));
  }
  return out;
};
async function layoutFits(browser, name, url) {
  const context = await openContext(browser, null);
  await visit(context, name, url, async (page, rec) => {
    // Resizing moves the page on purpose, so the generic no-growth rule does not apply here;
    // the two generic checks that do are repeated.
    if (PREVIEW) {
      const themeId = await page.evaluate(() => String((window.Shopify && window.Shopify.theme && window.Shopify.theme.id) || '')).catch(() => '');
      check(rec, 'served by the preview theme', themeId === PREVIEW, `Shopify.theme.id ${themeId || 'unknown'}`);
    }
    check(rec, 'http 200', rec.status === 200, `status ${rec.status}`);
    const scrolls = [];
    const squeezed = [];
    const unnamed = [];
    let withBar = 0;
    for (const w of LAYOUT_WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(200);
      const m = await page.evaluate(measureLayout);
      if (m.inner > m.client) withBar += 1;
      if (m.scroll > m.client + 1) scrolls.push(`${w}px: ${m.scroll - m.client}px past the window (${m.spill.join('; ') || 'no element named'})`);
      if (m.squeezed.length) squeezed.push(`${w}px: ${m.squeezed.join('; ')}`);
      if (m.unnamed.length) unnamed.push(`${w}px: ${m.unnamed.join('; ')}`);
    }
    rec.layoutWidths = LAYOUT_WIDTHS.length;
    // Without a scrollbar the layout has 15px more room than a shopper's, so a pass proves less.
    check(rec, 'measured with a real scrollbar (informational)', withBar === LAYOUT_WIDTHS.length, `${withBar} of ${LAYOUT_WIDTHS.length} widths had one`, false);
    check(rec, `no sideways scroll at ${LAYOUT_WIDTHS.length} widths from 1400 to 360px`, scrolls.length === 0, scrolls.slice(0, 4).join(' | ') || 'none');
    check(rec, 'no container spills into its own padding', squeezed.length === 0, squeezed.slice(0, 4).join(' | ') || 'none');
    check(rec, 'every visible button, link and field has a name', unnamed.length === 0, unnamed.slice(0, 4).join(' | ') || 'none');
  }, false);
  await context.close();
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
    await countrySelector(page, rec);
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
    // The delivery estimate a GB shopper reads is the one the order carries (owner ruling
    // 2026-09-22: the product's own figure where it has one). Before the ruling the page
    // showed the origin's figure and the order the product's, so they disagreed on five
    // products; this holds for whichever product the grid offered.
    const estimate = await page.evaluate(() => {
      const li = [...document.querySelectorAll('.delivery-info li')].map((e) => e.textContent.replace(/\s+/g, ' ').trim());
      const shown = (li.find((t) => /days to your door/.test(t)) || '').match(/Estimated (\S+) days/);
      const prop = document.querySelector('input[name="properties[Estimated delivery]"]');
      return { shown: shown ? shown[1] : null, order: prop ? prop.value.replace(/ days$/, '') : null };
    });
    rec.deliveryEstimate = estimate;
    if (estimate.order !== null) check(rec, 'the delivery estimate on the page is the one the order carries', estimate.shown === estimate.order, `page ${estimate.shown}, order ${estimate.order}`);
  });

  // Search: a thin native grid is exactly where the proxy would add ghost cards.
  // The search's own matches are the cards before the grid's first separator; after it come the
  // Liquid 'Suggested' cards (a term that hits a keyword rule) and the supplier's ghosts. They are
  // compared with the count the same render prints in data-have, not with the picker's earlier
  // request: the catalogue's answer can move between the two (run 35994930886, 2026-09-24:
  // "fountain" read 3 for the picker, then the page rendered 5 and said 5).
  const thin = await pickThinSearchTerm(context);
  await visit(context, 'search', `${BASE}/search?q=${encodeURIComponent(thin.term)}&type=product`, async (page, rec) => {
    const grid = await page.evaluate(() => {
      const host = document.querySelector('[data-pawscout-search]');
      let matches = 0;
      for (const n of document.querySelectorAll('.search-results-grid .commerce-card, .search-results-grid .search-suggested-sep')) {
        if (n.classList.contains('search-suggested-sep')) break;
        if (!n.classList.contains('pawscout-ghost')) matches += 1;
      }
      return { matches, have: host ? parseInt(host.getAttribute('data-have'), 10) : null };
    });
    const ghosts = await count(page, '.pawscout-ghost');
    rec.searchTerm = thin.term;
    rec.nativeCount = grid.matches;
    rec.pageCount = grid.have;
    rec.pickerCount = thin.have;
    rec.ghostCount = ghosts;
    check(rec, 'native results rendered', grid.matches > 0 && grid.matches === grid.have, `${grid.matches} search matches rendered, the page says ${grid.have} (the picker read ${thin.have})`);
    // A term that is no longer thin when the page renders leaves the ghost path untested.
    check(rec, 'search term still thin when the page rendered (informational)', grid.have >= 1 && grid.have <= 3, `"${thin.term}": the picker read ${thin.have}, the page ${grid.have}`, false);
    if (BLOCK) check(rec, 'no supplier ghost cards', ghosts === 0, `${ghosts} ghost cards`);
    check(rec, 'no empty-state message', (await count(page, '.search-empty')) === 0);
  });
  await supplierPrices(context, 'prices');

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
    await countrySelector(page, rec);
    await noUkDeliveryClaim(page, rec);
  });
  await visit(sparse, `collection-${cc}`, `${BASE}/collections/pet-toys`, async (page, rec) => {
    const cards = await count(page, '.commerce-grid .commerce-card');
    const message = (await text(page, '.empty-category')).replace(/\s+/g, ' ').trim();
    rec.cards = cards;
    check(rec, 'a grid of products or the empty message, never neither', cards > 0 || message.length > 0, cards > 0 ? `${cards} cards` : message.slice(0, 120));
    if (cards === 0) check(rec, 'empty message offers the products that are available', (await count(page, '.empty-category a[href]')) === 1);
    await noUkDeliveryClaim(page, rec);
  });
  await supplierPrices(sparse, `prices-${cc}`);
  await sparse.close();

  // The country switch, end to end, as a visitor with no cookie does it: choose a country in
  // the footer, land back on the same page and query in that market, then choose the UK again.
  const switcher = await openContext(browser, null);
  const startPath = '/collections/all?sort_by=price-ascending';
  await visit(switcher, 'switch', `${BASE}${startPath}`, async (page, rec) => {
    const state = () => page.evaluate(() => {
      const select = document.querySelector('[data-country-select]');
      const promise = document.querySelector('[data-delivery-promise]');
      return {
        country: (window.Shopify && window.Shopify.country) || null,
        where: window.location.pathname + window.location.search,
        promise: promise ? promise.textContent.trim() : '',
        selected: select ? select.value : null,
        name: select && select.selectedOptions[0] ? select.selectedOptions[0].textContent.trim().replace(/\s*\(.*$/, '') : '',
      };
    });
    const choose = async (code) => {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'load', timeout: 45000 }),
        page.selectOption('[data-country-select]', code, { timeout: 8000 }),
      ]);
      return state();
    };
    const before = await state();
    check(rec, 'a visitor with no cookie starts in the GB market', before.country === 'GB' && before.selected === 'GB', `Shopify.country ${before.country}, selected ${before.selected}`);
    let after = null;
    try { after = await choose(SPARSE_MARKET); } catch (e) { rec.switchError = String(e).slice(0, 160); }
    check(rec, `choosing ${SPARSE_MARKET} moves the visitor to that market`, after && after.country === SPARSE_MARKET && after.selected === SPARSE_MARKET, after ? `Shopify.country ${after.country}, selected ${after.selected}` : rec.switchError);
    check(rec, 'the visitor stays on the page and query they were on', after && after.where === startPath, after ? after.where : 'no navigation');
    check(rec, 'the delivery promise names the chosen country', after && after.name.length > 0 && after.promise.includes(after.name) && !/\bUK\b/.test(after.promise), after ? `${after.promise} (chosen: ${after.name})` : 'no navigation');
    let back = null;
    try { back = await choose('GB'); } catch (e) { rec.switchBackError = String(e).slice(0, 160); }
    check(rec, 'choosing the United Kingdom brings the UK promise back', back && back.country === 'GB' && /\bUK\b/.test(back.promise), back ? `Shopify.country ${back.country}, ${back.promise}` : rec.switchBackError);
  });
  await switcher.close();

  await browser.close();

  // Layout, in a browser that keeps its scrollbar (see layoutFits).
  const barBrowser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  await layoutFits(barBrowser, 'layout-home', `${BASE}/`);
  await layoutFits(barBrowser, 'layout-pdp', `${BASE}${productUrl || '/products/automatic-ball-launcher-for-dogs'}`);
  await barBrowser.close();

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
    if (p.platformSourceErrorLines) console.log(`     ${p.name.padEnd(10)} console errors logged by Shopify's own scripts (not theme code): ${p.platformSourceErrorLines}`);
    if (p.turnstileErrorLines) console.log(`     ${p.name.padEnd(10)} Cloudflare Turnstile console errors (not theme code): ${p.turnstileErrorLines}`);
    if (p.name === 'search') console.log(`     ${p.name.padEnd(10)} term=${p.searchTerm} native=${p.nativeCount} page=${p.pageCount} picker=${p.pickerCount} ghost=${p.ghostCount}`);
  }
  // A retried refusal passes the run, so it is printed where a reader of a green run sees it:
  // the log, and on GitHub a warning on the run's summary page.
  for (const r of results.retries) {
    const line = `${r.page} answered ${r.status} at ${r.at}, then ${r.retryStatus === null ? 'no response' : r.retryStatus} after ${r.pauseMs / 1000} s (${Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`).join('; ') || 'no identifying headers'})`;
    console.log(`     refused    ${line}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Storefront refused a request (${MODE})::${line}`);
  }
  console.log(`\n${MODE}: ${passed}/${total} checks passed, ${hardFailures} hard failure(s); details in ${file}`);
  process.exit(BLOCK && hardFailures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

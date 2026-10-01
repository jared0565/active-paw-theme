/* PawScout storefront integration.
 *
 * 1) Search backfill: when the store answers a search with fewer than the grid
 *    cap (12), fetch gated supplier candidates via the Shopify App Proxy
 *    (/apps/pawscout/*, HMAC-signed by Shopify - never call the worker domain
 *    directly) and append "ghost" cards. Ghost products do NOT exist in the
 *    store yet.
 * 2) Preview: clicking a ghost card opens an instant preview built from cached
 *    supplier data while the real Shopify product is created in the background;
 *    the action button flips to the real PDP link when the import lands.
 * 3) Beacons: JS-only view/add-to-cart signals for imported products feed the
 *    30-day performance cull. JS-only keeps most crawlers out of the data.
 */
(() => {
  'use strict';

  const PROXY = '/apps/pawscout';
  // Merchant-approved supplier framing: backfill ONLY a thin native grid
  // (< 4 real matches) and never show more than 3 ghost cards - supplement,
  // never flood. Mirrors the Stage-1 Liquid thin-gate/cap in main-search.liquid.
  const SUPPLIER_THIN_MAX = 4;
  const SUPPLIER_LIMIT = 3;
  const POLL_MS = 1500;
  const POLL_MAX = 20;

  // The visitor's storefront currency: Shopify's own global, GBP when it is missing.
  const shopCurrency = () => String((window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'GBP').toUpperCase();

  // How this storefront prints money in that currency, read from a sample Liquid renders on
  // <body> (1234567 minor units through the money filter: "£12,345.67", "€12.345,67"), so a
  // price built here reads exactly like the ones Liquid prints beside it. A sample that does
  // not parse (a currency without decimals, say) falls back to Intl.
  const moneyPattern = (() => {
    const sample = (document.body && document.body.getAttribute('data-money-sample')) || '';
    const m = sample.trim().match(/^(\D*)12(\D?)345(\D)67(\D*)$/);
    return m ? { before: m[1], group: m[2], point: m[3], after: m[4] } : null;
  })();

  // A price that is already in the visitor's currency: Shopify's own product JSON.
  const shopMoney = (amount) => {
    if (!moneyPattern) {
      try {
        return new Intl.NumberFormat(document.documentElement.lang || undefined, { style: 'currency', currency: shopCurrency(), currencyDisplay: 'narrowSymbol' }).format(amount);
      } catch {
        return shopCurrency() + ' ' + Number(amount).toFixed(2);
      }
    }
    const parts = Number(amount).toFixed(2).split('.');
    return moneyPattern.before + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, moneyPattern.group) + moneyPattern.point + parts[1] + moneyPattern.after;
  };

  // A price from the worker. Every worker price is GBP (pawscout-agent, channel round 257);
  // `currency` is an optional ISO code on a card or a preview, and absent means GBP. When it is
  // not the visitor's currency the amount is labelled with the code in words ("GBP 12.99",
  // owner ruling 2026-09-21) and never converted here: Shopify applies the market's own
  // rounding to the product page, which the browser cannot reproduce, and a card that
  // disagrees with its page by a few pence is worse than a plainly labelled amount.
  const supplierMoney = (amount, currency) => {
    const code = String(currency || 'GBP').toUpperCase();
    return code === shopCurrency() ? shopMoney(amount) : code + ' ' + Number(amount).toFixed(2);
  };

  // An item stocked only overseas (owner rule 2026-09-30, channel rounds 288 and 290: offer it
  // with the real supplier facts and make the customer aware). The worker sends
  // `delivery: { overseas, days }` on every card, and on a preview asked for with overseas=1.
  // `days` is its door-to-door band, the formula the product page uses, so the note reads like
  // the product page's "Estimated N days to your door". No country or supplier is ever named, and
  // a figure that is not a plain range or number is left out rather than printed.
  const OVERSEAS_DAYS_RE = /^\d{1,3}(-\d{1,3})?$/;
  const overseasNote = (delivery) => {
    if (!delivery || delivery.overseas !== true) return null;
    const days = typeof delivery.days === 'string' ? delivery.days.trim() : '';
    return OVERSEAS_DAYS_RE.test(days) ? `Ships from overseas · estimated ${days} days to your door` : 'Ships from overseas';
  };

  const proxyGet = (path, params) => {
    const qs = new URLSearchParams(params).toString();
    return fetch(`${PROXY}${path}?${qs}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json());
  };

  const sendEvent = (pid, event) => {
    try {
      const body = JSON.stringify({ pid, event });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(`${PROXY}/event`, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(`${PROXY}/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
      }
    } catch (e) { /* beacons must never break the page */ }
  };

  /* ---------- search backfill ---------- */

  const buildGhostCard = (p) => {
    const card = document.createElement('article');
    card.className = 'commerce-card pawscout-ghost';
    const img = document.createElement('img');
    img.src = p.image;
    img.alt = p.title;
    img.loading = 'lazy';
    const media = document.createElement('div');
    media.className = 'commerce-media';
    media.appendChild(img);
    const badge = document.createElement('span');
    badge.textContent = 'Supplier match';
    media.appendChild(badge);

    const body = document.createElement('div');
    body.className = 'commerce-card-body';
    const h3 = document.createElement('h3');
    h3.textContent = p.title;
    const priceRow = document.createElement('div');
    priceRow.className = 'commerce-price-row';
    const price = document.createElement('strong');
    price.textContent = supplierMoney(p.price, p.currency);
    priceRow.appendChild(price);
    const action = document.createElement('div');
    action.className = 'commerce-card-action';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'commerce-option-button pawscout-view';
    btn.textContent = 'View details';
    action.appendChild(btn);
    body.appendChild(h3);
    body.appendChild(priceRow);
    const note = overseasNote(p.delivery);
    if (note) body.appendChild(el('p', 'pawscout-overseas', note));
    body.appendChild(action);

    const link = document.createElement('div');
    link.className = 'commerce-card-link';
    link.appendChild(media);
    link.appendChild(body);
    card.appendChild(link);

    const open = () => (p.url ? (window.location.href = p.url) : openPreview(p.pid, p.delivery));
    btn.addEventListener('click', open);
    media.addEventListener('click', open);
    return card;
  };

  const initSearchBackfill = () => {
    const host = document.querySelector('[data-pawscout-search]');
    if (!host) return;
    const terms = host.getAttribute('data-terms') || '';
    const have = parseInt(host.getAttribute('data-have') || '0', 10) || 0;
    const exclude = host.getAttribute('data-shown-pids') || ''; // pids already on the page - never duplicate
    // Buyer's storefront country: the worker needs to know WHOSE local stock counts
    // (GB buyer -> GB stock, US -> US, ...); an overseas-only item carries its own note.
    const country = host.getAttribute('data-country') || '';
    if (!terms || have >= SUPPLIER_THIN_MAX) return;

    // overseas=1: this theme shows the overseas note, so the worker may add overseas-only items.
    proxyGet('/search', { q: terms, have: String(have), limit: String(SUPPLIER_LIMIT), exclude: exclude, country: country, overseas: '1' })
      .then((r) => {
        if (!r || !r.ok || !r.products || !r.products.length) return;
        const grid = host.querySelector('[data-pawscout-grid]');
        if (!grid) return;
        // In-grid merge: precede the first ghost with a supplier separator, but
        // never add a second one if Stage-1 already rendered its 'Suggested' separator.
        if (!grid.querySelector('.search-suggested-sep')) {
          const sep = document.createElement('div');
          sep.className = 'search-suggested-sep';
          sep.setAttribute('role', 'separator');
          sep.appendChild(el('span', null, 'From our supplier network'));
          grid.appendChild(sep);
        }
        r.products.forEach((p) => grid.appendChild(buildGhostCard(p)));
      })
      .catch(() => { /* backfill is additive - never break the search page */ });
  };

  /* ---------- ghost preview ---------- */

  let modal = null;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const closePreview = () => {
    if (modal) { modal.remove(); modal = null; document.body.classList.remove('pawscout-lock'); }
  };

  const openPreview = (pid, cardDelivery) => {
    closePreview();
    modal = el('div', 'pawscout-modal');
    const overlay = el('div', 'pawscout-overlay');
    overlay.addEventListener('click', closePreview);
    const panel = el('div', 'pawscout-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Product preview');
    const close = el('button', 'pawscout-close', '✕');
    close.type = 'button';
    close.addEventListener('click', closePreview);
    const content = el('div', 'pawscout-content');
    content.appendChild(el('p', 'pawscout-loading', 'Fetching product…'));
    panel.appendChild(close);
    panel.appendChild(content);
    modal.appendChild(overlay);
    modal.appendChild(panel);
    document.body.appendChild(modal);
    document.body.classList.add('pawscout-lock');

    proxyGet('/product', { pid, overseas: '1' })
      .then((r) => {
        if (!r || !r.ok) { renderPreviewError(content); return; }
        renderPreview(content, r.product, cardDelivery);
      })
      .catch(() => renderPreviewError(content));
  };

  const renderPreviewError = (content) => {
    content.textContent = '';
    content.appendChild(el('p', 'pawscout-loading', 'This product is no longer available. Please try another match.'));
  };

  const renderPreview = (content, p, cardDelivery) => {
    content.textContent = '';
    if (p.images && p.images.length) {
      const img = document.createElement('img');
      img.src = p.images[0];
      img.alt = p.title;
      img.className = 'pawscout-image';
      content.appendChild(img);
    }
    content.appendChild(el('h2', 'pawscout-title', p.title));
    content.appendChild(el('p', 'pawscout-price', p.variants && p.variants.length > 1 ? 'From ' + supplierMoney(p.priceFrom, p.currency) : supplierMoney(p.priceFrom, p.currency)));
    if (p.variants && p.variants.length > 1) {
      const list = el('p', 'pawscout-variants', p.variants.length + ' options: ' + p.variants.slice(0, 6).map((v) => v.name).join(', ') + (p.variants.length > 6 ? '…' : ''));
      content.appendChild(list);
    }
    if (p.descriptionText) content.appendChild(el('p', 'pawscout-desc', p.descriptionText.slice(0, 400)));
    // The note is the visitor's market's Delivery setting line, rendered by main-search.liquid
    // (snippets/delivery-promise.liquid, format ship_note); it names no time.
    const searchHost = document.querySelector('[data-pawscout-search]');
    const shipNote = (searchHost && searchHost.getAttribute('data-ship-note')) || 'Ships from our supplier network.';
    // An overseas item's note takes the place of that line, so the preview never states two
    // times. The preview's own `delivery` decides; a null one after an overseas card means the
    // worker could not confirm the route just now, so the note keeps "overseas" and drops the figure.
    let overseas = overseasNote(p.delivery);
    if (!overseas && p.delivery === null && cardDelivery && cardDelivery.overseas === true) overseas = 'Ships from overseas';
    content.appendChild(overseas ? el('p', 'pawscout-ship pawscout-overseas', overseas) : el('p', 'pawscout-ship', shipNote));

    const action = el('div', 'pawscout-action');
    const btn = el('button', 'commerce-add-button pawscout-cta', 'Preparing product…');
    btn.type = 'button';
    btn.disabled = true;
    action.appendChild(btn);
    content.appendChild(action);

    if (p.url) { activateCta(btn, p.url); return; }

    let polls = 0;
    const poll = () => {
      if (!modal) return; // closed
      polls += 1;
      proxyGet('/import-status', { pid: p.pid })
        .then((r) => {
          if (r && r.ok && r.state === 'imported' && r.url) { activateCta(btn, r.url); return; }
          if (r && r.ok && r.state === 'failed') { btn.textContent = 'Currently unavailable'; return; }
          if (polls < POLL_MAX) setTimeout(poll, POLL_MS);
          else btn.textContent = 'Taking longer than usual - check back shortly';
        })
        .catch(() => { if (polls < POLL_MAX) setTimeout(poll, POLL_MS); });
    };
    setTimeout(poll, POLL_MS);
  };

  const activateCta = (btn, url) => {
    btn.disabled = false;
    btn.textContent = 'View product & buy';
    btn.addEventListener('click', () => { window.location.href = url; });
  };

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePreview(); });

  /* ---------- performance beacons ---------- */

  const initBeacons = () => {
    const meta = document.querySelector('meta[name="pawscout-pid"]');
    if (!meta) return;
    const pid = meta.getAttribute('content');
    if (!pid) return;
    sendEvent(pid, 'view');
    // Non-blocking ATC signal: piggyback on any add-to-cart form submit on this PDP.
    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (form instanceof HTMLFormElement && form.action && form.action.indexOf('/cart/add') !== -1) {
        sendEvent(pid, 'atc');
      }
    }, true);
  };


  /* ---------------- W-ADDON: hidden basket-fillers ----------------
   * Cheap, curated products that are deliberately invisible to browsing and
   * search (seo.hidden + no collection). They surface ONLY here: the PDP
   * "Complete the kit" row and the cart drawer's free-delivery nudge.
   * Flow: /apps/pawscout/addons -> handles -> /products/{handle}.js (price,
   * image, variant stay Shopify-fresh) -> mini cards with one-tap add.
   */
  let addonCache = null; // handle list is stable per page view

  const fetchAddonProducts = (limit) => {
    if (addonCache) return Promise.resolve(addonCache.slice(0, limit));
    return proxyGet('/addons', { limit: String(limit) })
      .then((r) => {
        if (!r || !r.ok || !Array.isArray(r.addons) || !r.addons.length) return [];
        return Promise.all(
          r.addons.map((handle) =>
            fetch(`/products/${handle}.js`, { headers: { Accept: 'application/json' } })
              .then((res) => (res.ok ? res.json() : null))
              .catch(() => null)
          )
        );
      })
      .then((products) => {
        addonCache = (products || []).filter((p) => p && p.available && p.variants && p.variants.length);
        return addonCache.slice(0, limit);
      })
      .catch(() => []);
  };

  const renderCartDrawerHtml = (sections) => {
    // Mirrors theme.js: swap [data-cart-drawer-content] from the section payload.
    const html = sections && sections['cart-drawer'];
    const drawer = document.querySelector('[data-cart-drawer]');
    if (!drawer || typeof html !== 'string') return;
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const fresh = parsed.querySelector('[data-cart-drawer-content]');
    const live = drawer.querySelector('[data-cart-drawer-content]');
    if (fresh && live) live.innerHTML = fresh.innerHTML;
    fetch('/cart.js', { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((cart) => {
        document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = cart.item_count || 0; });
      })
      .catch(() => {});
  };

  const addonCard = (product) => {
    const v = product.variants[0];
    const card = document.createElement('div');
    card.className = 'addon-card';
    const img = document.createElement('img');
    img.src = product.featured_image || (product.images && product.images[0]) || '';
    img.alt = '';
    img.loading = 'lazy';
    img.width = 56; img.height = 56;
    const info = document.createElement('div');
    info.className = 'addon-card__info';
    const title = document.createElement('a');
    title.href = product.url;
    title.textContent = product.title;
    const price = document.createElement('span');
    price.textContent = shopMoney(v.price / 100); // Shopify's product JSON: already the visitor's currency
    info.appendChild(title);
    info.appendChild(price);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'addon-card__add';
    btn.textContent = '+ Add';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'Adding…';
      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: v.id, quantity: 1, sections: 'cart-drawer' })
      })
        .then((r) => { if (!r.ok) throw new Error('add failed'); return r.json(); })
        .then((data) => { renderCartDrawerHtml(data.sections); })
        .catch(() => { btn.disabled = false; btn.textContent = '+ Add'; });
    });
    card.appendChild(img);
    card.appendChild(info);
    card.appendChild(btn);
    return card;
  };

  const fillAddonContainer = (root, limit) => {
    const slot = root.querySelector('[data-addon-cards]');
    if (!slot || slot.childElementCount > 0) return;
    fetchAddonProducts(limit).then((products) => {
      if (!products.length) return;
      products.forEach((p) => slot.appendChild(addonCard(p)));
      root.hidden = false;
    });
  };

  const initAddons = () => {
    // PDP row (static markup, fill once).
    const pdpRow = document.querySelector('[data-pawscout-pdp-addons]');
    if (pdpRow) fillAddonContainer(pdpRow, 3);

    // Cart drawer nudge: the drawer content is server-re-rendered on every
    // cart change, wiping our cards - observe and refill.
    const drawerContent = document.querySelector('[data-cart-drawer-content]');
    if (drawerContent) {
      const refill = () => {
        const nudge = drawerContent.querySelector('[data-pawscout-cart-addons]');
        if (nudge) fillAddonContainer(nudge, 2);
      };
      refill();
      new MutationObserver(refill).observe(drawerContent, { childList: true, subtree: false });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initSearchBackfill(); initBeacons(); initAddons(); });
  } else {
    initSearchBackfill();
    initBeacons();
    initAddons();
  }
})();

/* PawScout storefront integration.
 *
 * 1) Search backfill: when the store answers a search with fewer than the grid
 *    cap (12), fetch gated supplier candidates via the Shopify App Proxy
 *    (/apps/pawscout/*, HMAC-signed by Shopify — never call the worker domain
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
  const GRID_CAP = 12;
  const POLL_MS = 1500;
  const POLL_MAX = 20;

  const money = (n) => '£' + Number(n).toFixed(2);

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
    price.textContent = money(p.price);
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
    body.appendChild(action);

    const link = document.createElement('div');
    link.className = 'commerce-card-link';
    link.appendChild(media);
    link.appendChild(body);
    card.appendChild(link);

    const open = () => (p.url ? (window.location.href = p.url) : openPreview(p.pid));
    btn.addEventListener('click', open);
    media.addEventListener('click', open);
    return card;
  };

  const initSearchBackfill = () => {
    const host = document.querySelector('[data-pawscout-search]');
    if (!host) return;
    const terms = host.getAttribute('data-terms') || '';
    const have = parseInt(host.getAttribute('data-have') || '0', 10) || 0;
    if (!terms || have >= GRID_CAP) return;

    proxyGet('/search', { q: terms, have: String(have), limit: String(GRID_CAP - have) })
      .then((r) => {
        if (!r || !r.ok || !r.products || !r.products.length) return;
        const grid = host.querySelector('[data-pawscout-grid]');
        if (!grid) return;
        r.products.forEach((p) => grid.appendChild(buildGhostCard(p)));
        host.hidden = false;
      })
      .catch(() => { /* backfill is additive — never break the search page */ });
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

  const openPreview = (pid) => {
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

    proxyGet('/product', { pid })
      .then((r) => {
        if (!r || !r.ok) { renderPreviewError(content); return; }
        renderPreview(content, r.product);
      })
      .catch(() => renderPreviewError(content));
  };

  const renderPreviewError = (content) => {
    content.textContent = '';
    content.appendChild(el('p', 'pawscout-loading', 'This product is no longer available. Please try another match.'));
  };

  const renderPreview = (content, p) => {
    content.textContent = '';
    if (p.images && p.images.length) {
      const img = document.createElement('img');
      img.src = p.images[0];
      img.alt = p.title;
      img.className = 'pawscout-image';
      content.appendChild(img);
    }
    content.appendChild(el('h2', 'pawscout-title', p.title));
    content.appendChild(el('p', 'pawscout-price', p.variants && p.variants.length > 1 ? 'From ' + money(p.priceFrom) : money(p.priceFrom)));
    if (p.variants && p.variants.length > 1) {
      const list = el('p', 'pawscout-variants', p.variants.length + ' options: ' + p.variants.slice(0, 6).map((v) => v.name).join(', ') + (p.variants.length > 6 ? '…' : ''));
      content.appendChild(list);
    }
    if (p.descriptionText) content.appendChild(el('p', 'pawscout-desc', p.descriptionText.slice(0, 400)));
    content.appendChild(el('p', 'pawscout-ship', 'Ships from our supplier network · estimated 7–12 days to the UK.'));

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
          else btn.textContent = 'Taking longer than usual — check back shortly';
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initSearchBackfill(); initBeacons(); });
  } else {
    initSearchBackfill();
    initBeacons();
  }
})();

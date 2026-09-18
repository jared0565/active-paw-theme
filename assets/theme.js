const setProductMedia = (thumb) => {
  const shell = thumb.closest('[data-pdp-shell]');
  const media = shell ? shell.querySelector('.product-featured-media img') : document.querySelector('.product-featured-media img');
  if (!media || !thumb.dataset.productMedia || media.src === thumb.dataset.productMedia) return;

  media.src = thumb.dataset.productMedia;
  media.removeAttribute('srcset');
  if (thumb.querySelector('img')?.alt) {
    media.alt = thumb.querySelector('img').alt;
  }

  const thumbScope = shell || document;
  thumbScope.querySelectorAll('.product-thumb').forEach((item) => item.classList.remove('is-active'));
  thumb.classList.add('is-active');
};

const numericCssValue = (element, name, fallback) => {
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
};

// Keep the cart badge and its accessible name in sync after async cart updates.
const updateCartCount = (count) => {
  const numeric = Number(count) || 0;
  const display = numeric > 99 ? '99+' : String(numeric);
  document.querySelectorAll('.cart-count').forEach((counter) => {
    counter.textContent = display;
  });
  document.querySelectorAll('.header-cart').forEach((cart) => {
    cart.setAttribute('aria-label', `Cart with ${numeric} items`);
  });
};

// Measure the real sticky-header height so sticky offsets never desync from the
// hardcoded CSS fallback (announcement bar wrap, logo resize, nav reflow, etc.).
const syncStickyHeaderOffset = () => {
  const stack = document.querySelector('.sticky-header-stack');
  if (!stack) return;
  const height = Math.round(stack.getBoundingClientRect().height);
  if (height > 0) {
    document.documentElement.style.setProperty('--sticky-header-offset', `${height}px`);
  }
};

let stickyOffsetTimer;
const scheduleStickyOffsetSync = () => {
  window.clearTimeout(stickyOffsetTimer);
  stickyOffsetTimer = window.setTimeout(syncStickyHeaderOffset, 80);
};

const fitProductTitle = (title) => {
  const styles = getComputedStyle(title);
  const maxSize = numericCssValue(title, '--pdp-title-max', Number.parseFloat(styles.fontSize) || 42);
  const minSize = numericCssValue(title, '--pdp-title-min', 22);
  const maxHeight = numericCssValue(title, '--pdp-title-max-height', 220);
  let nextSize = maxSize;

  title.style.fontSize = `${maxSize}px`;
  title.classList.remove('is-title-compressed');

  while (nextSize > minSize && title.scrollHeight > maxHeight) {
    nextSize -= 1;
    title.style.fontSize = `${nextSize}px`;
  }

  title.classList.toggle('is-title-compressed', nextSize < maxSize);
};

const fitProductTitles = () => {
  document.querySelectorAll('[data-fit-title]').forEach(fitProductTitle);
};

let titleResizeTimer;
const scheduleTitleFit = () => {
  window.clearTimeout(titleResizeTimer);
  titleResizeTimer = window.setTimeout(fitProductTitles, 80);
};

const copyToClipboard = (text) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    document.body.appendChild(textArea);
    textArea.select();

    try {
      const copied = document.execCommand('copy');
      document.body.removeChild(textArea);
      copied ? resolve() : reject(new Error('Copy failed'));
    } catch (error) {
      document.body.removeChild(textArea);
      reject(error);
    }
  });
};

const setShareFeedback = (button, labelText) => {
  const label = button.querySelector('[data-share-label]');
  if (!label) return;

  const defaultText = button.dataset.shareDefaultLabel || label.textContent || 'Share';
  button.dataset.shareDefaultLabel = defaultText;
  label.textContent = labelText;
  button.classList.add('is-shared');

  window.clearTimeout(button.shareFeedbackTimer);
  button.shareFeedbackTimer = window.setTimeout(() => {
    label.textContent = defaultText;
    button.classList.remove('is-shared');
  }, 2200);
};

const shareStoreLink = (button) => {
  const rawShareUrl = button.dataset.shareUrl || window.location.href;
  const shareUrl = new URL(rawShareUrl, window.location.origin).href;
  // Title + URL only unless a button explicitly opts into extra text: when a
  // text line rides along, some targets (Facebook chat among them) post it as
  // a plain text message and never render the link preview card.
  const shareData = {
    title: button.dataset.shareTitle || document.title,
    url: shareUrl
  };
  if (button.dataset.shareText) shareData.text = button.dataset.shareText;

  button.disabled = true;

  const finish = () => {
    button.disabled = false;
  };

  if (navigator.share) {
    navigator.share(shareData)
      .then(() => {
        setShareFeedback(button, 'Shared');
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          return copyToClipboard(shareUrl).then(() => {
            setShareFeedback(button, 'Link copied');
          });
        }
        return undefined;
      })
      .finally(finish);
    return;
  }

  copyToClipboard(shareUrl)
    .then(() => {
      setShareFeedback(button, 'Link copied');
    })
    .catch(() => {
      setShareFeedback(button, 'Copy failed');
    })
    .finally(finish);
};

document.addEventListener('mouseover', (event) => {
  const thumb = event.target.closest('.product-thumb');
  if (thumb) setProductMedia(thumb);
});

document.addEventListener('focusin', (event) => {
  const thumb = event.target.closest('.product-thumb');
  if (thumb) setProductMedia(thumb);
});

/* Buybox "Value": cash total of what Add to cart will put in the basket. */
const updateBuyboxValue = () => {
  const valueEl = document.querySelector('[data-buybox-value]');
  if (!valueEl) return;
  let unitPrice = Number(valueEl.dataset.unitPrice) || 0;
  const select = document.getElementById('ProductSelect');
  if (select) {
    const option = select.options[select.selectedIndex];
    if (option && option.dataset.price) unitPrice = Number(option.dataset.price);
  }
  const quantity = Math.max(1, Number(document.getElementById('ProductQuantity')?.value) || 1);
  const currency = valueEl.dataset.currency || 'GBP';
  valueEl.textContent = new Intl.NumberFormat(undefined, { style: 'currency', currency }).format((unitPrice * quantity) / 100);
};

const normalizeCartQuantity = (input) => {
  const max = Number(input.getAttribute('max'));
  const min = Number(input.getAttribute('min') || 0);
  const current = Number(input.value || 0);

  if (Number.isFinite(max) && current > max) {
    input.value = String(max);
    input.setCustomValidity(`Maximum available quantity is ${max}.`);
    input.reportValidity();
    return;
  }

  if (Number.isFinite(min) && current < min) {
    input.value = String(min);
  }

  input.setCustomValidity('');
};

document.addEventListener('input', (event) => {
  const cartQuantity = event.target.closest('[data-cart-quantity]');
  if (cartQuantity) {
    normalizeCartQuantity(cartQuantity);
    updateBuyboxValue();
  }
});

document.addEventListener('change', (event) => {
  const cartQuantity = event.target.closest('[data-cart-quantity]');
  if (cartQuantity) normalizeCartQuantity(cartQuantity);
  if (cartQuantity || event.target.closest('#ProductSelect')) updateBuyboxValue();
});

document.addEventListener('click', (event) => {
  const shareButton = event.target.closest('[data-share-url]');
  if (shareButton) {
    event.preventDefault();
    shareStoreLink(shareButton);
    return;
  }

  const quickAdd = event.target.closest('.quick-add');
  if (quickAdd) {
    quickAdd.textContent = 'Added to demo cart';
    quickAdd.disabled = true;
    window.setTimeout(() => {
      quickAdd.textContent = 'Quick add';
      quickAdd.disabled = false;
    }, 1600);
  }

  const thumb = event.target.closest('.product-thumb');
  if (thumb) {
    setProductMedia(thumb);
  }

  const quantityButton = event.target.closest('[data-quantity-change]');
  if (quantityButton) {
    const input = quantityButton.closest('form')?.querySelector('#ProductQuantity');
    if (!input) return;
    const delta = Number(quantityButton.dataset.quantityChange);
    const max = Number(input.getAttribute('max'));
    let nextValue = Math.max(1, Number(input.value || 1) + delta);
    if (Number.isFinite(max) && max > 0 && nextValue > max) {
      nextValue = max;
    }
    input.value = String(nextValue);
    updateBuyboxValue();
  }

  const showMoreButton = event.target.closest('[data-show-more]');
  if (showMoreButton) {
    const block = showMoreButton.closest('.category-block');
    if (!block) return;
    const expanded = block.classList.toggle('is-expanded');
    showMoreButton.setAttribute('aria-expanded', String(expanded));
    const label = showMoreButton.querySelector('span:first-child');
    const symbol = showMoreButton.querySelector('span:last-child');
    if (label) label.textContent = expanded ? 'Show fewer products' : label.textContent.replace('Show fewer products', 'Show more');
    if (symbol) symbol.textContent = expanded ? '-' : '+';
  }

  const bundleButton = event.target.closest('[data-bundle-add]');
  if (bundleButton) {
    const variantIds = (bundleButton.dataset.variantIds || '')
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (variantIds.length === 0) return;

    const originalText = bundleButton.textContent;
    const routesRoot = window.Shopify?.routes?.root || '/';
    bundleButton.disabled = true;
    bundleButton.textContent = 'Adding set...';

    fetch(`${routesRoot}cart/add.js`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        items: variantIds.map((id) => ({ id, quantity: 1 }))
      })
    })
      .then((response) => {
        if (!response.ok) throw new Error('Bundle add failed');
        return fetch(`${routesRoot}cart.js`, {
          headers: { Accept: 'application/json' }
        });
      })
      .then((response) => response.json())
      .then((cartState) => {
        updateCartCount(cartState.item_count || 0);
        bundleButton.textContent = 'Set added';
        window.setTimeout(() => {
          bundleButton.textContent = 'Add recommended set';
          bundleButton.disabled = false;
        }, 1800);
      })
      .catch(() => {
        bundleButton.textContent = 'Could not add set';
        window.setTimeout(() => {
          bundleButton.textContent = originalText;
          bundleButton.disabled = false;
        }, 2200);
      });
  }
});

fitProductTitles();
window.addEventListener('load', fitProductTitles);
window.addEventListener('resize', scheduleTitleFit);

// Browsers restore quantity/variant form state on back-navigation; re-sync the buybox value.
updateBuyboxValue();
window.addEventListener('pageshow', updateBuyboxValue);

syncStickyHeaderOffset();
window.addEventListener('load', syncStickyHeaderOffset);
window.addEventListener('resize', scheduleStickyOffsetSync);

/* ---------------- Cart drawer + AJAX cart ---------------- */
const CART_DRAWER_SECTION = 'cart-drawer';
const shopRoot = () => window.Shopify?.routes?.root || '/';
const getCartDrawer = () => document.querySelector('[data-cart-drawer]');

let cartDrawerReturnFocus = null;

const openCartDrawer = () => {
  const drawer = getCartDrawer();
  if (!drawer) return;
  cartDrawerReturnFocus = document.activeElement;
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('cart-drawer-open');
  const panel = drawer.querySelector('.cart-drawer__panel');
  if (panel) window.requestAnimationFrame(() => panel.focus());
};

const closeCartDrawer = () => {
  const drawer = getCartDrawer();
  if (!drawer || !drawer.classList.contains('is-open')) return;
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('cart-drawer-open');
  if (cartDrawerReturnFocus && typeof cartDrawerReturnFocus.focus === 'function') {
    cartDrawerReturnFocus.focus();
  }
  cartDrawerReturnFocus = null;
};

// `html` is first-party markup from Shopify's same-origin Section Rendering API
// (the cart-drawer section, server-rendered via Liquid) - the same trust level as the
// page itself, not third-party/user input. We parse it in an inert document and only
// ever read back the [data-cart-drawer-content] payload. This matches Shopify Dawn's
// getSectionInnerHTML pattern; textContent can't be used as we must inject rendered markup.
const renderCartDrawerSection = (html) => {
  const drawer = getCartDrawer();
  if (!drawer || typeof html !== 'string') return;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const fresh = parsed.querySelector('[data-cart-drawer-content]');
  const live = drawer.querySelector('[data-cart-drawer-content]');
  if (fresh && live) live.innerHTML = fresh.innerHTML;
};

// Apply the drawer HTML + cart count from a /cart/*.js response; falls back to /cart.js for count.
const syncCartFromResponse = (data) => {
  if (data && data.sections && data.sections[CART_DRAWER_SECTION]) {
    renderCartDrawerSection(data.sections[CART_DRAWER_SECTION]);
  }
  if (data && typeof data.item_count === 'number') {
    updateCartCount(data.item_count);
    return Promise.resolve(data);
  }
  return fetch(`${shopRoot()}cart.js`, { headers: { Accept: 'application/json' } })
    .then((response) => response.json())
    .then((cart) => {
      updateCartCount(cart.item_count || 0);
      return cart;
    })
    .catch(() => data);
};

const showCartFormError = (form, message) => {
  let alert = form.querySelector('[data-cart-error]');
  if (!alert) {
    alert = document.createElement('p');
    alert.className = 'cart-error';
    alert.setAttribute('data-cart-error', '');
    alert.setAttribute('role', 'alert');
    form.appendChild(alert);
  }
  alert.textContent = message;
};

const clearCartFormError = (form) => {
  const alert = form.querySelector('[data-cart-error]');
  if (alert) alert.textContent = '';
};

// Re-render the drawer from the server's current cart (used to revert optimistic UI
// when a change is rejected). The ?sections= GET returns { 'cart-drawer': html } directly.
const refreshCartDrawer = () =>
  fetch(`${shopRoot()}?sections=${CART_DRAWER_SECTION}`, { headers: { Accept: 'application/json' } })
    .then((response) => response.json())
    .then((data) => renderCartDrawerSection(data[CART_DRAWER_SECTION]))
    .then(() =>
      fetch(`${shopRoot()}cart.js`, { headers: { Accept: 'application/json' } })
        .then((response) => response.json())
        .then((cart) => updateCartCount(cart.item_count || 0))
    )
    .catch(() => {});

const changeCartLine = (line, quantity) =>
  fetch(`${shopRoot()}cart/change.js`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      line,
      quantity,
      sections: [CART_DRAWER_SECTION],
      sections_url: window.location.pathname
    })
  })
    .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
    .then(({ ok, data }) => (ok ? syncCartFromResponse(data) : refreshCartDrawer()))
    .catch(() => {});

// Intercept add-to-cart forms (PDP + product cards) for AJAX add + drawer.
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!form.action || form.action.indexOf('/cart/add') === -1) return;
  if (!getCartDrawer()) return; // no drawer present: allow the normal form POST

  event.preventDefault();
  clearCartFormError(form);

  const submitButton = form.querySelector('[type="submit"]');
  const formData = new FormData(form);
  formData.append('sections', CART_DRAWER_SECTION);
  formData.append('sections_url', window.location.pathname);

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.classList.add('is-loading');
  }

  fetch(`${shopRoot()}cart/add.js`, { method: 'POST', headers: { Accept: 'application/json' }, body: formData })
    .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) {
        const reason = (data && (data.description || data.message)) || 'Could not add to cart.';
        showCartFormError(form, reason);
        return undefined;
      }
      return syncCartFromResponse(data).then(() => openCartDrawer());
    })
    .catch(() => {
      showCartFormError(form, 'Could not add to cart. Please try again.');
    })
    .finally(() => {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.classList.remove('is-loading');
      }
    });
});

// Cart drawer clicks: open / close / remove / step quantity.
document.addEventListener('click', (event) => {
  const openTrigger = event.target.closest('[data-cart-open]');
  if (openTrigger) {
    if (!getCartDrawer()) return; // allow navigation to /cart as fallback
    event.preventDefault();
    openCartDrawer();
    return;
  }

  if (event.target.closest('[data-cart-drawer-close]')) {
    event.preventDefault();
    closeCartDrawer();
    return;
  }

  const removeButton = event.target.closest('[data-line-remove]');
  if (removeButton) {
    event.preventDefault();
    changeCartLine(Number(removeButton.dataset.line), 0);
    return;
  }

  const stepButton = event.target.closest('[data-line-step]');
  if (stepButton) {
    const line = Number(stepButton.dataset.line);
    const drawer = getCartDrawer();
    const input = drawer && drawer.querySelector(`[data-line-qty][data-line="${line}"]`);
    const current = Number((input && input.value) || 1);
    const max = input ? Number(input.getAttribute('max')) : NaN;
    let next = Math.max(0, current + Number(stepButton.dataset.lineStep));
    if (Number.isFinite(max) && max >= 0 && next > max) next = max;
    // Optimistically reflect the new value so rapid clicks compound before the re-render.
    if (input) input.value = String(next);
    changeCartLine(line, next);
  }
});

// Manual quantity typing inside the drawer.
document.addEventListener('change', (event) => {
  const lineInput = event.target.closest('[data-line-qty]');
  if (!lineInput) return;
  const line = Number(lineInput.dataset.line);
  let quantity = Math.max(0, Number(lineInput.value || 0));
  const max = Number(lineInput.getAttribute('max'));
  if (Number.isFinite(max) && max >= 0 && quantity > max) quantity = max;
  changeCartLine(line, quantity);
});

// Escape to close; simple focus trap while the drawer is open.
document.addEventListener('keydown', (event) => {
  const drawer = getCartDrawer();
  if (!drawer || !drawer.classList.contains('is-open')) return;
  if (event.key === 'Escape') {
    closeCartDrawer();
    return;
  }
  if (event.key !== 'Tab') return;
  const panel = drawer.querySelector('.cart-drawer__panel');
  if (!panel) return;
  const focusables = Array.from(
    panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')
  ).filter((el) => el.offsetParent !== null);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

/* ---------------- Header Collections dropdown ---------------- */
// CSS opens the menu on hover/focus-within (desktop); this adds click/tap toggle + outside-close.
const closeCollectionsMenu = () => {
  document
    .querySelectorAll('[data-collections-trigger][aria-expanded="true"]')
    .forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
};
// Header share dropdown - click-only (it holds interactive controls), mutually
// exclusive with the collections menu, and closed by an outside click or Esc.
const closeShareMenu = () => {
  document
    .querySelectorAll('[data-share-trigger][aria-expanded="true"]')
    .forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
  // Collapse the QR sub-panel too, so the menu reopens in its default state.
  document.querySelectorAll('[data-share-qr]:not([hidden])').forEach((p) => p.setAttribute('hidden', ''));
  document
    .querySelectorAll('[data-share-qr-toggle][aria-expanded="true"]')
    .forEach((t) => t.setAttribute('aria-expanded', 'false'));
};

document.addEventListener('click', (event) => {
  const collectionsTrigger = event.target.closest('[data-collections-trigger]');
  if (collectionsTrigger) {
    const isOpen = collectionsTrigger.getAttribute('aria-expanded') === 'true';
    closeCollectionsMenu();
    closeShareMenu();
    collectionsTrigger.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    return;
  }
  const shareTrigger = event.target.closest('[data-share-trigger]');
  if (shareTrigger) {
    const isOpen = shareTrigger.getAttribute('aria-expanded') === 'true';
    closeShareMenu();
    closeCollectionsMenu();
    shareTrigger.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    return;
  }
  if (!event.target.closest('[data-collections-menu]')) closeCollectionsMenu();
  if (!event.target.closest('[data-share-menu]')) closeShareMenu();
});

/* ---------------- Contact modal ---------------- */
const getContactModal = () => document.querySelector('[data-contact-modal]');
let contactReturnFocus = null;

const openContactModal = () => {
  const modal = getContactModal();
  if (!modal) return;
  contactReturnFocus = document.activeElement;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('contact-modal-open');
  const dialog = modal.querySelector('.contact-modal__dialog');
  if (dialog) {
    window.requestAnimationFrame(() => {
      const firstField = dialog.querySelector('input, textarea');
      (firstField || dialog).focus();
    });
  }
};

const closeContactModal = () => {
  const modal = getContactModal();
  if (!modal || !modal.classList.contains('is-open')) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('contact-modal-open');
  if (contactReturnFocus && typeof contactReturnFocus.focus === 'function') contactReturnFocus.focus();
  contactReturnFocus = null;
};

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-contact-open]')) {
    event.preventDefault();
    openContactModal();
    return;
  }
  if (event.target.closest('[data-contact-close]')) {
    event.preventDefault();
    closeContactModal();
  }
});

/* Marketing opt-in on the contact form: the contact form itself never
   subscribes anyone. When the visitor ticks the opt-in box we ALSO submit
   Shopify's own newsletter signup (form_type=customer) in the background,
   which records proper marketing consent on the customer record - the same
   field the checkout opt-in writes. keepalive lets the request finish while
   the contact form's own full-page POST navigates away. Never blocks sending. */
document.addEventListener('submit', (event) => {
  const form = event.target.closest('#ContactForm');
  if (!form) return;
  const optIn = form.querySelector('[data-contact-marketing]');
  const email = form.querySelector('#ContactEmail');
  if (!optIn || !optIn.checked || !email || !email.value) return;
  const body = new URLSearchParams({
    form_type: 'customer',
    utf8: '✓',
    'contact[email]': email.value.trim(),
    'contact[tags]': 'newsletter,contact-form'
  });
  try {
    fetch('/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      keepalive: true
    });
  } catch (e) { /* the ticked box still rides inside the message itself */ }
});

/* ---------------- Product details modal (PDP "More details") ---------------- */
const getDetailsModal = () => document.querySelector('[data-details-modal]');
let detailsReturnFocus = null;

const openDetailsModal = () => {
  const modal = getDetailsModal();
  if (!modal) return;
  detailsReturnFocus = document.activeElement;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('contact-modal-open'); // shared scroll lock
  const dialog = modal.querySelector('.contact-modal__dialog');
  if (dialog) window.requestAnimationFrame(() => dialog.focus());
};

const closeDetailsModal = () => {
  const modal = getDetailsModal();
  if (!modal || !modal.classList.contains('is-open')) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('contact-modal-open');
  if (detailsReturnFocus && typeof detailsReturnFocus.focus === 'function') detailsReturnFocus.focus();
  detailsReturnFocus = null;
};

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-details-open]')) {
    event.preventDefault();
    openDetailsModal();
    return;
  }
  if (event.target.closest('[data-details-close]')) {
    event.preventDefault();
    closeDetailsModal();
  }
});

/* ---------------- Storewide event feed (shared) ---------------- */
// PawScout's /public/event is the single source of truth for which storewide
// event is running (name, code, percentage, end date) and which enabled
// calendar event comes next (name and dates only, never a code or a
// percentage ahead of time). The welcome modal, the hero event badge and the
// announcement bar all read ONE fetch per page view; the feed is cached 10
// minutes server-side and 120 seconds in the browser. Resolves to null when
// the feed is unreachable, slow (3s cap) or malformed, so a failure can never
// paint anything: every consumer keeps its server-rendered state.
let storewideEventPromise = null;
const loadStorewideEvent = () => {
  if (storewideEventPromise) return storewideEventPromise;
  const host = document.querySelector('[data-storewide-event-src]');
  const src = host ? host.getAttribute('data-storewide-event-src') : '';
  if (!src || !window.fetch) {
    storewideEventPromise = Promise.resolve(null);
    return storewideEventPromise;
  }
  const controller = ('AbortController' in window) ? new AbortController() : null;
  const abortTimer = controller ? setTimeout(() => controller.abort(), 3000) : null;
  storewideEventPromise = fetch(src, controller ? { signal: controller.signal } : {})
    .then((response) => (response.ok ? response.json() : null))
    .then((event) => (event && typeof event === 'object' ? event : null))
    .catch(() => null)
    .then((event) => {
      if (abortTimer) clearTimeout(abortTimer);
      return event;
    });
  return storewideEventPromise;
};

// Feature-detect every field: `name` and `next` are optional, and an active
// payload is only trusted when it carries a code.
const storewideEventRunning = (event) => Boolean(event) && event.active === true && Boolean(event.code);
const storewideEventNext = (event) => {
  const next = event && event.next;
  return next && typeof next === 'object' && next.name ? next : null;
};
const storewidePctOff = (event) => {
  const pct = Number(event.pctOff);
  return Number.isFinite(pct) && pct > 0 ? pct : null;
};
// Running-event offer line, e.g. "15% off with code SUMMERSALE until 31 August".
// The end date is appended only while the whole line still fits the seal.
const storewideBadgeOffer = (event) => {
  const pct = storewidePctOff(event);
  const base = pct ? `${pct}% off with code ${event.code}` : `Code ${event.code}`;
  const withEnd = event.endsLabel ? `${base} until ${event.endsLabel}` : base;
  return withEnd.length <= 52 ? withEnd : base;
};
// Next-event date line, e.g. "Friday 27 November to Monday 30 November".
const storewideNextDates = (next) => [next.startsLabel, next.endsLabel].filter(Boolean).join(' to ');

/* ---------------- Hero event badge ---------------- */
// The seal renders its Theme Editor copy server-side, then swaps in place
// once the feed answers: the running event, else the next planned one, else
// it hides (nothing to stamp that the calendar can vouch for). An unreachable
// feed leaves the server copy alone. See snippets/hero-event-badge.liquid.
(() => {
  const badge = document.querySelector('[data-event-badge]');
  if (!badge) return;
  const paint = (state, emojiText, titleText, subText) => {
    const emoji = badge.querySelector('.hero-event-badge-emoji');
    const title = badge.querySelector('.hero-event-badge-title');
    const sub = badge.querySelector('.hero-event-badge-sub');
    if (emoji && emojiText) emoji.textContent = emojiText;
    if (title) title.textContent = titleText;
    if (sub) sub.textContent = subText;
    badge.setAttribute('href', badge.getAttribute('data-event-badge-href') || '/collections/all');
    badge.setAttribute('aria-label', `${titleText} ${subText}`.trim());
    badge.setAttribute('data-event-state', state);
  };
  loadStorewideEvent().then((event) => {
    if (!event) return;
    if (storewideEventRunning(event)) {
      paint('active', badge.getAttribute('data-event-emoji-active'), event.name || event.code, storewideBadgeOffer(event));
      return;
    }
    const next = storewideEventNext(event);
    if (next) {
      paint('next', badge.getAttribute('data-event-emoji-next'), `Next: ${next.name}`, storewideNextDates(next));
      return;
    }
    badge.hidden = true;
  });
})();

/* ---------------- Announcement bar event item ---------------- */
// While an event runs, one extra item leads the bar: "<name>: <pct>% off
// everything with code <code>, until <end>". It is cloned from the template
// in snippets/announcement-event.liquid into EVERY announcement set (the bar
// renders its set twice for the seamless mobile marquee). Nothing is added
// when no event runs, a planned event included.
(() => {
  const template = document.querySelector('[data-announcement-event-template]');
  const bar = document.querySelector('.announcement');
  if (!template || !bar || !('content' in template) || !template.content.firstElementChild) return;
  loadStorewideEvent().then((event) => {
    if (!storewideEventRunning(event)) return;
    const pct = storewidePctOff(event);
    const offer = pct ? `${pct}% off everything with code ${event.code}` : `Use code ${event.code}`;
    const text = event.endsLabel ? `${offer}, until ${event.endsLabel}` : offer;
    bar.querySelectorAll('.announcement-set').forEach((set) => {
      const item = template.content.firstElementChild.cloneNode(true);
      const nameEl = item.querySelector('[data-event-name]');
      const textEl = item.querySelector('[data-event-text]');
      if (nameEl) nameEl.textContent = `${event.name || event.code}:`;
      if (textEl) textEl.textContent = text;
      // The duplicate set is aria-hidden for the marquee; keep its copy of the
      // link out of the tab order too.
      if (set.classList.contains('announcement-dup')) {
        item.querySelectorAll('a').forEach((link) => link.setAttribute('tabindex', '-1'));
      }
      set.insertBefore(item, set.firstChild);
    });
    bar.classList.add('has-event');
  });
})();

/* ---------------- Welcome offer modal (event slot) ---------------- */
// Shows once per browser per event: after 3 seconds or the visitor's first
// scroll, whichever comes first - never instantly on load (mobile interstitial
// etiquette, and Google penalises intrusive entry interstitials). Rendered
// only while the Theme-settings toggle is on, and skipped server-side for
// logged-in customers with orders. Every CTA routes through /discount/<code>
// so the offer is already applied at checkout. The only urgency shown is the
// event's real end date from the feed.
const getWelcomeModal = () => document.querySelector('[data-welcome-modal]');
const WELCOME_SEEN_KEY = 'ap_welcome_dismissed';

// Dismissals are remembered PER EVENT CODE: closing the welcome offer in June
// must not hide the Summer sale in August.
const welcomeCurrentCode = () => {
  const modal = getWelcomeModal();
  return modal ? (modal.getAttribute('data-welcome-code') || '') : '';
};

// Private-mode localStorage throws: treat as "seen" so those visitors are
// never pestered on every page view.
const welcomeSeen = () => {
  const code = welcomeCurrentCode();
  if (!code) return false;
  try {
    return Boolean(localStorage.getItem(`${WELCOME_SEEN_KEY}:${code}`));
  } catch (error) { return true; }
};
const markWelcomeSeen = () => {
  try { localStorage.setItem(`${WELCOME_SEEN_KEY}:${welcomeCurrentCode()}`, String(Date.now())); } catch (error) { /* nothing to persist */ }
};

let welcomeReturnFocus = null;

// Closed until PawScout confirms a running event. The modal has no offer of
// its own any more (the last settings fallback kept rendering for weeks after
// its event ended), so only a successful fetch reporting active:true with a
// code can flip this; an unreachable feed or an idle store means no modal.
// Checked at the door like welcomeSeen(), so a verdict landing after the 3s
// timer armed still wins.
let welcomeEventOver = true;
// Set once the 3s timer or the first scroll has passed, so a late verdict can
// still open the modal without ever opening it instantly on load.
let welcomeTriggerFired = false;

// True while the offer may still open in this page view: used by the install
// pill so two overlays never stack.
const welcomeMayOpen = () => Boolean(getWelcomeModal()) && !welcomeSeen() && !welcomeEventOver;

const openWelcomeModal = () => {
  const modal = getWelcomeModal();
  if (!modal || modal.classList.contains('is-open')) return;
  // A dismissed offer stays dismissed. The first-scroll trigger stays armed
  // after the 3s timer has already opened the modal, so without this check a
  // close-then-scroll reopened it (the "shows twice" bug). Every trigger path
  // funnels through here, so re-check dismissal at the door.
  if (welcomeSeen() || welcomeEventOver) return;
  welcomeReturnFocus = document.activeElement;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('contact-modal-open'); // shared scroll lock
  const input = modal.querySelector('[data-welcome-input]');
  if (input) window.requestAnimationFrame(() => input.focus());
};

const closeWelcomeModal = () => {
  const modal = getWelcomeModal();
  if (!modal || !modal.classList.contains('is-open')) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('contact-modal-open');
  markWelcomeSeen();
  if (welcomeReturnFocus && typeof welcomeReturnFocus.focus === 'function') welcomeReturnFocus.focus();
  welcomeReturnFocus = null;
};

// Shopify's /discount/<code> route applies the code to the checkout session
// via Set-Cookie - nobody fails to redeem because they forgot to type it.
// Its ?redirect= only accepts a bare path (query strings are stripped), so
// for search targets we apply the code with a background fetch of the route
// and then navigate ourselves, keeping ?q= intact. Capped at 1.5s so a slow
// network can never strand the click.
const applyWelcomeCodeThenGo = (targetPath) => {
  const modal = getWelcomeModal();
  const code = modal ? modal.getAttribute('data-welcome-code') || '' : '';
  const applied = fetch(`/discount/${encodeURIComponent(code)}`, { credentials: 'same-origin' }).catch(() => {});
  Promise.race([applied, new Promise((resolve) => setTimeout(resolve, 1500))]).then(() => {
    window.location.href = targetPath;
  });
};

// Paint the whole modal from a running event: headline, wording, chips, code,
// link and end line. Catalogue codes bring their own headline/subline/chips;
// a plain code falls back to lines built from its percentage and name, so no
// wording is ever invented beyond what the feed states.
const paintWelcomeModal = (modal, event) => {
  modal.setAttribute('data-welcome-code', event.code);
  const codeEl = modal.querySelector('.welcome-modal__code strong');
  if (codeEl) codeEl.textContent = event.code;
  const browse = modal.querySelector('[data-welcome-browse]');
  if (browse) {
    const redirect = modal.getAttribute('data-welcome-redirect') || '/collections/all';
    browse.setAttribute('href', `/discount/${encodeURIComponent(event.code)}?redirect=${encodeURIComponent(redirect)}`);
  }
  const pct = storewidePctOff(event);
  const heading = modal.querySelector('#WelcomeModalTitle');
  if (heading) heading.textContent = event.headline || (pct ? `${pct}% off everything` : (event.name || event.code));
  const sub = modal.querySelector('.welcome-modal__sub');
  if (sub) {
    const eventName = event.name && event.name !== event.code ? event.name : '';
    sub.textContent = event.subline || eventName;
    sub.hidden = !sub.textContent;
  }
  if (event.chips && event.chips.length) {
    const wrap = modal.querySelector('.welcome-modal__chips');
    if (wrap) {
      wrap.textContent = '';
      event.chips.forEach((chip) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-welcome-chip', chip);
        b.textContent = chip;
        wrap.appendChild(b);
      });
    }
  }
  let ends = modal.querySelector('.welcome-modal__ends');
  if (event.endsLabel) {
    if (!ends) {
      ends = document.createElement('p');
      ends.className = 'welcome-modal__ends';
      const later = modal.querySelector('.welcome-modal__later');
      if (later && later.parentNode) later.parentNode.insertBefore(ends, later);
    }
    ends.textContent = `Ends ${event.endsLabel}`;
  } else if (ends) {
    ends.remove();
  }
};

(() => {
  const modal = getWelcomeModal();
  if (!modal) return;
  // NOTE: no early return on welcomeSeen() here - dismissal is per event code,
  // and the feed below decides WHICH event this visitor is being offered.
  // openWelcomeModal re-checks at the door.

  // Ask PawScout which storewide event is actually running - the Shopify
  // discount is the single source of truth. Only a successful answer with a
  // running code can open the modal; anything else keeps it closed.
  loadStorewideEvent().then((event) => {
    if (!storewideEventRunning(event)) return;
    paintWelcomeModal(modal, event);
    welcomeEventOver = false;
    // The verdict can land after the 3s timer or the first scroll has already
    // passed; opening now still honours "never instantly on load".
    if (welcomeTriggerFired) openWelcomeModal();
  });

  const trigger = () => {
    welcomeTriggerFired = true;
    openWelcomeModal();
  };
  const timer = setTimeout(trigger, 3000);
  window.addEventListener('scroll', () => {
    clearTimeout(timer);
    trigger();
  }, { once: true, passive: true });

  modal.addEventListener('click', (event) => {
    if (event.target.closest('[data-welcome-close]')) {
      event.preventDefault();
      closeWelcomeModal();
      return;
    }
    const chip = event.target.closest('[data-welcome-chip]');
    if (chip) {
      markWelcomeSeen();
      applyWelcomeCodeThenGo(`/search?q=${encodeURIComponent(chip.getAttribute('data-welcome-chip'))}`);
      return;
    }
    // The browse link navigates via its href; just stop it re-appearing.
    if (event.target.closest('[data-welcome-browse]')) markWelcomeSeen();
  });

  const form = modal.querySelector('[data-welcome-search]');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = modal.querySelector('[data-welcome-input]');
      const query = input && input.value ? input.value.trim() : '';
      markWelcomeSeen();
      applyWelcomeCodeThenGo(query
        ? `/search?q=${encodeURIComponent(query)}`
        : modal.getAttribute('data-welcome-redirect') || '/collections/all');
    });
  }
})();

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeCollectionsMenu();
    closeShareMenu();
    closeContactModal();
    closeDetailsModal();
    closeWelcomeModal();
  }
  if (event.key !== 'Tab') return;
  const modal = [getContactModal(), getDetailsModal(), getWelcomeModal()].find((m) => m && m.classList.contains('is-open'));
  if (!modal) return;
  const dialog = modal.querySelector('.contact-modal__dialog');
  if (!dialog) return;
  const focusables = Array.from(
    dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
  ).filter((el) => el.offsetParent !== null);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// After the contact form posts, Shopify reloads with the result rendered in the modal -
// auto-open it so the visitor sees the success/error without hunting for it.
if (getContactModal() && getContactModal().querySelector('[data-contact-result]')) {
  openContactModal();
}

/* ---------------- Add to Home Screen (install pill) ---------------- */
// The store ships a web app manifest + icons, so Chrome/Edge offer real
// installation and iOS adds a full-screen shortcut from the share menu. The
// pill appears only when installing is genuinely possible on this browser,
// only on small screens (the footer button covers desktop), never in the
// same page view as the welcome offer modal (one overlay per visit), and a
// dismissal sleeps it for 30 days. The footer button is always available
// once installability is confirmed - visitor-initiated, so no cool-off.
const INSTALL_DISMISS_KEY = 'ap_install_dismissed';
const INSTALL_DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

const installDismissed = () => {
  try {
    const at = Number(localStorage.getItem(INSTALL_DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < INSTALL_DISMISS_MS;
  } catch (error) { return true; }
};
const markInstallDismissed = () => {
  try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())); } catch (error) { /* nothing to persist */ }
};

// Already running from the home screen: never advertise installing again.
const isStandaloneDisplay = () =>
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
  window.navigator.standalone === true;

// Every iOS browser is WebKit and shares the share-menu Add to Home Screen
// path. iPadOS 13+ reports a Mac user agent, hence the touch-points check.
const isIosDevice = () =>
  /iPhone|iPad|iPod/.test(window.navigator.userAgent) ||
  (/Macintosh/.test(window.navigator.userAgent) && window.navigator.maxTouchPoints > 1);

(() => {
  const pill = document.querySelector('[data-install-pill]');
  const steps = document.querySelector('[data-install-steps]');
  const footerTrigger = document.querySelector('[data-install-trigger]');
  if (!pill || !steps || isStandaloneDisplay()) return;

  let deferredInstallPrompt = null;
  const smallScreen = () => window.matchMedia('(max-width: 900px)').matches;

  const hidePill = () => {
    pill.classList.remove('is-visible');
    pill.hidden = true;
  };
  const hideSteps = () => {
    steps.classList.remove('is-visible');
    steps.hidden = true;
  };
  const showSteps = () => {
    hidePill();
    steps.hidden = false;
    window.requestAnimationFrame(() => steps.classList.add('is-visible'));
  };

  const promptInstall = () => {
    if (deferredInstallPrompt) {
      const prompting = deferredInstallPrompt;
      deferredInstallPrompt = null;
      hidePill();
      prompting.prompt();
      prompting.userChoice.then((choice) => {
        if (choice && choice.outcome !== 'accepted') markInstallDismissed();
      }).catch(() => {});
      return;
    }
    showSteps();
  };

  // Auto-reveal etiquette mirrors the welcome modal: small screens only,
  // a beat after load, and skipped entirely on the page view where the
  // welcome offer shows so two overlays never stack.
  const scheduleReveal = () => {
    if (!smallScreen() || installDismissed()) return;
    // Wait for PawScout's verdict on the storewide event so the pill never
    // races the welcome offer: it yields whenever the offer may still open.
    loadStorewideEvent().then(() => {
      if (welcomeMayOpen()) return;
      setTimeout(() => {
        if (pill.hidden === false || steps.hidden === false || installDismissed()) return;
        pill.hidden = false;
        window.requestAnimationFrame(() => pill.classList.add('is-visible'));
      }, 4500);
    });
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's own mini-infobar; the pill and footer button run the
    // same native prompt on our terms.
    event.preventDefault();
    deferredInstallPrompt = event;
    if (footerTrigger) footerTrigger.hidden = false;
    scheduleReveal();
  });

  if (isIosDevice()) {
    if (footerTrigger) footerTrigger.hidden = false;
    scheduleReveal();
  }

  window.addEventListener('appinstalled', () => {
    hidePill();
    hideSteps();
    if (footerTrigger) footerTrigger.hidden = true;
    markInstallDismissed();
  });

  pill.addEventListener('click', (event) => {
    if (event.target.closest('[data-install-accept]')) {
      promptInstall();
      return;
    }
    if (event.target.closest('[data-install-dismiss]')) {
      hidePill();
      markInstallDismissed();
    }
  });

  steps.addEventListener('click', (event) => {
    if (event.target.closest('[data-install-steps-close]')) {
      hideSteps();
      // Closing the instructions counts as "not now": without this the pill
      // would re-offer on every page view to iOS visitors who read the steps
      // and chose not to follow through.
      markInstallDismissed();
    }
  });

  if (footerTrigger) {
    footerTrigger.addEventListener('click', () => {
      promptInstall();
      if (!deferredInstallPrompt && steps.hidden === false) {
        steps.scrollIntoView({ block: 'end', behavior: 'smooth' });
      }
    });
  }
})();

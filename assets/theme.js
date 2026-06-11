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
  const shareData = {
    title: button.dataset.shareTitle || document.title,
    text: button.dataset.shareText || '',
    url: shareUrl
  };

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
// (the cart-drawer section, server-rendered via Liquid) — the same trust level as the
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

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-collections-trigger]');
  if (trigger) {
    const isOpen = trigger.getAttribute('aria-expanded') === 'true';
    closeCollectionsMenu();
    trigger.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    return;
  }
  if (!event.target.closest('[data-collections-menu]')) closeCollectionsMenu();
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

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeCollectionsMenu();
    closeContactModal();
    closeDetailsModal();
  }
  if (event.key !== 'Tab') return;
  const modal = [getContactModal(), getDetailsModal()].find((m) => m && m.classList.contains('is-open'));
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

// After the contact form posts, Shopify reloads with the result rendered in the modal —
// auto-open it so the visitor sees the success/error without hunting for it.
if (getContactModal() && getContactModal().querySelector('[data-contact-result]')) {
  openContactModal();
}

/* Site comparateur : chargement du catalogue, filtres, fenêtre de commande et envoi du lead.
   Les données des boutiques sont insérées en texte (textContent), jamais en HTML. */
(function () {
  'use strict';

  const L = window.PerfumeLogic;
  const WEBAPP_URL = (window.PERFUME_CONFIG || {}).WEBAPP_URL;
  const PAGE_SIZE = 24;

  const state = {
    items: [], filtered: [], shown: PAGE_SIZE, type: '', size: '', query: '', sort: 'saving',
    minPrice: null, maxPrice: null, current: null, lastFocus: null,
  };
  const $ = (id) => document.getElementById(id);
  const grid = $('grid');
  const template = $('card-template');
  const modal = $('modal');
  const form = $('order-form');

  // ---------- Catalogue ----------

  function safeImage(url) {
    return /^https:\/\//i.test(String(url || '')) ? url : '';
  }

  function renderSkeletons() {
    grid.replaceChildren();
    for (let i = 0; i < 8; i++) {
      const li = document.createElement('li');
      li.className = 'motion-safe:animate-pulse';
      li.setAttribute('aria-hidden', 'true');
      const img = document.createElement('div');
      img.className = 'aspect-[4/5] rounded-tile bg-surface border border-line';
      const line = document.createElement('div');
      line.className = 'mt-4 h-4 w-2/3 rounded-full bg-surface';
      const price = document.createElement('div');
      price.className = 'mt-3 h-4 w-1/3 rounded-full bg-surface';
      li.append(img, line, price);
      grid.append(li);
    }
  }

  function renderStatus(message, withRetry) {
    const status = $('status');
    status.replaceChildren();
    if (!message) return;
    const box = document.createElement('div');
    box.className = 'rounded-tile border border-line bg-surface p-8 text-center';
    const p = document.createElement('p');
    p.className = 'text-base';
    p.textContent = message;
    box.append(p);
    if (withRetry) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Réessayer';
      retry.className = 'mt-5 min-h-11 px-6 rounded-tile bg-btn text-onBtn text-sm font-semibold cursor-pointer hover:bg-btnHover active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface';
      retry.addEventListener('click', loadCatalog);
      box.append(retry);
    }
    status.append(box);
  }

  function card(item, index, animate) {
    const node = template.content.firstElementChild.cloneNode(true);
    if (animate) {
      node.classList.add('card-in');
      node.style.setProperty('--i', index);  // apparition échelonnée
    }
    const img = node.querySelector('.card-img');
    const src = safeImage(item.image_url);
    if (src) {
      img.src = src;
      img.alt = item.perfume + ' ' + item.size;
    } else {
      img.remove();
    }
    node.querySelector('.card-type').textContent = (item.type === 'décante' ? 'Décante' : 'Flacon') + ' · ' + item.size;
    node.querySelector('.card-name').textContent = item.perfume;
    node.querySelector('.card-price').textContent = L.formatPrice(item.best_price);
    const saving = node.querySelector('.card-saving');
    if (Number(item.saving_dh) > 0) {
      saving.textContent = '−' + L.formatPrice(item.saving_dh) + ' vs le plus cher';
      saving.hidden = false;
    }
    const button = node.querySelector('.card-order');
    button.setAttribute('aria-label', 'Commander ' + item.perfume + ' ' + item.size);
    button.addEventListener('click', () => openModal(item, button));
    return node;
  }

  // animate : seulement au premier chargement et pour les cartes ajoutées par "Afficher plus".
  // append  : ajoute les cartes manquantes sans recréer celles déjà affichées.
  function render({ animate = false, append = false } = {}) {
    state.filtered = L.filterItems(state.items, {
      query: state.query, type: state.type, size: state.size,
      minPrice: state.minPrice, maxPrice: state.maxPrice, sort: state.sort,
    });
    const visible = state.filtered.slice(0, state.shown);
    if (append) {
      const start = grid.children.length;
      grid.append(...visible.slice(start).map((item, i) => card(item, i, animate)));
    } else {
      grid.replaceChildren(...visible.map((item, i) => card(item, i, animate)));
    }
    $('count').textContent = state.filtered.length + (state.filtered.length > 1 ? ' parfums' : ' parfum');
    $('more').hidden = state.shown >= state.filtered.length;
    renderStatus(state.filtered.length ? '' : 'Aucun parfum ne correspond à votre recherche.', false);
  }

  function fillSizes() {
    const select = $('size');
    L.sizesOf(state.items).forEach((size) => {
      const option = document.createElement('option');
      option.value = size;
      option.textContent = size;
      select.append(option);
    });
  }

  async function loadCatalog() {
    renderStatus('', false);
    renderSkeletons();
    try {
      if (!WEBAPP_URL) throw new Error('config');
      const response = await fetch(WEBAPP_URL + '?action=catalog');
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      state.items = data.items.filter((i) => i.id && i.perfume);
      fillSizes();
      setupPriceRange();
      render({ animate: true });
    } catch (err) {
      grid.replaceChildren();
      renderStatus('Impossible de charger les parfums pour le moment.', true);
    }
  }

  // ---------- Filtres ----------

  let searchTimer;
  $('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = e.target.value;
      state.shown = PAGE_SIZE;
      render();
    }, 150);
  });

  function paintTypeButtons() {
    document.querySelectorAll('.type-filter').forEach((btn) => {
      const active = btn.dataset.type === state.type;
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('bg-btn', active);
      btn.classList.toggle('text-onBtn', active);
      btn.classList.toggle('text-fg', !active);
      btn.classList.toggle('hover:bg-bg', !active);
    });
  }

  document.querySelectorAll('.type-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.type = btn.dataset.type;
      state.shown = PAGE_SIZE;
      paintTypeButtons();
      render();
    });
  });

  $('size').addEventListener('change', (e) => {
    state.size = e.target.value;
    state.shown = PAGE_SIZE;
    render();
  });

  // ---------- Prix et tri ----------

  const priceMin = $('price-min');
  const priceMax = $('price-max');

  function paintPriceRange() {
    const lo = Number(priceMin.min);
    const span = Number(priceMin.max) - lo || 1;
    const from = ((Number(priceMin.value) - lo) / span) * 100;
    const to = ((Number(priceMax.value) - lo) / span) * 100;
    $('price-fill').style.left = from + '%';
    $('price-fill').style.right = (100 - to) + '%';
    $('price-label').textContent = L.formatPrice(priceMin.value) + ' à ' + L.formatPrice(priceMax.value);
    priceMin.setAttribute('aria-valuetext', L.formatPrice(priceMin.value));
    priceMax.setAttribute('aria-valuetext', L.formatPrice(priceMax.value));
  }

  function setupPriceRange() {
    const bounds = L.priceBounds(state.items);
    [priceMin, priceMax].forEach((input) => {
      input.min = bounds.min;
      input.max = bounds.max;
    });
    priceMin.value = bounds.min;
    priceMax.value = bounds.max;
    paintPriceRange();
  }

  let priceTimer;
  function onPriceInput(e) {
    // Les deux poignées ne se croisent pas
    if (Number(priceMin.value) > Number(priceMax.value)) {
      if (e.target === priceMin) priceMin.value = priceMax.value;
      else priceMax.value = priceMin.value;
    }
    paintPriceRange();
    clearTimeout(priceTimer);
    priceTimer = setTimeout(() => {
      // Aux bornes extrêmes, pas de filtre : les prix futurs hors bornes restent visibles
      state.minPrice = Number(priceMin.value) > Number(priceMin.min) ? Number(priceMin.value) : null;
      state.maxPrice = Number(priceMax.value) < Number(priceMax.max) ? Number(priceMax.value) : null;
      state.shown = PAGE_SIZE;
      render();
    }, 120);
  }
  priceMin.addEventListener('input', onPriceInput);
  priceMax.addEventListener('input', onPriceInput);

  $('sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.shown = PAGE_SIZE;
    render();
  });

  $('more').addEventListener('click', () => {
    state.shown += PAGE_SIZE;
    render({ animate: true, append: true });
  });

  // ---------- Fenêtre de commande ----------

  function focusables() {
    return Array.from(modal.querySelectorAll('button, input:not([tabindex="-1"]), select, a[href]'))
      .filter((el) => !el.disabled && el.offsetParent !== null);
  }

  function openModal(item, trigger) {
    state.current = item;
    state.lastFocus = trigger;
    const src = safeImage(item.image_url);
    $('modal-img').hidden = !src;
    if (src) $('modal-img').src = src;
    $('modal-title').textContent = item.perfume;
    $('modal-meta').textContent = item.size + ' · ' + L.formatPrice(item.best_price);
    form.reset();
    clearErrors();
    setMessage('', '');
    $('submit').disabled = false;
    $('submit').textContent = 'Voir l’offre';
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    $('first_name').focus();
  }

  function closeModal() {
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    if (state.lastFocus) state.lastFocus.focus();
  }

  modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => {
    if (modal.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      closeModal();
    } else if (e.key === 'Tab') {
      // Le focus reste dans la fenêtre
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  function clearErrors() {
    form.querySelectorAll('.field-error').forEach((p) => { p.hidden = true; p.textContent = ''; });
    form.querySelectorAll('input').forEach((input) => input.removeAttribute('aria-invalid'));
  }

  function showErrors(errors) {
    Object.keys(errors).forEach((field) => {
      const p = $(field + '-error');
      p.textContent = errors[field];
      p.hidden = false;
      $(field).setAttribute('aria-invalid', 'true');
    });
    const firstField = ['first_name', 'last_name', 'phone', 'consent'].find((f) => errors[f]);
    if (firstField) $(firstField).focus();
  }

  function setMessage(text, tone) {
    const message = $('form-message');
    message.textContent = text;
    message.className = 'text-sm ' + (tone === 'error' ? 'text-danger' : tone === 'success' ? 'text-accent font-medium' : '');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    setMessage('', '');
    const fields = {
      first_name: $('first_name').value,
      last_name: $('last_name').value,
      phone: $('phone').value,
      consent: $('consent').checked,
    };
    const errors = L.validateForm(fields);
    if (Object.keys(errors).length) {
      showErrors(errors);
      return;
    }

    const submit = $('submit');
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    submit.textContent = 'Envoi…';
    try {
      // text/plain : Apps Script n'accepte pas les requêtes "pré-vol" CORS d'un JSON classique
      const response = await fetch(WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: 'lead', id: state.current.id, website: $('website').value }, fields)),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'error');
      if (data.url) {
        setMessage('Merci ! Redirection vers la boutique…', 'success');
        setTimeout(() => { window.location.href = data.url; }, 1200);
      } else {
        setMessage('Merci, votre demande a bien été reçue.', 'success');
      }
    } catch (err) {
      setMessage(L.serverMessage(err.message), 'error');
      submit.disabled = false;
      submit.textContent = 'Voir l’offre';
    } finally {
      submit.removeAttribute('aria-busy');
    }
  });

  paintTypeButtons();
  loadCatalog();
})();

/* Logique du site sans dépendance au DOM : recherche, filtres, formatage, validation.
   Utilisable dans le navigateur (window.PerfumeLogic) et dans les tests Node (module.exports). */
(function (root) {
  'use strict';

  function normalizeText(text) {
    return String(text || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function sizeValue(size) {
    return parseFloat(String(size)) || 0;
  }

  const SORTS = {
    // Par défaut : plus grosse économie d'abord
    'saving': function (a, b) { return (Number(b.saving_dh) || 0) - (Number(a.saving_dh) || 0); },
    'price-asc': function (a, b) { return Number(a.best_price) - Number(b.best_price); },
    'price-desc': function (a, b) { return Number(b.best_price) - Number(a.best_price); },
  };

  function filterItems(items, filters) {
    const words = normalizeText(filters.query).split(' ').filter(Boolean);
    const hasMin = filters.minPrice !== undefined && filters.minPrice !== null;
    const hasMax = filters.maxPrice !== undefined && filters.maxPrice !== null;
    const order = SORTS[filters.sort] || SORTS.saving;
    return items
      .filter(function (item) {
        if (filters.type && item.type !== filters.type) return false;
        if (filters.size && item.size !== filters.size) return false;
        const price = Number(item.best_price);
        if (hasMin && price < filters.minPrice) return false;
        if (hasMax && price > filters.maxPrice) return false;
        const haystack = normalizeText(item.perfume + ' ' + item.size);
        return words.every(function (w) { return haystack.indexOf(w) !== -1; });
      })
      .sort(function (a, b) {
        return order(a, b)
          || a.perfume.localeCompare(b.perfume)
          || sizeValue(a.size) - sizeValue(b.size);
      });
  }

  // Bornes du curseur de prix, arrondies à la dizaine (vers l'extérieur)
  function priceBounds(items) {
    const prices = items.map(function (i) { return Number(i.best_price); }).filter(function (n) { return n > 0; });
    if (!prices.length) return { min: 0, max: 0 };
    return { min: Math.floor(Math.min.apply(null, prices) / 10) * 10, max: Math.ceil(Math.max.apply(null, prices) / 10) * 10 };
  }

  function sizesOf(items) {
    const unique = Array.from(new Set(items.map(function (i) { return i.size; }).filter(Boolean)));
    return unique.sort(function (a, b) { return sizeValue(a) - sizeValue(b); });
  }

  function formatPrice(value) {
    return String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' DH';
  }

  // Mêmes règles que le script Google (normalizePhone_) : 05, 06, 07 ou +212, 9 chiffres après l'indicatif
  function normalizePhone(raw) {
    const digits = String(raw || '').replace(/[\s\-.()]/g, '');
    const match = /^(?:\+212|00212|0)([5-7]\d{8})$/.exec(digits);
    return match ? '+212' + match[1] : null;
  }

  function validateForm(fields) {
    const errors = {};
    const first = String(fields.first_name || '').trim();
    const last = String(fields.last_name || '').trim();
    if (first.length < 2 || first.length > 50) errors.first_name = 'Indiquez votre prénom (2 à 50 caractères).';
    if (last.length < 2 || last.length > 50) errors.last_name = 'Indiquez votre nom (2 à 50 caractères).';
    if (!normalizePhone(fields.phone)) {
      errors.phone = 'Numéro invalide, ex. 06 12 34 56 78.';
    }
    if (fields.consent !== true) errors.consent = 'Merci d’accepter l’utilisation de vos coordonnées.';
    return errors;
  }

  const SERVER_MESSAGES = {
    'consent': 'Merci d’accepter l’utilisation de vos coordonnées.',
    'name': 'Vérifiez votre nom et votre prénom.',
    'phone': 'Vérifiez votre numéro de téléphone.',
    'unknown product': 'Ce parfum n’est plus disponible. Rechargez la page.',
    'rate limit': 'Trop de demandes pour le moment. Réessayez dans quelques minutes.',
  };

  function serverMessage(code) {
    return SERVER_MESSAGES[code] || 'Une erreur est survenue. Merci de réessayer.';
  }

  const api = {
    normalizeText: normalizeText,
    filterItems: filterItems,
    priceBounds: priceBounds,
    sizesOf: sizesOf,
    formatPrice: formatPrice,
    normalizePhone: normalizePhone,
    validateForm: validateForm,
    serverMessage: serverMessage,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PerfumeLogic = api;
  }
})(typeof window !== 'undefined' ? window : this);

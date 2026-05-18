/**
 * Hiển thị giá tour: giá gốc gạch ngang + giá sau giảm (xanh, đậm).
 */
(function (global) {
  function formatTourPriceVnd(value) {
    return (
      new Intl.NumberFormat("vi-VN").format(Math.round(Number(value) || 0)) + "₫"
    );
  }

  function hasTourDiscount(tour) {
    const base = Number(tour?.base_price || 0);
    const sale = Number(tour?.sale_price || 0);
    return sale > 0 && sale < base;
  }

  function getAppliedPrice(tour) {
    const base = Number(tour?.base_price || 0);
    const sale = Number(tour?.sale_price || 0);
    if (sale > 0 && sale < base) return sale;
    return base;
  }

  function getTaxPercent(tour) {
    const p = Number(tour?.tax_percent);
    return Number.isFinite(p) && p > 0 ? p : 0;
  }

  function getTaxAmount(tour) {
    const taxPercent = getTaxPercent(tour);
    if (taxPercent <= 0) return 0;

    const stored = Number(tour?.tax || 0);
    if (stored > 0) return stored;

    const applied = getAppliedPrice(tour);
    return Math.round(applied * (taxPercent / 100));
  }

  function getFinalPrice(tour) {
    const final = Number(tour?.final_price || 0);
    if (final > 0) return final;

    const display = Number(tour?.display_price || 0);
    if (display > 0) return display;

    return getAppliedPrice(tour) + getTaxAmount(tour);
  }

  /** Giá niêm yết (trước giảm, đã gồm VAT) — dùng cho gạch ngang. */
  function getListPrice(tour) {
    if (!hasTourDiscount(tour)) return 0;

    const base = Number(tour?.base_price || 0);
    const taxPercent = getTaxPercent(tour);
    if (taxPercent > 0) {
      return Math.round(base * (1 + taxPercent / 100));
    }
    return base;
  }

  function renderPriceHtml(tour, options = {}) {
    const { showUnit = false, className = "tour-price-pair" } = options;
    const current = getFinalPrice(tour);
    const unitHtml = showUnit
      ? '<span class="tour-price-pair__unit">/ người</span>'
      : "";

    if (!hasTourDiscount(tour)) {
      return `<span class="tour-price-pair__current">${formatTourPriceVnd(current)}</span>${unitHtml}`;
    }

    const list = getListPrice(tour);
    return `
      <div class="${className}">
        <span class="tour-price-pair__old">${formatTourPriceVnd(list)}</span>
        <span class="tour-price-pair__current">${formatTourPriceVnd(current)}</span>
      </div>
      ${unitHtml}
    `.trim();
  }

  function setPriceElement(element, tour, options = {}) {
    if (!element) return;
    element.innerHTML = renderPriceHtml(tour, options);
  }

  global.TourPriceDisplay = {
    formatTourPriceVnd,
    hasTourDiscount,
    getAppliedPrice,
    getTaxAmount,
    getFinalPrice,
    getListPrice,
    renderPriceHtml,
    setPriceElement,
  };
})(typeof window !== "undefined" ? window : globalThis);

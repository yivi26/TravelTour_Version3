/**
 * Tiện ích dùng chung cho trang admin.
 */
(function () {
  function bindAdminGlobalSearch(input, options = {}) {
    if (!input) return;
    const targetPage = options.targetPage || "qlinguoidung.html";
    const param = options.param || "q";

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const q = String(input.value || "").trim();
      if (!q) return;
      const url = new URL(targetPage, window.location.href);
      url.searchParams.set(param, q);
      window.location.href = `${url.pathname}${url.search}`;
    });
  }

  function readInitialSearchQuery(param = "q") {
    try {
      return String(new URLSearchParams(window.location.search).get(param) || "").trim();
    } catch {
      return "";
    }
  }

  function applySearchFromUrl(input, param = "q") {
    const q = readInitialSearchQuery(param);
    if (input && q) input.value = q;
    return q;
  }

  window.AdminCommon = {
    bindAdminGlobalSearch,
    readInitialSearchQuery,
    applySearchFromUrl,
  };
})();

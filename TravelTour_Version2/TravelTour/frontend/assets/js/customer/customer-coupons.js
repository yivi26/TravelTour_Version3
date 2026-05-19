(function () {
  const API_LIST = "/api/customer/coupons";

  function getToken() {
    const raw =
      localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
    const token = String(raw).trim();
    if (!token || token === "null" || token === "undefined") return "";
    return token;
  }

  function authHeaders() {
    const headers = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function statusLabel(status) {
    const s = String(status || "").toLowerCase();
    if (s === "pending_claim") return { text: "Chưa kích hoạt", cls: "pending" };
    if (s === "active") return { text: "Đang hiệu lực", cls: "active" };
    if (s === "used") return { text: "Đã sử dụng", cls: "used" };
    if (s === "expired") return { text: "Hết hạn", cls: "expired" };
    return { text: s || "—", cls: "used" };
  }

  function highlightIdFromUrl() {
    const raw = new URLSearchParams(window.location.search).get("id");
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  async function fetchCoupons() {
    const res = await fetch(API_LIST, { headers: authHeaders() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || "Không tải được mã giảm giá");
    return Array.isArray(json?.data) ? json.data : [];
  }

  async function claimCoupon(id) {
    const res = await fetch(`${API_LIST}/${encodeURIComponent(id)}/claim`, {
      method: "POST",
      headers: authHeaders(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || "Kích hoạt thất bại");
    return json;
  }

  function renderCoupons(listEl, coupons, highlightId) {
    if (!coupons.length) {
      listEl.innerHTML =
        '<p class="coupons-empty">Bạn chưa có mã giảm giá nào.</p>';
      return;
    }

    listEl.innerHTML = coupons
      .map((c) => {
        const st = statusLabel(c.status);
        const isHighlight = highlightId && Number(c.id) === highlightId;
        const canClaim = String(c.status || "").toLowerCase() === "pending_claim";
        return `
        <article class="coupon-card ${isHighlight ? "is-highlight" : ""}" data-id="${escapeHtml(c.id)}">
          <div class="coupon-card__head">
            <h2 class="coupon-card__code">${escapeHtml(c.code)}</h2>
            <span class="coupon-card__badge coupon-card__badge--${st.cls}">${escapeHtml(st.text)}</span>
          </div>
          <p class="coupon-card__meta">${escapeHtml(c.providerName || "Nhà cung cấp tour")}</p>
          <p class="coupon-card__discount">Giảm <strong>${escapeHtml(c.discountPercent)}%</strong> — vô thời hạn, tự áp khi đặt tour cùng nhà cung cấp.</p>
          ${
            canClaim
              ? `<div class="coupon-card__actions"><button type="button" class="coupon-card__claim" data-claim-id="${escapeHtml(c.id)}">Kích hoạt mã</button></div>`
              : ""
          }
        </article>
      `;
      })
      .join("");

    if (highlightId) {
      const card = listEl.querySelector(`[data-id="${highlightId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    listEl.querySelectorAll("[data-claim-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.getAttribute("data-claim-id"));
        if (!id) return;
        btn.disabled = true;
        try {
          await claimCoupon(id);
          const coupons = await fetchCoupons();
          renderCoupons(listEl, coupons, id);
        } catch (err) {
          alert(err.message || "Lỗi kích hoạt");
          btn.disabled = false;
        }
      });
    });
  }

  async function init() {
    if (!getToken()) {
      window.location.href = "../../index.html";
      return;
    }

    const listEl = document.getElementById("couponsList");
    if (!listEl) return;

    const highlightId = highlightIdFromUrl();

    try {
      const coupons = await fetchCoupons();
      renderCoupons(listEl, coupons, highlightId);
    } catch (err) {
      listEl.innerHTML = `<p class="coupons-empty">${escapeHtml(err.message || "Lỗi tải dữ liệu")}</p>`;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

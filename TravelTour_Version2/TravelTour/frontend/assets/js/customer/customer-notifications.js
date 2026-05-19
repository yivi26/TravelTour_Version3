(() => {
  const API_LIST = "/api/customer/notifications?limit=25";
  const API_READ = "/api/customer/notifications/read";
  const POLL_MS = 45000;

  const BELL_SVG = `
    <svg class="customer-noti-bell__icon" viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  let lastUnreadCount = 0;
  let pollTimer = null;
  let navbarBellAttachPromise = null;
  let panelRepositionHandler = null;
  const DROPDOWN_PANEL_ID = "customerNotiDropdown";

  function getToken() {
    const raw =
      localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
    const token = String(raw).trim();
    if (!token || token === "null" || token === "undefined") return "";
    return token;
  }

  function isCustomerUser() {
    try {
      const raw = localStorage.getItem("traveltour_user");
      if (!raw) return false;
      const user = JSON.parse(raw);
      return String(user?.role || "").toLowerCase() === "customer";
    } catch {
      return false;
    }
  }

  function customerAuthHeaders() {
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

  function timeAgo(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Vừa xong";
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ngày trước`;
    return d.toLocaleDateString("vi-VN");
  }

  function getIcon(type) {
    if (type === "tour_cancelled_no_guide") return "⚠️";
    if (type === "tour_cancelled_with_coupon") return "🎁";
    if (type === "tour_guide_changed") return "🔄";
    return "🔔";
  }

  function getBookingHref() {
    const path = window.location.pathname || "";
    if (path.includes("/pages/customer/")) {
      return "booking.html";
    }
    return "/pages/customer/booking.html";
  }

  function getCouponsHref(couponId) {
    const path = window.location.pathname || "";
    let base = "/pages/customer/coupons.html";
    if (path.includes("/pages/customer/")) {
      base = "coupons.html";
    } else if (path.includes("/pages/tours/")) {
      base = "../customer/coupons.html";
    }
    if (couponId) {
      return `${base}?id=${encodeURIComponent(couponId)}`;
    }
    return base;
  }

  let cachedNotificationItems = [];

  function isCouponCancelNotification(item) {
    return String(item?.type || "") === "tour_cancelled_with_coupon";
  }

  async function handleCouponNotificationClick(item, card, panel, bell) {
    const id = Number(item?.id || card?.dataset?.id);
    if (id && card && card.dataset.unread === "1") {
      try {
        await markRead([id]);
        card.classList.remove("is-unread");
        card.dataset.unread = "0";
        card
          .querySelector(".customer-noti-item__unread-dot, .customer-noti__dot")
          ?.remove();
        if (bell) {
          const data = await fetchList(false);
          setUnreadIndicators(bell, Number(data.unreadCount || 0));
        }
      } catch (err) {
        console.error(err);
      }
    }

    const couponId = Number(item?.couponId || card?.dataset?.couponId) || 0;
    if (couponId) {
      try {
        await claimCoupon(couponId);
      } catch (err) {
        console.warn("claim coupon from notification:", err.message);
      }
    }

    closeAllPanels(null);
    window.location.href = getCouponsHref(couponId || null);
  }

  async function fetchList(unreadOnly = false) {
    const url = unreadOnly ? `${API_LIST}&unread=1` : API_LIST;
    const res = await fetch(url, { headers: customerAuthHeaders() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || "Không tải được thông báo");
    return json?.data || { items: [], unreadCount: 0 };
  }

  async function markRead(ids) {
    const body = ids && ids.length ? { ids } : { all: true };
    const res = await fetch(API_READ, {
      method: "PATCH",
      headers: customerAuthHeaders(),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || "Lỗi cập nhật");
    return json?.data || {};
  }

  function renderBookingPanel(data) {
    const panel = document.getElementById("customerNotificationsPanel");
    const list = document.getElementById("customerNotificationsList");
    if (!panel || !list) return;

    const items = Array.isArray(data?.items) ? data.items : [];
    cachedNotificationItems = items;
    if (!items.length) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;

    list.innerHTML = items
      .map((item) => {
        const icon = getIcon(item.type);
        const couponNav = isCouponCancelNotification(item);
        return `
        <article
          class="customer-noti ${item.isRead ? "" : "is-unread"}"
          data-id="${escapeHtml(item.id)}"
          data-type="${escapeHtml(item.type || "")}"
          data-coupon-id="${item.couponId ? escapeHtml(item.couponId) : ""}"
          data-unread="${item.isRead ? "0" : "1"}"
          ${couponNav ? 'role="button" tabindex="0"' : ""}
        >
          <span class="customer-noti__icon" aria-hidden="true">${icon}</span>
          <div class="customer-noti__body">
            <h3 class="customer-noti__title">${escapeHtml(item.title)}</h3>
            <p class="customer-noti__text">${escapeHtml(item.body)}</p>
            <div class="customer-noti__meta">
              <span>${escapeHtml(item.tourTitle || "")}</span>
              <span>${escapeHtml(timeAgo(item.createdAt))}</span>
            </div>
          </div>
          ${item.isRead ? "" : '<span class="customer-noti__dot" aria-hidden="true"></span>'}
        </article>
      `;
      })
      .join("");
  }

  function dedupeNotificationUi() {
    const wraps = [...document.querySelectorAll("#customerNotiWrap")];
    const keepWrap = wraps[0] || null;
    wraps.slice(1).forEach((node) => node.remove());

    document.querySelectorAll(".customer-noti-panel").forEach((panel) => {
      if (panel.id === DROPDOWN_PANEL_ID) return;
      panel.remove();
    });

    if (keepWrap) {
      keepWrap.querySelectorAll(".customer-noti-bell").forEach((bell, index) => {
        if (index > 0) bell.remove();
      });
    }

    return keepWrap;
  }

  function ensureNavbarBell() {
    const navActions = document.querySelector(".nav-actions");
    const userLink = document.getElementById("navUserLink");
    if (!navActions || !userLink) return null;

    let wrap = dedupeNotificationUi();
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "customerNotiWrap";
      wrap.className = "customer-noti-wrap";
      wrap.hidden = true;
      wrap.innerHTML = `
        <button
          type="button"
          class="customer-noti-bell"
          aria-label="Thông báo hệ thống"
          aria-expanded="false"
        >
          ${BELL_SVG}
          <span class="customer-noti-bell__dot" hidden></span>
          <span class="customer-noti-bell__count" hidden></span>
        </button>
      `;
      userLink.insertAdjacentElement("afterend", wrap);
    }
    return wrap;
  }

  function syncNavbarBellVisibility() {
    const wrap = ensureNavbarBell();
    if (!wrap) return;

    const userLink = document.getElementById("navUserLink");
    const loggedIn =
      isCustomerUser() &&
      !!getToken() &&
      userLink &&
      !userLink.hasAttribute("hidden") &&
      userLink.style.display !== "none";

    wrap.hidden = !loggedIn;
    if (!loggedIn) {
      stopPolling();
      return;
    }
    void initNavbarBells();
  }

  function setUnreadIndicators(bell, count, options = {}) {
    const { silent = false } = options;
    const dot = bell.querySelector(".customer-noti-bell__dot");
    const badge = bell.querySelector(".customer-noti-bell__count");

    if (count > 0) {
      bell.classList.add("has-unread");
      if (dot) {
        dot.hidden = false;
        dot.setAttribute("aria-label", `${count} thông báo chưa đọc`);
      }
      if (badge) {
        if (count > 9) {
          badge.textContent = "9+";
        } else {
          badge.textContent = String(count);
        }
        badge.hidden = false;
        badge.setAttribute("aria-label", `${count} thông báo chưa đọc`);
      }
    } else {
      bell.classList.remove("has-unread");
      if (dot) {
        dot.hidden = true;
        dot.removeAttribute("aria-label");
      }
      if (badge) {
        badge.hidden = true;
        badge.removeAttribute("aria-label");
      }
    }

    if (!silent && count > lastUnreadCount && lastUnreadCount >= 0) {
      ringBell(bell);
    }
    lastUnreadCount = count;
  }

  function ringBell(bell) {
    bell.classList.remove("is-ringing");
    void bell.offsetWidth;
    bell.classList.add("is-ringing");
    window.setTimeout(() => bell.classList.remove("is-ringing"), 600);
  }

  function getBellForPanel(panel) {
    if (panel?._anchorBell) return panel._anchorBell;
    return document.querySelector("#customerNotiWrap .customer-noti-bell");
  }

  function positionNavbarPanel(panel, bell) {
    if (!panel || !bell) return;
    const rect = bell.getBoundingClientRect();
    const width = Math.min(380, Math.max(280, window.innerWidth - 24));
    let left = rect.right - width;
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    const top = Math.max(12, rect.bottom + 10);

    panel.style.width = `${width}px`;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.right = "auto";
  }

  function bindPanelReposition(panel, bell) {
    if (panelRepositionHandler) {
      window.removeEventListener("resize", panelRepositionHandler);
      window.removeEventListener("scroll", panelRepositionHandler, true);
    }
    panelRepositionHandler = () => {
      if (!panel.classList.contains("is-visible")) return;
      positionNavbarPanel(panel, bell);
    };
    window.addEventListener("resize", panelRepositionHandler);
    window.addEventListener("scroll", panelRepositionHandler, true);
  }

  function buildNavbarPanel(wrap, bell) {
    wrap.querySelectorAll(".customer-noti-panel").forEach((node) => node.remove());

    let panel = document.getElementById(DROPDOWN_PANEL_ID);
    if (panel) {
      panel._anchorBell = bell;
      return panel;
    }

    panel = document.createElement("div");
    panel.id = DROPDOWN_PANEL_ID;
    panel.className = "customer-noti-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Thông báo hệ thống");
    panel.innerHTML = `
      <div class="customer-noti-panel__head">
        <div class="customer-noti-panel__title-row">
          <h2 class="customer-noti-panel__title">Thông báo</h2>
          <button type="button" class="customer-noti-panel__mark-read" data-action="mark-all">
            Đánh dấu đã đọc
          </button>
        </div>
        <div class="customer-noti-tabs" role="tablist">
          <button type="button" class="customer-noti-tab is-active" data-filter="all" role="tab">
            Tất cả
          </button>
          <button type="button" class="customer-noti-tab" data-filter="unread" role="tab">
            Chưa đọc
          </button>
        </div>
      </div>
      <div class="customer-noti-panel__body" data-role="list"></div>
      <div class="customer-noti-panel__foot">
        <a href="${escapeHtml(getBookingHref())}">Xem booking của tôi</a>
      </div>
    `;

    panel.addEventListener("click", (e) => e.stopPropagation());
    panel._anchorBell = bell;
    document.body.appendChild(panel);
    return panel;
  }

  function renderNavbarList(panel, items) {
    const listHost = panel.querySelector('[data-role="list"]');
    if (!listHost) return;

    if (!items.length) {
      listHost.innerHTML =
        '<div class="customer-noti-empty">Chưa có thông báo từ hệ thống.</div>';
      return;
    }

    listHost.innerHTML = items
      .map((item) => {
        const unread = !item.isRead;
        const couponNav = isCouponCancelNotification(item);
        return `
        <article
          class="customer-noti-item ${unread ? "is-unread" : ""}"
          data-id="${escapeHtml(item.id)}"
          data-type="${escapeHtml(item.type || "")}"
          data-coupon-id="${item.couponId ? escapeHtml(item.couponId) : ""}"
          data-unread="${unread ? "1" : "0"}"
          role="button"
          tabindex="0"
          ${couponNav ? 'data-nav-coupon="1"' : ""}
        >
          <span class="customer-noti-item__icon" aria-hidden="true">${getIcon(item.type)}</span>
          <div class="customer-noti-item__content">
            <h3 class="customer-noti-item__title">${escapeHtml(item.title)}</h3>
            <p class="customer-noti-item__text">${escapeHtml(item.body)}</p>
            <div class="customer-noti-item__meta">
              ${escapeHtml(item.tourTitle || "")}
              ${item.tourTitle ? " · " : ""}
              ${escapeHtml(timeAgo(item.createdAt))}
            </div>
          </div>
          ${unread ? '<span class="customer-noti-item__unread-dot" aria-hidden="true"></span>' : ""}
        </article>
      `;
      })
      .join("");

    listHost.querySelectorAll(".customer-noti-item").forEach((card) => {
      const handleActivate = async () => {
        const id = Number(card.dataset.id);
        const item = items.find((x) => Number(x.id) === id);
        if (item && isCouponCancelNotification(item)) {
          const bell = getBellForPanel(panel);
          await handleCouponNotificationClick(item, card, panel, bell);
          return;
        }
        if (!id || card.dataset.unread !== "1") return;
        try {
          await markRead([id]);
          card.classList.remove("is-unread");
          card.dataset.unread = "0";
          card.querySelector(".customer-noti-item__unread-dot")?.remove();
          const bell = getBellForPanel(panel);
          if (bell) {
            const data = await fetchList(false);
            setUnreadIndicators(bell, Number(data.unreadCount || 0));
          }
        } catch (err) {
          console.error(err);
        }
      };

      card.addEventListener("click", handleActivate);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      });
    });
  }

  function setActiveTab(panel, filter) {
    panel.querySelectorAll(".customer-noti-tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.filter === filter);
    });
  }

  function openPanel(panel, bell) {
    positionNavbarPanel(panel, bell);
    bindPanelReposition(panel, bell);
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add("is-visible"));
    bell.classList.add("is-open");
    bell.setAttribute("aria-expanded", "true");
  }

  function closePanel(panel, bell) {
    panel.classList.remove("is-visible");
    bell.classList.remove("is-open");
    bell.setAttribute("aria-expanded", "false");
    window.setTimeout(() => {
      if (!panel.classList.contains("is-visible")) {
        panel.hidden = true;
      }
    }, 220);
  }

  function closeAllPanels(exceptPanel = null) {
    document.querySelectorAll(".customer-noti-panel").forEach((panel) => {
      if (exceptPanel && panel === exceptPanel) return;
      const bell = getBellForPanel(panel);
      if (bell) closePanel(panel, bell);
    });
  }

  async function loadNavbarPanel(panel, state) {
    const listHost = panel.querySelector('[data-role="list"]');
    if (listHost) {
      listHost.innerHTML = '<div class="customer-noti-empty">Đang tải...</div>';
    }
    const data = await fetchList(state.filter === "unread");
    state.items = Array.isArray(data.items) ? data.items : [];
    state.unreadCount = Number(data.unreadCount || 0);
    renderNavbarList(panel, state.items);
    return data;
  }

  async function refreshNavbarUnread() {
    const bell = document.querySelector(".customer-noti-bell");
    if (!bell || bell.closest("#customerNotiWrap")?.hidden) return;
    try {
      const data = await fetchList(false);
      setUnreadIndicators(bell, Number(data.unreadCount || 0));
    } catch {
      /* ignore poll errors */
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(() => {
      void refreshNavbarUnread();
    }, POLL_MS);
  }

  function stopPolling() {
    if (!pollTimer) return;
    window.clearInterval(pollTimer);
    pollTimer = null;
  }

  async function attachNavbarBell(bell) {
    const wrap = bell.closest(".customer-noti-wrap");
    if (!wrap) return;

    const panel = buildNavbarPanel(wrap, bell);
    const state = { filter: "all", items: [], unreadCount: 0 };

    try {
      const data = await fetchList(false);
      state.unreadCount = Number(data.unreadCount || 0);
      setUnreadIndicators(bell, state.unreadCount, { silent: true });
      startPolling();
    } catch {
      setUnreadIndicators(bell, 0);
    }

    panel.querySelector('[data-action="mark-all"]')?.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const result = await markRead(null);
        const count = Number(result.unreadCount || 0);
        setUnreadIndicators(bell, count);
        await loadNavbarPanel(panel, state);
        renderBookingPanel(result);
      } catch (err) {
        console.error(err);
      }
    });

    panel.querySelectorAll(".customer-noti-tab").forEach((tab) => {
      tab.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.filter = tab.dataset.filter || "all";
        setActiveTab(panel, state.filter);
        try {
          await loadNavbarPanel(panel, state);
        } catch (err) {
          console.error(err);
        }
      });
    });

    bell.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      ringBell(bell);

      const willOpen = panel.hidden || !panel.classList.contains("is-visible");
      closeAllPanels(willOpen ? panel : null);

      if (!willOpen) {
        closePanel(panel, bell);
        return;
      }

      openPanel(panel, bell);

      try {
        const data = await loadNavbarPanel(panel, state);
        setUnreadIndicators(bell, Number(data.unreadCount || 0));
      } catch (err) {
        const listHost = panel.querySelector('[data-role="list"]');
        if (listHost) {
          listHost.innerHTML =
            '<div class="customer-noti-empty">Không tải được thông báo. Vui lòng thử lại.</div>';
        }
        console.error(err);
      }
    });

    bell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        bell.click();
      }
    });
  }

  function bindOutsideClose() {
    if (document.body.dataset.customerNotiOutsideBound === "1") return;
    document.body.dataset.customerNotiOutsideBound = "1";
    document.addEventListener("click", (event) => {
      if (
        event.target.closest(".customer-noti-wrap") ||
        event.target.closest(".customer-noti-panel")
      ) {
        return;
      }
      closeAllPanels(null);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllPanels(null);
    });
  }

  async function initNavbarBells() {
    if (!isCustomerUser() || !getToken()) return;

    bindOutsideClose();
    closeAllPanels(null);

    const wrap = ensureNavbarBell();
    if (!wrap || wrap.hidden) return;

    const bell = wrap.querySelector(".customer-noti-bell");
    if (!bell) return;
    if (navbarBellAttachPromise) {
      await navbarBellAttachPromise;
      if (bell.dataset.customerNotiBound === "1") return;
    }

    if (bell.dataset.customerNotiBound === "1") {
      bell.dataset.customerNotiBound = "0";
    }

    bell.dataset.customerNotiBound = "1";
    navbarBellAttachPromise = attachNavbarBell(bell).finally(() => {
      navbarBellAttachPromise = null;
    });
    await navbarBellAttachPromise;
  }

  async function initBookingPanel() {
    if (!getToken()) return;

    try {
      const data = await fetchList();
      renderBookingPanel(data);

      document.getElementById("markAllNotificationsRead")?.addEventListener("click", async () => {
        try {
          const next = await markRead(null);
          renderBookingPanel(next);
          await refreshNavbarUnread();
        } catch (err) {
          console.error(err);
        }
      });

      document.getElementById("customerNotificationsList")?.addEventListener("click", async (event) => {
        const card = event.target.closest(".customer-noti");
        if (!card) return;
        const id = Number(card.dataset.id);
        if (!id) return;
        const item = cachedNotificationItems.find((x) => Number(x.id) === id);
        if (item && isCouponCancelNotification(item)) {
          await handleCouponNotificationClick(item, card, null, null);
          return;
        }
        if (!card.classList.contains("is-unread")) return;
        try {
          const next = await markRead([id]);
          renderBookingPanel(next);
          await refreshNavbarUnread();
        } catch (err) {
          console.error(err);
        }
      });
    } catch (err) {
      console.warn("customer notifications:", err.message);
    }
  }

  function ensureCancelCouponPopup() {
    let modal = document.getElementById("tourCancelCouponPopup");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "tourCancelCouponPopup";
    modal.className = "tcc-popup";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="tcc-popup__backdrop"></div>
      <div class="tcc-popup__dialog" role="dialog" aria-modal="true">
        <div class="tcc-popup__icon" aria-hidden="true">⚠️</div>
        <h2 class="tcc-popup__title">Tour của bạn đã bị huỷ</h2>
        <p class="tcc-popup__body" data-role="tcc-body"></p>
        <div class="tcc-popup__coupon" data-role="tcc-coupon" hidden>
          <span class="tcc-popup__coupon-label">Mã giảm giá tặng bạn</span>
          <strong class="tcc-popup__coupon-code" data-role="tcc-code"></strong>
          <span class="tcc-popup__coupon-percent" data-role="tcc-percent"></span>
        </div>
        <button type="button" class="tcc-popup__btn" data-role="tcc-agree">Đồng ý</button>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function shouldShowCouponPopupFor(notif) {
    if (!notif || notif.type !== "tour_cancelled_with_coupon") return false;
    if (notif.isRead) return false;
    try {
      const shownIds = JSON.parse(
        sessionStorage.getItem("tcc-popup-shown") || "[]",
      );
      if (Array.isArray(shownIds) && shownIds.includes(notif.id)) return false;
    } catch {}
    return true;
  }

  function markPopupShown(notifId) {
    try {
      const shown = JSON.parse(
        sessionStorage.getItem("tcc-popup-shown") || "[]",
      );
      const next = Array.isArray(shown) ? [...new Set([...shown, notifId])] : [notifId];
      sessionStorage.setItem("tcc-popup-shown", JSON.stringify(next));
    } catch {}
  }

  async function claimCoupon(couponId) {
    if (!couponId) return null;
    const res = await fetch(
      `/api/customer/coupons/${encodeURIComponent(couponId)}/claim`,
      { method: "POST", headers: customerAuthHeaders() },
    );
    return res.json().catch(() => ({}));
  }

  async function maybeShowCancelCouponPopup() {
    try {
      const data = await fetchList(false);
      const items = Array.isArray(data?.items) ? data.items : [];
      const target = items.find(shouldShowCouponPopupFor);
      if (!target) return;

      const modal = ensureCancelCouponPopup();
      modal.querySelector("[data-role='tcc-body']").textContent = target.body || "";
      const couponWrap = modal.querySelector("[data-role='tcc-coupon']");
      if (target.couponCode && target.couponDiscountPercent != null) {
        couponWrap.hidden = false;
        modal.querySelector("[data-role='tcc-code']").textContent = target.couponCode;
        modal.querySelector("[data-role='tcc-percent']").textContent =
          `Giảm ${Number(target.couponDiscountPercent)}% — Vô thời hạn`;
      } else {
        couponWrap.hidden = true;
      }

      const agreeBtn = modal.querySelector("[data-role='tcc-agree']");
      agreeBtn.disabled = false;
      agreeBtn.textContent = "Đồng ý";
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add("is-visible"));
      markPopupShown(target.id);

      agreeBtn.onclick = async () => {
        agreeBtn.disabled = true;
        agreeBtn.textContent = "Đang xử lý...";
        try {
          if (target.couponId) await claimCoupon(target.couponId);
          await markRead([target.id]);
        } catch (err) {
          console.error("claim coupon:", err);
        }
        modal.classList.remove("is-visible");
        window.setTimeout(() => {
          modal.hidden = true;
        }, 200);
        await refreshNavbarUnread();
      };
    } catch (err) {
      console.warn("cancel coupon popup:", err.message);
    }
  }

  async function init() {
    if (document.body.dataset.customerNotiInit === "1") return;
    document.body.dataset.customerNotiInit = "1";

    dedupeNotificationUi();
    closeAllPanels(null);
    syncNavbarBellVisibility();
    await initBookingPanel();
    if (isCustomerUser() && getToken()) {
      void maybeShowCancelCouponPopup();
    }
  }

  window.CustomerNotifications = {
    syncNavbarBell: syncNavbarBellVisibility,
    refreshNavbarUnread,
    initNavbarBells,
  };

  function bootCustomerNotifications() {
    void init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootCustomerNotifications);
  } else {
    bootCustomerNotifications();
  }

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    closeAllPanels(null);
    dedupeNotificationUi();
    const bell = document.querySelector("#customerNotiWrap .customer-noti-bell");
    if (bell) bell.dataset.customerNotiBound = "0";
    syncNavbarBellVisibility();
  });
})();

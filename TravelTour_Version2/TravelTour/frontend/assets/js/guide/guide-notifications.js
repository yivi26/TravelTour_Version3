(() => {
  const API_LIST = "/api/guide/notifications?limit=25";
  const API_READ = "/api/guide/notifications/read";

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatTimeAgo(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";

    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Vừa xong";
    if (mins < 60) return `${mins} phút`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ngày`;
    return date.toLocaleDateString("vi-VN");
  }

  function isRecent(iso) {
    if (!iso) return false;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return false;
    return Date.now() - date.getTime() < 24 * 60 * 60 * 1000;
  }

  async function fetchNotifications(unreadOnly) {
    const url = unreadOnly ? `${API_LIST}&unread=1` : API_LIST;
    const res = await fetch(url, { headers: guideAuthHeaders() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.message || "Không tải được thông báo");
    }
    return json?.data || { total: 0, unreadCount: 0, items: [] };
  }

  async function markNotificationsRead(ids) {
    const body = ids && ids.length ? { ids } : { all: true };
    const res = await fetch(API_READ, {
      method: "PATCH",
      headers: guideAuthHeaders(),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.message || "Không cập nhật được trạng thái đọc");
    }
    return json?.data || { unreadCount: 0 };
  }

  function getBellButtons() {
    return document.querySelectorAll(".guide-noti-bell");
  }

  function setUnreadDot(bell, count) {
    const dot = bell.querySelector(".guide-noti-bell__dot");
    if (!dot) return;
    if (count > 0) {
      dot.hidden = false;
      dot.setAttribute("aria-label", `${count} thông báo chưa đọc`);
    } else {
      dot.hidden = true;
      dot.removeAttribute("aria-label");
    }
  }

  function ringBell(bell) {
    bell.classList.remove("is-ringing");
    void bell.offsetWidth;
    bell.classList.add("is-ringing");
    window.setTimeout(() => bell.classList.remove("is-ringing"), 600);
  }

  function buildPanel(wrap) {
    let panel = qs(".guide-noti-panel", wrap);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.className = "guide-noti-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Thông báo");
    panel.innerHTML = `
      <div class="guide-noti-panel__head">
        <div class="guide-noti-panel__title-row">
          <h2 class="guide-noti-panel__title">Thông báo</h2>
          <button type="button" class="guide-noti-panel__mark-read" data-action="mark-all">
            Đánh dấu đã đọc
          </button>
        </div>
        <div class="guide-noti-tabs" role="tablist">
          <button type="button" class="guide-noti-tab is-active" data-filter="all" role="tab">
            Tất cả
          </button>
          <button type="button" class="guide-noti-tab" data-filter="unread" role="tab">
            Chưa đọc
          </button>
        </div>
      </div>
      <div class="guide-noti-panel__body" data-role="list"></div>
      <div class="guide-noti-panel__foot">
        <a href="lichtrinh.html">Xem lịch trình tour</a>
      </div>
    `;

    panel.addEventListener("click", (e) => e.stopPropagation());
    wrap.appendChild(panel);
    return panel;
  }

  function renderAvatar(item) {
    const thumb = item.tourThumbnail;
    const label = String(item.providerName || item.tourTitle || "T")
      .trim()
      .charAt(0)
      .toUpperCase();

    if (thumb) {
      return `<img class="guide-noti-item__avatar" src="${escapeHtml(thumb)}" alt="" />`;
    }

    return `<span class="guide-noti-item__avatar guide-noti-item__avatar--fallback">${escapeHtml(label)}</span>`;
  }

  function renderItem(item) {
    const unread = !item.isRead;
    const href = item.href || "lichtrinh.html";
    const text =
      item.subtitle ||
      `${item.providerName || "Nhà cung cấp"} đã phân công bạn tour "${item.tourTitle || "Tour"}".`;

    return `
      <a
        class="guide-noti-item ${unread ? "is-unread" : ""}"
        href="${escapeHtml(href)}"
        data-id="${escapeHtml(item.id)}"
        data-unread="${unread ? "1" : "0"}"
      >
        <span class="guide-noti-item__avatar-wrap">
          ${renderAvatar(item)}
          <span class="guide-noti-item__badge" aria-hidden="true">✓</span>
        </span>
        <span class="guide-noti-item__content">
          <div class="guide-noti-item__text">${escapeHtml(text)}</div>
          <div class="guide-noti-item__time">${escapeHtml(formatTimeAgo(item.date))}</div>
        </span>
        ${unread ? '<span class="guide-noti-item__unread-dot" aria-hidden="true"></span>' : ""}
      </a>
    `;
  }

  function renderList(panel, items) {
    const listHost = panel.querySelector('[data-role="list"]');
    if (!listHost) return;

    if (!items.length) {
      listHost.innerHTML =
        '<div class="guide-noti-empty">Chưa có thông báo phân công tour.</div>';
      return;
    }

    const recent = items.filter((it) => isRecent(it.date));
    const older = items.filter((it) => !isRecent(it.date));

    let html = "";

    if (recent.length) {
      html += `
        <section class="guide-noti-section">
          <div class="guide-noti-section__head">
            <span class="guide-noti-section__title">Mới</span>
          </div>
          ${recent.map(renderItem).join("")}
        </section>
      `;
    }

    if (older.length) {
      html += `
        <section class="guide-noti-section">
          <div class="guide-noti-section__head">
            <span class="guide-noti-section__title">Trước đó</span>
          </div>
          ${older.map(renderItem).join("")}
        </section>
      `;
    }

    if (!recent.length && !older.length) {
      html = items.map(renderItem).join("");
    }

    listHost.innerHTML = html;

    listHost.querySelectorAll(".guide-noti-item").forEach((link) => {
      link.addEventListener("click", async () => {
        const id = Number(link.getAttribute("data-id"));
        if (!id || link.getAttribute("data-unread") !== "1") return;
        try {
          await markNotificationsRead([id]);
        } catch (err) {
          console.error(err);
        }
      });
    });
  }

  function setActiveTab(panel, filter) {
    panel.querySelectorAll(".guide-noti-tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.filter === filter);
    });
  }

  function openPanel(panel, bell) {
    panel.hidden = false;
    requestAnimationFrame(() => {
      panel.classList.add("is-visible");
    });
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
    document.querySelectorAll(".guide-noti-panel").forEach((panel) => {
      if (exceptPanel && panel === exceptPanel) return;
      const bell = panel.closest(".guide-noti-wrap")?.querySelector(".guide-noti-bell");
      if (bell) closePanel(panel, bell);
    });
  }

  async function loadAndRender(panel, state) {
    const listHost = panel.querySelector('[data-role="list"]');
    if (listHost) {
      listHost.innerHTML = '<div class="guide-noti-empty">Đang tải...</div>';
    }

    const data = await fetchNotifications(state.filter === "unread");
    state.items = Array.isArray(data.items) ? data.items : [];
    state.unreadCount = Number(data.unreadCount || 0);
    renderList(panel, state.items);
    return data;
  }

  async function attachBell(bell) {
    const wrap = bell.closest(".guide-noti-wrap") || bell.parentElement;
    if (!wrap) return;

    const panel = buildPanel(wrap);
    const state = { filter: "all", items: [], unreadCount: 0 };

    try {
      const data = await fetchNotifications(false);
      state.unreadCount = Number(data.unreadCount || 0);
      setUnreadDot(bell, state.unreadCount);
    } catch {
      setUnreadDot(bell, 0);
    }

    panel.querySelector('[data-action="mark-all"]')?.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const result = await markNotificationsRead(null);
        state.unreadCount = Number(result.unreadCount || 0);
        setUnreadDot(bell, state.unreadCount);
        await loadAndRender(panel, state);
      } catch (err) {
        console.error(err);
      }
    });

    panel.querySelectorAll(".guide-noti-tab").forEach((tab) => {
      tab.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.filter = tab.dataset.filter || "all";
        setActiveTab(panel, state.filter);
        try {
          await loadAndRender(panel, state);
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
        const data = await loadAndRender(panel, state);
        setUnreadDot(bell, Number(data.unreadCount || 0));
      } catch (err) {
        const listHost = panel.querySelector('[data-role="list"]');
        if (listHost) {
          listHost.innerHTML =
            '<div class="guide-noti-empty">Không tải được thông báo. Vui lòng thử lại.</div>';
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
    document.addEventListener("click", () => closeAllPanels(null));
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllPanels(null);
    });
  }

  async function init() {
    if (typeof guideAuthHeaders !== "function") return;

    bindOutsideClose();

    for (const bell of getBellButtons()) {
      if (bell.dataset.guideNotiBound === "1") continue;
      bell.dataset.guideNotiBound = "1";
      await attachBell(bell);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();

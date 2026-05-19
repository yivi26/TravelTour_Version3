(() => {
  const API_LIST = "/api/customer/notifications?limit=25";
  const API_READ = "/api/customer/notifications/read";

  function customerAuthHeaders() {
    const token =
      localStorage.getItem("accessToken") ||
      localStorage.getItem("token") ||
      "";
    const headers = { "Content-Type": "application/json" };
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
    if (type === "tour_guide_changed") return "🔄";
    return "🔔";
  }

  async function fetchList() {
    const res = await fetch(API_LIST, { headers: customerAuthHeaders() });
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

  function render(data) {
    const panel = document.getElementById("customerNotificationsPanel");
    const list = document.getElementById("customerNotificationsList");
    if (!panel || !list) return;

    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;

    list.innerHTML = items
      .map((item) => {
        const icon = getIcon(item.type);
        return `
        <article
          class="customer-noti ${item.isRead ? "" : "is-unread"}"
          data-id="${escapeHtml(item.id)}"
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

  async function init() {
    const token =
      localStorage.getItem("accessToken") || localStorage.getItem("token");
    if (!token) return;

    try {
      const data = await fetchList();
      render(data);

      const markAllBtn = document.getElementById("markAllNotificationsRead");
      markAllBtn?.addEventListener("click", async () => {
        try {
          const next = await markRead(null);
          render(next);
        } catch (err) {
          console.error(err);
        }
      });

      document
        .getElementById("customerNotificationsList")
        ?.addEventListener("click", async (event) => {
          const card = event.target.closest(".customer-noti.is-unread");
          if (!card) return;
          const id = Number(card.dataset.id);
          if (!id) return;
          try {
            const next = await markRead([id]);
            render(next);
          } catch (err) {
            console.error(err);
          }
        });
    } catch (err) {
      console.warn("customer notifications:", err.message);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();

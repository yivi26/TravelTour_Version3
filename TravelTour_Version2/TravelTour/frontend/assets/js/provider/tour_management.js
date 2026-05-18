let toursData = [];

function normalizeDateKey(value) {
  if (value == null || value === "") return "";
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getTourByIdFromCache(id) {
  return toursData.find((t) => Number(t.id) === Number(id)) || null;
}

function getTourActionsLockedMessage(tour) {
  if (!tour) return "Không tìm thấy tour.";
  if (tour.tour_phase === "ongoing") {
    return "Tour đang diễn ra. Không thể chỉnh sửa, xóa hoặc đổi trạng thái.";
  }
  if (tour.tour_phase === "completed") {
    return "Tour đã kết thúc. Không thể chỉnh sửa, xóa hoặc đổi trạng thái.";
  }
  if (tour.actions_locked) {
    return "Không thể thực hiện thao tác này với tour hiện tại.";
  }
  return "";
}

function isTourActionsLocked(tour) {
  if (!tour) return true;
  if (tour.management_actions_unlocked) return false;
  if (typeof tour.actions_locked === "boolean") return tour.actions_locked;
  const start = normalizeDateKey(tour.start_date);
  const end = normalizeDateKey(tour.end_date) || start;
  if (!start) return false;
  const today = normalizeDateKey(new Date());
  return today >= start;
}

/** Tour đang/đã diễn ra → áp dụng ràng buộc (trừ khi đã mở khóa thủ công). */
function isTourLifecycleConstrained(tour) {
  if (!tour) return false;
  if (tour.tour_phase === "ongoing" || tour.tour_phase === "completed") return true;
  const start = normalizeDateKey(tour.start_date);
  const end = normalizeDateKey(tour.end_date) || start;
  if (!start) return false;
  const today = normalizeDateKey(new Date());
  return today >= start;
}

function isTourActionsLockable(tour) {
  if (!tour || tour.management_actions_unlocked) return false;
  return isTourLifecycleConstrained(tour);
}

function isTourActionsRelockable(tour) {
  if (!tour || !tour.management_actions_unlocked) return false;
  return isTourLifecycleConstrained(tour);
}

function guardTourAction(id) {
  const tour = getTourByIdFromCache(id);
  const message = getTourActionsLockedMessage(tour);
  if (isTourActionsLocked(tour)) {
    alert(message);
    return false;
  }
  return true;
}

// =========================================
// 📦 LOAD DANH SÁCH TOUR
// =========================================
async function loadTours() {
  try {
    const res = await fetch("/api/provider/tours", {
      method: "GET",
      headers: providerAuthHeaders()
    });
    const result = await res.json();

    console.log("TOURS:", result);

    if (!res.ok) {
      const errText =
        result?.message ||
        (typeof result === "object" ? JSON.stringify(result) : String(result));
      console.error("API lỗi:", errText);
      alert(result?.message || "Không tải được danh sách tour");
      return;
    }

    // ✅ FIX Ở ĐÂY
    const tours = Array.isArray(result.data) ? result.data : [];

    if (!Array.isArray(result.data)) {
      console.error("Dữ liệu tours không hợp lệ:", result);
      return;
    }

    toursData = tours;

    renderTable(tours);
    renderStats(tours);
  } catch (err) {
    console.error("Lỗi load tours:", err);
    alert("Có lỗi xảy ra khi tải danh sách tour");
  }
}

// =========================================
// 📊 HIỂN THỊ TABLE
// =========================================
function renderTable(data) {
  const tbody = document.getElementById("tourTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!Array.isArray(data) || data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;">Không có tour nào</td>
      </tr>
    `;
    return;
  }

  data.forEach((t) => {
    const locked = isTourActionsLocked(t);
    const showUnlock = isTourActionsLockable(t);
    const showLock = isTourActionsRelockable(t);
    const lockTitle = locked ? escapeHtml(getTourActionsLockedMessage(t)) : "";
    const disabledAttr = locked ? " disabled" : "";
    const lockedClass = locked ? " tour-mgmt-action-btn--locked" : "";
    const constraintBtn = showUnlock
      ? `<button type="button" class="tour-mgmt-action-btn tour-mgmt-action-btn--unlock" onclick="unlockTourActions(${t.id})" title="Mở ràng buộc sửa, xóa, đổi trạng thái"><i class="fa-solid fa-lock-open" aria-hidden="true"></i></button>`
      : showLock
        ? `<button type="button" class="tour-mgmt-action-btn tour-mgmt-action-btn--lock" onclick="lockTourActions(${t.id})" title="Ràng buộc lại sửa, xóa, đổi trạng thái"><i class="fa-solid fa-lock" aria-hidden="true"></i></button>`
        : "";

    tbody.innerHTML += `
      <tr>
        <td>${escapeHtml(t.title || "")}</td>
        <td>${escapeHtml(t.location || "")}</td>
        <td>${formatMoney(t.display_price ?? t.final_price ?? t.base_price)}</td>
        <td>${Number(t.max_capacity || 0)}</td>
        <td>${renderStatus(t.status)}</td>
        <td class="tour-mgmt-actions">
          <button type="button" class="tour-mgmt-action-btn tour-mgmt-action-btn--progress" onclick="viewTourProgress(${t.id})" title="Xem tiến độ HDV cập nhật"><i class="fa-solid fa-clipboard-list"></i></button>
          ${constraintBtn}
          <button type="button" class="tour-mgmt-action-btn${lockedClass}"${disabledAttr} onclick="editTour(${t.id})" title="${locked ? lockTitle : "Chỉnh sửa"}">✏️</button>
          <button type="button" class="tour-mgmt-action-btn${lockedClass}"${disabledAttr} onclick="deleteTour(${t.id})" title="${locked ? lockTitle : "Xóa"}">🗑️</button>
          <button type="button" class="tour-mgmt-action-btn${lockedClass}"${disabledAttr} onclick="toggleStatus(${t.id}, '${String(t.status || "").replace(/'/g, "\\'")}')" title="${locked ? lockTitle : "Đổi trạng thái"}">🔄</button>
        </td>
      </tr>
    `;
  });
}

// =========================================
// ✏️ CHỈNH SỬA TOUR
// =========================================
function editTour(id) {
  if (!id) return;
  if (!guardTourAction(id)) return;
  window.location.href = `./taotour.html?id=${id}`;
}

// =========================================
// 📊 STATS
// =========================================
function renderStats(data) {
  const totalTours = document.getElementById("totalTours");
  const activeTours = document.getElementById("activeTours");
  const fullTours = document.getElementById("fullTours");
  const stoppedTours = document.getElementById("stoppedTours");

  if (totalTours) totalTours.innerText = data.length;

  const active = data.filter(t => t.status === "active").length;
  const full = data.filter(t => t.status === "full").length;
  const stopped = data.filter(t => t.status === "paused").length;

  if (activeTours) activeTours.innerText = active;
  if (fullTours) fullTours.innerText = full;
  if (stoppedTours) stoppedTours.innerText = stopped;
}

// =========================================
// 🔍 SEARCH
// =========================================
const searchInput = document.getElementById("searchInput");

if (searchInput) {
  searchInput.addEventListener("input", e => {
    const keyword = String(e.target.value || "").toLowerCase().trim();

    const filtered = toursData.filter(t =>
      String(t.title || "").toLowerCase().includes(keyword) ||
      String(t.location || "").toLowerCase().includes(keyword)
    );

    renderTable(filtered);
  });
}

// =========================================
// ➕ CLICK TẠO TOUR
// =========================================
const createBtn = document.getElementById("createTourBtn");

if (createBtn) {
  createBtn.addEventListener("click", () => {
    window.location.href = "./taotour.html";
  });
}

// =========================================
// 🗑 XOÁ TOUR
// =========================================
async function unlockTourActions(id) {
  if (!id) return;

  const tour = getTourByIdFromCache(id);
  if (!tour || !isTourActionsLockable(tour)) return;

  const ok = confirm(
    "Mở ràng buộc cho tour này?\n\nSau khi mở, bạn có thể sửa, xóa và đổi trạng thái tour kể cả khi tour đang diễn ra hoặc đã kết thúc.",
  );
  if (!ok) return;

  try {
    const res = await fetch(`/api/provider/tours/${id}/unlock-actions`, {
      method: "POST",
      headers: providerAuthHeaders(),
    });
    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(result.message || "Không mở được ràng buộc");
      return;
    }

    const cached = getTourByIdFromCache(id);
    if (cached) {
      cached.management_actions_unlocked = true;
      cached.actions_locked = false;
    }

    alert(result.message || "Đã mở ràng buộc");
    loadTours();
  } catch (err) {
    console.error("unlockTourActions:", err);
    alert("Có lỗi khi mở ràng buộc tour");
  }
}

async function lockTourActions(id) {
  if (!id) return;

  const tour = getTourByIdFromCache(id);
  if (!tour || !isTourActionsRelockable(tour)) return;

  const ok = confirm(
    "Ràng buộc lại tour này?\n\nSau khi khóa, bạn sẽ không thể sửa, xóa hoặc đổi trạng thái tour khi tour đang diễn ra hoặc đã kết thúc.",
  );
  if (!ok) return;

  try {
    const res = await fetch(`/api/provider/tours/${id}/lock-actions`, {
      method: "POST",
      headers: providerAuthHeaders(),
    });
    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(result.message || "Không ràng buộc được tour");
      return;
    }

    alert(result.message || "Đã ràng buộc lại");
    loadTours();
  } catch (err) {
    console.error("lockTourActions:", err);
    alert("Có lỗi khi ràng buộc tour");
  }
}

async function deleteTour(id) {
  if (!guardTourAction(id)) return;

  const confirmDelete = confirm("Bạn có chắc muốn xoá tour?");
  if (!confirmDelete) return;

  try {
    const res = await fetch(`/api/provider/tours/${id}`, {
      method: "DELETE",
      headers: providerAuthHeaders()
    });

    const result = await res.json();

    if (!res.ok) {
      alert(result.message || "Xóa tour thất bại");
      return;
    }

    alert("Xóa tour thành công");
    loadTours();
  } catch (err) {
    console.error("Lỗi deleteTour:", err);
    alert("Có lỗi xảy ra khi xóa tour");
  }
}

// =========================================
// 🔄 ĐỔI TRẠNG THÁI
// =========================================
async function toggleStatus(id, currentStatus) {
  if (!guardTourAction(id)) return;

  let newStatus = "active";

  if (currentStatus === "active") {
    newStatus = "paused";
  } else if (currentStatus === "paused") {
    newStatus = "active";
  } else if (currentStatus === "draft") {
    newStatus = "active";
  } else if (currentStatus === "archived") {
    newStatus = "active";
  }

  try {
    const res = await fetch(`/api/provider/tours/${id}/status`, {
      method: "PATCH",
      headers: providerAuthHeaders(),
      body: JSON.stringify({ status: newStatus })
    });

    const result = await res.json();

    if (!res.ok) {
      alert(result.message || "Cập nhật trạng thái thất bại");
      return;
    }

    loadTours();
  } catch (err) {
    console.error("Lỗi toggleStatus:", err);
    alert("Có lỗi xảy ra khi cập nhật trạng thái");
  }
}

// =========================================
// 🎨 HIỂN THỊ STATUS
// =========================================
function renderStatus(status) {
  const map = {
    active: "🟢 Đang hoạt động",
    paused: "🟡 Tạm dừng",
    draft: "⚪ Nháp",
    archived: "🔴 Ngưng",
    full: "🔵 Đã đầy"
  };

  return map[status] || escapeHtml(String(status || ""));
}

// =========================================
// 💰 FORMAT TIỀN
// =========================================
function formatMoney(value) {
  return Number(value || 0).toLocaleString("vi-VN") + " đ";
}

// =========================================
// 🛡 ESCAPE HTML
// =========================================
function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// =========================================
// 📋 XEM TIẾN ĐỘ HDV
// =========================================
function formatDateVN(value) {
  const key = normalizeDateKey(value);
  if (!key) return "--/--/----";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return "--/--/----";
  return date.toLocaleDateString("vi-VN");
}

function formatDateTimeVN(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN");
}

function closeTourProgressModal() {
  const modal = document.getElementById("tourProgressModal");
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.documentElement.classList.remove("tp-modal-open");
}

function renderProviderProgressBody(data) {
  const { tour, days, completed_activity_ids, stats, updated_at } = data;
  const completedSet = new Set(completed_activity_ids || []);
  const guideLabel = tour.guide_name
    ? `HDV: ${escapeHtml(tour.guide_name)}`
    : "Chưa phân công HDV";
  let updatedLabel = "HDV chưa cập nhật mốc nào";
  if (updated_at) {
    updatedLabel = `Cập nhật lần cuối: ${formatDateTimeVN(updated_at)}`;
  } else if (stats?.done > 0) {
    updatedLabel = `Đã hoàn thành ${stats.done} mốc (chưa ghi nhận thời gian)`;
  }

  const daysHtml = days?.length
    ? days
        .map((day) => {
          const headTitle = day.title
            ? `Ngày ${day.dayNum} — ${escapeHtml(day.title)}`
            : `Ngày ${day.dayNum}`;
          const activitiesHtml = day.activities.length
            ? day.activities
                .map((act) => {
                  const done = completedSet.has(act.id);
                  return `
              <div class="tp-activity${done ? " is-done" : ""}">
                <span class="tp-activity__check" aria-hidden="true">${done ? "✓" : ""}</span>
                <div class="tp-activity__body">
                  ${act.time ? `<div class="tp-activity__time">${escapeHtml(act.time)}</div>` : ""}
                  <p class="tp-activity__text">${escapeHtml(act.text)}</p>
                </div>
              </div>`;
                })
                .join("")
            : `<p class="tp-empty">Chưa có hoạt động trong ngày này.</p>`;

          return `
          <section class="tp-day">
            <h4 class="tp-day__title">${headTitle}</h4>
            ${activitiesHtml}
          </section>`;
        })
        .join("")
    : `<p class="tp-empty">Tour chưa có lịch trình chi tiết.</p>`;

  return `
    <p class="tp-summary-meta">${guideLabel} · ${escapeHtml(updatedLabel)}</p>
    <div class="tp-stats">
      <article class="tp-stat"><span>Đã hoàn thành</span><strong>${stats.done} / ${stats.total}</strong></article>
      <article class="tp-stat"><span>Tiến độ tổng</span><strong>${stats.percent}%</strong></article>
    </div>
    <div class="tp-scroll">${daysHtml}</div>
  `;
}

async function viewTourProgress(tourId) {
  const modal = document.getElementById("tourProgressModal");
  const titleEl = document.getElementById("tpModalTitle");
  const metaEl = document.getElementById("tpModalMeta");
  const bodyEl = document.getElementById("tpModalBody");
  if (!modal || !bodyEl) return;

  const tour = getTourByIdFromCache(tourId);
  if (titleEl) titleEl.textContent = tour?.title || "Tour";
  if (metaEl) {
    metaEl.textContent = tour?.start_date
      ? `${formatDateVN(tour.start_date)} – ${formatDateVN(tour.end_date || tour.start_date)}`
      : "";
  }

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.documentElement.classList.add("tp-modal-open");
  bodyEl.innerHTML =
    '<div class="tp-modal__loading">Đang tải tiến độ từ hướng dẫn viên...</div>';

  try {
    const res = await fetch(
      `/api/provider/tours/${encodeURIComponent(tourId)}/progress?_=${Date.now()}`,
      {
        method: "GET",
        headers: providerAuthHeaders(),
        cache: "no-store",
      },
    );
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.message || "Không tải được tiến độ tour");
    }
    bodyEl.innerHTML = renderProviderProgressBody(result.data);
  } catch (err) {
    console.error(err);
    bodyEl.innerHTML = `<p class="tp-empty tp-empty--error">${escapeHtml(err.message || "Có lỗi xảy ra")}</p>`;
  }
}

function bindProgressModalEvents() {
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-tp-modal]")) {
      closeTourProgressModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeTourProgressModal();
  });
}

// =========================================
// 🚀 INIT
// =========================================
bindProgressModalEvents();
loadTours();
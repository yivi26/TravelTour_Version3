let availability = [];
let assignedTours = [];
let schedules = [];
let selectedDates = new Set();
/** @type {"register" | "unregister" | null} */
let selectionMode = null;
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let urlTourHighlightId = null;
let toastTimer = null;

const MONTH_NAMES = [
  "Tháng 1",
  "Tháng 2",
  "Tháng 3",
  "Tháng 4",
  "Tháng 5",
  "Tháng 6",
  "Tháng 7",
  "Tháng 8",
  "Tháng 9",
  "Tháng 10",
  "Tháng 11",
  "Tháng 12",
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Chuẩn hóa ngày từ API (ISO UTC hoặc YYYY-MM-DD) → YYYY-MM-DD theo giờ local. */
function normalizeDateKey(value) {
  if (value == null || value === "") return "";
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso && text.length === 10) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return toDateKey(d);

  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return "";
}

function normalizeAvailabilityRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    date: normalizeDateKey(row.date),
  }));
}

function formatDateVN(dateString) {
  if (!dateString) return "--/--/----";
  const key = normalizeDateKey(dateString);
  if (!key) return "--/--/----";
  const date = parseDateKey(key);
  if (Number.isNaN(date.getTime())) return "--/--/----";
  return date.toLocaleDateString("vi-VN");
}

function formatTimeRange(startDate, endDate) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  const startTime =
    start && !Number.isNaN(start.getTime())
      ? start.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
      : "--:--";

  const endTime =
    end && !Number.isNaN(end.getTime())
      ? end.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
      : "--:--";

  return `${startTime} - ${endTime}`;
}

function showToast(message, isError = false) {
  const el = document.getElementById("ltToast");
  if (!el) return;

  el.textContent = message;
  el.hidden = false;
  el.classList.toggle("is-error", isError);

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

function guideLogout() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("traveltour_user");
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/pages/dangnhap/login.html";
}

function buildTourDateSet(tours) {
  const set = new Set();
  (tours || []).forEach((tour) => {
    const startKey = normalizeDateKey(tour.startDate || tour.start_date);
    const endKey = normalizeDateKey(tour.endDate || tour.end_date) || startKey;
    if (!startKey) return;

    const cursor = parseDateKey(startKey);
    const last = parseDateKey(endKey);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return;

    while (cursor <= last) {
      set.add(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  });
  return set;
}

function getFreeDateSet() {
  return new Set(
    availability.map((row) => normalizeDateKey(row.date)).filter(Boolean),
  );
}

function getAvailabilityRowByDate(dateKey) {
  const key = normalizeDateKey(dateKey);
  if (!key) return null;
  return (
    availability.find((row) => normalizeDateKey(row.date) === key) || null
  );
}

function clearDateSelection() {
  selectedDates.clear();
  selectionMode = null;
  updateSidePanelState();
}

function updateSidePanelState() {
  const isUnregister = selectionMode === "unregister";
  const btn = document.getElementById("ltConfirmRegister");
  const fields = ["ltTimeFrom", "ltTimeTo", "ltTourType", "ltNote"];

  fields.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = isUnregister;
  });

  if (!btn) return;

  if (isUnregister) {
    btn.classList.remove("lt-btn--primary");
    btn.classList.add("lt-btn--danger");
    btn.innerHTML =
      '<i class="ti ti-x"></i> Xác nhận hủy đăng ký';
  } else {
    btn.classList.remove("lt-btn--danger");
    btn.classList.add("lt-btn--primary");
    btn.innerHTML =
      '<i class="ti ti-check"></i> Xác nhận đăng ký';
  }
}

function toggleDateSelection(dateKey) {
  const freeSet = getFreeDateSet();
  const isFree = freeSet.has(dateKey);

  if (selectedDates.has(dateKey)) {
    selectedDates.delete(dateKey);
    if (selectedDates.size === 0) selectionMode = null;
    return;
  }

  if (selectionMode === "register" && isFree) {
    selectedDates.clear();
    selectionMode = "unregister";
    selectedDates.add(dateKey);
    return;
  }

  if (selectionMode === "unregister" && !isFree) {
    showToast("Chỉ chọn ngày đã đăng ký rảnh (màu xanh) để hủy", true);
    return;
  }

  if (!selectionMode) {
    selectionMode = isFree ? "unregister" : "register";
  }

  selectedDates.add(dateKey);
}

function isActiveTourOnCalendar(tour) {
  if (!tour) return false;
  if (tour.guideCompletedAt) return false;
  if (tour.type === "done") return false;
  const status = String(tour.status || "").toLowerCase();
  if (status.includes("hoàn thành") || status.includes("đã xong")) return false;
  return true;
}

function getActiveToursForCalendar() {
  const byId = new Map();
  [...assignedTours, ...schedules].forEach((tour) => {
    if (!tour?.id || !isActiveTourOnCalendar(tour)) return;
    byId.set(Number(tour.id), tour);
  });
  return [...byId.values()];
}

function getTourDateSet() {
  return buildTourDateSet(getActiveToursForCalendar());
}

function isPastDate(key) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = parseDateKey(key);
  return date < today;
}

function populateTimeSelects() {
  const fromEl = document.getElementById("ltTimeFrom");
  const toEl = document.getElementById("ltTimeTo");
  if (!fromEl || !toEl) return;

  const options = [];
  for (let h = 0; h < 24; h += 1) {
    for (const m of [0, 30]) {
      const value = `${pad2(h)}:${pad2(m)}`;
      options.push(`<option value="${value}">${value}</option>`);
    }
  }

  fromEl.innerHTML = options.join("");
  toEl.innerHTML = options.join("");
  fromEl.value = "08:00";
  toEl.value = "17:00";
}

function renderSelectedChips() {
  const container = document.getElementById("ltSelectedChips");
  if (!container) return;

  const sorted = [...selectedDates].sort();
  if (!sorted.length) {
    container.innerHTML = '<p class="lt-muted">Chưa chọn ngày nào</p>';
    selectionMode = null;
    updateSidePanelState();
    return;
  }

  const chipClass =
    selectionMode === "unregister" ? "lt-chip lt-chip--cancel" : "lt-chip";

  container.innerHTML = sorted
    .map(
      (key) => `
      <span class="${chipClass}" data-date="${key}">
        ${formatDateVN(key)}
        <button type="button" aria-label="Bỏ chọn" data-remove="${key}">&times;</button>
      </span>
    `,
    )
    .join("");

  updateSidePanelState();
}

function renderCalendar() {
  const grid = document.getElementById("ltCalendarGrid");
  const label = document.getElementById("ltMonthLabel");
  if (!grid || !label) return;

  label.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

  const freeSet = getFreeDateSet();
  const tourSet = getTourDateSet();
  const todayKey = toDateKey(new Date());

  const first = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  let startWeekday = first.getDay();
  startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;

  const cells = [];

  for (let i = 0; i < startWeekday; i += 1) {
    cells.push('<div class="lt-day lt-day--empty" aria-hidden="true"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
    const classes = ["lt-day"];
    const isTour = tourSet.has(key);
    const isFree = freeSet.has(key);
    const isPick = selectedDates.has(key);
    const isToday = key === todayKey;
    const isPast = isPastDate(key);

    if (isToday) classes.push("lt-day--today");
    if (isPick) classes.push("lt-day--pick");
    else if (isTour) classes.push("lt-day--tour");
    else if (isFree) classes.push("lt-day--free");

    if (isPast && !isFree && !isTour) classes.push("lt-day--muted");

    const disabled = isTour || (isPast && !isFree);
    const marker =
      isTour || isFree
        ? '<span class="lt-day-marker" aria-hidden="true"></span>'
        : "";

    cells.push(`
      <button
        type="button"
        class="${classes.join(" ")}"
        data-date="${key}"
        ${disabled ? "disabled" : ""}
        aria-label="Ngày ${day}"
      >
        <span>${day}</span>
        ${marker}
      </button>
    `);
  }

  grid.innerHTML = cells.join("");
}

function switchTab(tabName) {
  document.querySelectorAll(".lt-tab").forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  const panels = {
    register: document.getElementById("ltPanelRegister"),
    list: document.getElementById("ltPanelList"),
    assigned: document.getElementById("ltPanelAssigned"),
  };

  Object.entries(panels).forEach(([name, panel]) => {
    if (!panel) return;
    const active = name === tabName;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });

  if (tabName === "list") renderScheduleList();
  if (tabName === "assigned") renderAssignedList();
}

async function fetchAvailabilityBundle() {
  const response = await fetch("/api/guide/availability", {
    method: "GET",
    headers: guideAuthHeaders(),
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    assertGuideFetchOk(response, result, "Không thể tải lịch rảnh");
  }

  const data = result.data || {};
  availability = normalizeAvailabilityRows(data.availability);
  assignedTours = Array.isArray(data.assignedTours)
    ? data.assignedTours.map((tour) => ({
        ...tour,
        startDate: normalizeDateKey(tour.startDate),
        endDate: normalizeDateKey(tour.endDate),
        guideCompletedAt: tour.guideCompletedAt || null,
      }))
    : [];
}

async function fetchSchedules(filter = "all") {
  const response = await fetch(
    `/api/guide/schedules?filter=${encodeURIComponent(filter)}`,
    { method: "GET", headers: guideAuthHeaders() },
  );
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    assertGuideFetchOk(response, result, "Không thể tải lịch trình");
  }

  return Array.isArray(result.data)
    ? result.data.map((item) => ({
        ...item,
        startDate: normalizeDateKey(item.startDate),
        endDate: normalizeDateKey(item.endDate),
        guideCompletedAt: item.guideCompletedAt || null,
      }))
    : [];
}

async function saveAvailability() {
  const dates = [...selectedDates];
  if (!dates.length) {
    showToast("Vui lòng chọn ít nhất một ngày", true);
    return;
  }

  const tourSet = getTourDateSet();
  const blocked = dates.filter((d) => tourSet.has(d));
  if (blocked.length) {
    showToast("Không thể đăng ký ngày đã có tour", true);
    return;
  }

  const body = {
    dates,
    timeFrom: document.getElementById("ltTimeFrom")?.value || "08:00",
    timeTo: document.getElementById("ltTimeTo")?.value || "17:00",
    tourType: document.getElementById("ltTourType")?.value || "Tất cả loại tour",
    note: document.getElementById("ltNote")?.value?.trim() || "",
  };

  const response = await fetch("/api/guide/availability", {
    method: "POST",
    headers: guideAuthHeaders(),
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    assertGuideFetchOk(response, result, "Không thể đăng ký ngày rảnh");
  }

  availability = Array.isArray(result.data)
    ? normalizeAvailabilityRows(result.data)
    : availability;
  clearDateSelection();
  document.getElementById("ltNote").value = "";
  renderSelectedChips();
  renderCalendar();
  showToast(result.message || "Đăng ký ngày rảnh thành công");
}

async function cancelAvailability() {
  const dates = [...selectedDates].sort();
  if (!dates.length) {
    showToast("Vui lòng chọn ít nhất một ngày", true);
    return;
  }

  let removed = 0;
  for (const dateKey of dates) {
    const row = getAvailabilityRowByDate(dateKey);
    if (!row?.id) continue;
    await deleteAvailability(row.id, { quiet: true });
    removed += 1;
  }

  clearDateSelection();
  document.getElementById("ltNote").value = "";
  renderSelectedChips();
  renderCalendar();
  renderScheduleList();
  showToast(
    removed > 0
      ? `Đã hủy đăng ký ${removed} ngày rảnh`
      : "Không tìm thấy lịch rảnh để hủy",
    removed === 0,
  );
}

async function deleteAvailability(id, options = {}) {
  const { quiet = false } = options;
  const response = await fetch(`/api/guide/availability/${id}`, {
    method: "DELETE",
    headers: guideAuthHeaders(),
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    assertGuideFetchOk(response, result, "Không thể xóa ngày rảnh");
  }

  availability = availability.filter((row) => Number(row.id) !== Number(id));

  if (!quiet) {
    renderCalendar();
    renderScheduleList();
    showToast(result.message || "Đã xóa ngày rảnh");
  }
}

function renderScheduleList() {
  const container = document.getElementById("ltScheduleList");
  const filter = document.getElementById("ltListFilter")?.value || "all";
  if (!container) return;

  const tourSet = getTourDateSet();
  const items = [];

  if (filter === "all" || filter === "available") {
    availability.forEach((row) => {
      const dateLabel = formatDateVN(row.date);
      items.push({
        kind: "available",
        sortKey: normalizeDateKey(row.date),
        id: row.id,
        title: "Ngày rảnh đã đăng ký",
        date: row.date,
        meta: [
          `<span><i class="ti ti-calendar"></i>${dateLabel}</span>`,
          `<span><i class="ti ti-clock"></i>${row.timeFrom || "08:00"} - ${row.timeTo || "17:00"}</span>`,
          `<span><i class="ti ti-category"></i>${row.tourType || "Tất cả loại tour"}</span>`,
        ],
        note: row.note,
        badge: "lt-badge--free",
        badgeText: "Ngày rảnh",
      });
    });
  }

  if (filter === "all" || filter === "tour") {
    schedules.forEach((item) => {
      items.push({
        kind: "tour",
        sortKey: normalizeDateKey(item.startDate),
        id: item.id,
        title: item.tourName,
        date: item.startDate,
        meta: [
          `<span><i class="ti ti-calendar"></i>${formatDateVN(item.startDate)}</span>`,
          `<span><i class="ti ti-clock"></i>${formatTimeRange(item.startDate, item.endDate)}</span>`,
          `<span><i class="ti ti-map-pin"></i>${item.location}</span>`,
          `<span><i class="ti ti-users"></i>${item.customers} khách</span>`,
        ],
        badge: `lt-badge--${item.type || "upcoming"}`,
        badgeText: item.status,
        tourId: item.id,
      });
    });
  }

  items.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));

  if (!items.length) {
    container.innerHTML = '<div class="lt-empty">Không có lịch phù hợp.</div>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const focused =
        urlTourHighlightId != null &&
        item.kind === "tour" &&
        Number(item.tourId) === urlTourHighlightId;

      const actions =
        item.kind === "available"
          ? `<button type="button" class="lt-link lt-link--danger" data-delete-id="${item.id}">Xóa</button>`
          : `<button type="button" class="lt-link" data-tour-id="${item.tourId}">Xem chi tiết →</button>`;

      const noteHtml = item.note
        ? `<p class="lt-muted" style="margin-top:8px">${item.note}</p>`
        : "";

      return `
        <article class="lt-item${focused ? " lt-item--focused" : ""}">
          <div class="lt-item-top">
            <div>
              <div class="lt-item-title">${item.title}</div>
              <div class="lt-item-meta">${item.meta.join("")}</div>
              ${noteHtml}
            </div>
            <div class="lt-item-actions">
              <span class="lt-badge ${item.badge}">${item.badgeText}</span>
              ${actions}
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  if (urlTourHighlightId != null) {
    requestAnimationFrame(() => {
      container.querySelector(".lt-item--focused")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }
}

function renderAssignedList() {
  const container = document.getElementById("ltAssignedList");
  if (!container) return;

  const list = assignedTours.length ? assignedTours : schedules;

  if (!list.length) {
    container.innerHTML =
      '<div class="lt-empty">Chưa có tour được phân công.</div>';
    return;
  }

  container.innerHTML = list
    .map((item) => {
      const focused =
        urlTourHighlightId != null && Number(item.id) === urlTourHighlightId;
      const statusText =
        item.status ||
        (item.type === "running"
          ? "Đang diễn ra"
          : item.type === "done"
            ? "Đã xong"
            : "Sắp diễn ra");
      const badgeClass =
        item.type === "running"
          ? "lt-badge--running"
          : item.type === "done"
            ? "lt-badge--done"
            : "lt-badge--upcoming";

      return `
        <article class="lt-item${focused ? " lt-item--focused" : ""}">
          <div class="lt-item-top">
            <div>
              <div class="lt-item-title">${item.tourName || item.title || "Tour"}</div>
              <div class="lt-item-meta">
                <span><i class="ti ti-calendar"></i>${formatDateVN(item.startDate)}</span>
                <span><i class="ti ti-clock"></i>${formatTimeRange(item.startDate, item.endDate)}</span>
                <span><i class="ti ti-map-pin"></i>${item.location || "Chưa cập nhật"}</span>
                <span><i class="ti ti-users"></i>${item.customers || 0} khách</span>
              </div>
            </div>
            <div class="lt-item-actions">
              <span class="lt-badge ${badgeClass}">${statusText}</span>
              <button type="button" class="lt-link" data-tour-id="${item.id}">Xem chi tiết →</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function bindEvents() {
  document.querySelectorAll(".lt-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab || "register"));
  });

  document.getElementById("ltPrevMonth")?.addEventListener("click", () => {
    viewMonth -= 1;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear -= 1;
    }
    renderCalendar();
  });

  document.getElementById("ltNextMonth")?.addEventListener("click", () => {
    viewMonth += 1;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear += 1;
    }
    renderCalendar();
  });

  document.getElementById("ltCalendarGrid")?.addEventListener("click", (event) => {
    const btn = event.target.closest(".lt-day[data-date]:not([disabled])");
    if (!btn) return;

    const key = btn.dataset.date;
    if (!key || getTourDateSet().has(key)) return;
    if (isPastDate(key) && !getFreeDateSet().has(key)) return;

    toggleDateSelection(key);

    renderSelectedChips();
    renderCalendar();
  });

  document.getElementById("ltSelectedChips")?.addEventListener("click", (event) => {
    const removeBtn = event.target.closest("[data-remove]");
    if (!removeBtn) return;
    selectedDates.delete(removeBtn.dataset.remove);
    if (selectedDates.size === 0) selectionMode = null;
    renderSelectedChips();
    renderCalendar();
  });

  document.getElementById("ltClearSelection")?.addEventListener("click", () => {
    clearDateSelection();
    renderSelectedChips();
    renderCalendar();
  });

  document.getElementById("ltConfirmRegister")?.addEventListener("click", async () => {
    try {
      if (selectionMode === "unregister") {
        await cancelAvailability();
      } else {
        await saveAvailability();
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || "Không thể đăng ký", true);
    }
  });

  document.getElementById("ltListFilterBtn")?.addEventListener("click", () => {
    renderScheduleList();
  });

  document.getElementById("ltListFilter")?.addEventListener("change", () => {
    renderScheduleList();
  });

  document.getElementById("logoutBtn")?.addEventListener("click", guideLogout);

  document.addEventListener("click", async (event) => {
    const tourBtn = event.target.closest("[data-tour-id]");
    if (tourBtn) {
      const tourId = tourBtn.getAttribute("data-tour-id");
      if (tourId) {
        window.location.href = `tourdangdan.html?tourId=${tourId}`;
      }
      return;
    }

    const deleteBtn = event.target.closest("[data-delete-id]");
    if (!deleteBtn) return;

    const id = deleteBtn.getAttribute("data-delete-id");
    if (!id) return;
    if (!window.confirm("Xóa ngày rảnh này?")) return;

    try {
      await deleteAvailability(id);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Không thể xóa", true);
    }
  });
}

async function initPage() {
  try {
    const raw = new URLSearchParams(window.location.search).get("tourId");
    const n = raw != null && String(raw).trim() !== "" ? Number(raw) : NaN;
    urlTourHighlightId = Number.isNaN(n) ? null : n;

    populateTimeSelects();
    bindEvents();
    updateSidePanelState();

    await fetchAvailabilityBundle();
    schedules = await fetchSchedules("all");

    renderCalendar();
    renderSelectedChips();
    renderScheduleList();
    renderAssignedList();

    if (urlTourHighlightId != null) {
      switchTab("assigned");
    }
  } catch (error) {
    console.error("Lỗi tải lịch trình:", error);
    showToast(error.message || "Không tải được dữ liệu", true);

    const list = document.getElementById("ltScheduleList");
    if (list) {
      list.innerHTML =
        '<div class="lt-empty">Không tải được lịch trình.</div>';
    }
  }
}

document.addEventListener("DOMContentLoaded", initPage);

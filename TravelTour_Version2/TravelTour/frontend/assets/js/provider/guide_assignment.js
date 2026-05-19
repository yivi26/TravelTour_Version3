let guidesData = [];
let guidesDataAll = [];
let toursData = [];
let selectedTourIdFromUrl = null;
let focusedTourIdForSuggest = null;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function normalizeDateKey(value) {
  if (value == null || value === "") return "";
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso && text.length === 10) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return "";
}

function formatDateVN(dateString) {
  const key = normalizeDateKey(dateString);
  if (!key) return "--/--/----";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return "--/--/----";
  return date.toLocaleDateString("vi-VN");
}

/** Kết thúc ngày 19 → tour mới phải bắt đầu từ ngày 21. */
const MIN_DAYS_BETWEEN_TOUR_END_AND_NEXT_START = 2;

function ymdToLocalDate(ymd) {
  const key = normalizeDateKey(ymd);
  if (!key) return null;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetweenYmd(fromYmd, toYmd) {
  const from = ymdToLocalDate(fromYmd);
  const to = ymdToLocalDate(toYmd);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function addDaysToYmd(ymd, days) {
  const d = ymdToLocalDate(ymd);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return normalizeDateKey(d);
}

function toursHaveScheduleGap(start1, end1, start2, end2) {
  const s1 = normalizeDateKey(start1);
  const e1 = normalizeDateKey(end1) || s1;
  const s2 = normalizeDateKey(start2);
  const e2 = normalizeDateKey(end2) || s2;
  if (!s1 || !s2) return true;

  if (!(e1 < s2 || e2 < s1)) return false;

  if (e1 < s2) {
    const gap = daysBetweenYmd(e1, s2);
    if (gap != null && gap < MIN_DAYS_BETWEEN_TOUR_END_AND_NEXT_START) return false;
  }
  if (e2 < s1) {
    const gap = daysBetweenYmd(e2, s1);
    if (gap != null && gap < MIN_DAYS_BETWEEN_TOUR_END_AND_NEXT_START) return false;
  }
  return true;
}

function buildScheduleConflictMessage(tour, other) {
  const s1 = normalizeDateKey(tour.departureDate);
  const e1 = normalizeDateKey(tour.endDate || tour.departureDate) || s1;
  const s2 = normalizeDateKey(other.startDate);
  const e2 = normalizeDateKey(other.endDate || other.startDate) || s2;
  const otherName = other.title || "khác";
  const newName = tour.title || "này";

  if (!s1 || !s2) {
    return "Không thể phân công do thiếu ngày khởi hành/kết thúc của tour.";
  }

  if (!(e1 < s2 || e2 < s1)) {
    return `Hướng dẫn viên đã được phân công tour "${otherName}" trùng thời gian với tour "${newName}".`;
  }

  if (e1 < s2) {
    const minOtherStart = addDaysToYmd(e1, MIN_DAYS_BETWEEN_TOUR_END_AND_NEXT_START);
    return `Tour "${otherName}" phải bắt đầu từ ${formatDateVN(minOtherStart)} trở đi (sau tour "${newName}" kết thúc ${formatDateVN(e1)}, cần ít nhất 1 ngày nghỉ).`;
  }

  const minNewStart = addDaysToYmd(e2, MIN_DAYS_BETWEEN_TOUR_END_AND_NEXT_START);
  return `Tour "${newName}" phải bắt đầu từ ${formatDateVN(minNewStart)} trở đi (sau tour "${otherName}" kết thúc ${formatDateVN(e2)}, cần ít nhất 1 ngày nghỉ).`;
}

function getConflictingAssignedTour(guide, tour) {
  if (!guide?.assignedTours?.length || !tour) return null;
  const others = guide.assignedTours.filter(
    (t) => Number(t.id) !== Number(tour.id),
  );
  for (const other of others) {
    if (
      !toursHaveScheduleGap(
        tour.departureDate,
        tour.endDate || tour.departureDate,
        other.startDate,
        other.endDate || other.startDate,
      )
    ) {
      return other;
    }
  }
  return null;
}

function hasGuideScheduleConflict(guide, tour) {
  return Boolean(getConflictingAssignedTour(guide, tour));
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveGuideAvatarUrl(url) {
  if (!url) return "";
  const text = String(url).trim();
  if (!text) return "";
  if (text.startsWith("http://") || text.startsWith("https://")) return text;
  if (text.startsWith("/")) return text;
  return `/${text.replace(/^\/+/, "")}`;
}

function getGuideById(guideId) {
  if (!guideId) return null;
  const id = Number(guideId);
  return (
    guidesData.find((item) => item.id === id) ||
    guidesDataAll.find((item) => item.id === id) ||
    null
  );
}

function getGuideLabelById(guideId) {
  const guide = getGuideById(guideId);
  return guide?.name || "Chọn hướng dẫn viên";
}

function renderGuideAvatarHtml(guide, className = "tc-option-avatar") {
  const name = escapeHtml(guide?.name || "Hướng dẫn viên");
  const url = resolveGuideAvatarUrl(guide?.avatarUrl);

  if (url) {
    return `<span class="${className}"><img src="${escapeHtml(url)}" alt="${name}" /></span>`;
  }

  return `<span class="${className}"><i class="fa-solid fa-user" aria-hidden="true"></i></span>`;
}

function updateTriggerGuideDisplay(trigger, guideId) {
  if (!trigger) return;

  const labelEl = trigger.querySelector(".tc-select-trigger-text");
  const guide = guideId ? getGuideById(guideId) : null;

  if (labelEl) {
    labelEl.textContent = guideId
      ? guide?.name || "Chọn hướng dẫn viên"
      : "Chọn hướng dẫn viên";
    labelEl.classList.toggle("is-placeholder", !guideId);
  }

  let avatarEl = trigger.querySelector(".tc-select-trigger-avatar");
  if (!guideId) {
    avatarEl?.remove();
    return;
  }

  if (!avatarEl) {
    trigger.insertAdjacentHTML(
      "afterbegin",
      renderGuideAvatarHtml(guide, "tc-select-trigger-avatar"),
    );
    return;
  }

  const url = resolveGuideAvatarUrl(guide?.avatarUrl);
  if (url) {
    avatarEl.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(guide?.name || "Hướng dẫn viên")}" />`;
  } else {
    avatarEl.innerHTML = `<i class="fa-solid fa-user" aria-hidden="true"></i>`;
  }
}

function closeAllGuideDropdowns() {
  document.querySelectorAll(".tc-custom-select.is-open").forEach((root) => {
    root.classList.remove("is-open");
    const trigger = root.querySelector(".tc-select-trigger");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  });
}

/** HDV để hiện modal: ưu tiên bản đã enrich theo tour đang chọn (cột gợi ý). */
function resolveGuideForDetailModal(guideId) {
  const base = getGuideById(Number(guideId));
  if (!base) return null;
  const tour = getTourById(getActiveSuggestTourId());
  if (tour) return enrichGuideForActiveTour({ ...base });
  return { ...base };
}

function fileNameFromUrl(url) {
  if (!url) return "CV.pdf";
  const parts = String(url).split("/");
  return parts[parts.length - 1] || "CV.pdf";
}

function isPdfFileUrl(url) {
  return /\.pdf$/i.test(String(url || "").split("?")[0]);
}

function buildGuideCvSection(cvUrl) {
  const resolved = resolveGuideAvatarUrl(cvUrl);
  if (!resolved) {
    return `
      <section class="guide-detail-cv">
        <h4 class="guide-detail-cv__title">CV (Hồ sơ tài liệu)</h4>
        <p class="guide-detail-muted">HDV chưa tải CV trong mục <strong>Hồ sơ tài liệu</strong> ở trang hồ sơ cá nhân.</p>
      </section>
    `;
  }

  const fileName = fileNameFromUrl(resolved);
  const pdfPreview = isPdfFileUrl(resolved)
    ? `<iframe
        class="guide-detail-cv__frame"
        src="${escapeHtml(resolved)}"
        title="CV ${escapeHtml(fileName)}"
      ></iframe>`
    : "";

  return `
    <section class="guide-detail-cv">
      <h4 class="guide-detail-cv__title">CV (Hồ sơ tài liệu)</h4>
      <p class="guide-detail-modal__lead">
        Tài liệu được lấy từ hồ sơ cá nhân của hướng dẫn viên (mục Hồ sơ tài liệu).
      </p>
      <div class="guide-detail-cv__actions">
        <a
          class="guide-detail-cv__link"
          href="${escapeHtml(resolved)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <i class="fa-solid fa-file-pdf" aria-hidden="true"></i>
          Mở / tải CV (${escapeHtml(fileName)})
        </a>
      </div>
      ${pdfPreview}
    </section>
  `;
}

function buildGuideDetailModalContent(guide, documents = {}) {
  const ratingLine = guide.ratingHasScore
    ? `${escapeHtml(String(guide.rating))} / 5`
    : escapeHtml(guide.rating);

  return `
    <dl class="guide-detail-dl guide-detail-dl--compact">
      <dt>Họ tên</dt>
      <dd>${escapeHtml(guide.name)}</dd>
      <dt>Đánh giá</dt>
      <dd>${ratingLine}</dd>
      <dt>Kinh nghiệm</dt>
      <dd>${escapeHtml(guide.experience)}</dd>
      <dt>Chuyên môn</dt>
      <dd>${escapeHtml(guide.specialty)}</dd>
      <dt>Trạng thái</dt>
      <dd>${escapeHtml(guide.availabilityLabel)}</dd>
    </dl>
    ${buildGuideCvSection(documents.cvFileUrl)}
  `;
}

async function fetchGuideDocumentsForProvider(guideId) {
  const response = await fetch(
    `/api/provider/guides/${encodeURIComponent(guideId)}/documents`,
    { method: "GET", headers: providerAuthHeaders() },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "Không tải được CV hướng dẫn viên");
  }
  return result.data || {};
}

async function openGuideDetailModal(guideId) {
  const guide = resolveGuideForDetailModal(guideId);
  const modal = document.getElementById("guideDetailModal");
  const body = document.getElementById("guideDetailModalBody");
  const titleEl = document.getElementById("guideDetailModalTitle");
  if (!guide || !modal || !body || !titleEl) return;

  titleEl.textContent = guide.name || "CV hướng dẫn viên";
  body.innerHTML =
    '<p class="guide-detail-muted guide-detail-loading">Đang tải CV...</p>';
  modal.hidden = false;
  document.body.style.overflow = "hidden";

  const closeBtn = modal.querySelector(".guide-detail-modal__close");
  closeBtn?.focus?.();

  try {
    const documents = await fetchGuideDocumentsForProvider(guideId);
    titleEl.textContent = documents.fullName || guide.name || "CV hướng dẫn viên";
    body.innerHTML = buildGuideDetailModalContent(guide, documents);
  } catch (error) {
    console.error("openGuideDetailModal:", error);
    body.innerHTML = `
      <p class="guide-detail-muted">${escapeHtml(error.message || "Không tải được CV")}</p>
      ${buildGuideCvSection("")}
    `;
  }
}

function closeGuideDetailModal() {
  const modal = document.getElementById("guideDetailModal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.style.overflow = "";
}

function initGuideDropdowns() {
  document.querySelectorAll(".tc-custom-select").forEach((root) => {
    const trigger = root.querySelector(".tc-select-trigger");
    const menu = root.querySelector(".tc-select-menu");
    const hidden = root.querySelector(".tc-select-value");
    const labelEl = root.querySelector(".tc-select-trigger-text");

    if (!trigger || !menu || !hidden || root.dataset.dropdownBound === "1") return;
    root.dataset.dropdownBound = "1";

    trigger.addEventListener("click", function (event) {
      event.stopPropagation();
      const isOpen = root.classList.contains("is-open");
      closeAllGuideDropdowns();
      if (!isOpen) {
        root.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
      }
    });

    menu.querySelectorAll(".tc-select-option").forEach((option) => {
      option.addEventListener("click", function (event) {
        event.stopPropagation();
        if (option.getAttribute("data-busy") === "1") {
          const guide = getGuideById(Number(option.getAttribute("data-value")));
          const tourId = Number(root.getAttribute("data-tour-id"));
          const tour = getTourById(tourId);
          alert(getAssignBlockMessage(guide, tour));
          closeAllGuideDropdowns();
          return;
        }

        if (option.getAttribute("data-no-avail") === "1") {
          const tourId = Number(root.getAttribute("data-tour-id"));
          const guide = getGuideById(Number(option.getAttribute("data-value")));
          const tour = getTourById(tourId);
          alert(getAssignBlockMessage(guide, tour));
          closeAllGuideDropdowns();
          return;
        }

        const value = option.getAttribute("data-value") || "";
        const guide = value ? getGuideById(Number(value)) : null;
        const tourId = Number(root.getAttribute("data-tour-id"));
        const tour = getTourById(tourId);

        if (guide) {
          const blockMsg = getAssignBlockMessage(guide, tour);
          if (blockMsg) {
            alert(blockMsg);
            closeAllGuideDropdowns();
            return;
          }
        }

        hidden.value = value;
        if (labelEl) {
          labelEl.textContent = guide?.name || "Chọn hướng dẫn viên";
          labelEl.classList.toggle("is-placeholder", !value);
        }
        updateTriggerGuideDisplay(trigger, value ? Number(value) : null);

        menu.querySelectorAll(".tc-select-option").forEach((item) => {
          item.classList.toggle("is-selected", item === option);
          item.setAttribute("aria-selected", item === option ? "true" : "false");
        });

        closeAllGuideDropdowns();
      });
    });
  });
}

function getTourStatusText(status) {
  const map = {
    draft: "Nháp",
    active: "Đang mở bán",
    paused: "Tạm dừng",
    archived: "Lưu trữ",
    full: "Đã đủ chỗ",
  };
  return map[status] || status || "Không xác định";
}

function buildTourDayKeys(tour) {
  const start = normalizeDateKey(tour?.departureDate);
  const end = normalizeDateKey(tour?.endDate || tour?.departureDate);
  if (!start) return [];

  const cursor = new Date(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  );
  const last = new Date(
    Number(end.slice(0, 4)),
    Number(end.slice(5, 7)) - 1,
    Number(end.slice(8, 10)),
  );
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return [];

  const endBound = last < cursor ? cursor : last;
  const keys = [];
  while (cursor <= endBound) {
    keys.push(
      `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(cursor.getDate())}`,
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function getScheduleMatchLabel(match) {
  if (match.scheduleMatch === "full") {
    return `Phù hợp lịch (${match.matchedDays}/${match.totalTourDays} ngày)`;
  }
  if (match.scheduleMatch === "partial") {
    return `Khớp một phần (${match.matchedDays}/${match.totalTourDays} ngày rảnh)`;
  }
  if (match.scheduleMatch === "none" && match.totalTourDays > 0) {
    return "Chưa đăng ký đủ ngày rảnh";
  }
  return "";
}

function computeGuideMatchForTour(guide, tour, tourId) {
  const tourDays = buildTourDayKeys(tour);
  const total = tourDays.length;
  if (!total) {
    return {
      scheduleMatch: "unknown",
      matchedDays: 0,
      totalTourDays: 0,
      isSuggested: false,
      scheduleMatchLabel: "",
    };
  }

  const freeSet = new Set(
    (Array.isArray(guide.freeDates) ? guide.freeDates : []).map((d) =>
      normalizeDateKey(d),
    ),
  );
  let matched = 0;
  for (const day of tourDays) {
    if (freeSet.has(day)) matched += 1;
  }

  let scheduleMatch = "none";
  if (matched === total) scheduleMatch = "full";
  else if (matched > 0) scheduleMatch = "partial";

  const tourForMatch =
    tour || (tourId != null ? getTourById(tourId) : null);
  const scheduleConflict = tourForMatch
    ? hasGuideScheduleConflict(guide, tourForMatch)
    : false;
  const isSuggested = scheduleMatch === "full" && !scheduleConflict;

  return {
    scheduleMatch,
    matchedDays: matched,
    totalTourDays: total,
    isSuggested,
    scheduleMatchLabel: getScheduleMatchLabel({
      scheduleMatch,
      matchedDays: matched,
      totalTourDays: total,
    }),
  };
}

/** Chuỗi chuyên môn từ cột guides.specialty (thường là danh sách phân tách bằng dấu phẩy). */
function formatGuideSpecialtyField(value) {
  if (value == null || value === "") return "Chưa cập nhật";
  const parts = String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return "Chưa cập nhật";
  return parts.join(", ");
}

/** Điểm sao chỉ hiển thị số khi đã có đánh giá (rating_count > 0). */
function formatGuideRatingFields(guide) {
  const count = Number(guide.rating_count ?? 0);
  const avgRaw =
    guide.rating_avg != null && guide.rating_avg !== ""
      ? Number(guide.rating_avg)
      : NaN;
  if (count > 0 && !Number.isNaN(avgRaw)) {
    return { ratingText: avgRaw.toFixed(1), ratingHasScore: true };
  }
  const legacy =
    guide.rating != null && guide.rating !== "" ? Number(guide.rating) : NaN;
  if (!Number.isNaN(legacy) && legacy > 0) {
    return { ratingText: legacy.toFixed(1), ratingHasScore: true };
  }
  return { ratingText: "Chưa có đánh giá", ratingHasScore: false };
}

function normalizeGuide(guide) {
  const currentTourId = guide.active_tour_id != null ? Number(guide.active_tour_id) : null;
  const currentTourTitle = guide.active_tour_title || "";
  const hasInvalidActiveTour = Boolean(guide.has_invalid_active_tour);
  const isOnTour = Boolean(currentTourId) && !hasInvalidActiveTour;
  const scheduleMatch = guide.schedule_match || "unknown";
  const matchedDays = Number(guide.matched_days || 0);
  const totalTourDays = Number(guide.total_tour_days || 0);
  const isSuggested = Boolean(guide.is_suggested);
  const activeTourMatchedDays = Number(guide.active_tour_matched_days || 0);
  const activeTourTotalDays = Number(guide.active_tour_total_days || 0);

  let availabilityLabel = "Sẵn sàng";
  if (hasInvalidActiveTour) {
    availabilityLabel = "Chưa đăng ký đủ ngày rảnh";
  } else if (currentTourId) {
    availabilityLabel = "Đang dẫn tour";
  }

  const activeTourScheduleLabel = hasInvalidActiveTour
    ? `Chưa đủ ngày rảnh (${activeTourMatchedDays}/${activeTourTotalDays} ngày)`
    : "";

  const { ratingText, ratingHasScore } = formatGuideRatingFields(guide);

  return {
    id: Number(guide.id),
    name: guide.full_name || "Chưa có tên",
    avatarUrl: guide.avatar_url || "",
    rating: ratingText,
    ratingHasScore,
    experience:
      guide.experience_years != null
        ? `${guide.experience_years} năm`
        : guide.experience || "Chưa cập nhật",
    specialty: formatGuideSpecialtyField(guide.specialty),
    isOnTour,
    hasInvalidActiveTour,
    currentTourId,
    currentTourTitle,
    availabilityLabel,
    activeTourScheduleLabel,
    scheduleMatch,
    matchedDays,
    totalTourDays,
    isSuggested,
    scheduleMatchLabel: getScheduleMatchLabel({
      scheduleMatch,
      matchedDays,
      totalTourDays,
    }),
    freeDates: Array.isArray(guide.free_dates)
      ? guide.free_dates.map((d) => normalizeDateKey(d)).filter(Boolean)
      : [],
    assignedTours: Array.isArray(guide.assigned_tours)
      ? guide.assigned_tours.map((t) => ({
          id: Number(t.id),
          title: t.title || "",
          startDate: normalizeDateKey(t.start_date),
          endDate: normalizeDateKey(t.end_date || t.start_date),
        }))
      : [],
  };
}

function isGuideOnAnotherTour(guide, tourId) {
  if (!guide?.currentTourId) return false;
  if (guide.hasInvalidActiveTour) return false;
  return Number(guide.currentTourId) !== Number(tourId);
}

function isGuideBlockedOnCurrentTour(guide, tourId) {
  return (
    Boolean(guide?.hasInvalidActiveTour) &&
    Number(guide.currentTourId) === Number(tourId)
  );
}

function isGuideEligibleForTour(guide, tour) {
  if (!guide || !tour) return false;
  if (hasGuideScheduleConflict(guide, tour)) return false;

  const match = computeGuideMatchForTour(guide, tour, tour.id);
  if (!match.totalTourDays) return false;
  return match.scheduleMatch === "full";
}

function findGuideYearMismatchForTour(guide, tourDays) {
  const freeSet = new Set(
    (Array.isArray(guide?.freeDates) ? guide.freeDates : []).map((d) =>
      normalizeDateKey(d),
    ),
  );
  const mismatches = [];
  for (const tourDay of tourDays) {
    if (freeSet.has(tourDay)) continue;
    const monthDay = tourDay.slice(5);
    const sameCalendarDay = [...freeSet].find((d) => d.slice(5) === monthDay);
    if (sameCalendarDay && sameCalendarDay !== tourDay) {
      mismatches.push({ tourDay, guideDay: sameCalendarDay });
    }
  }
  return mismatches;
}

function getAssignBlockMessage(guide, tour) {
  if (!tour) return "Không tìm thấy tour.";
  const match = computeGuideMatchForTour(guide, tour, tour.id);

  if (!match.totalTourDays) {
    return "Tour chưa có ngày khởi hành/kết thúc. Vui lòng cập nhật lịch tour trước khi phân công HDV.";
  }
  const conflict = getConflictingAssignedTour(guide, tour);
  if (conflict) {
    return buildScheduleConflictMessage(tour, conflict);
  }
  if (match.scheduleMatch !== "full") {
    const tourDays = buildTourDayKeys(tour);
    const freeSet = new Set(
      (Array.isArray(guide.freeDates) ? guide.freeDates : []).map((d) =>
        normalizeDateKey(d),
      ),
    );
    const missing = tourDays.filter((day) => !freeSet.has(day));
    const start = formatDateVN(tour.departureDate);
    const end = formatDateVN(tour.endDate || tour.departureDate);
    const missingText = missing.length
      ? ` Còn thiếu: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? "…" : ""}.`
      : "";

    const yearMismatch = findGuideYearMismatchForTour(guide, tourDays);
    if (yearMismatch.length) {
      const sample = yearMismatch[0];
      return (
        `Tour cần ngày ${formatDateVN(sample.tourDay)}, nhưng HDV chỉ đăng ký rảnh ${formatDateVN(sample.guideDay)} (khác năm). ` +
        `Vui lòng sửa ngày khởi hành/kết thúc của tour trong Quản lý tour cho khớp năm ${sample.guideDay.slice(0, 4)}, ` +
        `hoặc yêu cầu HDV đăng ký đúng ngày ${formatDateVN(sample.tourDay)} trong Lịch trình của tôi.`
      );
    }

    return (
      `Hướng dẫn viên chưa đăng ký đủ ngày rảnh trùng lịch tour (${match.matchedDays}/${match.totalTourDays} ngày, tour: ${start} → ${end}).` +
      ` Yêu cầu HDV vào mục Lịch trình của tôi và đăng ký đúng các ngày trên.${missingText}`
    );
  }
  return "";
}

function enrichGuideForActiveTour(guide) {
  const tourId = getActiveSuggestTourId();
  const tour = tourId ? getTourById(tourId) : null;
  if (!tour) return guide;
  const match = computeGuideMatchForTour(guide, tour, tour.id);
  return { ...guide, ...match };
}

function normalizeTour(tour) {
  return {
    id: Number(tour.id),
    title: tour.title || "Chưa có tên tour",
    destination: tour.location || "Chưa cập nhật",
    departureDate: tour.start_date || null,
    endDate: tour.end_date || null,
    guests: Number(tour.max_capacity || 0),
    assignedGuideName: tour.guide_name || "",
    status: tour.status || "",
    guideId: tour.guide_id != null ? Number(tour.guide_id) : null,
  };
}

function getActiveSuggestTourId() {
  if (focusedTourIdForSuggest) return Number(focusedTourIdForSuggest);
  if (selectedTourIdFromUrl) return Number(selectedTourIdFromUrl);
  const withDates = toursData.find(
    (t) => normalizeDateKey(t.departureDate) && normalizeDateKey(t.endDate || t.departureDate),
  );
  if (withDates) return withDates.id;
  return toursData[0]?.id || null;
}

function getTourById(tourId) {
  return toursData.find((t) => Number(t.id) === Number(tourId)) || null;
}

function sortGuidesForSuggest(guides) {
  const order = { full: 0, partial: 1, none: 2, unknown: 3 };
  return [...guides].sort((a, b) => {
    if (a.isSuggested && !b.isSuggested) return -1;
    if (!a.isSuggested && b.isSuggested) return 1;
    const ma = order[a.scheduleMatch] ?? 9;
    const mb = order[b.scheduleMatch] ?? 9;
    if (ma !== mb) return ma - mb;
    if (b.matchedDays !== a.matchedDays) return b.matchedDays - a.matchedDays;
    return String(a.name).localeCompare(String(b.name), "vi");
  });
}

function sortGuidesForDropdown(guides, tourId) {
  const tour = getTourById(tourId);
  return [...guides]
    .map((guide) => {
      const match = tour
        ? computeGuideMatchForTour(guide, tour, tourId)
        : {
            scheduleMatch: guide.scheduleMatch,
            matchedDays: guide.matchedDays,
            totalTourDays: guide.totalTourDays,
            isSuggested: guide.isSuggested,
            scheduleMatchLabel: guide.scheduleMatchLabel,
          };
      return { ...guide, ...match };
    })
    .sort((a, b) => {
      const score = (g) => {
        if (g.isSuggested) return 0;
        if (g.scheduleMatch === "full") return 1;
        if (g.scheduleMatch === "partial") return 2;
        if (hasGuideScheduleConflict(g, getTourById(tourId))) return 9;
        return 5;
      };
      const diff = score(a) - score(b);
      if (diff !== 0) return diff;
      return String(a.name).localeCompare(String(b.name), "vi");
    });
}

function updateGuideListHint() {
  const el = document.getElementById("guideListHint");
  if (!el) return;

  const tourId = getActiveSuggestTourId();
  const tour = tourId ? getTourById(tourId) : null;

  if (!tour) {
    el.textContent = "Chọn tour bên phải để gợi ý HDV theo lịch rảnh.";
    return;
  }

  const start = formatDateVN(tour.departureDate);
  const end = formatDateVN(tour.endDate || tour.departureDate);
  el.textContent = `Gợi ý theo tour "${tour.title}" (${start} → ${end}): HDV có đủ ngày rảnh trong khoảng này.`;
}

async function fetchGuides(tourId = null) {
  const suggestId = tourId != null ? tourId : getActiveSuggestTourId();
  const query = suggestId ? `?tourId=${encodeURIComponent(suggestId)}` : "";

  const response = await fetch(`/api/provider/guides${query}`, {
    method: "GET",
    headers: providerAuthHeaders(),
  });

  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(data.message || "Không thể tải danh sách HDV");
  }

  return Array.isArray(data) ? data.map(normalizeGuide) : [];
}

async function fetchToursForAssignment() {
  const response = await fetch("/api/provider/tours/guide-assignment", {
    method: "GET",
    headers: providerAuthHeaders(),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Không thể tải danh sách tour");
  }

  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows.map(normalizeTour);
}

async function assignGuideToTour(tourId, guideId) {
  const response = await fetch("/api/provider/assign-guide-to-tour", {
    method: "POST",
    headers: providerAuthHeaders(),
    body: JSON.stringify({ tourId, guideId }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Phân công hướng dẫn viên thất bại");
  }

  return data;
}

async function unassignGuideFromTour(tourId) {
  const response = await fetch("/api/provider/unassign-guide-from-tour", {
    method: "POST",
    headers: providerAuthHeaders(),
    body: JSON.stringify({ tourId }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Bỏ phân công hướng dẫn viên thất bại");
  }

  return data;
}

function buildGuideCardHtml(guide, options = {}) {
  const { showSuggestBadge = false } = options;

  const cardClass = [
    "guide-card",
    guide.isOnTour ? "guide-card--busy" : "",
    guide.hasInvalidActiveTour ? "guide-card--no-avail" : "",
    showSuggestBadge &&
    guide.isSuggested &&
    !guide.isOnTour &&
    !guide.hasInvalidActiveTour
      ? "guide-card--suggested"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  let extraBadge = "";
  if (showSuggestBadge) {
    if (guide.hasInvalidActiveTour) {
      extraBadge = `<span class="gc-suggest-badge gc-suggest-badge--none">${escapeHtml(guide.activeTourScheduleLabel || guide.availabilityLabel)}</span>`;
    } else if (guide.isOnTour) {
      extraBadge = "";
    } else if (guide.isSuggested) {
      extraBadge =
        '<span class="gc-suggest-badge"><i class="fa-solid fa-sparkles"></i> Gợi ý</span>';
    } else if (guide.scheduleMatch === "partial") {
      extraBadge = `<span class="gc-suggest-badge gc-suggest-badge--partial">${escapeHtml(guide.scheduleMatchLabel)}</span>`;
    } else if (guide.scheduleMatch === "none" && guide.totalTourDays > 0) {
      extraBadge = `<span class="gc-suggest-badge gc-suggest-badge--none">${escapeHtml(guide.scheduleMatchLabel)}</span>`;
    }
  }

  return `
    <div class="${cardClass}">
      ${renderGuideAvatarHtml(guide, "gc-avatar")}
      <div class="gc-info">
        <div class="gc-header">
          <span class="gc-name">${escapeHtml(guide.name)}</span>
          <span class="gc-rating${guide.ratingHasScore ? "" : " gc-rating--empty"}" title="${
            guide.ratingHasScore
              ? "Điểm trung bình từ đánh giá của khách"
              : "HDV chưa có đánh giá từ khách (hoặc hệ thống chưa ghi nhận)"
          }">${
            guide.ratingHasScore
              ? `<i class="fa-solid fa-star"></i> ${escapeHtml(String(guide.rating))}`
              : escapeHtml(guide.rating)
          }</span>
        </div>
        <div class="gc-status-row">
          <span class="gc-status-badge ${
            guide.hasInvalidActiveTour
              ? "is-no-avail"
              : guide.isOnTour
                ? "is-busy"
                : "is-available"
          }">
            ${guide.availabilityLabel}
          </span>
          ${extraBadge}
        </div>
        ${
          guide.currentTourId && guide.currentTourTitle
            ? `<div class="gc-current-tour ${guide.hasInvalidActiveTour ? "is-warning" : ""}" title="${escapeHtml(guide.currentTourTitle)}">
                <i class="fa-solid fa-route"></i>
                <span>${escapeHtml(guide.currentTourTitle)}</span>
              </div>`
            : ""
        }
        <div class="gc-exp"><span class="gc-meta-label">Kinh nghiệm</span> ${escapeHtml(guide.experience)}</div>
        <div class="gc-specialty"><span class="gc-meta-label">Chuyên môn</span> ${escapeHtml(guide.specialty)}</div>
        <button type="button" class="gc-detail-btn" data-guide-detail="${guide.id}">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          Thông tin chi tiết
        </button>
      </div>
    </div>
  `;
}

function renderGuides(data) {
  const container = document.getElementById("guideList");
  if (!container) return;

  updateGuideListHint();

  if (!Array.isArray(data) || data.length === 0) {
    container.innerHTML = `<div class="empty-state">Không có HDV gợi ý.</div>`;
    return;
  }

  container.innerHTML = sortGuidesForSuggest(data)
    .map((guide) => buildGuideCardHtml(guide, { showSuggestBadge: true }))
    .join("");
}

function renderAllGuides(data) {
  const container = document.getElementById("guideListAll");
  const countEl = document.getElementById("guideAllCount");
  if (!container) return;

  if (countEl) {
    countEl.textContent = String(Array.isArray(data) ? data.length : 0);
  }

  if (!Array.isArray(data) || data.length === 0) {
    container.innerHTML = `<div class="empty-state">Chưa có hướng dẫn viên active trên hệ thống. Liên hệ quản trị để tạo tài khoản HDV.</div>`;
    return;
  }

  const tour = getTourById(getActiveSuggestTourId());
  const showMatch = Boolean(tour);

  container.innerHTML = [...data]
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "vi"))
    .map((guide) =>
      buildGuideCardHtml(enrichGuideForActiveTour(guide), {
        showSuggestBadge: showMatch,
      }),
    )
    .join("");
}

function renderTours(data) {
  const container = document.getElementById("tourList");
  if (!container) return;

  if (!Array.isArray(data) || data.length === 0) {
    container.innerHTML = `<div class="empty-state">Không tìm thấy tour phù hợp. Vào <strong>Quản lý tour</strong> để tạo tour trước khi phân công HDV.</div>`;
    return;
  }

  container.innerHTML = data
    .map((tour) => {
      const isAssigned = Boolean(tour.assignedGuideName);
      const assignedGuide = tour.guideId ? getGuideById(tour.guideId) : null;
      const invalidAssign =
        assignedGuide && isGuideBlockedOnCurrentTour(assignedGuide, tour.id);
      const activeSuggestId = getActiveSuggestTourId();
      const isFocused =
        Number(activeSuggestId) === Number(tour.id) ||
        (selectedTourIdFromUrl && Number(selectedTourIdFromUrl) === Number(tour.id));

      return `
        <div
          class="tour-card ${isFocused ? "tour-card-focus" : ""} ${isAssigned ? "tour-card--assigned" : ""}"
          data-tour-pick="${tour.id}"
          role="button"
          tabindex="0"
        >
          <div class="tc-title">${escapeHtml(tour.title)}</div>

          <div class="tc-details">
            <p><i class="fa-solid fa-location-dot"></i> ${escapeHtml(tour.destination)}</p>
            <p><i class="fa-regular fa-calendar"></i> ${formatDateVN(tour.departureDate)} → ${formatDateVN(tour.endDate || tour.departureDate)}</p>
            <p><i class="fa-solid fa-users"></i> Tối đa: ${tour.guests} khách</p>
            <p><i class="fa-solid fa-ticket"></i> Trạng thái tour: ${getTourStatusText(tour.status)}</p>
          </div>

          <div class="tc-assign-block">
            <div class="tc-assign-header">
              <span class="tc-assign-icon" aria-hidden="true">
                <i class="fa-solid fa-user-tie"></i>
              </span>
              <span class="tc-assign-label">Hướng dẫn viên</span>
            </div>

            <div class="tc-assign-row">
              <div class="tc-custom-select" data-tour-id="${tour.id}">
                <input
                  type="hidden"
                  class="tc-select-value"
                  data-tour-id="${tour.id}"
                  value="${tour.guideId || ""}"
                />
                <button
                  type="button"
                  class="tc-select-trigger"
                  aria-haspopup="listbox"
                  aria-expanded="false"
                  aria-label="Chọn hướng dẫn viên cho tour"
                >
                  ${tour.guideId ? renderGuideAvatarHtml(getGuideById(tour.guideId), "tc-select-trigger-avatar") : ""}
                  <span class="tc-select-trigger-text ${tour.guideId ? "" : "is-placeholder"}">
                    ${escapeHtml(getGuideLabelById(tour.guideId))}
                  </span>
                  <span class="tc-select-chevron" aria-hidden="true">
                    <i class="fa-solid fa-chevron-down"></i>
                  </span>
                </button>
                <ul class="tc-select-menu" role="listbox">
                  <li
                    class="tc-select-option tc-select-option--placeholder ${!tour.guideId ? "is-selected" : ""}"
                    role="option"
                    data-value=""
                    aria-selected="${!tour.guideId ? "true" : "false"}"
                  >
                    <span class="tc-option-label">Chọn hướng dẫn viên</span>
                  </li>
                  ${sortGuidesForDropdown(guidesDataAll.length ? guidesDataAll : guidesData, tour.id)
                    .map((guide) => {
                      const selected = tour.guideId === guide.id;
                      const scheduleConflict = hasGuideScheduleConflict(guide, tour);
                      const onOtherTour = isGuideOnAnotherTour(guide, tour.id);
                      const blockedOnTour = isGuideBlockedOnCurrentTour(guide, tour.id);
                      const eligible = isGuideEligibleForTour(guide, tour);
                      const noAvail =
                        blockedOnTour || scheduleConflict || !eligible;
                      const suggestTag = guide.isSuggested
                        ? '<span class="tc-option-suggest-tag">Gợi ý</span>'
                        : guide.scheduleMatch === "partial"
                          ? '<span class="tc-option-suggest-tag tc-option-suggest-tag--partial">Khớp một phần</span>'
                          : noAvail
                            ? '<span class="tc-option-no-avail-tag">Chưa đủ ngày rảnh</span>'
                            : "";
                      return `
                    <li
                      class="tc-select-option ${selected ? "is-selected" : ""} ${scheduleConflict ? "is-busy" : ""} ${noAvail ? "is-no-avail" : ""} ${guide.isSuggested ? "is-suggested" : ""}"
                      role="option"
                      data-value="${guide.id}"
                      data-busy="${scheduleConflict ? "1" : "0"}"
                      data-no-avail="${noAvail ? "1" : "0"}"
                      aria-selected="${selected ? "true" : "false"}"
                      aria-disabled="${noAvail ? "true" : "false"}"
                    >
                      ${renderGuideAvatarHtml(guide, "tc-option-avatar")}
                      <span class="tc-option-label">
                        ${escapeHtml(guide.name)}
                        ${suggestTag}
                        ${scheduleConflict ? '<span class="tc-option-busy-tag">Chưa đủ cách ngày</span>' : onOtherTour ? '<span class="tc-option-busy-tag">Đang dẫn tour</span>' : ""}
                      </span>
                      ${selected ? '<span class="tc-option-check"><i class="fa-solid fa-check"></i></span>' : ""}
                    </li>
                  `;
                    })
                    .join("")}
                </ul>
              </div>

              <button
                type="button"
                class="btn-action btn-assign"
                data-action="assign-tour"
                data-tour-id="${tour.id}"
              >
                <i class="fa-solid ${isAssigned ? "fa-arrows-rotate" : "fa-user-check"}"></i>
                <span>${isAssigned ? "Cập nhật" : "Phân công"}</span>
              </button>
              ${
                isAssigned
                  ? `
              <button
                type="button"
                class="btn-action btn-unassign"
                data-action="unassign-tour"
                data-tour-id="${tour.id}"
                title="Bỏ phân công hướng dẫn viên"
              >
                <i class="fa-solid fa-user-xmark"></i>
                <span>Bỏ chọn</span>
              </button>
              `
                  : ""
              }
            </div>

            <div class="tc-status ${isAssigned ? "" : "hidden"}">
              <span class="tc-status-dot" aria-hidden="true"></span>
              <span class="tc-status-text">
                <strong>Đã phân công:</strong> ${escapeHtml(isAssigned ? tour.assignedGuideName : "")}
              </span>
            </div>
            ${
              invalidAssign
                ? `<p class="tc-invalid-assign">HDV này chưa đủ ngày rảnh — phân công không hợp lệ. Chọn HDV khác hoặc yêu cầu HDV đăng ký lịch.</p>`
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");

  initGuideDropdowns();
}

function getFilteredData() {
  const input = document.getElementById("globalSearchInput");
  const keyword = (input?.value || "").trim().toLowerCase();

  let filteredGuides = guidesData.filter((guide) => {
    return (
      guide.name.toLowerCase().includes(keyword) ||
      String(guide.specialty).toLowerCase().includes(keyword) ||
      String(guide.experience).toLowerCase().includes(keyword) ||
      String(guide.rating).toLowerCase().includes(keyword) ||
      String(guide.availabilityLabel).toLowerCase().includes(keyword) ||
      String(guide.scheduleMatchLabel || "").toLowerCase().includes(keyword) ||
      String(guide.currentTourTitle).toLowerCase().includes(keyword)
    );
  });

  let filteredTours = toursData.filter((tour) => {
    return (
      tour.title.toLowerCase().includes(keyword) ||
      tour.destination.toLowerCase().includes(keyword) ||
      formatDateVN(tour.departureDate).toLowerCase().includes(keyword) ||
      String(tour.guests).includes(keyword) ||
      String(tour.assignedGuideName).toLowerCase().includes(keyword) ||
      getTourStatusText(tour.status).toLowerCase().includes(keyword)
    );
  });

  if (selectedTourIdFromUrl) {
    const selectedId = Number(selectedTourIdFromUrl);
    filteredTours = filteredTours.sort((a, b) => {
      if (a.id === selectedId) return -1;
      if (b.id === selectedId) return 1;
      return 0;
    });
  }

  let filteredAll = guidesDataAll.filter((guide) => {
    return (
      guide.name.toLowerCase().includes(keyword) ||
      String(guide.specialty).toLowerCase().includes(keyword) ||
      String(guide.experience).toLowerCase().includes(keyword) ||
      String(guide.rating).toLowerCase().includes(keyword) ||
      String(guide.availabilityLabel).toLowerCase().includes(keyword) ||
      String(guide.currentTourTitle).toLowerCase().includes(keyword)
    );
  });

  return { filteredGuides, filteredAll, filteredTours };
}

function updateView() {
  const { filteredGuides, filteredAll, filteredTours } = getFilteredData();
  renderGuides(filteredGuides);
  renderAllGuides(filteredAll);
  renderTours(filteredTours);
}

async function handleUnassign(tourId) {
  const tour = getTourById(tourId);
  if (!tour?.guideId) {
    alert("Tour này chưa có hướng dẫn viên được phân công.");
    return;
  }

  if (
    !(await showAppConfirm(
      `Bỏ phân công "${tour.assignedGuideName || "hướng dẫn viên"}" khỏi tour "${tour.title}"?`,
    ))
  ) {
    return;
  }

  try {
    await unassignGuideFromTour(tourId);
    await loadPageData();
    alert("Đã bỏ phân công hướng dẫn viên cho tour.");
  } catch (error) {
    console.error("Lỗi bỏ phân công:", error);
    alert(error.message || "Có lỗi xảy ra khi bỏ phân công.");
  }
}

async function handleAssign(tourId) {
  const hidden = document.querySelector(
    `input.tc-select-value[data-tour-id="${tourId}"]`,
  );
  if (!hidden) return;

  const guideId = Number(hidden.value);

  if (!guideId) {
    alert("Vui lòng chọn hướng dẫn viên.");
    return;
  }

  const guide = getGuideById(guideId);
  const tour = getTourById(tourId);
  const blockMsg = getAssignBlockMessage(guide, tour);
  if (blockMsg) {
    alert(blockMsg);
    return;
  }

  try {
    await assignGuideToTour(tourId, guideId);
    await loadPageData();
    alert("Phân công hướng dẫn viên cho tour thành công.");
  } catch (error) {
    console.error("Lỗi phân công:", error);
    alert(error.message || "Có lỗi xảy ra khi phân công.");
  }
}

async function reloadGuidesForActiveTour() {
  guidesData = await fetchGuides(getActiveSuggestTourId());
}

async function reloadAllGuides() {
  guidesDataAll = await fetchGuides(null);
}

async function handleTourPick(tourId) {
  const id = Number(tourId);
  if (!id) return;

  focusedTourIdForSuggest = id;
  selectedTourIdFromUrl = null;

  try {
    await reloadGuidesForActiveTour();
    const { filteredGuides, filteredAll, filteredTours } = getFilteredData();
    renderGuides(filteredGuides);
    renderAllGuides(filteredAll);
    renderTours(filteredTours);
  } catch (error) {
    console.error("Lỗi tải gợi ý HDV:", error);
  }
}

function bindEvents() {
  const searchInput = document.getElementById("globalSearchInput");

  if (searchInput) {
    searchInput.addEventListener("input", updateView);
  }

  document.addEventListener("click", function (event) {
    const dismissGuide = event.target.closest("[data-guide-detail-dismiss]");
    if (dismissGuide) {
      closeGuideDetailModal();
      return;
    }

    const detailBtn = event.target.closest("[data-guide-detail]");
    if (detailBtn) {
      event.stopPropagation();
      openGuideDetailModal(detailBtn.getAttribute("data-guide-detail"));
      return;
    }

    if (!event.target.closest(".tc-custom-select")) {
      closeAllGuideDropdowns();
    }

    const tourCard = event.target.closest("[data-tour-pick]");
    if (
      tourCard &&
      !event.target.closest(
        ".tc-custom-select, [data-action='assign-tour'], [data-action='unassign-tour'], button, a",
      )
    ) {
      handleTourPick(tourCard.getAttribute("data-tour-pick"));
      return;
    }

    const unassignBtn = event.target.closest("[data-action='unassign-tour']");
    if (unassignBtn) {
      const tourId = Number(unassignBtn.getAttribute("data-tour-id"));
      if (tourId) handleUnassign(tourId);
      return;
    }

    const button = event.target.closest("[data-action='assign-tour']");
    if (!button) return;

    const tourId = Number(button.getAttribute("data-tour-id"));
    if (!tourId) return;

    handleAssign(tourId);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    const modal = document.getElementById("guideDetailModal");
    if (modal && !modal.hidden) {
      closeGuideDetailModal();
      return;
    }
    closeAllGuideDropdowns();
  });
}

async function loadPageData() {
  const tours = await fetchToursForAssignment();
  toursData = tours.filter((item) => item.status !== "archived");

  if (!focusedTourIdForSuggest && selectedTourIdFromUrl) {
    focusedTourIdForSuggest = Number(selectedTourIdFromUrl);
  }

  guidesDataAll = await fetchGuides(null);
  guidesData = await fetchGuides(getActiveSuggestTourId());
  updateView();
}

function readTourIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  selectedTourIdFromUrl = params.get("tourId");
}

async function initPage() {
  if (typeof syncProviderHeaderFromStorage === "function") {
    syncProviderHeaderFromStorage();
  }

  try {
    readTourIdFromUrl();
    await loadPageData();
    bindEvents();
  } catch (error) {
    console.error("Lỗi tải dữ liệu trang phân công guide:", error);

    const msg = error && error.message ? String(error.message) : "";
    if (msg.indexOf("Chỉ tài khoản nhà cung cấp") !== -1) {
      alert(
        "Trang này chỉ dành cho tài khoản Nhà cung cấp (Provider). Vui lòng đăng xuất và đăng nhập bằng email nhà cung cấp.",
      );
      const ret = encodeURIComponent(
        window.location.pathname + (window.location.search || ""),
      );
      window.location.href = "/pages/dangnhap/login.html?return_to=" + ret;
      return;
    }

    const guideList = document.getElementById("guideList");
    const tourList = document.getElementById("tourList");

    if (guideList) {
      guideList.innerHTML = `<div class="empty-state">Không tải được danh sách hướng dẫn viên.</div>`;
    }

    const guideListAll = document.getElementById("guideListAll");
    if (guideListAll) {
      guideListAll.innerHTML = `<div class="empty-state">Không tải được danh sách hướng dẫn viên.</div>`;
    }

    if (tourList) {
      tourList.innerHTML = `<div class="empty-state">Không tải được danh sách tour.</div>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", initPage);

let currentTours = [];
/** Từ `lichtrinh.html?tourId=` → tourdangdan: làm nổi bật đúng tour. */
let urlTourHighlightId = null;
let activeProgressTourId = null;
let activeContactTourId = null;
/** @type {{ tourView: object, days: object[] } | null} */
let progressPanelCache = null;
/** @type {Map<number, Set<string>>} */
const progressCompletedByTour = new Map();
/** @type {Map<string, Promise<void>>} */
const progressSaveQueues = new Map();
const TOUR_PROGRESS_STORAGE_KEY = "guide_tour_progress_v1";

const TD_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80";

function formatDateVN(dateString) {
  if (!dateString) return "--/--/----";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "--/--/----";
  return date.toLocaleDateString("vi-VN");
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMultiline(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function hasText(value) {
  return String(value ?? "").trim() !== "";
}

async function fetchTourCustomers(tourId) {
  const res = await fetch(
    `/api/guide/tours/${encodeURIComponent(tourId)}/customers`,
    { method: "GET", headers: guideAuthHeaders() },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.message || "Không tải được danh sách khách hàng");
  }
  return json.data;
}

function travelerTypeLabel(type) {
  if (type === "child") return "Trẻ em";
  if (type === "infant") return "Em bé";
  return "Người lớn";
}

function genderLabel(g) {
  if (g === "male") return "Nam";
  if (g === "female") return "Nữ";
  return "Khác";
}

function renderContactPanelContent(data) {
  const tour = data?.tour || {};
  const bookings = Array.isArray(data?.bookings) ? data.bookings : [];
  const dateRange = `${formatDateVN(tour.start_date)} – ${formatDateVN(tour.end_date)}`;

  if (!bookings.length) {
    return `
      <header class="tour-contact__header">
        <div>
          <h3 class="tour-contact__title">Liên hệ khách</h3>
          <p class="tour-contact__subtitle">${escapeHtml(tour.title || "")} · ${escapeHtml(dateRange)}</p>
        </div>
        <button type="button" class="tour-contact__close" data-close-contact aria-label="Đóng">&times;</button>
      </header>
      <p class="tour-contact__empty">Chưa có khách đặt tour này.</p>
    `;
  }

  let stt = 0;
  const rowsHtml = bookings
    .map((b) => {
      const bookerStt = ++stt;
      const bookerRow = `
        <tr class="tour-contact__row tour-contact__row--booker">
          <td class="tour-contact__stt">${bookerStt}</td>
          <td>
            <div class="tour-contact__name">${escapeHtml(b.booker.name || "Khách hàng")}</div>
            <div class="tour-contact__meta">
              <span class="tour-contact__chip tour-contact__chip--booker">Người đặt</span>
              <span class="tour-contact__chip">${escapeHtml(b.booking_code || ("#" + b.booking_id))}</span>
            </div>
          </td>
          <td>
            ${
              b.booker.phone
                ? `<a class="tour-contact__link" href="tel:${escapeHtml(b.booker.phone)}">${escapeHtml(b.booker.phone)}</a>`
                : '<span class="tour-contact__muted">—</span>'
            }
          </td>
          <td>
            ${
              b.booker.email
                ? `<a class="tour-contact__link" href="mailto:${escapeHtml(b.booker.email)}">${escapeHtml(b.booker.email)}</a>`
                : '<span class="tour-contact__muted">—</span>'
            }
          </td>
        </tr>
      `;

      const travelerRows = (b.travelers || [])
        .map((t) => {
          const s = ++stt;
          return `
            <tr class="tour-contact__row tour-contact__row--traveler">
              <td class="tour-contact__stt">${s}</td>
              <td>
                <div class="tour-contact__name">${escapeHtml(t.full_name || "")}</div>
                <div class="tour-contact__meta">
                  <span class="tour-contact__chip tour-contact__chip--traveler">Thành viên</span>
                  <span class="tour-contact__chip">${escapeHtml(travelerTypeLabel(t.traveler_type))}</span>
                  <span class="tour-contact__chip">${escapeHtml(genderLabel(t.gender))}</span>
                  ${t.id_number ? `<span class="tour-contact__chip">CMND/CCCD: ${escapeHtml(t.id_number)}</span>` : ""}
                </div>
              </td>
              <td>
                ${
                  t.phone
                    ? `<a class="tour-contact__link" href="tel:${escapeHtml(t.phone)}">${escapeHtml(t.phone)}</a>`
                    : '<span class="tour-contact__muted">—</span>'
                }
              </td>
              <td>
                <span class="tour-contact__muted tour-contact__hint">Liên hệ qua người đặt</span>
              </td>
            </tr>
          `;
        })
        .join("");

      return bookerRow + travelerRows;
    })
    .join("");

  return `
    <header class="tour-contact__header">
      <div>
        <h3 class="tour-contact__title">Liên hệ khách</h3>
        <p class="tour-contact__subtitle">${escapeHtml(tour.title || "")} · ${escapeHtml(dateRange)}</p>
      </div>
      <button type="button" class="tour-contact__close" data-close-contact aria-label="Đóng">&times;</button>
    </header>

    <div class="tour-contact__stats">
      <article class="tour-contact__stat">
        <span>Tổng booking</span><strong>${bookings.length}</strong>
      </article>
      <article class="tour-contact__stat">
        <span>Tổng khách</span><strong>${data.total_customers || 0}</strong>
      </article>
    </div>

    <div class="tour-contact__scroll">
      <table class="tour-contact__table">
        <thead>
          <tr>
            <th>STT</th>
            <th>Khách hàng</th>
            <th>Số điện thoại</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

function closeContactPanel() {
  activeContactTourId = null;
  const workspace = document.getElementById("tourWorkspace");
  const panel = document.getElementById("tourContactPanel");
  if (workspace && activeProgressTourId == null) {
    workspace.classList.remove("has-progress");
  }
  if (panel) {
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = "";
  }
  document
    .querySelectorAll(".btn-contact.is-active")
    .forEach((btn) => btn.classList.remove("is-active"));
  document
    .querySelectorAll(".tour-card--contact-active")
    .forEach((card) => card.classList.remove("tour-card--contact-active"));
}

async function openContactPanel(tourId) {
  const workspace = document.getElementById("tourWorkspace");
  const panel = document.getElementById("tourContactPanel");
  if (!panel) return;

  if (activeContactTourId === Number(tourId)) {
    closeContactPanel();
    return;
  }

  // Đóng panel tiến độ nếu đang mở để tránh chồng nhau
  if (activeProgressTourId != null) {
    closeProgressPanel();
  }

  activeContactTourId = Number(tourId);
  if (workspace) workspace.classList.add("has-progress");
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  panel.innerHTML = '<div class="tour-contact__loading">Đang tải danh sách khách hàng...</div>';

  document.querySelectorAll(".btn-contact").forEach((btn) => {
    btn.classList.toggle(
      "is-active",
      Number(btn.getAttribute("data-id")) === Number(tourId) &&
        btn.getAttribute("data-action") === "contact",
    );
  });
  document.querySelectorAll(".tour-card").forEach((card) => {
    card.classList.toggle(
      "tour-card--contact-active",
      Number(card.getAttribute("data-tour-id")) === Number(tourId),
    );
  });

  try {
    const data = await fetchTourCustomers(tourId);
    panel.innerHTML = renderContactPanelContent(data);
  } catch (err) {
    panel.innerHTML = `
      <header class="tour-contact__header">
        <div><h3 class="tour-contact__title">Liên hệ khách</h3></div>
        <button type="button" class="tour-contact__close" data-close-contact aria-label="Đóng">&times;</button>
      </header>
      <p class="tour-contact__empty tour-contact__empty--error">${escapeHtml(err.message || "Có lỗi xảy ra")}</p>
    `;
  }
}

function ensureAbsenceConsentModal() {
  let modal = document.getElementById("absenceConsentModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "absenceConsentModal";
  modal.className = "absence-modal absence-modal--consent";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="absence-modal__backdrop" data-close-consent></div>
    <div class="absence-modal__dialog" role="dialog" aria-modal="true">
      <h2 class="absence-modal__title">Báo bận khẩn cấp</h2>
      <p class="absence-consent__text">
        Nhà cung cấp sẽ hỗ trợ bạn tìm kiếm người thay thế. Nếu không có hướng dẫn viên phù hợp thì bạn phải chịu mức đền bù <strong>2%</strong> trên tổng giá trị tour.
        Bạn vui lòng đợi phản hồi từ phía Nhà Cung Cấp.
      </p>
      <div class="absence-modal__actions">
        <button type="button" class="absence-modal__btn absence-modal__btn--ghost" data-close-consent>Thoát</button>
        <button type="button" class="absence-modal__btn absence-modal__btn--primary" data-role="consent-agree">Đồng ý</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function closeAbsenceConsentModal() {
  const modal = document.getElementById("absenceConsentModal");
  if (!modal) return;
  modal.classList.remove("is-visible");
  window.setTimeout(() => {
    if (!modal.classList.contains("is-visible")) modal.hidden = true;
  }, 180);
}

function openAbsenceConsentModal(tourId, tourName) {
  const modal = ensureAbsenceConsentModal();
  modal.dataset.tourId = String(tourId);
  modal.dataset.tourName = tourName || "";
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("is-visible"));
}

function ensureAbsenceModal() {
  let modal = document.getElementById("absenceRequestModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "absenceRequestModal";
  modal.className = "absence-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="absence-modal__backdrop" data-close-absence></div>
    <div class="absence-modal__dialog" role="dialog" aria-modal="true">
      <button type="button" class="absence-modal__close" data-close-absence aria-label="Đóng">&times;</button>
      <h2 class="absence-modal__title">Báo bận khẩn cấp</h2>
      <p class="absence-modal__tour" data-role="tour"></p>
      <p class="absence-modal__hint">
        Yêu cầu sẽ gửi trực tiếp tới nhà cung cấp để bố trí HDV thay thế. Vui lòng mô tả lý do trung thực.
      </p>
      <form data-role="form" class="absence-modal__form" enctype="multipart/form-data">
        <label class="absence-modal__field">
          <span>Lý do (bắt buộc, ≥ 10 ký tự)</span>
          <textarea
            data-role="reason"
            rows="4"
            required
            placeholder="VD: Tôi bị sốt cao 39°C, cần nghỉ ngơi điều trị..."
          ></textarea>
        </label>
        <div class="absence-modal__field">
          <span>Ảnh xác minh (tuỳ chọn — JPG/PNG/PDF ≤ 8MB)</span>
          <label class="absence-upload" data-role="upload-label">
            <input
              type="file"
              data-role="evidence-file"
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
              hidden
            />
            <span class="absence-upload__placeholder" data-role="upload-placeholder">
              <i class="absence-upload__icon">📎</i>
              Bấm để chọn ảnh hoặc kéo thả vào đây
            </span>
            <div class="absence-upload__preview" data-role="upload-preview" hidden></div>
          </label>
          <button
            type="button"
            class="absence-upload__remove"
            data-role="remove-evidence"
            hidden
          >
            Xoá ảnh
          </button>
        </div>
        <p class="absence-modal__error" data-role="error" hidden></p>
        <div class="absence-modal__actions">
          <button type="button" class="absence-modal__btn absence-modal__btn--ghost" data-close-absence>Huỷ</button>
          <button type="submit" class="absence-modal__btn absence-modal__btn--primary" data-role="submit">
            Gửi yêu cầu
          </button>
        </div>
      </form>
    </div>
  `;

  const fileInput = modal.querySelector("[data-role='evidence-file']");
  const preview = modal.querySelector("[data-role='upload-preview']");
  const placeholder = modal.querySelector("[data-role='upload-placeholder']");
  const removeBtn = modal.querySelector("[data-role='remove-evidence']");

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      preview.hidden = true;
      placeholder.hidden = false;
      removeBtn.hidden = true;
      preview.innerHTML = "";
      return;
    }
    placeholder.hidden = true;
    preview.hidden = false;
    removeBtn.hidden = false;
    preview.innerHTML = "";
    if (file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.alt = file.name;
      img.className = "absence-upload__img";
      preview.appendChild(img);
    } else {
      const span = document.createElement("span");
      span.className = "absence-upload__file";
      span.textContent = `📄 ${file.name}`;
      preview.appendChild(span);
    }
  });

  removeBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileInput.value = "";
    fileInput.dispatchEvent(new Event("change"));
  });
  document.body.appendChild(modal);

  modal.querySelector("[data-role='form']").addEventListener("submit", handleAbsenceFormSubmit);

  return modal;
}

function closeAbsenceModal() {
  const modal = document.getElementById("absenceRequestModal");
  if (!modal) return;
  modal.classList.remove("is-visible");
  window.setTimeout(() => {
    if (!modal.classList.contains("is-visible")) modal.hidden = true;
  }, 180);
}

function openAbsenceRequestModal(tourId, tourName) {
  const modal = ensureAbsenceModal();
  modal.dataset.tourId = String(tourId);
  modal.querySelector("[data-role='tour']").textContent = `Tour: ${tourName || "Tour"}`;
  modal.querySelector("[data-role='reason']").value = "";
  const fileInput = modal.querySelector("[data-role='evidence-file']");
  if (fileInput) {
    fileInput.value = "";
    fileInput.dispatchEvent(new Event("change"));
  }
  const errBox = modal.querySelector("[data-role='error']");
  errBox.hidden = true;
  errBox.textContent = "";
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("is-visible"));
}

async function handleAbsenceFormSubmit(event) {
  event.preventDefault();
  const modal = document.getElementById("absenceRequestModal");
  if (!modal) return;

  const tourId = modal.dataset.tourId;
  const reason = modal.querySelector("[data-role='reason']").value.trim();
  const fileInput = modal.querySelector("[data-role='evidence-file']");
  const file = fileInput?.files?.[0] || null;
  const errBox = modal.querySelector("[data-role='error']");
  const submitBtn = modal.querySelector("[data-role='submit']");

  errBox.hidden = true;
  errBox.textContent = "";

  if (reason.length < 10) {
    errBox.textContent = "Lý do cần ít nhất 10 ký tự.";
    errBox.hidden = false;
    return;
  }

  if (file && file.size > 8 * 1024 * 1024) {
    errBox.textContent = "File quá lớn (giới hạn 8MB).";
    errBox.hidden = false;
    return;
  }

  submitBtn.disabled = true;
  const originalText = submitBtn.textContent;
  submitBtn.textContent = "Đang gửi...";

  try {
    const formData = new FormData();
    formData.append("tour_id", String(tourId));
    formData.append("reason", reason);
    if (file) formData.append("evidence", file);

    // Không tự đặt Content-Type — trình duyệt sẽ thêm boundary multipart.
    const token =
      localStorage.getItem("accessToken") ||
      localStorage.getItem("token") ||
      "";
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch("/api/guide/absences", {
      method: "POST",
      headers,
      body: formData,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Không gửi được yêu cầu");
    }
    alert(result.message || "Đã gửi yêu cầu báo bận tới nhà cung cấp.");
    closeAbsenceModal();
    const keyword = document.getElementById("tourSearchInput")?.value || "";
    renderTours(keyword);
  } catch (err) {
    errBox.textContent = err.message || "Có lỗi xảy ra";
    errBox.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + "đ";
}

function safeParseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeImageUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return TD_FALLBACK_IMAGE;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return raw;
  return `/${raw.replace(/^\/+/, "")}`;
}

function getGalleryImages(tour) {
  const gallery = [];
  if (tour.thumbnail_url) gallery.push(normalizeImageUrl(tour.thumbnail_url));
  if (Array.isArray(tour.images)) {
    tour.images.forEach((item) => {
      const imageUrl = item?.image_url || item;
      if (imageUrl) gallery.push(normalizeImageUrl(imageUrl));
    });
  }
  return [...new Set(gallery.filter(Boolean))];
}

function getDurationText(days, durationText) {
  if (hasText(durationText)) return durationText;
  const totalDays = Number(days || 1);
  if (totalDays <= 1) return "1 ngày";
  return `${totalDays} ngày ${Math.max(totalDays - 1, 0)} đêm`;
}

function getAppliedPrice(tour) {
  const basePrice = Number(tour?.base_price || 0);
  const salePrice = Number(tour?.sale_price || 0);
  if (salePrice > 0 && salePrice < basePrice) return salePrice;
  return basePrice;
}

function getTaxPercent(tour) {
  const p = Number(tour?.tax_percent);
  return Number.isFinite(p) && p > 0 ? p : 0;
}

function getTaxAmount(tour) {
  const taxPercent = getTaxPercent(tour);
  if (taxPercent <= 0) return 0;
  const applied = getAppliedPrice(tour);
  const taxValue = Number(tour?.tax || 0);
  if (taxValue > 0) return taxValue;
  return Math.round(applied * (taxPercent / 100));
}

function getFinalPrice(tour) {
  const finalPrice = Number(tour?.final_price || 0);
  if (finalPrice > 0) return finalPrice;
  return getAppliedPrice(tour) + getTaxAmount(tour);
}

async function fetchTourDetailPublic(tourId) {
  const response = await fetch(`/api/provider/public/tours/${encodeURIComponent(tourId)}`);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "Không thể tải chi tiết tour");
  }
  return result.data;
}

function renderItineraryHtml(itinerary) {
  if (!Array.isArray(itinerary) || !itinerary.length) {
    return '<p class="td-detail-section">Chưa có lịch trình chi tiết.</p>';
  }

  return itinerary
    .map((day, idx) => {
      const dayNum =
        day.day != null && String(day.day).trim() !== ""
          ? String(day.day)
          : String(idx + 1);
      const title = escapeHtml(day.title || "Chưa có tiêu đề");
      const desc = formatMultiline(
        (day.description || "").trim() || "Chưa có mô tả cho ngày này.",
      );
      return `
        <article class="td-itinerary-day">
          <h4>Ngày ${escapeHtml(dayNum)} — ${title}</h4>
          <p>${desc}</p>
        </article>
      `;
    })
    .join("");
}

function renderListSection(title, items, emptyText) {
  const list = Array.isArray(items) && items.length
    ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>${escapeHtml(emptyText)}</li>`;
  return `
    <section class="td-detail-section">
      <h3>${escapeHtml(title)}</h3>
      <ul>${list}</ul>
    </section>
  `;
}

function renderTextSection(title, text) {
  if (!hasText(text)) return "";
  return `
    <section class="td-detail-section">
      <h3>${escapeHtml(title)}</h3>
      <p>${formatMultiline(text)}</p>
    </section>
  `;
}

function bindModalGallery(mainImageEl, thumbs) {
  if (!mainImageEl || !thumbs.length) return;

  thumbs.forEach((thumb) => {
    thumb.addEventListener("click", () => {
      const url = thumb.getAttribute("data-src") || TD_FALLBACK_IMAGE;
      mainImageEl.src = url;
      thumbs.forEach((t) => t.classList.remove("is-active"));
      thumb.classList.add("is-active");
    });
  });
}

function renderTourDetailModal(tour) {
  const title = tour.title || "Chưa có tên tour";
  const location = tour.location || "Chưa cập nhật";
  const provider = tour.provider_name || "Nhà cung cấp";
  const description =
    tour.description || tour.short_description || "Chưa có mô tả";
  const duration = getDurationText(tour.duration_days, tour.duration_text);
  const capacity = `${Number(tour.max_capacity || 0)} khách`;
  const finalPrice = formatCurrency(getFinalPrice(tour));
  const images = getGalleryImages(tour);
  const mainImage = images[0] || TD_FALLBACK_IMAGE;
  const includes = safeParseJsonArray(tour.includes);
  const excludes = safeParseJsonArray(tour.excludes);
  const itinerary = safeParseJsonArray(tour.itinerary);

  const thumbsHtml =
    images.length > 1
      ? images
          .map(
            (url, index) =>
              `<img src="${escapeHtml(url)}" data-src="${escapeHtml(url)}" alt="Ảnh ${index + 1}" class="${index === 0 ? "is-active" : ""}" />`,
          )
          .join("")
      : "";

  const dateRange =
    tour.start_date || tour.end_date
      ? `${formatDateVN(tour.start_date)} – ${formatDateVN(tour.end_date)}`
      : "";

  return `
    <div class="td-detail-hero">
      <img id="tdDetailMainImage" src="${escapeHtml(mainImage)}" alt="${escapeHtml(title)}" />
      ${thumbsHtml ? `<div class="td-detail-thumbs">${thumbsHtml}</div>` : ""}
    </div>

    <div class="td-detail-meta">
      <span>📍 <strong>${escapeHtml(location)}</strong></span>
      <span>🏢 ${escapeHtml(provider)}</span>
      ${dateRange ? `<span>📅 ${escapeHtml(dateRange)}</span>` : ""}
    </div>

    <p class="td-detail-desc">${formatMultiline(description)}</p>

    <div class="td-detail-stats">
      <article class="td-detail-stat">
        <span>Thời gian</span>
        <strong>${escapeHtml(duration)}</strong>
      </article>
      <article class="td-detail-stat">
        <span>Số khách tối đa</span>
        <strong>${escapeHtml(capacity)}</strong>
      </article>
      <article class="td-detail-stat">
        <span>Giá tour</span>
        <strong>${escapeHtml(finalPrice)}</strong>
      </article>
    </div>

    ${renderTextSection("Điểm tập trung", tour.meeting_point || tour.location)}
    ${renderListSection("Dịch vụ bao gồm", includes, "Chưa có thông tin")}
    ${renderListSection("Không bao gồm", excludes, "Chưa có thông tin")}
    ${renderTextSection("Khách sạn", tour.hotel_info)}
    ${renderTextSection("Phương tiện di chuyển", tour.transport_info)}
    <section class="td-detail-section">
      <h3>Lịch trình chi tiết</h3>
      ${renderItineraryHtml(itinerary)}
    </section>
    ${renderTextSection("Chính sách hủy", tour.cancel_policy)}
    ${renderTextSection("Điều khoản", tour.terms_conditions)}
    ${renderTextSection("Ghi chú khác", tour.other_notes)}
  `;
}

function getTourDetailModalEls() {
  return {
    modal: document.getElementById("tourDetailModal"),
    title: document.getElementById("tdModalTitle"),
    body: document.getElementById("tdModalBody"),
    openPage: document.getElementById("tdModalOpenPage"),
  };
}

function openTourDetailModal() {
  const { modal } = getTourDetailModalEls();
  if (!modal) return;
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.documentElement.classList.add("td-modal-open");
  document.body.classList.add("td-modal-open");
  document.body.style.overflow = "hidden";
}

function closeTourDetailModal() {
  const { modal } = getTourDetailModalEls();
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.documentElement.classList.remove("td-modal-open");
  document.body.classList.remove("td-modal-open");
  document.body.style.overflow = "";
}

async function showTourDetailModal(tourId) {
  const { title, body, openPage } = getTourDetailModalEls();
  if (!body) return;

  openTourDetailModal();
  if (title) title.textContent = "Đang tải...";
  body.innerHTML = '<div class="td-modal__loading">Đang tải thông tin tour...</div>';
  if (openPage) openPage.hidden = true;

  try {
    const tour = await fetchTourDetailPublic(tourId);
    if (title) title.textContent = tour.title || "Chi tiết tour";
    body.innerHTML =
      '<div class="td-modal__scroll">' + renderTourDetailModal(tour) + "</div>";

    if (openPage) {
      openPage.href = `../../tours/chitiet.html?id=${encodeURIComponent(tourId)}`;
      openPage.hidden = false;
    }

    const scrollEl = body.querySelector(".td-modal__scroll");
    const mainImageEl = scrollEl?.querySelector("#tdDetailMainImage");
    const thumbs = scrollEl?.querySelectorAll(".td-detail-thumbs img") || [];
    if (mainImageEl) {
      mainImageEl.onerror = function onImgError() {
        this.onerror = null;
        this.src = TD_FALLBACK_IMAGE;
      };
    }
    bindModalGallery(mainImageEl, [...thumbs]);
  } catch (error) {
    console.error(error);
    if (title) title.textContent = "Không tải được tour";
    body.innerHTML = `<p class="td-modal__error">${escapeHtml(error.message || "Có lỗi xảy ra")}</p>`;
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Chuẩn hóa ngày từ API (ISO UTC hoặc YYYY-MM-DD) → YYYY-MM-DD theo giờ local. */
function normalizeDateKey(value) {
  if (value == null || value === "") return "";
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso && text.length === 10) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(d.getTime())) return toDateKey(d);

  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return "";
}

function parseDateOnly(value) {
  const key = normalizeDateKey(value);
  if (!key) return null;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function parseItineraryToDays(itinerary) {
  const days = safeParseJsonArray(itinerary);
  return days.map((day, dayIdx) => {
    const dayNum =
      day.day != null && String(day.day).trim() !== ""
        ? Number(day.day)
        : dayIdx + 1;
    const title = String(day.title || "").trim();
    const raw = String(day.description || "").trim();
    const lines = raw
      ? raw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
      : [];

    const activities = lines.map((line, slotIdx) => {
      const match = line.match(/^(\d{1,2}:\d{2})\s*[-–—]\s*(.+)$/);
      return {
        id: `d${dayNum}-s${slotIdx}`,
        time: match ? match[1] : "",
        text: match ? match[2].trim() : line,
      };
    });

    if (!activities.length && raw) {
      activities.push({ id: `d${dayNum}-s0`, time: "", text: raw });
    }

    return { dayNum, title, activities };
  });
}

function getDayStatus(tourStartDate, dayNum) {
  const start = parseDateOnly(tourStartDate);
  if (!start) return "upcoming";

  const dayDate = new Date(start);
  dayDate.setDate(dayDate.getDate() + Number(dayNum) - 1);
  dayDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dayDate < today) return "done";
  if (dayDate.getTime() === today.getTime()) return "current";
  return "upcoming";
}

function dayStatusLabel(status) {
  if (status === "done") return "Đã xong";
  if (status === "current") return "Đang diễn ra";
  return "Sắp diễn ra";
}

function loadTourProgressFromStorage(tourId) {
  try {
    const all = JSON.parse(localStorage.getItem(TOUR_PROGRESS_STORAGE_KEY) || "{}");
    const list = all[String(tourId)];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function saveTourProgressToStorage(tourId, completedSet) {
  try {
    const all = JSON.parse(localStorage.getItem(TOUR_PROGRESS_STORAGE_KEY) || "{}");
    all[String(tourId)] = [...completedSet];
    localStorage.setItem(TOUR_PROGRESS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

async function saveTourProgressToServer(tourId, completedSet) {
  const list = [...completedSet];
  const response = await fetch(
    `/api/guide/tours/${encodeURIComponent(tourId)}/progress`,
    {
      method: "PUT",
      headers: guideAuthHeaders(),
      body: JSON.stringify({ completedActivityIds: list }),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      result.message || `Không lưu được tiến độ lên hệ thống (${response.status})`,
    );
  }
  return result;
}

async function fetchTourProgressFromServer(tourId) {
  try {
    const response = await fetch(
      `/api/guide/tours/${encodeURIComponent(tourId)}/progress`,
      { method: "GET", headers: guideAuthHeaders() },
    );
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.data) {
      const ids = Array.isArray(result.data.completed_activity_ids)
        ? result.data.completed_activity_ids
        : [];
      return {
        completedSet: new Set(ids),
        guideCompletedAt: result.data.guide_completed_at || null,
      };
    }
  } catch (error) {
    console.warn("fetchTourProgressFromServer:", error);
  }
  return { completedSet: new Set(), guideCompletedAt: null };
}

async function loadTourProgress(tourId) {
  const fromStorage = loadTourProgressFromStorage(tourId);
  const fromApi = await fetchTourProgressFromServer(tourId);
  const merged = new Set([...fromApi.completedSet, ...fromStorage]);

  if (!fromApi.guideCompletedAt && merged.size > fromApi.completedSet.size) {
    try {
      await saveTourProgressToServer(tourId, merged);
    } catch (error) {
      console.warn("Đồng bộ tiến độ local → server:", error);
    }
  }

  saveTourProgressToStorage(tourId, merged);
  progressCompletedByTour.set(Number(tourId), merged);
  return { completedSet: merged, guideCompletedAt: fromApi.guideCompletedAt };
}

function isProgressFullyDone(days, completedSet) {
  const total = countTotalActivities(days);
  if (total === 0) return false;
  const done = [...completedSet].filter((id) =>
    days.some((d) => d.activities.some((a) => a.id === id)),
  ).length;
  return done >= total;
}

function renderCompleteTourFooter(
  tourId,
  days,
  completedSet,
  guideCompletedAt,
  canEditProgress = true,
) {
  if (guideCompletedAt) {
    return `
    <div class="tour-progress__footer">
      <p class="tour-progress__completed-msg">
        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
        Tour đã hoàn thành · Nhà cung cấp đã được thông báo
      </p>
    </div>`;
  }

  if (!canEditProgress) {
    return `
    <div class="tour-progress__footer" data-complete-footer>
      <button type="button" class="btn-complete-tour" data-complete-tour data-tour-id="${tourId}" disabled>
        Hoàn thành tour
      </button>
      <p class="tour-progress__footer-hint">Chưa thể kết thúc tour khi chưa đủ điều kiện khởi hành.</p>
    </div>`;
  }

  if (!isProgressFullyDone(days, completedSet)) {
    return `
    <div class="tour-progress__footer" data-complete-footer>
      <button type="button" class="btn-complete-tour" data-complete-tour data-tour-id="${tourId}" disabled>
        Hoàn thành tour
      </button>
      <p class="tour-progress__footer-hint">Hoàn thành tất cả hoạt động để kết thúc tour.</p>
    </div>`;
  }

  return `
    <div class="tour-progress__footer" data-complete-footer>
      <button type="button" class="btn-complete-tour" data-complete-tour data-tour-id="${tourId}">
        Hoàn thành tour
      </button>
      <p class="tour-progress__footer-hint">Xác nhận kết thúc tour và gửi thông báo cho nhà cung cấp.</p>
    </div>`;
}

function getProgressSetForTour(tourId) {
  const id = Number(tourId);
  if (progressCompletedByTour.has(id)) {
    return new Set(progressCompletedByTour.get(id));
  }
  return loadTourProgressFromStorage(tourId);
}

async function saveTourProgress(tourId, completedSet) {
  const snapshot = new Set(completedSet);
  progressCompletedByTour.set(Number(tourId), snapshot);
  saveTourProgressToStorage(tourId, snapshot);

  const key = String(tourId);
  const prev = progressSaveQueues.get(key) || Promise.resolve();
  const task = prev
    .then(() => saveTourProgressToServer(tourId, snapshot))
    .catch((error) => {
      console.error("saveTourProgress:", error);
      alert(
        error.message ||
          "Không lưu được tiến độ lên hệ thống. Nhà cung cấp sẽ chưa thấy cập nhật. Vui lòng thử lại.",
      );
      throw error;
    });
  progressSaveQueues.set(
    key,
    task.catch(() => {}),
  );
  return task;
}

function countTotalActivities(days) {
  return days.reduce((sum, d) => sum + d.activities.length, 0);
}

function getFlatActivities(days) {
  const flat = [];
  for (const day of days || []) {
    for (const act of day.activities || []) {
      flat.push({ id: String(act.id), dayNum: day.dayNum });
    }
  }
  return flat;
}

function getNextSequentialIndex(flat, completedSet) {
  for (let i = 0; i < flat.length; i++) {
    if (!completedSet.has(flat[i].id)) return i;
  }
  return flat.length;
}

/**
 * Tính cờ allow check cho từng activity theo ràng buộc tuần tự:
 * - Chỉ activity ở vị trí kế tiếp chưa hoàn thành (nextIdx) được phép tick.
 * - Chỉ activity hoàn thành cuối cùng (nextIdx - 1) được phép bỏ tick.
 */
function isActivityToggleAllowed(globalIdx, isChecked, nextIdx) {
  if (globalIdx === nextIdx) return true;
  if (globalIdx === nextIdx - 1 && isChecked) return true;
  return false;
}

function getCurrentDayLabel(days, tourStartDate) {
  const current = days.find((d) => getDayStatus(tourStartDate, d.dayNum) === "current");
  if (current) return `Ngày ${current.dayNum}`;
  const upcoming = days.find((d) => getDayStatus(tourStartDate, d.dayNum) === "upcoming");
  if (upcoming) return `Ngày ${upcoming.dayNum}`;
  if (days.length) return `Ngày ${days[days.length - 1].dayNum}`;
  return "—";
}

function renderProgressPanelContent(
  tour,
  days,
  completedSet,
  guideCompletedAt = null,
  canEditProgress = true,
  departBlockMessage = "",
) {
  const total = countTotalActivities(days);
  const done = [...completedSet].filter((id) =>
    days.some((d) => d.activities.some((a) => a.id === id)),
  ).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const dateRange = `${formatDateVN(tour.startDate)} – ${formatDateVN(tour.endDate)}`;
  const tourCompleted = Boolean(guideCompletedAt);
  const departWarn =
    !canEditProgress && departBlockMessage
      ? `<p class="tour-progress__depart-warn" role="status">${escapeHtml(departBlockMessage)}</p>`
      : "";

  const flat = getFlatActivities(days);
  const nextIdx = getNextSequentialIndex(flat, completedSet);

  const daysHtml = days.length
    ? days
        .map((day) => {
          const status = getDayStatus(tour.startDate, day.dayNum);
          const badgeClass =
            status === "current"
              ? "is-current"
              : status === "done"
                ? "is-done"
                : "";
          const headTitle = day.title
            ? `Ngày ${day.dayNum} — ${escapeHtml(day.title)}`
            : `Ngày ${day.dayNum}`;

          const activitiesHtml = day.activities.length
            ? day.activities
                .map((act) => {
                  const checked = completedSet.has(act.id);
                  const globalIdx = flat.findIndex(
                    (x) => x.id === String(act.id),
                  );
                  const toggleAllowed = isActivityToggleAllowed(
                    globalIdx,
                    checked,
                    nextIdx,
                  );
                  const isDisabled =
                    tourCompleted || !canEditProgress || !toggleAllowed;
                  const lockedClass =
                    !tourCompleted && (!canEditProgress || !toggleAllowed)
                      ? " is-locked"
                      : "";
                  return `
              <label class="tour-progress__activity${checked ? " is-done" : ""}${lockedClass}">
                <input
                  type="checkbox"
                  data-progress-check
                  data-tour-id="${tour.id}"
                  data-activity-id="${escapeHtml(act.id)}"
                  ${checked ? "checked" : ""}${isDisabled ? " disabled" : ""}
                />
                <div class="tour-progress__activity-body">
                  ${act.time ? `<div class="tour-progress__activity-time">${escapeHtml(act.time)}</div>` : ""}
                  <p class="tour-progress__activity-text">${escapeHtml(act.text)}</p>
                </div>
              </label>
            `;
                })
                .join("")
            : `<p class="tour-progress__empty" style="padding:12px 0">Chưa có hoạt động trong ngày này.</p>`;

          return `
          <section class="tour-progress__day">
            <div class="tour-progress__day-head">
              <h4 class="tour-progress__day-title">${headTitle}</h4>
              <span class="tour-progress__day-badge ${badgeClass}">${dayStatusLabel(status)}</span>
            </div>
            ${activitiesHtml}
          </section>
        `;
        })
        .join("")
    : `<p class="tour-progress__empty">Tour chưa có lịch trình chi tiết. Vui lòng liên hệ nhà cung cấp.</p>`;

  return `
    <header class="tour-progress__header">
      <div>
        <h3>Cập nhật tiến độ tour</h3>
        <p class="tour-progress__subtitle">${escapeHtml(tour.name)} · ${escapeHtml(dateRange)}</p>
      </div>
      <button type="button" class="tour-progress__close" data-close-progress aria-label="Đóng">&times;</button>
    </header>
    ${departWarn}
    <div class="tour-progress__stats">
      <article class="tour-progress__stat">
        <span>Đã hoàn thành</span>
        <strong>${done} / ${total}</strong>
      </article>
      <article class="tour-progress__stat">
        <span>Ngày hiện tại</span>
        <strong>${escapeHtml(getCurrentDayLabel(days, tour.startDate))}</strong>
      </article>
      <article class="tour-progress__stat">
        <span>Tiến độ tổng</span>
        <strong>${percent}%</strong>
      </article>
    </div>
    <div class="tour-progress__scroll">${daysHtml}</div>
    ${renderCompleteTourFooter(tour.id, days, completedSet, guideCompletedAt, canEditProgress)}
  `;
}

function refreshProgressGating(panel, days, completedSet, tourCompleted, canEditProgress = true) {
  if (!panel) return;
  const flat = getFlatActivities(days);
  const nextIdx = getNextSequentialIndex(flat, completedSet);

  flat.forEach((entry, idx) => {
    const escapedId = (window.CSS && CSS.escape ? CSS.escape(entry.id) : entry.id)
      .replace(/"/g, '\\"');
    const cb = panel.querySelector(
      `input[data-progress-check][data-activity-id="${escapedId}"]`,
    );
    if (!cb) return;

    const checked = completedSet.has(entry.id);
    const allowed = isActivityToggleAllowed(idx, checked, nextIdx);
    cb.disabled = tourCompleted || !canEditProgress || !allowed;
    const row = cb.closest(".tour-progress__activity");
    if (row) {
      row.classList.toggle("is-done", checked);
      row.classList.toggle(
        "is-locked",
        !tourCompleted && (!canEditProgress || !allowed),
      );
    }
  });
}

function syncProgressPanelStats(days, completedSet, guideCompletedAt = null) {
  const panel = document.getElementById("tourProgressPanel");
  if (!panel || panel.hidden) return;

  const total = countTotalActivities(days);
  const done = [...completedSet].filter((id) =>
    days.some((d) => d.activities.some((a) => a.id === id)),
  ).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const tourStart = progressPanelCache?.tourView?.startDate ?? null;
  const tourId = progressPanelCache?.tourView?.id;

  const stats = panel.querySelectorAll(".tour-progress__stat strong");
  if (stats[0]) stats[0].textContent = `${done} / ${total}`;
  if (stats[1]) stats[1].textContent = getCurrentDayLabel(days, tourStart);
  if (stats[2]) stats[2].textContent = `${percent}%`;

  const canEditProgress = progressPanelCache?.canEditProgress !== false;
  refreshProgressGating(
    panel,
    days,
    completedSet,
    Boolean(guideCompletedAt),
    canEditProgress,
  );

  if (guideCompletedAt != null && tourId != null) {
    const footer = panel.querySelector("[data-complete-footer]");
    if (footer) {
      footer.outerHTML = renderCompleteTourFooter(
        tourId,
        days,
        completedSet,
        guideCompletedAt,
        canEditProgress,
      );
    }
  } else if (tourId != null) {
    const footer = panel.querySelector("[data-complete-footer]");
    const fullyDone = isProgressFullyDone(days, completedSet);
    const btn = footer?.querySelector("[data-complete-tour]");
    if (btn) btn.disabled = !canEditProgress || !fullyDone;
  }
}

function closeProgressPanel() {
  activeProgressTourId = null;
  progressPanelCache = null;
  const workspace = document.getElementById("tourWorkspace");
  const panel = document.getElementById("tourProgressPanel");
  if (workspace && activeContactTourId == null) {
    workspace.classList.remove("has-progress");
  }
  if (panel) {
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = "";
  }
  document
    .querySelectorAll(".btn-progress.is-active")
    .forEach((btn) => btn.classList.remove("is-active"));
  document
    .querySelectorAll(".tour-card--progress-active")
    .forEach((card) => card.classList.remove("tour-card--progress-active"));
}

function tourCanOperate(tour) {
  if (!tour) return false;
  if (tour.canOperate === false) return false;
  const dep = tour.departureEligibility;
  if (dep && dep.can_depart === false) return false;
  return true;
}

/** Trùng backend: chỉ chặn sửa tiến độ khi đang trong khung ngày tour mà chưa đủ điều kiện khởi hành. */
function isTourInOperationalWindow(tour) {
  const todayYmd = normalizeDateKey(new Date());
  const start = normalizeDateKey(tour?.startDate);
  const end = normalizeDateKey(tour?.endDate || tour?.startDate);
  if (!start || !todayYmd) return false;
  return todayYmd >= start && todayYmd <= end;
}

function tourCanEditProgress(tour) {
  if (!tour) return false;
  if (!isTourInOperationalWindow(tour)) return true;
  return tourCanOperate(tour);
}

function tourDepartureBlockMessage(tour) {
  return (
    tour?.departureEligibility?.message ||
    "Tour chưa đủ điều kiện khởi hành (cần trên 50% sức chứa và có hướng dẫn viên)."
  );
}

async function openProgressPanel(tourId) {
  const tour = currentTours.find((t) => Number(t.id) === Number(tourId));
  const workspace = document.getElementById("tourWorkspace");
  const panel = document.getElementById("tourProgressPanel");
  if (!tour || !panel) return;

  if (activeProgressTourId === Number(tourId)) {
    closeProgressPanel();
    return;
  }

  if (activeContactTourId != null) {
    closeContactPanel();
  }

  activeProgressTourId = Number(tourId);
  if (workspace) workspace.classList.add("has-progress");
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  panel.innerHTML = '<div class="tour-progress__loading">Đang tải lịch trình tour...</div>';

  document.querySelectorAll(".btn-progress").forEach((btn) => {
    btn.classList.toggle(
      "is-active",
      Number(btn.getAttribute("data-id")) === Number(tourId),
    );
  });
  document.querySelectorAll(".tour-card").forEach((card) => {
    card.classList.toggle(
      "tour-card--progress-active",
      Number(card.getAttribute("data-tour-id")) === Number(tourId),
    );
  });

  try {
    const detail = await fetchTourDetailPublic(tourId);
    const days = parseItineraryToDays(detail.itinerary);
    const { completedSet, guideCompletedAt } = await loadTourProgress(tourId);
    const tourView = {
      id: tour.id,
      name: tour.name,
      startDate: tour.startDate || detail.start_date,
      endDate: tour.endDate || detail.end_date,
      departureEligibility: tour.departureEligibility,
      canOperate: tour.canOperate,
    };
    const canEditProgress = tourCanEditProgress(tour);
    progressPanelCache = { tourView, days, guideCompletedAt, canEditProgress };
    panel.innerHTML = renderProgressPanelContent(
      tourView,
      days,
      completedSet,
      guideCompletedAt,
      canEditProgress,
      canEditProgress ? "" : tourDepartureBlockMessage(tour),
    );
  } catch (error) {
    progressPanelCache = null;
    console.error(error);
    panel.innerHTML = `
      <header class="tour-progress__header">
        <div><h3>Cập nhật tiến độ tour</h3></div>
        <button type="button" class="tour-progress__close" data-close-progress>&times;</button>
      </header>
      <p class="tour-progress__empty">${escapeHtml(error.message || "Không tải được lịch trình")}</p>
    `;
  }
}

function refreshProgressPanelIfOpen() {
  if (!activeProgressTourId) return;
  openProgressPanel(activeProgressTourId);
}

async function completeGuideTour(tourId) {
  if (
    !(await showAppConfirm(
      "Xác nhận hoàn thành tour?\n\nNhà cung cấp sẽ nhận thông báo và các booking liên quan sẽ được cập nhật trạng thái hoàn thành.",
    ))
  ) {
    return;
  }

  try {
    const response = await fetch(
      `/api/guide/tours/${encodeURIComponent(tourId)}/complete`,
      { method: "POST", headers: guideAuthHeaders() },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || "Không hoàn thành được tour");
    }

    alert(result.message || "Đã hoàn thành tour thành công.");
    closeProgressPanel();
    currentTours = await fetchCurrentTours(
      document.getElementById("tourSearchInput")?.value?.trim() || "",
    );
    renderTours(document.getElementById("tourSearchInput")?.value || "");
  } catch (error) {
    console.error("completeGuideTour:", error);
    alert(error.message || "Không hoàn thành được tour");
  }
}

function renderTourCount(count) {
  const tourCountText = document.getElementById("tourCountText");
  if (!tourCountText) return;
  tourCountText.textContent = `Bạn đang có ${count} tour đang hoạt động`;
}

async function fetchCurrentTours(keyword = "") {
  const response = await fetch(
    `/api/guide/current-tours?keyword=${encodeURIComponent(keyword)}`,
    {
      method: "GET",
      headers: guideAuthHeaders()
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    assertGuideFetchOk(response, result, "Không thể tải danh sách tour");
  }

  return Array.isArray(result.data) ? result.data : [];
}

function renderTours(keyword = "") {
  const tourGrid = document.getElementById("tourGrid");
  if (!tourGrid) return;

  const normalizedKeyword = keyword.trim().toLowerCase();

  const filteredTours = currentTours.filter((tour) => {
    return (
      tour.name.toLowerCase().includes(normalizedKeyword) ||
      tour.location.toLowerCase().includes(normalizedKeyword) ||
      tour.duration.toLowerCase().includes(normalizedKeyword)
    );
  });

  renderTourCount(filteredTours.length);

  if (!filteredTours.length) {
    tourGrid.innerHTML = `
      <div class="empty-state">
        Không tìm thấy tour phù hợp.
      </div>
    `;
    return;
  }

  tourGrid.innerHTML = filteredTours
    .map(
      (tour) => {
        const focused =
          urlTourHighlightId != null && Number(tour.id) === urlTourHighlightId;
        const canOperate = tourCanOperate(tour);
        const booked = Number(tour.bookedParticipants || 0);
        const cap = Number(tour.customers || 0);
        const departHint = canOperate
          ? ""
          : `<p class="tour-depart-block">${escapeHtml(tourDepartureBlockMessage(tour))}</p>`;
        return `
        <div class="tour-card${focused ? " tour-card--focused" : ""}${activeProgressTourId === Number(tour.id) ? " tour-card--progress-active" : ""}" data-tour-id="${tour.id}">
          <div class="tour-card-top">
            <h4 class="tour-title">${tour.name}</h4>
            <span class="tour-status">${tour.statusText || "Đang hoạt động"}</span>
          </div>

          <div class="tour-info-list">
            <div class="tour-info-item">
              <span class="tour-info-icon">👥</span>
              <span><strong>${booked}/${cap}</strong> khách (đã đặt/tối đa)</span>
            </div>

            <div class="tour-info-item">
              <span class="tour-info-icon">📅</span>
              <span>${formatDateVN(tour.startDate)} - ${formatDateVN(tour.endDate)}</span>
            </div>

            <div class="tour-info-item">
              <span class="tour-info-icon">🕒</span>
              <span>${tour.duration}</span>
            </div>

            <div class="tour-info-item">
              <span class="tour-info-icon">📍</span>
              <span>${tour.location}</span>
            </div>
          </div>

          <div class="tour-actions">
            <button type="button" class="btn-detail" data-action="detail" data-id="${tour.id}">
              Xem chi tiết
            </button>
            <button type="button" class="btn-progress${activeProgressTourId === Number(tour.id) ? " is-active" : ""}" data-action="progress" data-id="${tour.id}">
              Cập nhật quá trình
            </button>
            <button type="button" class="btn-contact" data-action="contact" data-id="${tour.id}" data-tour-name="${String(tour.name).replace(/"/g, "&quot;")}">
              Liên hệ khách
            </button>
            <button type="button" class="btn-absence" data-action="report-absence" data-id="${tour.id}" data-tour-name="${String(tour.name).replace(/"/g, "&quot;")}">
              Báo bận khẩn cấp
            </button>
          </div>
          ${departHint}
          <p class="tour-note">
            <strong>Lưu ý:</strong> hướng dẫn viên vui lòng tích vào ô mốc giờ khi hoàn thành thành để cập nhật tiến độ toàn bộ tour
          </p>
        </div>
      `;
      }
    )
    .join("");

  if (activeProgressTourId != null) {
    document.querySelectorAll(".tour-card").forEach((card) => {
      card.classList.toggle(
        "tour-card--progress-active",
        Number(card.getAttribute("data-tour-id")) === activeProgressTourId,
      );
    });
  }

  if (urlTourHighlightId != null) {
    requestAnimationFrame(() => {
      const el = tourGrid.querySelector(".tour-card--focused");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}

function bindEvents() {
  const searchInput = document.getElementById("tourSearchInput");
  const logoutBtn = document.getElementById("logoutBtn");
  const searchBtn = document.getElementById("searchBtn");

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      renderTours(this.value);
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener("click", function () {
      const keyword = document.getElementById("tourSearchInput")?.value || "";
      renderTours(keyword);
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      window.location.href = "http://localhost:3000/login";
    });
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-close-consent]")) {
      closeAbsenceConsentModal();
      return;
    }

    const consentAgree = event.target.closest("[data-role='consent-agree']");
    if (consentAgree) {
      const consentModal = document.getElementById("absenceConsentModal");
      const tourId = consentModal?.dataset.tourId;
      const tourName = consentModal?.dataset.tourName || "";
      closeAbsenceConsentModal();
      if (tourId) openAbsenceRequestModal(tourId, tourName);
      return;
    }

    if (event.target.closest("[data-close-absence]")) {
      closeAbsenceModal();
      return;
    }

    if (event.target.closest("[data-close-modal]")) {
      closeTourDetailModal();
      return;
    }

    if (event.target.closest("[data-close-progress]")) {
      closeProgressPanel();
      const keyword = document.getElementById("tourSearchInput")?.value || "";
      renderTours(keyword);
      return;
    }

    if (event.target.closest("[data-close-contact]")) {
      closeContactPanel();
      return;
    }

    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-id");

    if (action === "detail" && id) {
      showTourDetailModal(id);
      return;
    }

    if (action === "progress" && id) {
      openProgressPanel(id).then(() => {
        const keyword = document.getElementById("tourSearchInput")?.value || "";
        renderTours(keyword);
      });
      return;
    }

    if (action === "contact" && id) {
      openContactPanel(id);
      return;
    }

    if (action === "report-absence" && id) {
      const tourName = target.getAttribute("data-tour-name") || "";
      openAbsenceConsentModal(id, tourName);
      return;
    }
  });

  document.addEventListener("click", function (event) {
    const completeBtn = event.target.closest("[data-complete-tour]");
    if (!completeBtn || completeBtn.disabled) return;
    const tourId = completeBtn.getAttribute("data-tour-id");
    if (tourId) void completeGuideTour(tourId);
  });

  document.addEventListener("change", async function (event) {
    const checkbox = event.target.closest("[data-progress-check]");
    if (!checkbox) return;

    const tourId = checkbox.getAttribute("data-tour-id");
    const activityId = checkbox.getAttribute("data-activity-id");
    if (!tourId || !activityId) return;

    const tour = currentTours.find((t) => Number(t.id) === Number(tourId));
    if (tour && !tourCanEditProgress(tour)) {
      checkbox.checked = !checkbox.checked;
      alert(tourDepartureBlockMessage(tour));
      return;
    }

    const wasChecked = checkbox.checked;
    const previousSet = getProgressSetForTour(tourId);

    if (
      progressPanelCache &&
      Number(tourId) === Number(activeProgressTourId)
    ) {
      const flat = getFlatActivities(progressPanelCache.days);
      const nextIdx = getNextSequentialIndex(flat, previousSet);
      const idx = flat.findIndex((x) => x.id === String(activityId));

      if (idx < 0) {
        checkbox.checked = !wasChecked;
        return;
      }

      if (wasChecked && idx !== nextIdx) {
        checkbox.checked = false;
        alert(
          "Vui lòng hoàn thành các mốc thời gian theo thứ tự từ trên xuống.",
        );
        return;
      }

      if (!wasChecked && idx !== nextIdx - 1) {
        checkbox.checked = true;
        alert(
          "Chỉ có thể bỏ chọn mốc hoàn thành gần nhất.",
        );
        return;
      }
    }

    let completedSet = previousSet;
    try {
      if (wasChecked) completedSet.add(String(activityId));
      else completedSet.delete(String(activityId));
      await saveTourProgress(tourId, completedSet);
    } catch {
      checkbox.checked = !wasChecked;
      return;
    }

    const row = checkbox.closest(".tour-progress__activity");
    if (row) row.classList.toggle("is-done", checkbox.checked);

    if (
      progressPanelCache &&
      Number(tourId) === Number(activeProgressTourId)
    ) {
      syncProgressPanelStats(
        progressPanelCache.days,
        completedSet,
        progressPanelCache.guideCompletedAt,
      );
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    const absenceModal = document.getElementById("absenceRequestModal");
    if (absenceModal && !absenceModal.hidden) {
      closeAbsenceModal();
      return;
    }
    if (activeContactTourId) {
      closeContactPanel();
      return;
    }
    if (activeProgressTourId) {
      closeProgressPanel();
      const keyword = document.getElementById("tourSearchInput")?.value || "";
      renderTours(keyword);
      return;
    }
    closeTourDetailModal();
  });
}

async function initPage() {
  try {
    const raw = new URLSearchParams(window.location.search).get("tourId");
    const n =
      raw != null && String(raw).trim() !== "" ? Number(raw) : NaN;
    urlTourHighlightId = Number.isNaN(n) ? null : n;

    currentTours = await fetchCurrentTours("");
    renderTours("");
    bindEvents();
  } catch (error) {
    console.error("Lỗi tải tour đang dẫn:", error);

    const tourGrid = document.getElementById("tourGrid");
    const tourCountText = document.getElementById("tourCountText");

    if (tourCountText) {
      tourCountText.textContent = "Không tải được dữ liệu tour";
    }

    if (tourGrid) {
      tourGrid.innerHTML = `
        <div class="empty-state">
          Không tải được danh sách tour đang dẫn.
        </div>
      `;
    }
  }
}

document.addEventListener("DOMContentLoaded", initPage);
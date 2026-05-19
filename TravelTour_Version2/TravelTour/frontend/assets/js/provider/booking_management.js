// booking_management.js

let allBookings = [];
let selectedCancelRequestId = null;
let currentFilter = "all";

const STATUS_LABEL = {
  pending:          "Chờ xử lý",
  pending_payment:  "Thanh toán đang chờ xử lý",
  confirmed:        "Đã xác nhận",
  cancel_requested: "Yêu cầu hủy",
  paid:             "Đã thanh toán",
  in_progress:      "Đang diễn ra",
  completed:        "Hoàn thành",
  cancelled:        "Đã hủy",
  refunded:         "Đã hoàn tiền",
};

const STATUS_BADGE = {
  pending:         "badge-warning",
  pending_payment: "badge-warning",
  confirmed:       "badge-success",
  cancel_requested: "badge-cancel-request",
  paid:            "badge-success",
  in_progress:     "badge-info",
  completed:       "badge-success",
  cancelled:       "badge-danger",
  refunded:        "badge-danger",
};

const PAYMENT_STATUS_LABEL = {
  pending: "Chờ thanh toán",
  success: "Đã thanh toán",
  paid: "Đã thanh toán",
  failed: "Thanh toán thất bại",
  cancelled: "Đã hủy thanh toán",
  refunded: "Đã hoàn tiền",
};

const PAYMENT_METHOD_LABEL = {
  cash: "Tiền mặt",
  cod: "Thanh toán trực tiếp",
  bank_transfer: "Chuyển khoản ngân hàng",
  transfer: "Chuyển khoản ngân hàng",
  momo: "Ví MoMo",
  zalopay: "ZaloPay",
  vnpay: "VNPay",
  card: "Thẻ ngân hàng",
  credit_card: "Thẻ tín dụng",
};

function formatCurrency(value) {
  return new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + " đ";
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const CARD_BADGE_CLASS = {
  pending: "badge--pending",
  pending_payment: "badge--pending",
  confirmed: "badge--confirmed",
  cancel_requested: "badge-cancel-request",
  paid: "badge--paid",
  in_progress: "badge--in-progress",
  completed: "badge--completed",
  cancelled: "badge--cancelled",
  refunded: "badge--cancelled",
};

function badgeHtml(status) {
  const cls = STATUS_BADGE[status] || "badge-warning";
  const text = STATUS_LABEL[status] || status || "—";
  return `<span class="badge ${cls}">${text}</span>`;
}

function cardBadgeHtml(status) {
  const cls = CARD_BADGE_CLASS[status] || STATUS_BADGE[status] || "badge--pending";
  const text = STATUS_LABEL[status] || status || "—";
  return `<span class="badge ${cls}">${text}</span>`;
}

function getCustomerInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resolvePaymentStatus(b) {
  if (b.payment_status) {
    return PAYMENT_STATUS_LABEL[b.payment_status] || b.payment_status;
  }

  if (b.booking_status === "pending_payment") return "Thanh toán đang chờ xử lý";
  if (["paid", "in_progress", "completed"].includes(b.booking_status)) return "Đã thanh toán";
  if (["cancelled", "refunded"].includes(b.booking_status)) return "Không thanh toán";
  return "Chưa ghi nhận giao dịch";
}

function resolvePaymentMethod(b) {
  if (!b.payment_method) return "Chưa cập nhật";
  return PAYMENT_METHOD_LABEL[b.payment_method] || b.payment_method;
}

function resolvePaidAt(b) {
  if (b.paid_at) return formatDate(b.paid_at);
  if (["paid", "in_progress", "completed"].includes(b.booking_status)) return "Chưa cập nhật thời gian";
  return "Chưa thanh toán";
}

function actionHtml(b) {
  const st = b.booking_status;
  let btns = `
    <button class="action-btn btn-view" title="Xem chi tiết" onclick="viewBooking(${b.booking_id})">
      <i class="fa-solid fa-eye"></i>
    </button>`;

  if (st === "pending" || st === "pending_payment") {
    btns += `
   <button class="action-btn btn-approve" title="Đã thanh toán" onclick="changeStatus(${b.booking_id},'paid')">
      <i class="fa-solid fa-check"></i>
    </button>
    <button class="action-btn btn-reject" title="Hủy booking" onclick="changeStatus(${b.booking_id},'cancelled')">
      <i class="fa-solid fa-xmark"></i>
    </button>`;
  }

  if (st === "cancel_requested") {
    btns += `
    <button class="action-btn btn-cancel-request" title="Xem yêu cầu hủy" onclick="viewCancelRequest(${b.booking_id})">
      <i class="fa-solid fa-file-lines"></i>
    </button>`;
  }

  return `<div class="actions">${btns}</div>`;
}

// ───── Render ─────
function matchesStatusFilter(booking) {
  const st = booking.booking_status;
  if (currentFilter === "all") return true;
  if (currentFilter === "confirmed") return st === "confirmed";
  if (currentFilter === "paid") return st === "paid";
  if (currentFilter === "completed") return st === "completed";
  if (currentFilter === "cancelled") return st === "cancelled" || st === "refunded";
  return true;
}

function getFilteredBookings() {
  const input = document.getElementById("bookingCodeSearchInput");
  const kw = String(input?.value || "").toLowerCase().trim();

  return allBookings.filter((b) => {
    const matchesKeyword =
      !kw ||
      (b.booking_code || "").toLowerCase().includes(kw) ||
      (b.customer_name || "").toLowerCase().includes(kw) ||
      (b.tour_title || "").toLowerCase().includes(kw) ||
      (b.customer_phone || "").toLowerCase().includes(kw);

    return matchesKeyword && matchesStatusFilter(b);
  });
}

function applyFiltersAndRender() {
  renderBookingList(getFilteredBookings());
}

function renderBookingCard(b) {
  const paxLabel = b.total_pax != null ? `${b.total_pax} khách` : "—";

  return `
    <article class="booking-card">
      <div class="booking-card__main">
        <div class="booking-card__avatar" aria-hidden="true">${escapeHtml(getCustomerInitials(b.customer_name))}</div>
        <div class="booking-card__info">
          <div class="booking-card__top">
            <span class="booking-card__code">${escapeHtml(b.booking_code || "—")}</span>
            ${cardBadgeHtml(b.booking_status)}
          </div>
          <div class="booking-card__name-row">
            <span class="booking-card__name">${escapeHtml(b.customer_name || "—")}</span>
            ${
              b.customer_phone
                ? `<span class="booking-card__phone"><i class="fa-solid fa-phone" aria-hidden="true"></i>${escapeHtml(b.customer_phone)}</span>`
                : ""
            }
          </div>
          <div class="booking-card__meta">
            <span class="booking-card__meta-item">
              <i class="fa-solid fa-ticket" aria-hidden="true"></i>
              ${escapeHtml(b.tour_title || "—")}
            </span>
            <span class="booking-card__meta-item">
              <i class="fa-regular fa-calendar" aria-hidden="true"></i>
              ${escapeHtml(formatDate(b.departure_date))}
            </span>
            <span class="booking-card__meta-item">
              <i class="fa-solid fa-user" aria-hidden="true"></i>
              ${escapeHtml(paxLabel)}
            </span>
          </div>
        </div>
      </div>
      <div class="booking-card__side">
        <div class="booking-card__price">${escapeHtml(formatCurrency(b.final_price))}</div>
        <div class="booking-card__actions">${actionHtml(b)}</div>
      </div>
    </article>
  `;
}

function renderBookingList(list) {
  const listEl = document.getElementById("bookingList");
  if (!listEl) return;

  if (!list.length) {
    listEl.innerHTML = `<div class="empty-state">Không có dữ liệu booking.</div>`;
    return;
  }

  listEl.innerHTML = list.map((b) => renderBookingCard(b)).join("");
}

function renderStats(list) {
  const total     = list.length;
  const pending   = list.filter(b =>
    ["pending", "pending_payment", "cancel_requested"].includes(b.booking_status),
  ).length;
  const confirmed = list.filter(b => ["confirmed","paid","in_progress","completed"].includes(b.booking_status)).length;
  const cancelled = list.filter(b => ["cancelled","refunded"].includes(b.booking_status)).length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("totalBookings", total);
  set("pendingBookings", pending);
  set("confirmedBookings", confirmed);
  set("cancelledBookings", cancelled);
  set("filterCountAll", total);
}

function bindSearch() {
  const input = document.getElementById("bookingCodeSearchInput");
  if (input) {
    input.addEventListener("input", applyFiltersAndRender);
  }
}

function bindFilterButtons() {
  const filterButtons = document.querySelectorAll(".filter-pill[data-filter]");
  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter || "all";
      filterButtons.forEach((item) =>
        item.classList.toggle("is-active", item === button),
      );
      applyFiltersAndRender();
    });
  });
}

// ───── API helpers ─────
async function changeStatus(bookingId, status) {
  const labels = { confirmed: "xác nhận", cancelled: "hủy" };
  if (!(await showAppConfirm(`Bạn có chắc muốn ${labels[status] || status} booking này không?`)) return;

  try {
    const res = await fetch(`/api/provider/bookings/${bookingId}`, {
      method: "PUT",
      headers: providerAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Cập nhật thất bại");
    alert("✅ " + (data.message || "Cập nhật thành công"));
    loadBookings();
  } catch (err) {
    alert("❌ " + err.message);
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val || "—";
}

function closeModal() {
  const modal = document.getElementById("bookingDetailModal");
  if (modal) modal.style.display = "none";
  document.body.style.overflow = "";
}

function closeCancelRequestModal() {
  selectedCancelRequestId = null;
  const modal = document.getElementById("cancelRequestModal");
  if (modal) modal.style.display = "none";
  if (!document.getElementById("bookingDetailModal")?.style.display ||
      document.getElementById("bookingDetailModal")?.style.display === "none") {
    document.body.style.overflow = "";
  }
}

function viewCancelRequest(bookingId) {
  const b = allBookings.find((x) => x.booking_id === bookingId);
  if (!b) return;

  selectedCancelRequestId = bookingId;
  setText("crBookingCode", b.booking_code);
  setText("crCustomerName", b.customer_name);
  const reasonEl = document.getElementById("crCancelReason");
  if (reasonEl) {
    reasonEl.textContent =
      (b.cancelled_reason && String(b.cancelled_reason).trim()) ||
      "Khách hàng chưa ghi rõ lý do.";
  }

  const modal = document.getElementById("cancelRequestModal");
  if (modal) {
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
}

async function approveCancelRequest() {
  if (!selectedCancelRequestId) return;

  const b = allBookings.find((x) => x.booking_id === selectedCancelRequestId);
  if (!b || b.booking_status !== "cancel_requested") {
    alert("Booking không còn ở trạng thái yêu cầu hủy.");
    return;
  }

  if (
    !(await showAppConfirm(
      `Chấp nhận yêu cầu hủy booking ${b.booking_code || selectedCancelRequestId}?`,
    )
  ) {
    return;
  }

  try {
    const res = await fetch(
      `/api/provider/bookings/${selectedCancelRequestId}/approve-cancel`,
      {
        method: "POST",
        headers: providerAuthHeaders(),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Không chấp nhận được yêu cầu hủy");

    alert("✅ " + (data.message || "Đã chấp nhận yêu cầu hủy tour"));
    closeCancelRequestModal();
    loadBookings();
  } catch (err) {
    alert("❌ " + err.message);
  }
}

function viewBooking(bookingId) {
  const b = allBookings.find(x => x.booking_id === bookingId);
  if (!b) return;

  setText("mdCode",      b.booking_code);
  setText("mdName",      b.customer_name);
  setText("mdEmail",     b.customer_email);
  setText("mdPhone",     b.customer_phone);
  setText("mdTour",      b.tour_title);
  setText("mdDepart",    formatDate(b.departure_date));
  setText("mdReturn",    formatDate(b.return_date));
  setText("mdPax",       b.total_pax != null ? b.total_pax + " khách" : null);
  setText("mdBookedAt",  formatDate(b.booked_at));
  setText("mdPayAmount", formatCurrency(b.final_price));
  setText("mdPayStatus", resolvePaymentStatus(b));
  setText("mdPayMethod", resolvePaymentMethod(b));
  setText("mdPaidAt",    resolvePaidAt(b));

  const priceEl = document.getElementById("mdPrice");
  if (priceEl) priceEl.textContent = formatCurrency(b.final_price);

  const badgeEl = document.getElementById("mdBadge");
  if (badgeEl) badgeEl.innerHTML = badgeHtml(b.booking_status);

  // Footer: nút hành động nếu còn chờ
  const footer = document.getElementById("mdFooter");
  if (footer) {
    const st = b.booking_status;
    if (st === "pending" || st === "pending_payment") {
      footer.innerHTML = `
        <button class="modal-btn modal-btn-close" onclick="closeModal()">
          <i class="fa-solid fa-xmark"></i> Đóng
        </button>
        <button class="modal-btn modal-btn-cancel" onclick="changeStatus(${b.booking_id},'cancelled');closeModal()">
          <i class="fa-solid fa-ban"></i> Hủy booking
        </button>
        <button class="modal-btn modal-btn-confirm" onclick="changeStatus(${b.booking_id},'paid');closeModal()">
          <i class="fa-solid fa-check"></i> Xác nhận
        </button>`;
    } else {
      footer.innerHTML = `
        <button class="modal-btn modal-btn-close" onclick="closeModal()">
          <i class="fa-solid fa-xmark"></i> Đóng
        </button>`;
    }
  }

  const modal = document.getElementById("bookingDetailModal");
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

// Đóng modal khi click ra ngoài
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("bookingDetailModal");
  if (modal) {
    modal.addEventListener("click", e => {
      if (e.target === modal) closeModal();
    });
  }

  const cancelModal = document.getElementById("cancelRequestModal");
  if (cancelModal) {
    cancelModal.addEventListener("click", (e) => {
      if (e.target === cancelModal) closeCancelRequestModal();
    });
  }

  const approveBtn = document.getElementById("approveCancelRequestBtn");
  if (approveBtn) {
    approveBtn.addEventListener("click", approveCancelRequest);
  }
});

// ───── Load ─────
async function loadBookings() {
  try {
    const res  = await fetch("/api/provider/bookings", {
      method: "GET",
      headers: providerAuthHeaders()
    });
    const data = await res.json();

    if (!res.ok || !Array.isArray(data)) {
      console.error("API lỗi:", data);
      const listEl = document.getElementById("bookingList");
      if (listEl) {
        listEl.innerHTML = `<div class="empty-state">Không thể tải dữ liệu.</div>`;
      }
      return;
    }

    allBookings = data;
    renderStats(allBookings);
    applyFiltersAndRender();
  } catch (err) {
    console.error("Lỗi tải booking:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadBookings();
  bindSearch();
  bindFilterButtons();
});

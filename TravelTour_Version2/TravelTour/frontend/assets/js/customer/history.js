let bookingHistory = [];
let selectedCancelBookingId = null;
let pendingCancelReason = "";

const API_ORIGIN = window.location.origin || "http://localhost:3000";

function getCancellationPolicy(booking) {
  const bookedAt = booking?.bookingDate ? new Date(booking.bookingDate) : null;
  if (!bookedAt || Number.isNaN(bookedAt.getTime())) {
    return {
      canCancel: false,
      tier: "unknown",
      feePercent: 0,
      feeAmount: 0,
      applyText: "Không xác định được thời gian đặt tour. Vui lòng liên hệ hỗ trợ.",
    };
  }

  const diffMs = Date.now() - bookedAt.getTime();
  const diffMinutes = diffMs / (1000 * 60);
  const totalPrice = Number(booking.price || 0);

  if (diffMinutes <= 60) {
    return {
      canCancel: true,
      tier: "free",
      feePercent: 0,
      feeAmount: 0,
      applyText:
        "Áp dụng cho booking này: Hủy trong vòng 60 phút kể từ lúc đặt tour — không mất phí.",
    };
  }

  if (diffMinutes <= 24 * 60) {
    const feeAmount = Math.round(totalPrice * 0.15);
    return {
      canCancel: true,
      tier: "partial",
      feePercent: 15,
      feeAmount,
      applyText: `Áp dụng cho booking này: Hủy từ sau 60 phút đến 24 giờ kể từ lúc đặt — mất 15% trên tổng giá trị tour (${formatCurrency(feeAmount)} / ${formatCurrency(totalPrice)}).`,
    };
  }

  return {
    canCancel: false,
    tier: "blocked",
    feePercent: 0,
    feeAmount: 0,
      applyText:
        "Áp dụng cho booking này: Đã quá 24 giờ kể từ lúc đặt tour — không hủy được.",
  };
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("vi-VN");
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("vi-VN") + " VNĐ";
}
async function loadBookingHistory() {
  try {
    const response = await fetch(`${API_ORIGIN}/api/bookings/history`, {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("accessToken"),
      },
    });
    const result = await response.json();

    if (!result.success) {
      console.error(result.message || "Không lấy được lịch sử booking");
      return;
    }

    bookingHistory = result.data || [];
    updateHistory();
  } catch (error) {
    console.error("Lỗi loadBookingHistory:", error);
  }
}
function getHiddenPrice(price) {
  return "••••••••";
}

function renderHistory(data) {
  const historyList = document.getElementById("historyList");
  if (!historyList) return;

  if (!data.length) {
    historyList.innerHTML = `
      <div class="empty-state">
        Không tìm thấy booking phù hợp.
      </div>
    `;
    return;
  }

  historyList.innerHTML = data
    .map(
      (booking) => `
      <div class="history-card">
        <div class="history-content">
          <div class="history-main">
            <div class="history-top">
              <div>
                <h3 class="history-title">${booking.tourName}</h3>
                <div class="history-meta">
                  <div class="meta-item">
                    <span>📍</span>
                    <span>${booking.destination}</span>
                  </div>
                  <div class="meta-item">
                    <span>⏰</span>
                    <span>${booking.duration}</span>
                  </div>
                </div>
              </div>

              <span class="status-chip ${booking.statusClass}">${booking.status}</span>
            </div>

            <div class="history-grid">
              <div class="info-tile">
                <div class="tile-label">Ngày đặt</div>
                <div class="tile-value">
                  <span>📅</span>
                  <span>${formatDate(booking.bookingDate)}</span>
                </div>
              </div>

              <div class="info-tile">
                <div class="tile-label">Ngày khởi hành</div>
                <div class="tile-value">
                  <span>📅</span>
                  <span>${formatDate(booking.travelDate)}</span>
                </div>
              </div>

              <div class="info-tile price-tile">
                <div class="tile-label">Tổng tiền</div>
                <div class="tile-price-row">
                 <div
  class="tile-price"
  id="price-${booking.id}"
  data-price="${formatCurrency(booking.price)}"
  data-hidden="true"
>
  ${getHiddenPrice(booking.price)}
</div>

                  <button
                    type="button"
                    class="price-toggle-btn"
                    data-action="toggle-price"
                    data-target="price-${booking.id}"
                    aria-label="Ẩn hoặc hiện tổng tiền"
                    title="Ẩn/hiện tổng tiền"
                  >
                    👁
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="history-actions">
            ${
              booking.statusRaw === "pending_payment"
                ? `
              <button
                type="button"
                class="history-btn history-btn-pay"
                data-action="continue-pay"
                data-id="${booking.id}"
              >
                Tiếp tục thanh toán
              </button>
            `
                : ""
            }

            <button class="history-btn history-btn-primary" data-action="detail" data-id="${booking.id}">
              Chi tiết
            </button>

            ${
              ["pending_payment", "confirmed", "paid", "in_progress"].includes(
                booking.statusRaw,
              )
                ? `
              <button class="history-btn history-btn-danger" data-action="cancel" data-id="${booking.id}">
                Hủy tour
              </button>
            `
                : ""
            }

            ${
              booking.statusRaw === "completed"
                ? `
              <div class="history-review-dropdown">
                <button
                  type="button"
                  class="history-btn history-btn-review history-review-dropdown__trigger"
                  aria-haspopup="true"
                  aria-expanded="false"
                >
                  Đánh giá
                  <span class="history-review-dropdown__caret" aria-hidden="true">▾</span>
                </button>
                <div class="history-review-dropdown__menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    class="history-review-dropdown__item"
                    data-action="review"
                    data-review-type="tour"
                    data-id="${booking.id}"
                    data-tour-id="${booking.tourId ?? ""}"
                  >
                    Tour
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    class="history-review-dropdown__item"
                    data-action="review"
                    data-review-type="guide"
                    data-id="${booking.id}"
                    data-tour-id="${booking.tourId ?? ""}"
                  >
                    Hướng dẫn viên
                  </button>
                </div>
              </div>
              <button
                class="history-btn history-btn-outline"
                data-action="rebook"
                data-id="${booking.id}"
                data-tour-id="${booking.tourId ?? ""}"
              >
                Đặt lại
              </button>
            `
                : ""
            }
          </div>
        </div>
      </div>
    `,
    )
    .join("");

  bindReviewDropdowns();
}

function getFilteredHistory() {
  const statusFilterEl = document.getElementById("statusFilter");
  const searchInputEl = document.getElementById("searchInput");

  const statusValue = statusFilterEl ? statusFilterEl.value : "all";
  const searchValue = searchInputEl
    ? searchInputEl.value.trim().toLowerCase()
    : "";

  return bookingHistory.filter((item) => {
    const matchStatus = statusValue === "all" || item.status === statusValue;
    const matchSearch =
      item.tourName.toLowerCase().includes(searchValue) ||
      item.destination.toLowerCase().includes(searchValue);

    return matchStatus && matchSearch;
  });
}

function updateHistory() {
  renderHistory(getFilteredHistory());
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");

  if (sidebar) sidebar.classList.toggle("open");
  if (overlay) overlay.classList.toggle("show");
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");

  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("show");
}

function togglePrice(targetId, buttonEl) {
  const priceEl = document.getElementById(targetId);
  if (!priceEl) return;

  const isHidden = priceEl.dataset.hidden === "true";
  const realPrice = priceEl.dataset.price || "";

  if (isHidden) {
    priceEl.textContent = realPrice;
    priceEl.dataset.hidden = "false";
    if (buttonEl) buttonEl.textContent = "👁";
  } else {
    priceEl.textContent = getHiddenPrice(realPrice);
    priceEl.dataset.hidden = "true";
    if (buttonEl) buttonEl.textContent = "🙈";
  }
}

function bindReviewDropdowns() {
  document.querySelectorAll(".history-review-dropdown").forEach(function (wrap) {
    const trigger = wrap.querySelector(".history-review-dropdown__trigger");
    if (!trigger || trigger.dataset.boundReviewDropdown) return;
    trigger.dataset.boundReviewDropdown = "1";

    trigger.addEventListener("click", function (event) {
      event.stopPropagation();
      const open = wrap.classList.toggle("is-open");
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  document.addEventListener("click", function () {
    document.querySelectorAll(".history-review-dropdown.is-open").forEach(function (wrap) {
      wrap.classList.remove("is-open");
      const trigger = wrap.querySelector(".history-review-dropdown__trigger");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  });
}

function bindEvents() {
  const menuToggle = document.getElementById("menuToggle");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  const statusFilter = document.getElementById("statusFilter");
  const searchInput = document.getElementById("searchInput");

  if (menuToggle) {
    menuToggle.addEventListener("click", toggleSidebar);
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
  }

  if (statusFilter) {
    statusFilter.addEventListener("change", updateHistory);
  }

  if (searchInput) {
    searchInput.addEventListener("input", updateHistory);
  }
  document.querySelectorAll('input[name="cancelReason"]').forEach(function (radio) {
    radio.addEventListener("change", syncCancelReasonDetailField);
  });

  const confirmCancelBtn = document.getElementById("confirmCancelBtn");
  if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener("click", openCancelPolicyModal);
  }

  document.querySelectorAll("[data-cancel-close]").forEach(function (el) {
    el.addEventListener("click", closeCancelModal);
  });
  document.addEventListener("click", async function (event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.dataset.action;

    if (action === "toggle-price") {
      togglePrice(target.dataset.target, target);
      return;
    }

    if (action === "continue-pay") {
      continuePayment(target.dataset.id);
      return;
    }

    if (action === "detail") {
      window.location.href = `../tours/chitiet.html?booking_id=${target.dataset.id}`;
      return;
    }

    if (action === "cancel") {
      handleCancelTourClick(target.dataset.id);
      return;
    }
    if (action === "review") {
      const tourId = target.dataset.tourId;
      const bookingId = target.dataset.id;
      const reviewType = target.dataset.reviewType === "guide" ? "guide" : "tour";
      if (!tourId) {
        showMessageModal("Không tìm thấy tour để đánh giá.");
        return;
      }
      const qs = new URLSearchParams({
        review_only: "1",
        review_type: reviewType,
        id: String(tourId),
        booking_id: String(bookingId),
      });
      window.location.href = `../tours/chitiet.html?${qs.toString()}`;
      return;
    }

    if (action === "rebook") {
      handleRebookClick(target.dataset.id, target.dataset.tourId);
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth >= 1024) {
      closeSidebar();
    }
  });
}
function syncCancelReasonDetailField() {
  const selected = document.querySelector('input[name="cancelReason"]:checked');
  const detail = document.getElementById("cancelReasonDetail");
  if (!detail) return;

  if (selected) {
    detail.hidden = false;
    detail.placeholder =
      selected.value === "Khác"
        ? "Nhập lý do hủy của bạn..."
        : "Mô tả rõ hơn lý do hủy (tuỳ chọn)...";
  } else {
    detail.hidden = true;
    detail.value = "";
  }
}

function getCancelReasonPayload() {
  const selected = document.querySelector('input[name="cancelReason"]:checked');
  if (!selected) {
    return { valid: false, message: "Vui lòng chọn lý do hủy tour." };
  }

  const mainReason = selected.value;
  const detail = document.getElementById("cancelReasonDetail");
  const detailText = detail ? detail.value.trim() : "";

  if (mainReason === "Khác" && !detailText) {
    return {
      valid: false,
      message: "Vui lòng nhập rõ lý do khi chọn mục Khác.",
    };
  }

  const reason = detailText ? `${mainReason}: ${detailText}` : mainReason;
  return { valid: true, reason };
}

function buildCancelBlockedMessage(booking) {
  const policy = getCancellationPolicy(booking);
  return [
    "Không thể hủy tour này.",
    "",
    "Quy định hủy tour:",
    "• Hủy trong vòng 60 phút kể từ lúc đặt tour thì không mất phí.",
    "• Hủy từ sau 60 phút đến 24 giờ kể từ lúc đặt thì mất 15% trên tổng giá trị của tour.",
    "• Từ sau 24 giờ kể từ lúc đặt tour thì không hủy được.",
    "",
    policy.applyText,
  ].join("\n");
}

function handleCancelTourClick(bookingId) {
  const booking = findBookingById(bookingId);
  if (!booking) {
    showMessageModal("Không tìm thấy thông tin booking.", "Không thể hủy tour");
    return;
  }

  const policy = getCancellationPolicy(booking);
  if (!policy.canCancel) {
    showMessageModal(buildCancelBlockedMessage(booking), "Không thể hủy tour");
    return;
  }

  openCancelModal(bookingId);
}

function openCancelModal(bookingId) {
  selectedCancelBookingId = bookingId;
  pendingCancelReason = "";

  const modal = document.getElementById("cancelModal");
  document.querySelectorAll('input[name="cancelReason"]').forEach((radio) => {
    radio.checked = false;
  });

  const detail = document.getElementById("cancelReasonDetail");
  if (detail) {
    detail.value = "";
    detail.hidden = true;
  }

  if (modal) modal.classList.add("is-open");
}

function openCancelPolicyModal() {
  const payload = getCancelReasonPayload();
  if (!payload.valid) {
    showMessageModal(payload.message);
    return;
  }

  if (!selectedCancelBookingId) {
    showMessageModal("Không tìm thấy booking cần hủy.");
    return;
  }

  const booking = findBookingById(selectedCancelBookingId);
  if (!booking) {
    showMessageModal("Không tìm thấy thông tin booking.");
    return;
  }

  pendingCancelReason = payload.reason;
  const policy = getCancellationPolicy(booking);
  const applyEl = document.getElementById("cancelPolicyApply");
  const confirmBtn = document.getElementById("confirmCancelFinal");
  const modal = document.getElementById("confirmCancelModal");

  if (applyEl) {
    applyEl.textContent = policy.applyText;
    applyEl.classList.remove("is-warning", "is-error");
    if (policy.tier === "partial") applyEl.classList.add("is-warning");
    if (!policy.canCancel) applyEl.classList.add("is-error");
  }

  if (confirmBtn) {
    confirmBtn.hidden = !policy.canCancel;
    confirmBtn.disabled = !policy.canCancel;
  }

  if (modal) modal.classList.add("active");
}

function closeCancelModal() {
  selectedCancelBookingId = null;
  pendingCancelReason = "";

  const modal = document.getElementById("cancelModal");
  if (modal) modal.classList.remove("is-open");
}

async function submitCancelBooking() {
  const reason = pendingCancelReason || getCancelReasonPayload().reason;

  if (!reason) {
    showMessageModal("Vui lòng chọn hoặc nhập lý do hủy tour.");
    return;
  }

  if (!selectedCancelBookingId) {
    showMessageModal("Không tìm thấy booking cần hủy.");
    return;
  }

  const booking = findBookingById(selectedCancelBookingId);
  const policy = getCancellationPolicy(booking);
  if (!policy.canCancel) {
    showMessageModal(policy.applyText);
    return;
  }

  try {
    const response = await fetch(
      `${API_ORIGIN}/api/bookings/${selectedCancelBookingId}/cancel`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + localStorage.getItem("accessToken"),
        },
        body: JSON.stringify({ reason }),
      },
    );

    const result = await response.json();

    if (!result.success) {
      showMessageModal(result.message || "Hủy tour thất bại");
      return;
    }

    let successMsg = result.message || "Đã gửi yêu cầu hủy tour.";
    if (result.policy?.feePercent > 0 && result.policy?.feeAmount != null) {
      successMsg += ` Phí hủy dự kiến: ${Number(result.policy.feeAmount).toLocaleString("vi-VN")} VNĐ (${result.policy.feePercent}%).`;
    } else if (result.policy?.feePercent === 0) {
      successMsg += " Bạn không mất phí hủy.";
    }

    showMessageModal(successMsg);
    closeCancelModal();
    loadBookingHistory();
  } catch (error) {
    console.error(error);
    showMessageModal("Lỗi kết nối server");
  }
}
function bindLogout() {
  const logoutBtn = document.querySelector(".logout-btn");
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", function () {
    const modal = document.getElementById("logoutModal");
    modal.classList.add("active");
  });
}

function handleLogoutModal() {
  const modal = document.getElementById("logoutModal");
  const cancelBtn = document.getElementById("cancelLogout");
  const confirmBtn = document.getElementById("confirmLogout");

  cancelBtn.addEventListener("click", () => {
    modal.classList.remove("active");
  });

  confirmBtn.addEventListener("click", () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("traveltour_user");

    window.location.href = "../dangnhap/login.html";
  });
}
function bindConfirmCancelModal() {
  const modal = document.getElementById("confirmCancelModal");
  const cancelBtn = document.getElementById("cancelConfirmCancel");
  const confirmBtn = document.getElementById("confirmCancelFinal");

  if (!modal) return;

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      modal.classList.remove("active");
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      modal.classList.remove("active");
      await submitCancelBooking();
    });
  }

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.classList.remove("active");
    }
  });
}
function findBookingById(bookingId) {
  return bookingHistory.find((b) => String(b.id) === String(bookingId)) || null;
}

async function fetchTourBookingEligibility(tourId) {
  const token = localStorage.getItem("accessToken");
  if (!token) {
    return { canBook: false, reason: "not_logged_in" };
  }

  const response = await fetch(
    `${API_ORIGIN}/api/bookings/tour/${encodeURIComponent(tourId)}/eligibility`,
    {
      headers: { Authorization: "Bearer " + token },
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Không kiểm tra được điều kiện đặt lại tour.");
  }
  return result.data || { canBook: false };
}

function buildRebookBlockedMessage(booking, eligibility) {
  const tourLabel = booking?.tourName ? `「${booking.tourName}」` : "tour này";
  const reason = String(eligibility?.reason || "");

  if (reason === "max_active_bookings" || reason === "active_booking") {
    const code = eligibility?.existingBooking?.booking_code;
    return [
      `Bạn đã có 2 đơn đặt ${tourLabel} đang xử lý.`,
      code ? `Mã đơn gần nhất: ${code}.` : "",
      "Không thể đặt thêm cho đến khi một đơn hoàn tất hoặc được hủy.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (reason === "completed_same_schedule") {
    const prev = eligibility?.previousCompleted;
    const prevLine =
      booking?.travelDate && formatDate(booking.travelDate)
        ? `\nLịch bạn đã đi: khởi hành ${formatDate(booking.travelDate)}.`
        : "";
    return (
      (eligibility?.message ||
        `Bạn đã hoàn thành ${tourLabel}. Chỉ có thể đặt lại khi nhà cung cấp cập nhật ngày khởi hành / kết thúc mới.`) + prevLine
    );
  }

  if (reason === "tour_not_found") {
    return "Không tìm thấy tour để đặt lại. Vui lòng liên hệ hỗ trợ.";
  }

  return (
    eligibility?.message ||
    `Hiện không thể đặt lại ${tourLabel}. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.`
  );
}

async function handleRebookClick(bookingId, tourIdFromBtn) {
  const booking = findBookingById(bookingId);
  const tourId = tourIdFromBtn || booking?.tourId;

  if (!booking) {
    showMessageModal("Không tìm thấy thông tin đơn đặt.", "Không thể đặt lại");
    return;
  }

  if (!tourId) {
    showMessageModal(
      "Không xác định được tour để đặt lại. Hãy mở Chi tiết đơn hoặc liên hệ hỗ trợ.",
      "Không thể đặt lại",
    );
    return;
  }

  const token = localStorage.getItem("accessToken");
  if (!token) {
    showMessageModal("Vui lòng đăng nhập để đặt lại tour.", "Cần đăng nhập");
    window.location.href = `../dangnhap/login.html?return_to=${encodeURIComponent(window.location.pathname)}`;
    return;
  }

  try {
    const eligibility = await fetchTourBookingEligibility(tourId);

    if (!eligibility.canBook) {
      showMessageModal(
        buildRebookBlockedMessage(booking, eligibility),
        "Không thể đặt lại",
      );
      return;
    }

    window.location.href = `../tours/chitiet.html?id=${encodeURIComponent(tourId)}`;
  } catch (error) {
    console.error("handleRebookClick:", error);
    showMessageModal(
      error.message || "Không kiểm tra được điều kiện đặt lại. Vui lòng thử lại.",
      "Lỗi",
    );
  }
}

function openOfficePaymentModal(booking) {
  const modal = document.getElementById("officeModal");
  const codeEl = document.getElementById("officeBookingCode");
  if (codeEl) {
    codeEl.textContent = booking?.booking_code
      ? `Mã booking: ${booking.booking_code}`
      : "";
  }
  if (modal) modal.classList.add("active");
}

function closeOfficePaymentModal() {
  const modal = document.getElementById("officeModal");
  if (modal) modal.classList.remove("active");
}

async function continueMomoPayment(bookingId) {
  const token = localStorage.getItem("accessToken");
  if (!token) {
    showMessageModal("Vui lòng đăng nhập để thanh toán.");
    return;
  }

  try {
    const response = await fetch(
      `${API_ORIGIN}/api/payments/momo/${encodeURIComponent(bookingId)}/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success || !result.payUrl) {
      showMessageModal(result.message || "Không thể tạo thanh toán MoMo.");
      return;
    }

    window.location.href = result.payUrl;
  } catch (error) {
    console.error("continueMomoPayment:", error);
    showMessageModal("Lỗi kết nối server khi thanh toán.");
  }
}

async function continuePayment(bookingId) {
  const booking = findBookingById(bookingId);
  if (!booking) {
    showMessageModal("Không tìm thấy booking.");
    return;
  }

  if (booking.statusRaw !== "pending_payment") {
    showMessageModal("Tour này không còn ở trạng thái chờ thanh toán.");
    return;
  }

  const method = String(booking.paymentMethod || "momo").toLowerCase();

  if (method === "office") {
    openOfficePaymentModal(booking);
    return;
  }

  await continueMomoPayment(bookingId);
}

function bindOfficeModal() {
  const closeBtn = document.getElementById("closeOfficeModal");
  const modal = document.getElementById("officeModal");

  if (closeBtn) {
    closeBtn.addEventListener("click", closeOfficePaymentModal);
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeOfficePaymentModal();
    });
  }
}

function showMessageModal(message, title) {
  const modal = document.getElementById("messageModal");
  const titleEl = document.querySelector("#messageModal .modal-content h3");
  const text = document.getElementById("messageModalText");
  const okBtn = document.getElementById("messageModalOk");

  if (!modal || !text || !okBtn) {
    console.error(message);
    return;
  }

  if (titleEl) {
    titleEl.textContent = title || "Thông báo";
  }
  text.textContent = message;
  modal.classList.add("active");

  okBtn.onclick = function () {
    modal.classList.remove("active");
  };
}
document.addEventListener("DOMContentLoaded", function () {
  bindEvents();
  loadBookingHistory();

  bindLogout();
  handleLogoutModal();
  bindConfirmCancelModal();
  bindOfficeModal();
});

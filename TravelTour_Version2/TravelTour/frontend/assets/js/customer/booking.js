const API_ORIGIN = window.location.origin || "http://localhost:3000";

let upcomingBookings = [];
let bookingStats = {
  upcomingCount: 0,
  completedCount: 0,
  totalCount: 0,
};

async function continueMomoPaymentFromBooking(bookingId) {
  const token = localStorage.getItem("accessToken");
  if (!token) {
    alert("Vui lòng đăng nhập để thanh toán.");
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
      alert(result.message || "Không thể tạo thanh toán MoMo.");
      return;
    }

    window.location.href = result.payUrl;
  } catch (error) {
    console.error("continueMomoPaymentFromBooking:", error);
    alert("Lỗi kết nối server khi thanh toán.");
  }
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("vi-VN");
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("vi-VN") + " VNĐ";
}
async function loadMyBookings() {
  try {
    const response = await fetch(
      `${API_ORIGIN}/api/bookings/my-bookings`,
      {
        headers: {
          Authorization:
            "Bearer " + localStorage.getItem("accessToken"),
        },
      }
    );

    const result = await response.json();

    console.log("API BOOKINGS:", result);

    if (!result.success) {
      console.error(result.message || "Không lấy được booking");
      return;
    }

    // ===== STATS =====
    bookingStats = result.data.stats || {
      upcomingCount: 0,
      completedCount: 0,
      totalCount: 0,
    };

    // ===== BOOKINGS =====
    upcomingBookings =
      result.data.upcomingBookings ||
      result.data.bookings ||
      result.data.upcoming ||
      [];

    console.log("UPCOMING:", upcomingBookings);

    renderStats();
    renderUpcomingBookings();
  } catch (error) {
    console.error("Lỗi loadMyBookings:", error);
  }
}

function renderStats() {
  const upcomingCount = document.getElementById("upcomingCount");
  const completedCount = document.getElementById("completedCount");
  const totalCount = document.getElementById("totalCount");

  if (upcomingCount) {
    upcomingCount.textContent = String(bookingStats.upcomingCount || 0);
  }

  if (completedCount) {
    completedCount.textContent = String(bookingStats.completedCount || 0);
  }

  if (totalCount) {
    totalCount.textContent = String(bookingStats.totalCount || 0);
  }
}
function renderUpcomingBookings() {
  const list = document.getElementById("upcomingBookingList");
  if (!list) return;

  if (!upcomingBookings.length) {
    list.innerHTML = `
      <div class="empty-booking">
        Chưa có booking nào sắp tới. Hãy khám phá và đặt tour ngay!
      </div>
    `;
    return;
  }

  list.innerHTML = upcomingBookings
    .map(
      (booking) => `
    <div class="upcoming-booking-card">
      <div class="upcoming-booking-layout">
        <div class="booking-image" style="background-image: url('${booking.imageUrl}')">
          <div class="booking-image-icon">📍</div>
        </div>

        <div class="booking-detail">
          <div class="booking-detail-top">
            <div class="booking-title-wrap">
              <h3>${booking.tourName}</h3>
              <div class="booking-location">
                <span>📍</span>
                <span>${booking.destination}</span>
              </div>
            </div>

            <span class="booking-status ${booking.statusClass}">${booking.status}</span>
          </div>

          <div class="booking-meta-grid">
            <div class="meta-box">
              <p class="meta-label">Ngày đi</p>
              <div class="meta-value">
                <span>📅</span>
               <span>${formatDate(booking.travelDate)}</span>
              </div>
            </div>

            <div class="meta-box">
              <p class="meta-label">Ngày về</p>
              <div class="meta-value">
                <span>📅</span>
                <span>${booking.endDate ? formatDate(booking.endDate) : "--"}</span>
              </div>
            </div>

            <div class="meta-box">
              <p class="meta-label">Thời gian</p>
              <div class="meta-value">
                <span>⏰</span>
                <span>${booking.duration}</span>
              </div>
            </div>

            <div class="meta-box">
              <p class="meta-label">Số người</p>
              <div class="meta-value">
                <span>👥</span>
                <span>${booking.participants} người</span>
              </div>
            </div>
          </div>

          <div class="booking-footer">
            <div>
              <p class="booking-price-text">Tổng tiền</p>
              <p class="booking-price-value">${formatCurrency(booking.price)}</p>
            </div>

            <div class="booking-action-group">
              ${
                booking.statusRaw === "pending_payment" &&
                booking.paymentMethod === "momo"
                  ? `
  <button class="booking-btn booking-btn-primary" data-action="pay" data-id="${booking.id}">
    Thanh toán ngay
  </button>
`
                  : ""
              }

${
  booking.statusRaw === "pending_payment" && booking.paymentMethod === "office"
    ? `
  <button class="booking-btn booking-btn-primary" data-action="office" data-id="${booking.id}">
    Thanh toán tại văn phòng
  </button>
`
    : ""
}

              <button class="booking-btn booking-btn-outline-primary" data-action="detail" data-id="${booking.id}" data-tour-id="${booking.tourId ?? ""}">
                Chi tiết
              </button>

              <button class="booking-btn booking-btn-outline-muted" data-action="contact" data-id="${booking.id}">
                Liên hệ
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
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

function bindEvents() {
  const menuToggle = document.getElementById("menuToggle");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  if (menuToggle) {
    menuToggle.addEventListener("click", toggleSidebar);
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
  }

  document.addEventListener("click", function (event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.dataset.action;
    const id = target.dataset.id;
    const tourId = target.dataset.tourId;

    if (!action || !id) return;

    if (action === "pay") {
      continueMomoPaymentFromBooking(id);
      return;
    }
    if (action === "office") {
      document.getElementById("officeModal").classList.remove("hidden");
      return;
    }
    if (action === "detail") {
      window.location.href = `../tours/chitiet.html?booking_id=${encodeURIComponent(id)}`;
      return;
    }

    if (action === "contact") {
      alert("Liên hệ hỗ trợ cho booking ID: " + id);
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth >= 1024) {
      closeSidebar();
    }
  });
}
const closeBtn = document.getElementById("closeModal");

if (closeBtn) {
  closeBtn.addEventListener("click", function () {
    document.getElementById("officeModal").classList.add("hidden");
  });
}
function bindLogout() {
  const logoutBtn = document.querySelector(".logout-btn");
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", function () {
    const modal = document.getElementById("logoutModal");
    modal.classList.remove("hidden");
  });
}

function handleLogoutModal() {
  const modal = document.getElementById("logoutModal");
  const cancelBtn = document.getElementById("cancelLogout");
  const confirmBtn = document.getElementById("confirmLogout");

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("traveltour_user");

      window.location.href = "../dangnhap/login.html";
    });
  }
}
document.addEventListener("DOMContentLoaded", function () {
  bindEvents();
  loadMyBookings();

  bindLogout();
  handleLogoutModal();
});

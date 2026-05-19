(() => {
  if (typeof Chart === "undefined") {
    console.error("Chart.js chưa được load.");
    return;
  }

  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.color = "#9ca3af";

  const API_URL = "/api/admin/reports/overview?months=12&top=5";

  let barInstance = null;
  let lineInstance = null;
  let pieInstance = null;
  let reportSnapshot = null;

  const chartColors = [
    "#10b981",
    "#3b82f6",
    "#f59e0b",
    "#a855f7",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#6366f1"
  ];

  function qs(sel) {
    return document.querySelector(sel);
  }

  function formatVnd(value) {
    return new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + " đ";
  }

  function formatCompactVnd(value) {
    const v = Number(value || 0);
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)} tỷ`;
    if (v >= 1_000_000) return `${Math.round(v / 1_000_000)} triệu`;
    return formatVnd(v);
  }

  async function fetchJson(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Không thể tải dữ liệu báo cáo");
    return data;
  }

  function renderStats(stats) {
    const totalRevenueEl = qs("#statTotalRevenue");
    const totalBookingsEl = qs("#statTotalBookings");
    const newUsersEl = qs("#statNewUsers");
    const growthEl = qs("#statGrowth");

    const totalRevenueSubEl = qs("#statTotalRevenueSub");
    const totalBookingsSubEl = qs("#statTotalBookingsSub");
    const newUsersSubEl = qs("#statNewUsersSub");
    const growthSubEl = qs("#statGrowthSub");

    const totalRevenue = Number(stats?.totalRevenueVnd || 0);
    const totalBookings = Number(stats?.totalBookings || 0);
    const newUsers = Number(stats?.newUsers || 0);
    const growthPct = Number(stats?.growthPct || 0);

    if (totalRevenueEl) totalRevenueEl.textContent = formatCompactVnd(totalRevenue);
    if (totalBookingsEl)
      totalBookingsEl.textContent = new Intl.NumberFormat("vi-VN").format(totalBookings);
    if (newUsersEl) newUsersEl.textContent = new Intl.NumberFormat("vi-VN").format(newUsers);
    if (growthEl) growthEl.textContent = `${growthPct > 0 ? "+" : ""}${growthPct}%`;

    if (totalRevenueSubEl) totalRevenueSubEl.textContent = "Tổng doanh thu (đơn hàng đã xác nhận)";
    if (totalBookingsSubEl) totalBookingsSubEl.textContent = "Tổng booking toàn hệ thống";
    if (newUsersSubEl) newUsersSubEl.textContent = "Người dùng mới trong 12 tháng";
    if (growthSubEl) growthSubEl.textContent = "Tăng trưởng booking so với 12 tháng trước";
  }

  function renderTopTours(topTours) {
    const wrap = qs("#topTourList");
    if (!wrap) return;

    if (!Array.isArray(topTours) || topTours.length === 0) {
      wrap.innerHTML = `<div style="color:#9ca3af;">Chưa có dữ liệu.</div>`;
      return;
    }

    wrap.innerHTML = topTours
      .slice(0, 5)
      .map((t, idx) => {
        const rank = idx + 1;
        return `
          <div class="top-tour-item">
            <div class="top-rank rank-${rank}">${rank}</div>
            <div>
              <div class="top-tour-name">${escapeHtml(t.name || "Không tên")}</div>
              <div class="top-tour-count">${Number(t.bookings || 0)} bookings</div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderBar(monthlyRevenue) {
    const el = qs("#barChart");
    if (!el) return;
    if (barInstance) barInstance.destroy();

    const labels = Array.isArray(monthlyRevenue) ? monthlyRevenue.map((x) => x.label) : [];
    const data = Array.isArray(monthlyRevenue) ? monthlyRevenue.map((x) => Number(x.value || 0)) : [];

    barInstance = new Chart(el, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Doanh thu (tỷ VNĐ)",
            data,
            backgroundColor: "#10b981",
            borderRadius: 4,
            barPercentage: 0.7
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback(value) {
                return `${value}`;
              }
            },
            border: { display: false },
            grid: { color: "#f3f4f6", drawTicks: false }
          },
          x: { grid: { display: false }, border: { display: false } }
        }
      }
    });
  }

  function renderLine(monthlyBookings) {
    const el = qs("#lineChart");
    if (!el) return;
    if (lineInstance) lineInstance.destroy();

    const labels = Array.isArray(monthlyBookings) ? monthlyBookings.map((x) => x.label) : [];
    const data = Array.isArray(monthlyBookings) ? monthlyBookings.map((x) => Number(x.value || 0)) : [];

    lineInstance = new Chart(el, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Booking",
            data,
            borderColor: "#3b82f6",
            backgroundColor: "#ffffff",
            borderWidth: 3,
            pointBackgroundColor: "#3b82f6",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            pointRadius: 5,
            tension: 0.1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 },
            border: { display: false },
            grid: { color: "#f3f4f6", drawTicks: false }
          },
          x: {
            grid: { color: "#f3f4f6", drawTicks: false },
            border: { display: false }
          }
        }
      }
    });
  }

  function renderPie(popularTours) {
    const el = qs("#pieChart");
    if (!el) return;
    if (pieInstance) pieInstance.destroy();

    const labels = Array.isArray(popularTours) ? popularTours.map((x) => x.name || "Không tên") : [];
    const data = Array.isArray(popularTours) ? popularTours.map((x) => Number(x.value || 0)) : [];
    const bg = labels.map((_, i) => chartColors[i % chartColors.length]);

    pieInstance = new Chart(el, {
      type: "pie",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: bg,
            borderWidth: 1,
            borderColor: "#ffffff"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } }
      }
    });
  }

  function toIsoDateForFile() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
  }

  function exportReportToExcel(snapshot) {
    if (!window.XLSX) {
      alert("Thiếu thư viện xuất Excel. Vui lòng tải lại trang.");
      return;
    }

    const stats = snapshot?.stats || {};
    const monthlyRevenue = Array.isArray(snapshot?.monthlyRevenue) ? snapshot.monthlyRevenue : [];
    const monthlyBookings = Array.isArray(snapshot?.monthlyBookings) ? snapshot.monthlyBookings : [];
    const topTours = Array.isArray(snapshot?.topTours) ? snapshot.topTours : [];

    const workbook = XLSX.utils.book_new();

    const summaryRows = [
      { chi_so: "Tổng doanh thu (VND)", gia_tri: Number(stats.totalRevenueVnd || 0) },
      { chi_so: "Tổng booking", gia_tri: Number(stats.totalBookings || 0) },
      { chi_so: "Người dùng mới", gia_tri: Number(stats.newUsers || 0) },
      { chi_so: "Tăng trưởng (%)", gia_tri: Number(stats.growthPct || 0) },
    ];
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(summaryRows),
      "Tong_quan",
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        monthlyRevenue.map((item) => ({
          thang: item.label || "",
          doanh_thu_ty_vnd: Number(item.value || 0),
        })),
      ),
      "Doanh_thu_thang",
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        monthlyBookings.map((item) => ({
          thang: item.label || "",
          tong_booking: Number(item.value || 0),
        })),
      ),
      "Booking_thang",
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        topTours.map((item, idx) => ({
          top: idx + 1,
          ten_tour: item.name || "",
          tong_booking: Number(item.bookings || 0),
        })),
      ),
      "Top_tour",
    );

    XLSX.writeFile(workbook, `bao-cao-admin-${toIsoDateForFile()}.xlsx`);
  }

  function bindExportButtons() {
    const excelBtn = qs("#exportExcelBtn");
    const pdfBtn = qs("#exportPdfBtn");

    if (excelBtn) {
      excelBtn.addEventListener("click", () => {
        if (!reportSnapshot) {
          alert("Chưa có dữ liệu để xuất. Vui lòng thử lại sau.");
          return;
        }
        exportReportToExcel(reportSnapshot);
      });
    }

    if (pdfBtn) {
      pdfBtn.addEventListener("click", () => {
        window.print();
      });
    }
  }

  function statusLabel(s) {
    const map = {
      guide_confirmed: { label: "HDV đã xác nhận", cls: "confirmed" },
      provider_marked_paid: { label: "Chờ HDV xác nhận", cls: "waiting" },
      pending_payout: { label: "Chờ NCC trả HDV", cls: "pending" },
      not_completed: { label: "Tour chưa hoàn thành", cls: "snapshot" },
      cancelled: { label: "Đã hủy", cls: "cancelled" },
    };
    return map[s] || { label: s || "-", cls: "snapshot" };
  }

  function renderCommissionTable(rows) {
    const body = document.querySelector("#commissionTableBody");
    if (!body) return;
    if (!rows || rows.length === 0) {
      body.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:18px;color:#9ca3af;">Chưa có dữ liệu hoa hồng.</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map((r) => {
        const st = statusLabel(r.guide_status);
        return `
          <tr>
            <td>${escapeHtml(r.booking_code || "#" + r.booking_id)}</td>
            <td>${escapeHtml(r.tour_title || "-")}</td>
            <td>${escapeHtml(r.provider_name || "-")}</td>
            <td class="num">${Number(r.duration_days || 0)}</td>
            <td class="num">${formatVnd(r.base_amount)}</td>
            <td class="num">${Number(r.platform_fee_rate || 0)}%</td>
            <td class="num">${formatVnd(r.platform_fee_amount)}</td>
            <td class="num">${Number(r.guide_commission_rate || 0)}%</td>
            <td class="num">${formatVnd(r.guide_commission_gross)}</td>
            <td class="num">${formatVnd(r.guide_partner_fee_amount)}</td>
            <td class="num"><strong>${formatVnd(r.total_system_amount)}</strong></td>
            <td><span class="commission-status ${st.cls}">${st.label}</span></td>
          </tr>
        `;
      })
      .join("");
  }

  function renderCommissionOverview(ov) {
    const wrap = document.querySelector("#commissionSummary");
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="commission-summary__item is-primary">
        <span>Tổng phí sàn</span>
        <strong>${formatCompactVnd(ov?.totalSystemRevenue || 0)}</strong>
      </div>
      <div class="commission-summary__item">
        <span>Phí NCC</span>
        <strong>${formatCompactVnd(ov?.totalPlatformFee || 0)}</strong>
      </div>
      <div class="commission-summary__item">
        <span>Phí partner HDV (6%)</span>
        <strong>${formatCompactVnd(ov?.totalPartnerFee || 0)}</strong>
      </div>
      <div class="commission-summary__item">
        <span>Tổng booking đã trả</span>
        <strong>${new Intl.NumberFormat("vi-VN").format(ov?.bookingCount || 0)}</strong>
      </div>
    `;
    const statTotal = qs("#statCommissionTotal");
    if (statTotal) statTotal.textContent = formatCompactVnd(ov?.totalSystemRevenue || 0);
  }

  async function loadCommissions() {
    try {
      const [ov, br] = await Promise.all([
        fetchJson("/api/admin/commissions/overview"),
        fetchJson("/api/admin/commissions/breakdown?limit=50"),
      ]);
      renderCommissionOverview(ov?.data || {});
      renderCommissionTable(br?.data || []);
    } catch (err) {
      console.error("commissions:", err);
      renderCommissionOverview({});
      renderCommissionTable([]);
    }
  }

  async function init() {
    bindExportButtons();
    try {
      const data = await fetchJson(API_URL);
      reportSnapshot = data;
      renderStats(data.stats);
      renderBar(data.monthlyRevenue);
      renderLine(data.monthlyBookings);
      renderPie(data.popularTours);
      renderTopTours(data.topTours);
    } catch (err) {
      console.error(err);
      renderStats({});
      renderBar([]);
      renderLine([]);
      renderPie([]);
      renderTopTours([]);
    }
    loadCommissions();
  }

  document.addEventListener("DOMContentLoaded", init);
})();


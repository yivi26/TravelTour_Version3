let barChartInstance = null;
let lineChartInstance = null;

const STATUS_LABEL = {
  pending_payout: { label: "Chờ NCC thanh toán", cls: "pending" },
  provider_marked_paid: { label: "Đã nhận tiền? Hãy xác nhận", cls: "waiting" },
  guide_confirmed: { label: "Đã xác nhận", cls: "confirmed" },
  cancelled: { label: "Đã hủy", cls: "cancelled" },
};

function formatMoney(value) {
  return new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + " đ";
}

function formatMoneyShort(value) {
  const num = Number(value || 0);
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  return new Intl.NumberFormat("vi-VN").format(num);
}

function formatMoneyMillion(value) {
  return Number((Number(value || 0) / 1_000_000).toFixed(1));
}

function formatDateVN(value) {
  if (!value) return "--/--/----";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--/--/----";
  return d.toLocaleDateString("vi-VN");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    headers: guideAuthHeaders(),
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || "Yêu cầu thất bại");
  return json;
}

async function fetchSummary(range = 6) {
  const json = await fetchJson(`/api/guide/earnings/summary?range=${encodeURIComponent(range)}`);
  return json.data || {};
}

async function fetchEarnings(status = null) {
  const url = status
    ? `/api/guide/earnings?status=${encodeURIComponent(status)}`
    : "/api/guide/earnings";
  const json = await fetchJson(url);
  return json.data || [];
}

async function fetchBankInfo() {
  const json = await fetchJson("/api/guide/bank-info");
  return json.data || {};
}

function renderStats(summary) {
  const container = document.getElementById("incomeStatsGrid");
  if (!container) return;

  const stats = summary.stats || {};
  const cards = [
    {
      icon: "💵",
      iconClass: "icon-green",
      label: "Tổng thu nhập (gross)",
      value: formatMoneyShort(stats.totalGross || 0),
      note: `Từ ${stats.totalCount || 0} tour đã xác nhận`,
    },
    {
      icon: "🏦",
      iconClass: "icon-yellow",
      label: "Thu nhập thực (net)",
      value: formatMoneyShort(stats.totalNet || 0),
      note: `Đã trừ phí sàn 6%: ${formatMoney(stats.totalPartnerFee || 0)}`,
    },
    {
      icon: "📅",
      iconClass: "icon-blue",
      label: "Thu nhập tháng này",
      value: formatMoneyShort(stats.monthNet || 0),
      note: `Gross: ${formatMoney(stats.monthGross || 0)} · Phí sàn: ${formatMoney(stats.monthPartnerFee || 0)}`,
    },
    {
      icon: "⏳",
      iconClass: "icon-orange",
      label: "Chờ thanh toán",
      value: formatMoneyShort(stats.pendingGross || 0),
      note: `${stats.pendingCount || 0} khoản đang chờ`,
    },
  ];

  container.innerHTML = cards
    .map(
      (c) => `
      <div class="income-stat-card">
        <div class="income-stat-top">
          <div class="income-stat-icon-box ${c.iconClass}">${c.icon}</div>
          <div>
            <p class="income-stat-label">${c.label}</p>
            <p class="income-stat-value">${c.value}</p>
          </div>
        </div>
        <p class="income-stat-note">${c.note}</p>
      </div>
    `,
    )
    .join("");
}

function renderEarningsList(earnings) {
  const host = document.getElementById("transactionList");
  if (!host) return;
  if (!earnings.length) {
    host.innerHTML = `<div class="empty-state">Chưa có khoản thu nhập nào.</div>`;
    return;
  }
  host.innerHTML = earnings
    .map((e) => {
      const st = STATUS_LABEL[e.status] || { label: e.status, cls: "pending" };
      const actionHtml =
        e.status === "provider_marked_paid"
          ? `<button type="button" class="earning-confirm-btn" data-confirm-earning="${e.id}">Đã nhận tiền</button>`
          : e.status === "guide_confirmed"
            ? `<span class="earning-meta">${formatDateVN(e.guide_confirmed_at)}</span>`
            : "";
      const ref = e.provider_payment_ref
        ? `<div class="earning-ref">Mã GD: <strong>${escapeHtml(e.provider_payment_ref)}</strong></div>`
        : "";
      return `
        <div class="earning-row">
          <div class="earning-row__left">
            <p class="earning-row__title">${escapeHtml(e.tour_title || "Tour")}</p>
            <p class="earning-row__sub">${escapeHtml(e.booking_code || "")} · ${formatDateVN(e.created_at)}</p>
            ${ref}
          </div>
          <div class="earning-row__right">
            <div class="earning-row__amount">
              <span>${formatMoney(e.gross_amount)}</span>
              <small>− phí sàn ${formatMoney(e.partner_fee_amount)}</small>
              <strong>${formatMoney(e.net_amount)}</strong>
            </div>
            <span class="earning-status ${st.cls}">${st.label}</span>
            ${actionHtml}
          </div>
        </div>
      `;
    })
    .join("");
}

function buildCharts(monthly) {
  const labels = monthly.map((m) => `T${String(m.monthNumber).padStart(2, "0")}`);
  const grossValues = monthly.map((m) => formatMoneyMillion(m.gross));
  const netValues = monthly.map((m) => formatMoneyMillion(m.net));

  const barCtx = document.getElementById("incomeBarChart");
  const lineCtx = document.getElementById("incomeLineChart");
  if (typeof Chart === "undefined") return;
  if (barChartInstance) barChartInstance.destroy();
  if (lineChartInstance) lineChartInstance.destroy();

  if (barCtx) {
    barChartInstance = new Chart(barCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Gross (triệu)", data: grossValues, backgroundColor: "#a7f3d0", borderRadius: 8 },
          { label: "Net (triệu)", data: netValues, backgroundColor: "#10b981", borderRadius: 8 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + "M" } } },
      },
    });
  }

  if (lineCtx) {
    lineChartInstance = new Chart(lineCtx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Thu nhập thực (triệu)",
            data: netValues,
            borderColor: "#10b981",
            backgroundColor: "rgba(16,185,129,0.12)",
            fill: true,
            tension: 0.35,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + "M" } } },
      },
    });
  }
}

function renderBankInfo(bank) {
  const host = document.getElementById("guideBankInfo");
  if (!host) return;
  const hasBank = bank?.bank_account_number && bank?.bank_account_name;
  host.innerHTML = `
    <div class="bank-card">
      <div class="bank-card__head">
        <strong>Thông tin tài khoản ngân hàng</strong>
        <button type="button" class="bank-card__edit" id="bankEditBtn">${hasBank ? "Cập nhật" : "Thêm STK"}</button>
      </div>
      ${
        hasBank
          ? `<ul class="bank-card__list">
              <li><span>Ngân hàng</span><strong>${escapeHtml(bank.bank_name || "")}</strong></li>
              <li><span>Số tài khoản</span><strong>${escapeHtml(bank.bank_account_number)}</strong></li>
              <li><span>Chủ tài khoản</span><strong>${escapeHtml(bank.bank_account_name)}</strong></li>
              ${bank.bank_branch ? `<li><span>Chi nhánh</span><strong>${escapeHtml(bank.bank_branch)}</strong></li>` : ""}
            </ul>`
          : `<p class="bank-card__warn">Bạn chưa có STK. Hãy cập nhật để NCC có thể chuyển khoản hoa hồng.</p>`
      }
    </div>`;

  const editBtn = document.getElementById("bankEditBtn");
  if (editBtn) editBtn.addEventListener("click", () => openBankModal(bank || {}));
}

function openBankModal(bank) {
  const existing = document.getElementById("bankModal");
  if (existing) existing.remove();
  const html = `
    <div class="bank-modal" id="bankModal">
      <div class="bank-modal__backdrop" data-close-bank></div>
      <div class="bank-modal__dialog">
        <header>
          <h3>Cập nhật tài khoản ngân hàng</h3>
          <button type="button" data-close-bank>×</button>
        </header>
        <form id="bankForm">
          <label>Ngân hàng
            <input name="bank_name" value="${escapeHtml(bank.bank_name || "")}" placeholder="Vietcombank" required />
          </label>
          <label>Số tài khoản
            <input name="bank_account_number" value="${escapeHtml(bank.bank_account_number || "")}" placeholder="0123456789" required />
          </label>
          <label>Chủ tài khoản (in hoa, không dấu)
            <input name="bank_account_name" value="${escapeHtml(bank.bank_account_name || "")}" placeholder="NGUYEN VAN A" required />
          </label>
          <label>Chi nhánh (tuỳ chọn)
            <input name="bank_branch" value="${escapeHtml(bank.bank_branch || "")}" placeholder="Chi nhánh Hà Nội" />
          </label>
          <div class="bank-modal__actions">
            <button type="button" class="btn btn--ghost" data-close-bank>Hủy</button>
            <button type="submit" class="btn btn--primary">Lưu</button>
          </div>
        </form>
      </div>
    </div>`;
  document.body.insertAdjacentHTML("beforeend", html);

  const modal = document.getElementById("bankModal");
  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-bank]")) modal.remove();
  });
  document.getElementById("bankForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const json = await fetchJson("/api/guide/bank-info", {
        method: "PUT",
        body: JSON.stringify({
          bank_name: fd.get("bank_name"),
          bank_account_number: fd.get("bank_account_number"),
          bank_account_name: fd.get("bank_account_name"),
          bank_branch: fd.get("bank_branch"),
        }),
        headers: { ...guideAuthHeaders(), "Content-Type": "application/json" },
      });
      modal.remove();
      renderBankInfo(json.data || {});
      alert("Đã cập nhật thông tin ngân hàng");
    } catch (err) {
      alert(err.message || "Cập nhật thất bại");
    }
  });
}

async function handleConfirmEarning(earningId) {
  if (!window.confirm("Bạn xác nhận đã nhận tiền hoa hồng cho khoản này?")) return;
  try {
    const json = await fetchJson(`/api/guide/earnings/${encodeURIComponent(earningId)}/confirm`, {
      method: "POST",
      headers: { ...guideAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    alert(json.message || "Đã xác nhận.");
    initPage();
  } catch (err) {
    alert(err.message || "Không xác nhận được");
  }
}

function bindEvents() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-confirm-earning]");
    if (btn) {
      const id = Number(btn.getAttribute("data-confirm-earning"));
      if (id) handleConfirmEarning(id);
    }
  });

  const rangeSelect = document.getElementById("rangeSelect");
  if (rangeSelect) {
    rangeSelect.addEventListener("change", async () => {
      try {
        const summary = await fetchSummary(Number(rangeSelect.value));
        renderStats(summary);
        buildCharts(summary.monthly || []);
      } catch (err) {
        alert(err.message || "Lỗi tải dữ liệu");
      }
    });
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      window.location.href = "http://localhost:3000/login";
    });
  }
}

async function initPage() {
  try {
    const [summary, earnings, bank] = await Promise.all([
      fetchSummary(6),
      fetchEarnings(),
      fetchBankInfo(),
    ]);
    renderStats(summary);
    renderEarningsList(earnings);
    buildCharts(summary.monthly || []);
    renderBankInfo(bank);
    bindEvents();
  } catch (err) {
    console.error(err);
    const statsGrid = document.getElementById("incomeStatsGrid");
    if (statsGrid) {
      statsGrid.innerHTML = `<div class="empty-state">Không tải được dữ liệu thu nhập.</div>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", initPage);

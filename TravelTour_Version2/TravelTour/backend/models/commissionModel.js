/**
 * Quản lý hoa hồng & thanh toán (mô hình A — Provider trả Guide trực tiếp).
 *
 * - booking_commissions: snapshot khi booking 'confirmed' (sau khi khách trả)
 * - guide_earnings: tạo khi tour hoàn thành (guide_completed_at) cho HDV cuối
 * - guides.bank_* : thông tin tài khoản ngân hàng để Provider chuyển khoản
 *
 * Công thức (D = tours.duration_days):
 *   provider_platform_fee_rate    = 10 (cố định, không phụ thuộc số ngày tour)
 *   guide_commission_rate(D)      = min(17, 10 + max(0, D - 1))
 *   guide_partner_fee_rate        = 6 (cố định)
 */

import db from "../config/db.js";

const DEFAULT_PARTNER_FEE_RATE = 6;
const PROVIDER_PLATFORM_FEE_RATE = 10;
const GUIDE_BASE = 10;
const GUIDE_BUMP_FROM = 1; // +1% từ D = 2
const GUIDE_CAP = 17;

let bootstrapped = false;

async function ensureSchema() {
  if (bootstrapped) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS booking_commissions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      booking_id INT UNSIGNED NOT NULL,
      tour_id INT UNSIGNED NOT NULL,
      provider_id INT UNSIGNED NOT NULL,
      duration_days SMALLINT NOT NULL DEFAULT 1,
      base_amount DECIMAL(14,0) NOT NULL DEFAULT 0,
      platform_fee_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
      platform_fee_amount DECIMAL(14,0) NOT NULL DEFAULT 0,
      guide_commission_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
      guide_commission_gross_expected DECIMAL(14,0) NOT NULL DEFAULT 0,
      guide_partner_fee_rate DECIMAL(5,2) NOT NULL DEFAULT 6,
      status ENUM('snapshot','cancelled') NOT NULL DEFAULT 'snapshot',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_booking_commissions_booking (booking_id),
      KEY idx_booking_commissions_provider (provider_id, created_at),
      KEY idx_booking_commissions_tour (tour_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS guide_earnings (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      booking_id INT UNSIGNED NOT NULL,
      tour_id INT UNSIGNED NOT NULL,
      guide_id INT UNSIGNED NOT NULL,
      provider_id INT UNSIGNED NOT NULL,
      gross_amount DECIMAL(14,0) NOT NULL DEFAULT 0,
      partner_fee_rate DECIMAL(5,2) NOT NULL DEFAULT 6,
      partner_fee_amount DECIMAL(14,0) NOT NULL DEFAULT 0,
      net_amount DECIMAL(14,0) NOT NULL DEFAULT 0,
      status ENUM('pending_payout','provider_marked_paid','guide_confirmed','cancelled')
        NOT NULL DEFAULT 'pending_payout',
      provider_marked_paid_at DATETIME NULL,
      provider_payment_ref VARCHAR(120) NULL,
      guide_confirmed_at DATETIME NULL,
      cancelled_reason VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_guide_earnings_booking (booking_id),
      KEY idx_guide_earnings_guide (guide_id, status, created_at),
      KEY idx_guide_earnings_provider (provider_id, status, created_at),
      KEY idx_guide_earnings_tour (tour_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Bổ sung cột bank cho guides nếu chưa có
  const guideBankCols = [
    ["bank_name", "VARCHAR(150) NULL"],
    ["bank_account_number", "VARCHAR(50) NULL"],
    ["bank_account_name", "VARCHAR(150) NULL"],
    ["bank_branch", "VARCHAR(150) NULL"],
  ];
  for (const [col, ddl] of guideBankCols) {
    try {
      await db.query(`ALTER TABLE guides ADD COLUMN ${col} ${ddl}`);
    } catch (err) {
      if (err.code !== "ER_DUP_FIELDNAME") {
        console.warn(`guides ADD COLUMN ${col}:`, err.message);
      }
    }
  }

  bootstrapped = true;
}

// ===== Công thức =====
export function computeProviderPlatformFeeRate(_durationDays) {
  return PROVIDER_PLATFORM_FEE_RATE;
}

export function computeGuideCommissionRate(durationDays) {
  const d = Math.max(1, Number(durationDays) || 1);
  return Math.min(GUIDE_CAP, GUIDE_BASE + Math.max(0, d - GUIDE_BUMP_FROM));
}

export const GUIDE_PARTNER_FEE_RATE = DEFAULT_PARTNER_FEE_RATE;

function round0(n) {
  return Math.round(Number(n) || 0);
}

export function computeCommissionBreakdown({ baseAmount, durationDays }) {
  const base = round0(baseAmount);
  const d = Math.max(1, Number(durationDays) || 1);
  const platformRate = computeProviderPlatformFeeRate(d);
  const guideRate = computeGuideCommissionRate(d);
  const partnerRate = DEFAULT_PARTNER_FEE_RATE;

  const platformFeeAmount = round0((base * platformRate) / 100);
  const guideGross = round0((base * guideRate) / 100);
  const partnerFeeAmount = round0((guideGross * partnerRate) / 100);
  const guideNet = Math.max(0, guideGross - partnerFeeAmount);

  return {
    durationDays: d,
    baseAmount: base,
    platformFeeRate: platformRate,
    platformFeeAmount,
    guideCommissionRate: guideRate,
    guideCommissionGross: guideGross,
    guidePartnerFeeRate: partnerRate,
    guidePartnerFeeAmount: partnerFeeAmount,
    guideNet,
    providerNet: Math.max(0, base - platformFeeAmount - guideGross),
  };
}

// ===== Snapshot khi booking confirmed (khách đã trả) =====
export async function ensureBookingCommissionSnapshot(bookingId) {
  await ensureSchema();
  const bid = Number(bookingId);
  if (!bid) return null;

  const [[booking]] = await db.query(
    `
    SELECT
      b.id, b.tour_id, b.final_price, b.status,
      t.provider_id, t.duration_days
    FROM bookings b
    JOIN tours t ON t.id = b.tour_id
    WHERE b.id = ?
    LIMIT 1
    `,
    [bid],
  );
  if (!booking) return null;

  const breakdown = computeCommissionBreakdown({
    baseAmount: booking.final_price,
    durationDays: booking.duration_days,
  });

  await db.query(
    `
    INSERT INTO booking_commissions (
      booking_id, tour_id, provider_id, duration_days, base_amount,
      platform_fee_rate, platform_fee_amount,
      guide_commission_rate, guide_commission_gross_expected,
      guide_partner_fee_rate, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'snapshot')
    ON DUPLICATE KEY UPDATE
      duration_days = VALUES(duration_days),
      base_amount = VALUES(base_amount),
      platform_fee_rate = VALUES(platform_fee_rate),
      platform_fee_amount = VALUES(platform_fee_amount),
      guide_commission_rate = VALUES(guide_commission_rate),
      guide_commission_gross_expected = VALUES(guide_commission_gross_expected),
      guide_partner_fee_rate = VALUES(guide_partner_fee_rate),
      status = 'snapshot',
      updated_at = CURRENT_TIMESTAMP
    `,
    [
      bid,
      booking.tour_id,
      booking.provider_id,
      breakdown.durationDays,
      breakdown.baseAmount,
      breakdown.platformFeeRate,
      breakdown.platformFeeAmount,
      breakdown.guideCommissionRate,
      breakdown.guideCommissionGross,
      breakdown.guidePartnerFeeRate,
    ],
  );

  return breakdown;
}

// ===== Tạo guide_earnings khi tour hoàn thành (HDV cuối) =====
export async function createGuideEarningsForCompletedTour(tourId) {
  await ensureSchema();
  const tid = Number(tourId);
  if (!tid) return { created: 0 };

  const [[tour]] = await db.query(
    `
    SELECT id, provider_id, guide_id, duration_days
    FROM tours
    WHERE id = ?
    LIMIT 1
    `,
    [tid],
  );
  if (!tour || !tour.guide_id) return { created: 0, reason: "no_guide" };

  // Lấy bookings của tour này đã thanh toán (confirmed trở lên, không cancelled)
  const [bookings] = await db.query(
    `
    SELECT id, final_price
    FROM bookings
    WHERE tour_id = ?
      AND status IN ('confirmed','paid','in_progress','completed')
    `,
    [tid],
  );

  let created = 0;
  for (const b of bookings) {
    const breakdown = computeCommissionBreakdown({
      baseAmount: b.final_price,
      durationDays: tour.duration_days,
    });
    if (breakdown.guideCommissionGross <= 0) continue;

    const [result] = await db.query(
      `
      INSERT IGNORE INTO guide_earnings (
        booking_id, tour_id, guide_id, provider_id,
        gross_amount, partner_fee_rate, partner_fee_amount, net_amount,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_payout')
      `,
      [
        b.id,
        tid,
        tour.guide_id,
        tour.provider_id,
        breakdown.guideCommissionGross,
        breakdown.guidePartnerFeeRate,
        breakdown.guidePartnerFeeAmount,
        breakdown.guideNet,
      ],
    );
    if (result.affectedRows > 0) created += 1;
  }

  return { created, totalBookings: bookings.length };
}

// ===== Provider: tổng phải trả HDV cho 1 tour =====
export async function getTourPayableGuideForProvider(providerId, tourId) {
  await ensureSchema();
  const pid = Number(providerId);
  const tid = Number(tourId);
  if (!pid || !tid) return null;

  const [[tour]] = await db.query(
    `
    SELECT
      t.id AS tour_id, t.title, t.guide_id, t.guide_completed_at,
      g.id AS guide_id_check, u.full_name AS guide_name, u.email AS guide_email,
      g.bank_name, g.bank_account_number, g.bank_account_name, g.bank_branch
    FROM tours t
    LEFT JOIN guides g ON g.id = t.guide_id
    LEFT JOIN users u  ON u.id = g.user_id
    WHERE t.id = ? AND t.provider_id = ?
    LIMIT 1
    `,
    [tid, pid],
  );
  if (!tour) return null;

  const [items] = await db.query(
    `
    SELECT
      ge.id, ge.booking_id, ge.gross_amount, ge.partner_fee_amount, ge.net_amount,
      ge.status, ge.provider_marked_paid_at, ge.guide_confirmed_at,
      b.booking_code, b.final_price, b.contact_name
    FROM guide_earnings ge
    JOIN bookings b ON b.id = ge.booking_id
    WHERE ge.tour_id = ? AND ge.provider_id = ?
    ORDER BY ge.id ASC
    `,
    [tid, pid],
  );

  const sum = (rows, key, filter = () => true) =>
    rows.filter(filter).reduce((s, r) => s + Number(r[key] || 0), 0);

  const totalGross = sum(items, "gross_amount");
  const pendingGross = sum(items, "gross_amount", (r) => r.status === "pending_payout");
  const waitingConfirmGross = sum(items, "gross_amount", (r) => r.status === "provider_marked_paid");
  const confirmedGross = sum(items, "gross_amount", (r) => r.status === "guide_confirmed");

  return {
    tour_id: tid,
    tour_title: tour.title,
    guide_completed_at: tour.guide_completed_at,
    guide: tour.guide_id
      ? {
          id: tour.guide_id,
          name: tour.guide_name || "",
          email: tour.guide_email || "",
          bank: {
            name: tour.bank_name || "",
            account_number: tour.bank_account_number || "",
            account_name: tour.bank_account_name || "",
            branch: tour.bank_branch || "",
          },
        }
      : null,
    totals: {
      gross: totalGross,
      pending: pendingGross,
      waiting_confirm: waitingConfirmGross,
      confirmed: confirmedGross,
    },
    earnings: items.map((r) => ({
      id: Number(r.id),
      booking_id: Number(r.booking_id),
      booking_code: r.booking_code || "",
      contact_name: r.contact_name || "",
      base_amount: Number(r.final_price || 0),
      gross_amount: Number(r.gross_amount || 0),
      partner_fee_amount: Number(r.partner_fee_amount || 0),
      net_amount: Number(r.net_amount || 0),
      status: r.status,
      provider_marked_paid_at: r.provider_marked_paid_at,
      guide_confirmed_at: r.guide_confirmed_at,
    })),
  };
}

// ===== Provider mark paid =====
export async function providerMarkEarningPaid({ providerId, earningId, paymentRef }) {
  await ensureSchema();
  const pid = Number(providerId);
  const eid = Number(earningId);
  if (!pid || !eid) throw new Error("Tham số không hợp lệ");

  const [[row]] = await db.query(
    `SELECT id, status, provider_id, guide_id, tour_id, booking_id, gross_amount
     FROM guide_earnings WHERE id = ? LIMIT 1`,
    [eid],
  );
  if (!row) throw new Error("Không tìm thấy bản ghi thanh toán");
  if (row.provider_id !== pid) throw new Error("Không có quyền với khoản này");
  if (row.status !== "pending_payout") {
    throw new Error("Khoản này không ở trạng thái chờ thanh toán");
  }

  await db.query(
    `
    UPDATE guide_earnings
    SET status = 'provider_marked_paid',
        provider_marked_paid_at = CURRENT_TIMESTAMP,
        provider_payment_ref = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    [paymentRef ? String(paymentRef).slice(0, 120) : null, eid],
  );

  return { ...row, status: "provider_marked_paid" };
}

// ===== Guide confirm =====
export async function guideConfirmEarning({ guideId, earningId }) {
  await ensureSchema();
  const gid = Number(guideId);
  const eid = Number(earningId);
  if (!gid || !eid) throw new Error("Tham số không hợp lệ");

  const [[row]] = await db.query(
    `SELECT id, status, guide_id, provider_id, tour_id, booking_id, gross_amount, net_amount
     FROM guide_earnings WHERE id = ? LIMIT 1`,
    [eid],
  );
  if (!row) throw new Error("Không tìm thấy khoản thu nhập");
  if (row.guide_id !== gid) throw new Error("Không có quyền với khoản này");
  if (row.status !== "provider_marked_paid") {
    throw new Error("Khoản này chưa được Provider đánh dấu đã trả");
  }

  await db.query(
    `
    UPDATE guide_earnings
    SET status = 'guide_confirmed',
        guide_confirmed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    [eid],
  );

  return { ...row, status: "guide_confirmed" };
}

// ===== Guide thu nhập (gross/net + 6%) =====
export async function getGuideEarningsSummary(guideId, monthRange = 6) {
  await ensureSchema();
  const gid = Number(guideId);
  if (!gid) return null;
  const safeRange = [3, 6, 12].includes(Number(monthRange)) ? Number(monthRange) : 6;

  const [[totalRow]] = await db.query(
    `
    SELECT
      COALESCE(SUM(gross_amount), 0) AS total_gross,
      COALESCE(SUM(net_amount), 0) AS total_net,
      COALESCE(SUM(partner_fee_amount), 0) AS total_partner_fee,
      COUNT(*) AS total_count
    FROM guide_earnings
    WHERE guide_id = ? AND status = 'guide_confirmed'
    `,
    [gid],
  );

  const [[monthRow]] = await db.query(
    `
    SELECT
      COALESCE(SUM(gross_amount), 0) AS gross,
      COALESCE(SUM(net_amount), 0) AS net,
      COALESCE(SUM(partner_fee_amount), 0) AS partner_fee,
      COUNT(*) AS cnt
    FROM guide_earnings
    WHERE guide_id = ?
      AND status = 'guide_confirmed'
      AND YEAR(guide_confirmed_at) = YEAR(CURDATE())
      AND MONTH(guide_confirmed_at) = MONTH(CURDATE())
    `,
    [gid],
  );

  const [[pendingRow]] = await db.query(
    `
    SELECT
      COALESCE(SUM(gross_amount), 0) AS gross,
      COUNT(*) AS cnt
    FROM guide_earnings
    WHERE guide_id = ?
      AND status IN ('pending_payout','provider_marked_paid')
    `,
    [gid],
  );

  const [monthlyRows] = await db.query(
    `
    SELECT
      DATE_FORMAT(guide_confirmed_at, '%Y-%m') AS ym,
      YEAR(guide_confirmed_at) AS yr, MONTH(guide_confirmed_at) AS mo,
      COALESCE(SUM(gross_amount), 0) AS gross,
      COALESCE(SUM(net_amount), 0) AS net
    FROM guide_earnings
    WHERE guide_id = ?
      AND status = 'guide_confirmed'
      AND guide_confirmed_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
    GROUP BY DATE_FORMAT(guide_confirmed_at, '%Y-%m'), YEAR(guide_confirmed_at), MONTH(guide_confirmed_at)
    ORDER BY ym ASC
    `,
    [gid, safeRange],
  );

  const [recent] = await db.query(
    `
    SELECT
      ge.id, ge.gross_amount, ge.net_amount, ge.partner_fee_amount, ge.status,
      ge.created_at, ge.provider_marked_paid_at, ge.guide_confirmed_at,
      t.title AS tour_title, b.booking_code
    FROM guide_earnings ge
    JOIN tours t    ON t.id = ge.tour_id
    JOIN bookings b ON b.id = ge.booking_id
    WHERE ge.guide_id = ?
    ORDER BY ge.id DESC
    LIMIT 20
    `,
    [gid],
  );

  return {
    stats: {
      totalGross: Number(totalRow?.total_gross || 0),
      totalNet: Number(totalRow?.total_net || 0),
      totalPartnerFee: Number(totalRow?.total_partner_fee || 0),
      totalCount: Number(totalRow?.total_count || 0),
      monthGross: Number(monthRow?.gross || 0),
      monthNet: Number(monthRow?.net || 0),
      monthPartnerFee: Number(monthRow?.partner_fee || 0),
      monthCount: Number(monthRow?.cnt || 0),
      pendingGross: Number(pendingRow?.gross || 0),
      pendingCount: Number(pendingRow?.cnt || 0),
    },
    monthly: monthlyRows.map((r) => ({
      monthKey: r.ym,
      monthNumber: Number(r.mo),
      yearNumber: Number(r.yr),
      gross: Number(r.gross || 0),
      net: Number(r.net || 0),
    })),
    recent: recent.map((r) => ({
      id: Number(r.id),
      tour_title: r.tour_title,
      booking_code: r.booking_code,
      gross_amount: Number(r.gross_amount || 0),
      net_amount: Number(r.net_amount || 0),
      partner_fee_amount: Number(r.partner_fee_amount || 0),
      status: r.status,
      provider_marked_paid_at: r.provider_marked_paid_at,
      guide_confirmed_at: r.guide_confirmed_at,
      created_at: r.created_at,
    })),
  };
}

export async function listGuideEarningsForGuide(guideId, status = null) {
  await ensureSchema();
  const gid = Number(guideId);
  if (!gid) return [];
  const params = [gid];
  let where = `ge.guide_id = ?`;
  if (status) {
    where += ` AND ge.status = ?`;
    params.push(status);
  }
  const [rows] = await db.query(
    `
    SELECT
      ge.id, ge.booking_id, ge.tour_id, ge.gross_amount, ge.partner_fee_amount,
      ge.net_amount, ge.status, ge.provider_marked_paid_at, ge.guide_confirmed_at,
      ge.provider_payment_ref, ge.created_at,
      t.title AS tour_title, b.booking_code
    FROM guide_earnings ge
    JOIN tours t    ON t.id = ge.tour_id
    JOIN bookings b ON b.id = ge.booking_id
    WHERE ${where}
    ORDER BY ge.id DESC
    `,
    params,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    booking_id: Number(r.booking_id),
    tour_id: Number(r.tour_id),
    tour_title: r.tour_title,
    booking_code: r.booking_code,
    gross_amount: Number(r.gross_amount || 0),
    partner_fee_amount: Number(r.partner_fee_amount || 0),
    net_amount: Number(r.net_amount || 0),
    status: r.status,
    provider_marked_paid_at: r.provider_marked_paid_at,
    guide_confirmed_at: r.guide_confirmed_at,
    provider_payment_ref: r.provider_payment_ref,
    created_at: r.created_at,
  }));
}

// ===== Guide bank info =====
export async function getGuideBankInfo(guideId) {
  await ensureSchema();
  const [[row]] = await db.query(
    `SELECT bank_name, bank_account_number, bank_account_name, bank_branch
     FROM guides WHERE id = ? LIMIT 1`,
    [Number(guideId)],
  );
  if (!row) return null;
  return {
    bank_name: row.bank_name || "",
    bank_account_number: row.bank_account_number || "",
    bank_account_name: row.bank_account_name || "",
    bank_branch: row.bank_branch || "",
  };
}

export async function updateGuideBankInfo(guideId, info) {
  await ensureSchema();
  const gid = Number(guideId);
  if (!gid) throw new Error("Guide ID không hợp lệ");
  const fields = {
    bank_name: info?.bank_name ? String(info.bank_name).slice(0, 150) : null,
    bank_account_number: info?.bank_account_number
      ? String(info.bank_account_number).replace(/[^\d]/g, "").slice(0, 50)
      : null,
    bank_account_name: info?.bank_account_name
      ? String(info.bank_account_name).toUpperCase().slice(0, 150)
      : null,
    bank_branch: info?.bank_branch ? String(info.bank_branch).slice(0, 150) : null,
  };
  await db.query(
    `UPDATE guides
     SET bank_name = ?, bank_account_number = ?, bank_account_name = ?, bank_branch = ?
     WHERE id = ?`,
    [
      fields.bank_name,
      fields.bank_account_number,
      fields.bank_account_name,
      fields.bank_branch,
      gid,
    ],
  );
  return getGuideBankInfo(gid);
}

// ===== Provider: tổng commission/summary =====
export async function getProviderCommissionSummary(providerId, months = 6) {
  await ensureSchema();
  const pid = Number(providerId);
  if (!pid) return null;
  const nMonths = Math.max(1, Math.min(24, Number(months) || 6));

  const [[s]] = await db.query(
    `
    SELECT
      COALESCE(SUM(bc.base_amount), 0) AS gross_revenue,
      COALESCE(SUM(bc.platform_fee_amount), 0) AS total_platform_fee,
      COALESCE(SUM(bc.guide_commission_gross_expected), 0) AS total_guide_commission_expected,
      COUNT(*) AS booking_count
    FROM booking_commissions bc
    WHERE bc.provider_id = ?
      AND bc.status = 'snapshot'
      AND bc.created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
    `,
    [pid, nMonths],
  );

  const [[paidRow]] = await db.query(
    `
    SELECT
      COALESCE(SUM(ge.gross_amount), 0) AS guide_commission_confirmed
    FROM guide_earnings ge
    WHERE ge.provider_id = ?
      AND ge.status = 'guide_confirmed'
      AND ge.guide_confirmed_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
    `,
    [pid, nMonths],
  );

  const [[payableRow]] = await db.query(
    `
    SELECT
      COALESCE(SUM(ge.gross_amount), 0) AS payable_gross,
      COUNT(*) AS payable_count
    FROM guide_earnings ge
    WHERE ge.provider_id = ?
      AND ge.status IN ('pending_payout','provider_marked_paid')
    `,
    [pid],
  );

  const grossRevenue = Number(s?.gross_revenue || 0);
  const platformFee = Number(s?.total_platform_fee || 0);
  const guideExpected = Number(s?.total_guide_commission_expected || 0);
  const guideConfirmed = Number(paidRow?.guide_commission_confirmed || 0);
  const netRevenueAfterPlatform = Math.max(0, grossRevenue - platformFee);
  const netRevenueAfterAll = Math.max(0, netRevenueAfterPlatform - guideConfirmed);

  return {
    months: nMonths,
    grossRevenue,
    platformFee,
    guideCommissionExpected: guideExpected,
    guideCommissionConfirmed: guideConfirmed,
    netRevenueAfterPlatform,
    netRevenueAfterAll,
    payableToGuides: Number(payableRow?.payable_gross || 0),
    payableCount: Number(payableRow?.payable_count || 0),
    bookingCount: Number(s?.booking_count || 0),
  };
}

// ===== Admin overview =====
export async function getAdminCommissionOverview({ from, to } = {}) {
  await ensureSchema();
  const params = [];
  let dateWhere = "";
  if (from) {
    dateWhere += " AND bc.created_at >= ?";
    params.push(from);
  }
  if (to) {
    dateWhere += " AND bc.created_at <= ?";
    params.push(to);
  }

  const [[platform]] = await db.query(
    `
    SELECT
      COALESCE(SUM(bc.base_amount), 0) AS gross_revenue,
      COALESCE(SUM(bc.platform_fee_amount), 0) AS total_platform_fee,
      COUNT(*) AS booking_count
    FROM booking_commissions bc
    WHERE bc.status = 'snapshot' ${dateWhere}
    `,
    params,
  );

  const partnerParams = [];
  let partnerWhere = "";
  if (from) {
    partnerWhere += " AND ge.guide_confirmed_at >= ?";
    partnerParams.push(from);
  }
  if (to) {
    partnerWhere += " AND ge.guide_confirmed_at <= ?";
    partnerParams.push(to);
  }

  const [[partner]] = await db.query(
    `
    SELECT
      COALESCE(SUM(ge.partner_fee_amount), 0) AS total_partner_fee,
      COALESCE(SUM(ge.gross_amount), 0) AS total_guide_gross_confirmed,
      COUNT(*) AS confirmed_count
    FROM guide_earnings ge
    WHERE ge.status = 'guide_confirmed' ${partnerWhere}
    `,
    partnerParams,
  );

  const totalPlatform = Number(platform?.total_platform_fee || 0);
  const totalPartner = Number(partner?.total_partner_fee || 0);

  return {
    grossRevenue: Number(platform?.gross_revenue || 0),
    bookingCount: Number(platform?.booking_count || 0),
    totalPlatformFee: totalPlatform,
    totalPartnerFee: totalPartner,
    totalSystemRevenue: totalPlatform + totalPartner,
    guideGrossConfirmed: Number(partner?.total_guide_gross_confirmed || 0),
    confirmedCount: Number(partner?.confirmed_count || 0),
  };
}

export async function getAdminCommissionBreakdown({ from, to, limit = 50, offset = 0 } = {}) {
  await ensureSchema();
  const params = [];
  let where = "bc.status = 'snapshot'";
  if (from) {
    where += " AND bc.created_at >= ?";
    params.push(from);
  }
  if (to) {
    where += " AND bc.created_at <= ?";
    params.push(to);
  }

  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const [rows] = await db.query(
    `
    SELECT
      bc.id, bc.booking_id, bc.tour_id, bc.provider_id, bc.duration_days, bc.base_amount,
      bc.platform_fee_rate, bc.platform_fee_amount,
      bc.guide_commission_rate, bc.guide_commission_gross_expected,
      bc.guide_partner_fee_rate, bc.created_at,
      b.booking_code, t.title AS tour_title, p.company_name AS provider_name,
      ge.partner_fee_amount AS guide_partner_fee_amount, ge.status AS guide_status
    FROM booking_commissions bc
    JOIN bookings b   ON b.id = bc.booking_id
    JOIN tours t      ON t.id = bc.tour_id
    JOIN providers p  ON p.id = bc.provider_id
    LEFT JOIN guide_earnings ge ON ge.booking_id = bc.booking_id
    WHERE ${where}
    ORDER BY bc.id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, safeOffset],
  );

  return rows.map((r) => {
    const partnerFee = Number(r.guide_partner_fee_amount || 0);
    const platformFee = Number(r.platform_fee_amount || 0);
    return {
      id: Number(r.id),
      booking_id: Number(r.booking_id),
      booking_code: r.booking_code,
      tour_id: Number(r.tour_id),
      tour_title: r.tour_title,
      provider_id: Number(r.provider_id),
      provider_name: r.provider_name,
      duration_days: Number(r.duration_days || 1),
      base_amount: Number(r.base_amount || 0),
      platform_fee_rate: Number(r.platform_fee_rate || 0),
      platform_fee_amount: platformFee,
      guide_commission_rate: Number(r.guide_commission_rate || 0),
      guide_commission_gross: Number(r.guide_commission_gross_expected || 0),
      guide_partner_fee_rate: Number(r.guide_partner_fee_rate || 0),
      guide_partner_fee_amount: partnerFee,
      total_system_amount: platformFee + (r.guide_status === "guide_confirmed" ? partnerFee : 0),
      guide_status: r.guide_status || "not_completed",
      created_at: r.created_at,
    };
  });
}

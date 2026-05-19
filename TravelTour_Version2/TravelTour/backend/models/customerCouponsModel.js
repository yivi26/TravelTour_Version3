import db from "../config/db.js";

let tableReady = false;

export async function ensureCustomerCouponsTable() {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS customer_coupons (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL,
      provider_id INT UNSIGNED NOT NULL,
      code VARCHAR(40) NOT NULL,
      discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
      source_type VARCHAR(60) NOT NULL DEFAULT 'absence_cancel_compensation',
      source_absence_request_id BIGINT UNSIGNED NULL,
      source_booking_id BIGINT UNSIGNED NULL,
      status ENUM('pending_claim','active','used','expired') NOT NULL DEFAULT 'pending_claim',
      used_booking_id BIGINT UNSIGNED NULL,
      used_at DATETIME NULL,
      claimed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_customer_coupon_code (code),
      KEY idx_customer_coupons_user (user_id, status),
      KEY idx_customer_coupons_provider (provider_id, status),
      KEY idx_customer_coupons_source_booking (source_booking_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tableReady = true;
}

function generateCouponCode(prefix = "BOI") {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

/** Tạo coupon "đền bù" cho 1 khách (1 booking). Status pending_claim → khi khách bấm Đồng ý mới active. */
export async function createCompensationCoupon({
  userId,
  providerId,
  discountPercent,
  absenceRequestId,
  bookingId,
}) {
  await ensureCustomerCouponsTable();

  const uid = Number(userId);
  const pid = Number(providerId);
  const percent = Math.max(0, Math.min(100, Number(discountPercent) || 0));
  if (!uid || !pid || percent <= 0) return null;

  const code = generateCouponCode();

  const [result] = await db.query(
    `
    INSERT INTO customer_coupons
      (user_id, provider_id, code, discount_percent,
       source_type, source_absence_request_id, source_booking_id, status)
    VALUES (?, ?, ?, ?, 'absence_cancel_compensation', ?, ?, 'pending_claim')
    `,
    [
      uid,
      pid,
      code,
      percent,
      absenceRequestId ? Number(absenceRequestId) : null,
      bookingId ? Number(bookingId) : null,
    ],
  );

  return {
    id: result.insertId,
    code,
    discountPercent: percent,
  };
}

export async function claimCustomerCoupon(userId, couponId) {
  await ensureCustomerCouponsTable();
  const [[row]] = await db.query(
    `SELECT id, user_id, status FROM customer_coupons WHERE id = ? LIMIT 1`,
    [Number(couponId)],
  );
  if (!row) throw new Error("Không tìm thấy mã giảm giá");
  if (Number(row.user_id) !== Number(userId)) {
    throw new Error("Mã giảm giá không thuộc về bạn");
  }
  if (row.status === "active") return { id: row.id, alreadyActive: true };
  if (row.status !== "pending_claim") {
    throw new Error("Mã giảm giá không còn hiệu lực");
  }

  await db.query(
    `UPDATE customer_coupons
       SET status = 'active', claimed_at = NOW()
     WHERE id = ?`,
    [row.id],
  );
  return { id: row.id, alreadyActive: false };
}

/** Lấy 1 coupon active dùng được cho tour này (cùng provider của tour). */
export async function getBestActiveCouponForTour(userId, tourId) {
  await ensureCustomerCouponsTable();
  const uid = Number(userId);
  const tid = Number(tourId);
  if (!uid || !tid) return null;

  const [[row]] = await db.query(
    `
    SELECT c.id, c.code, c.discount_percent, c.provider_id
    FROM customer_coupons c
    JOIN tours t ON t.provider_id = c.provider_id
    WHERE c.user_id = ?
      AND c.status = 'active'
      AND t.id = ?
    ORDER BY c.discount_percent DESC, c.created_at ASC
    LIMIT 1
    `,
    [uid, tid],
  );
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    discountPercent: Number(row.discount_percent || 0),
    providerId: row.provider_id,
  };
}

export async function listCustomerCoupons(userId) {
  await ensureCustomerCouponsTable();
  const [rows] = await db.query(
    `
    SELECT c.id, c.code, c.discount_percent, c.status, c.created_at, c.claimed_at,
           p.company_name AS provider_name
    FROM customer_coupons c
    LEFT JOIN providers p ON p.id = c.provider_id
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
    LIMIT 100
    `,
    [Number(userId)],
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    discountPercent: Number(r.discount_percent || 0),
    status: r.status,
    providerName: r.provider_name,
    createdAt: r.created_at,
    claimedAt: r.claimed_at,
  }));
}

/** Áp dụng coupon vào booking — phải gọi trong cùng transaction nếu có. */
export async function applyCouponToBooking({
  userId,
  couponId,
  bookingId,
  tourId,
}) {
  await ensureCustomerCouponsTable();
  const uid = Number(userId);
  const cid = Number(couponId);
  if (!uid || !cid) return null;

  const [[coupon]] = await db.query(
    `SELECT id, user_id, provider_id, discount_percent, status
     FROM customer_coupons
     WHERE id = ? LIMIT 1`,
    [cid],
  );
  if (!coupon) throw new Error("Mã giảm giá không tồn tại");
  if (Number(coupon.user_id) !== uid) {
    throw new Error("Mã giảm giá không thuộc về bạn");
  }
  if (coupon.status !== "active") {
    throw new Error("Mã giảm giá không còn hiệu lực");
  }

  const [[tour]] = await db.query(
    `SELECT provider_id FROM tours WHERE id = ? LIMIT 1`,
    [Number(tourId)],
  );
  if (!tour || Number(tour.provider_id) !== Number(coupon.provider_id)) {
    throw new Error("Mã giảm giá chỉ áp dụng cho tour của nhà cung cấp đã hủy tour trước đó");
  }

  await db.query(
    `UPDATE customer_coupons
       SET status = 'used', used_booking_id = ?, used_at = NOW()
     WHERE id = ?`,
    [Number(bookingId), cid],
  );

  return Number(coupon.discount_percent || 0);
}

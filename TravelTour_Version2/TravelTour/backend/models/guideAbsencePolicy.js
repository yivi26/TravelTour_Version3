import db from "../config/db.js";

export const YEARLY_ABSENCE_LIMIT = 2;
export const ABSENCE_SUSPENSION_MONTHS = 3;
export const ABSENCE_PENALTY_RATE = 0.02;

let penaltiesTableReady = false;
let guideColumnsReady = false;

export async function ensureGuideAbsencePolicySchema() {
  if (!penaltiesTableReady) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS guide_absence_penalties (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        guide_id INT UNSIGNED NOT NULL,
        absence_request_id BIGINT UNSIGNED NOT NULL,
        tour_id INT UNSIGNED NOT NULL,
        tour_value_base DECIMAL(14,2) NOT NULL DEFAULT 0,
        penalty_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0200,
        penalty_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        status ENUM('pending','settled','waived') NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_absence_penalty_request (absence_request_id),
        KEY idx_guide_penalties_guide (guide_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    penaltiesTableReady = true;
  }

  if (!guideColumnsReady) {
    try {
      await db.query(`
        ALTER TABLE guides
        ADD COLUMN absence_suspended_until DATETIME NULL
      `);
    } catch (e) {
      if (e.code !== "ER_DUP_FIELDNAME") throw e;
    }
    guideColumnsReady = true;
  }
}

/** Số lần báo bận trong năm (pending + approved, không tính rejected). */
export async function countGuideAbsencesInYear(guideId, year = null) {
  await ensureGuideAbsencePolicySchema();
  const gid = Number(guideId);
  const y = year ?? new Date().getFullYear();
  const [[row]] = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM guide_absence_requests
    WHERE guide_id = ?
      AND status IN ('pending', 'approved')
      AND YEAR(requested_at) = ?
    `,
    [gid, y],
  );
  return Number(row?.total || 0);
}

export async function isGuideAbsenceSuspended(guideId) {
  await ensureGuideAbsencePolicySchema();
  const gid = Number(guideId);
  const [[row]] = await db.query(
    `
    SELECT absence_suspended_until
    FROM guides
    WHERE id = ?
    LIMIT 1
    `,
    [gid],
  );
  if (!row?.absence_suspended_until) return false;
  return new Date(row.absence_suspended_until).getTime() > Date.now();
}

export async function applyGuideAbsenceSuspension(guideId, months = ABSENCE_SUSPENSION_MONTHS) {
  await ensureGuideAbsencePolicySchema();
  const gid = Number(guideId);
  await db.query(
    `
    UPDATE guides
    SET absence_suspended_until = DATE_ADD(NOW(), INTERVAL ? MONTH)
    WHERE id = ?
    `,
    [months, gid],
  );
}

/** Kiểm tra trước khi HDV gửi báo bận hoặc được gán tour thay. */
export async function assertGuideCanReportOrReceiveAbsence(guideId) {
  const gid = Number(guideId);
  if (!gid) throw new Error("Thiếu thông tin hướng dẫn viên");

  if (await isGuideAbsenceSuspended(gid)) {
    throw new Error(
      "Tài khoản của bạn đang tạm ngưng nhận tour trong 3 tháng do báo bận quá số lần cho phép trong năm.",
    );
  }

  const count = await countGuideAbsencesInYear(gid);
  if (count >= YEARLY_ABSENCE_LIMIT) {
    await applyGuideAbsenceSuspension(gid);
    throw new Error(
      `Bạn đã báo bận ${YEARLY_ABSENCE_LIMIT}/${YEARLY_ABSENCE_LIMIT} lần trong năm. Tài khoản tạm ngưng nhận tour ${ABSENCE_SUSPENSION_MONTHS} tháng.`,
    );
  }
}

export async function getGuideAbsenceYearlyStats(guideId) {
  await ensureGuideAbsencePolicySchema();
  const gid = Number(guideId);
  const year = new Date().getFullYear();
  const count = await countGuideAbsencesInYear(gid, year);
  const suspended = await isGuideAbsenceSuspended(gid);

  const [[row]] = await db.query(
    `SELECT absence_suspended_until FROM guides WHERE id = ? LIMIT 1`,
    [gid],
  );

  let warning = null;
  if (suspended) {
    const until = new Date(row.absence_suspended_until).toLocaleDateString("vi-VN");
    warning = `Thì bạn sẽ bị tạm ngưng nhận tour đến ${until}.`;
  } else if (count > 0) {
    warning = `Bạn đã báo bận ${count}/${YEARLY_ABSENCE_LIMIT} · Nếu vượt quá ${YEARLY_ABSENCE_LIMIT} lần/năm Thì bạn sẽ bị tạm ngưng nhận tour trong vòng ${ABSENCE_SUSPENSION_MONTHS} tháng.`;
  }

  return {
    year,
    count,
    limit: YEARLY_ABSENCE_LIMIT,
    isSuspended: suspended,
    suspendedUntil: row?.absence_suspended_until || null,
    warning,
  };
}

/** Tổng giá trị booking đã xác nhận của tour (cơ sở tính phạt 2%). */
export async function computeTourValueForPenalty(tourId) {
  const tid = Number(tourId);
  const [[sumRow]] = await db.query(
    `
    SELECT COALESCE(SUM(final_price), 0) AS total
    FROM bookings
    WHERE tour_id = ?
      AND status IN ('confirmed', 'paid', 'in_progress')
    `,
    [tid],
  );
  let total = Number(sumRow?.total || 0);
  if (total > 0) return total;

  const [[tourRow]] = await db.query(
    `SELECT final_price, max_capacity FROM tours WHERE id = ? LIMIT 1`,
    [tid],
  );
  const price = Number(tourRow?.final_price || 0);
  const cap = Math.max(1, Number(tourRow?.max_capacity || 1));
  return price * cap;
}

export async function recordAbsencePenalty({
  guideId,
  absenceRequestId,
  tourId,
}) {
  await ensureGuideAbsencePolicySchema();
  const tourValue = await computeTourValueForPenalty(tourId);
  const penaltyAmount = Math.round(tourValue * ABSENCE_PENALTY_RATE);

  await db.query(
    `
    INSERT INTO guide_absence_penalties
      (guide_id, absence_request_id, tour_id, tour_value_base, penalty_rate, penalty_amount, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
    ON DUPLICATE KEY UPDATE
      tour_value_base = VALUES(tour_value_base),
      penalty_amount = VALUES(penalty_amount)
    `,
    [
      guideId,
      absenceRequestId,
      tourId,
      tourValue,
      ABSENCE_PENALTY_RATE,
      penaltyAmount,
    ],
  );

  return { tourValue, penaltyAmount };
}

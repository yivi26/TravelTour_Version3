import db from "../config/db.js";
import {
  assignGuideToTour,
  unassignGuideFromTour,
} from "./providerModel.js";
import {
  createGuideTourAssignedNotification,
  createGuideAbsenceOutcomeNotification,
} from "./guideNotificationsModel.js";
import {
  assertGuideCanReportOrReceiveAbsence,
  recordAbsencePenalty,
  getGuideAbsenceYearlyStats,
} from "./guideAbsencePolicy.js";

export { getGuideAbsenceYearlyStats };
import {
  notifyTourCustomers,
  createCustomerNotification,
} from "./customerNotificationsModel.js";
import { createCompensationCoupon } from "./customerCouponsModel.js";
import { logTourGuideHistory } from "./tourGuideHistoryModel.js";
import {
  computeAbsenceUrgency,
  ABSENCE_URGENCY_ORDER_SQL,
} from "../utils/absenceUrgency.js";

let tableReady = false;

export async function ensureGuideAbsenceTable() {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS guide_absence_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      guide_id INT UNSIGNED NOT NULL,
      tour_id INT UNSIGNED NOT NULL,
      provider_id INT UNSIGNED NOT NULL,
      reason TEXT NOT NULL,
      evidence_url VARCHAR(500) NULL,
      urgency ENUM('low','medium','urgent') NOT NULL DEFAULT 'medium',
      status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
      requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME NULL,
      resolved_by_user_id INT UNSIGNED NULL,
      replacement_guide_id INT UNSIGNED NULL,
      provider_note TEXT NULL,
      PRIMARY KEY (id),
      KEY idx_guide_absence_guide (guide_id, status),
      KEY idx_guide_absence_provider (provider_id, status),
      KEY idx_guide_absence_tour (tour_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tableReady = true;
}

/** Đồng bộ urgency DB cho yêu cầu pending khi tour đổi ngày khởi hành. */
export async function refreshPendingAbsenceUrgencyForTour(tourId) {
  const tid = Number(tourId);
  if (!tid) return;
  await ensureGuideAbsenceTable();
  const [[tour]] = await db.query(
    `SELECT start_date FROM tours WHERE id = ? LIMIT 1`,
    [tid],
  );
  if (!tour) return;
  const urgency = computeAbsenceUrgency(tour.start_date);
  await db.query(
    `
    UPDATE guide_absence_requests
    SET urgency = ?
    WHERE tour_id = ? AND status = 'pending'
    `,
    [urgency, tid],
  );
}

export async function createGuideAbsenceRequest({
  guideId,
  tourId,
  reason,
  evidenceUrl,
}) {
  const gid = Number(guideId);
  const tid = Number(tourId);
  const trimmedReason = String(reason || "").trim();
  if (!gid || !tid) {
    throw new Error("Thiếu tour hoặc HDV");
  }
  if (trimmedReason.length < 10) {
    throw new Error("Vui lòng mô tả lý do ít nhất 10 ký tự");
  }

  await assertGuideCanReportOrReceiveAbsence(gid);

  await ensureGuideAbsenceTable();

  const [[tourRow]] = await db.query(
    `
    SELECT id, provider_id, start_date, guide_id, guide_completed_at
    FROM tours
    WHERE id = ?
    LIMIT 1
    `,
    [tid],
  );

  if (!tourRow) throw new Error("Không tìm thấy tour");
  if (Number(tourRow.guide_id) !== gid) {
    throw new Error("Bạn không phải HDV phụ trách tour này");
  }
  if (tourRow.guide_completed_at) {
    throw new Error("Tour đã hoàn thành, không thể gửi yêu cầu báo bận");
  }

  const [[existing]] = await db.query(
    `
    SELECT id FROM guide_absence_requests
    WHERE guide_id = ? AND tour_id = ? AND status = 'pending'
    LIMIT 1
    `,
    [gid, tid],
  );
  if (existing) {
    throw new Error("Đã có yêu cầu báo bận đang chờ xử lý cho tour này");
  }

  const urgency = "urgent";

  const [result] = await db.query(
    `
    INSERT INTO guide_absence_requests
      (guide_id, tour_id, provider_id, reason, evidence_url, urgency, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `,
    [
      gid,
      tid,
      Number(tourRow.provider_id),
      trimmedReason,
      evidenceUrl ? String(evidenceUrl).trim() : null,
      urgency,
    ],
  );

  return {
    id: result.insertId,
    urgency,
  };
}

const BASE_SELECT = `
  SELECT
    r.id,
    r.guide_id,
    r.tour_id,
    r.provider_id,
    r.reason,
    r.evidence_url,
    r.urgency,
    r.status,
    r.requested_at,
    r.resolved_at,
    r.replacement_guide_id,
    r.provider_note,
    t.title AS tour_title,
    t.location AS tour_location,
    DATE_FORMAT(t.start_date, '%Y-%m-%d') AS tour_start_date,
    DATE_FORMAT(t.end_date, '%Y-%m-%d') AS tour_end_date,
    t.guide_id AS current_guide_id,
    ug.full_name AS guide_full_name,
    ug.email AS guide_email,
    ug.phone AS guide_phone,
    urep.full_name AS replacement_full_name
  FROM guide_absence_requests r
  JOIN tours t ON t.id = r.tour_id
  LEFT JOIN guides g ON g.id = r.guide_id
  LEFT JOIN users ug ON ug.id = g.user_id
  LEFT JOIN guides grep ON grep.id = r.replacement_guide_id
  LEFT JOIN users urep ON urep.id = grep.user_id
`;

function mapRow(row) {
  const urgency =
    row.status === "pending" && row.tour_start_date
      ? computeAbsenceUrgency(row.tour_start_date)
      : row.urgency;

  return {
    id: row.id,
    guideId: row.guide_id,
    tourId: row.tour_id,
    providerId: row.provider_id,
    reason: row.reason,
    evidenceUrl: row.evidence_url,
    urgency,
    status: row.status,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at,
    replacementGuideId: row.replacement_guide_id,
    providerNote: row.provider_note,
    tour: {
      id: row.tour_id,
      title: row.tour_title,
      location: row.tour_location,
      startDate: row.tour_start_date,
      endDate: row.tour_end_date,
      currentGuideId: row.current_guide_id,
    },
    guide: {
      id: row.guide_id,
      fullName: row.guide_full_name,
      email: row.guide_email,
      phone: row.guide_phone,
    },
    replacementGuide: row.replacement_guide_id
      ? { id: row.replacement_guide_id, fullName: row.replacement_full_name }
      : null,
  };
}

export async function listGuideAbsenceRequestsForGuide(guideId) {
  await ensureGuideAbsenceTable();
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE r.guide_id = ?
     ORDER BY r.requested_at DESC, r.id DESC
     LIMIT 50`,
    [guideId],
  );
  return rows.map(mapRow);
}

export async function listGuideAbsenceRequestsForProvider(
  providerId,
  { status, limit = 50 } = {},
) {
  await ensureGuideAbsenceTable();
  const params = [providerId];
  let where = "WHERE r.provider_id = ?";
  if (status) {
    where += " AND r.status = ?";
    params.push(status);
  }
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  params.push(safeLimit);

  const [rows] = await db.query(
    `${BASE_SELECT}
     ${where}
     ORDER BY
       CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
       ${ABSENCE_URGENCY_ORDER_SQL},
       t.start_date ASC,
       r.requested_at DESC,
       r.id DESC
     LIMIT ?`,
    params,
  );
  return rows.map(mapRow);
}

async function getRequest(providerId, requestId) {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE r.id = ? AND r.provider_id = ?
     LIMIT 1`,
    [requestId, providerId],
  );
  return rows.length ? mapRow(rows[0]) : null;
}

export async function approveGuideAbsenceAndReassign(
  providerId,
  requestId,
  { replacementGuideId, note, resolvedByUserId },
) {
  await ensureGuideAbsenceTable();
  const request = await getRequest(providerId, requestId);
  if (!request) throw new Error("Không tìm thấy yêu cầu");
  if (request.status !== "pending") {
    throw new Error("Yêu cầu này đã được xử lý trước đó");
  }

  const repId = Number(replacementGuideId);
  if (!repId) {
    throw new Error("Vui lòng chọn HDV thay thế");
  }
  if (repId === Number(request.guideId)) {
    throw new Error("HDV thay thế phải khác HDV hiện tại");
  }

  // assignGuideToTour đã có sẵn validation (provider sở hữu, không trùng lịch, đủ ngày rảnh).
  await assignGuideToTour(providerId, request.tourId, repId);

  await db.query(
    `
    UPDATE guide_absence_requests
    SET status = 'approved',
        resolved_at = NOW(),
        resolved_by_user_id = ?,
        replacement_guide_id = ?,
        provider_note = ?
    WHERE id = ? AND provider_id = ?
    `,
    [
      resolvedByUserId || null,
      repId,
      note ? String(note).trim() : null,
      request.id,
      providerId,
    ],
  );

  try {
    await createGuideTourAssignedNotification(repId, request.tourId, providerId);
  } catch (err) {
    console.error("approveGuideAbsence assign notification:", err);
  }

  try {
    await createGuideAbsenceOutcomeNotification(
      request.guideId,
      request.tourId,
      providerId,
      "approved_replacement",
    );
  } catch (err) {
    console.error("approveGuideAbsence outcome notification:", err);
  }

  return await getRequest(providerId, requestId);
}

/**
 * Provider không tìm được HDV thay → huỷ tour:
 * - Đánh dấu absence_request = approved (resolved) nhưng không có replacement.
 * - Huỷ toàn bộ booking đang hoạt động của tour (pending → in_progress) với lý do system.
 * - Set tour status = 'paused' (provider có thể tự gỡ sau).
 * - Notify mọi khách bị ảnh hưởng.
 */
export async function cancelTourForAbsence(
  providerId,
  requestId,
  { note, resolvedByUserId, customerDiscountPercent = 0 },
) {
  await ensureGuideAbsenceTable();
  const request = await getRequest(providerId, requestId);
  if (!request) throw new Error("Không tìm thấy yêu cầu");
  if (request.status !== "pending") {
    throw new Error("Yêu cầu này đã được xử lý trước đó");
  }

  const tourId = Number(request.tourId);
  const tourTitle = request.tour?.title || "Tour";
  const discountPercent = Math.max(0, Math.min(100, Number(customerDiscountPercent) || 0));

  const reason = String(note || "Nhà cung cấp huỷ tour do không có HDV thay thế").trim();

  const [activeBookings] = await db.query(
    `
    SELECT id, user_id
    FROM bookings
    WHERE tour_id = ?
      AND status IN ('pending', 'pending_payment', 'confirmed', 'paid', 'in_progress')
    `,
    [tourId],
  );

  await db.query(
    `
    UPDATE bookings
    SET status = 'cancelled',
        cancelled_reason = ?,
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE tour_id = ?
      AND status IN ('pending', 'pending_payment', 'confirmed', 'paid', 'in_progress')
    `,
    [`[Tour bị huỷ] ${reason}`, tourId],
  );

  try {
    await db.query(
      `UPDATE tours SET status = 'paused', guide_id = NULL WHERE id = ? AND provider_id = ?`,
      [tourId, providerId],
    );
  } catch (uErr) {
    console.warn("cancelTourForAbsence tour status:", uErr.message);
  }

  await db.query(
    `
    UPDATE guide_absence_requests
    SET status = 'approved',
        resolved_at = NOW(),
        resolved_by_user_id = ?,
        replacement_guide_id = NULL,
        provider_note = ?
    WHERE id = ? AND provider_id = ?
    `,
    [
      resolvedByUserId || null,
      reason,
      request.id,
      providerId,
    ],
  );

  try {
    await logTourGuideHistory({
      tourId,
      guideId: null,
      previousGuideId: request.guideId,
      action: "unassigned",
      reason: `Huỷ tour do thiếu HDV: ${reason}`,
      byUserId: resolvedByUserId,
    });
  } catch (h) {
    console.warn("logTourGuideHistory cancel:", h.message);
  }

  const notifyTitle = "Tour của bạn đã bị huỷ";
  const notifyBody =
    "Tour của bạn đã được hủy bởi hệ thống vì một sự cố đột xuất. Chúng tôi chân thành xin lỗi bạn vì sự bất tiện này, chúng tôi sẽ hoàn lại đúng số tiền và gửi tặng bạn 1 mã giảm giá vô thời hạn áp dụng cho tất cả các tour của chúng tôi.";

  for (const booking of activeBookings) {
    let couponId = null;
    if (discountPercent > 0) {
      try {
        const coupon = await createCompensationCoupon({
          userId: booking.user_id,
          providerId,
          discountPercent,
          absenceRequestId: request.id,
          bookingId: booking.id,
        });
        couponId = coupon?.id || null;
      } catch (couponErr) {
        console.warn("createCompensationCoupon:", couponErr.message);
      }
    }

    try {
      await createCustomerNotification({
        userId: booking.user_id,
        bookingId: booking.id,
        tourId,
        type: "tour_cancelled_with_coupon",
        title: notifyTitle,
        body: notifyBody,
        couponId,
      });
    } catch (nErr) {
      console.warn("notify cancel customer:", nErr.message);
    }
  }

  try {
    await createGuideAbsenceOutcomeNotification(
      request.guideId,
      tourId,
      providerId,
      "no_replacement",
    );
  } catch (nErr) {
    console.warn("notify guide absence no replacement:", nErr.message);
  }

  try {
    await recordAbsencePenalty({
      guideId: request.guideId,
      absenceRequestId: request.id,
      tourId,
    });
  } catch (penErr) {
    console.warn("recordAbsencePenalty:", penErr.message);
  }

  return await getRequest(providerId, requestId);
}

export async function rejectGuideAbsence(
  providerId,
  requestId,
  { note, resolvedByUserId },
) {
  await ensureGuideAbsenceTable();
  const request = await getRequest(providerId, requestId);
  if (!request) throw new Error("Không tìm thấy yêu cầu");
  if (request.status !== "pending") {
    throw new Error("Yêu cầu này đã được xử lý trước đó");
  }

  await db.query(
    `
    UPDATE guide_absence_requests
    SET status = 'rejected',
        resolved_at = NOW(),
        resolved_by_user_id = ?,
        provider_note = ?
    WHERE id = ? AND provider_id = ?
    `,
    [
      resolvedByUserId || null,
      note ? String(note).trim() : null,
      request.id,
      providerId,
    ],
  );

  return await getRequest(providerId, requestId);
}

export async function countPendingAbsenceForProvider(providerId) {
  await ensureGuideAbsenceTable();
  const [[row]] = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM guide_absence_requests
    WHERE provider_id = ? AND status = 'pending'
    `,
    [providerId],
  );
  return Number(row?.total || 0);
}

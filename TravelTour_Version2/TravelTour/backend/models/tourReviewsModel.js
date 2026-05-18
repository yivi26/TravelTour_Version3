import db from "../config/db.js";
import { toNumber } from "../utils/modelHelpers.js";
import { getAllSettings } from "./settingsModel.js";

const ELIGIBLE_BOOKING_STATUSES = ["completed"];

/** Khách đã book tour và booking ở trạng thái hoàn thành. */
export async function shouldShowTourReviewsSection(userId, tourId, bookingId = null) {
  const uid = toNumber(userId, 0);
  const tid = toNumber(tourId, 0);
  if (!uid || !tid) return false;

  const bid = bookingId != null ? toNumber(bookingId, 0) : 0;
  let sql = `
    SELECT 1 AS ok
    FROM bookings b
    WHERE b.user_id = ? AND b.tour_id = ? AND b.status = 'completed'
  `;
  const params = [uid, tid];
  if (bid) {
    sql += ` AND b.id = ?`;
    params.push(bid);
  }
  sql += ` ORDER BY b.id DESC LIMIT 1`;

  const [[row]] = await db.query(sql, params);
  return !!row;
}

function parseGuidePhotosMeta(photos) {
  if (!photos) return { guideTags: [], guideComment: "" };
  try {
    const p = typeof photos === "string" ? JSON.parse(photos) : photos;
    return {
      guideTags: Array.isArray(p?.guide_tags) ? p.guide_tags : [],
      guideComment: String(p?.guide_comment || "").trim(),
    };
  } catch {
    return { guideTags: [], guideComment: "" };
  }
}

/** Ngữ cảnh đánh giá tour + HDV cho khách đã hoàn thành chuyến đi. */
export async function getCustomerTourReviewContext(userId, tourId, bookingId = null) {
  const uid = toNumber(userId, 0);
  const tid = toNumber(tourId, 0);
  const bidPref = bookingId != null ? toNumber(bookingId, 0) : 0;
  if (!uid || !tid) {
    return { showSections: false, reason: "not_authenticated" };
  }

  let bookingSql = `
    SELECT b.id, b.status
    FROM bookings b
    WHERE b.user_id = ? AND b.tour_id = ? AND b.status = 'completed'
  `;
  const bookingParams = [uid, tid];
  if (bidPref) {
    bookingSql += ` AND b.id = ?`;
    bookingParams.push(bidPref);
  }
  bookingSql += ` ORDER BY b.id DESC LIMIT 1`;

  const [[booking]] = await db.query(bookingSql, bookingParams);
  if (!booking) {
    return { showSections: false, reason: "no_completed_booking" };
  }

  const completedBookingId = toNumber(booking.id);

  const [[guideRow]] = await db.query(
    `
    SELECT
      g.id AS guide_id,
      u.full_name AS guide_name,
      u.avatar_url AS guide_avatar_url,
      g.specialty,
      g.languages,
      g.experience_years,
      g.rating_avg,
      g.rating_count
    FROM tours t
    INNER JOIN guides g ON g.id = t.guide_id
    INNER JOIN users u ON u.id = g.user_id
    WHERE t.id = ?
    LIMIT 1
    `,
    [tid]
  );

  const [[reviewRow]] = await db.query(
    `
    SELECT id, rating, comment, guide_rating, photos, status, created_at
    FROM reviews
    WHERE booking_id = ?
    LIMIT 1
    `,
    [completedBookingId]
  );

  const guideMeta = parseGuidePhotosMeta(reviewRow?.photos);
  const hasTourReview = !!reviewRow;
  const hasGuideReview =
    reviewRow != null && reviewRow.guide_rating != null && toNumber(reviewRow.guide_rating) > 0;

  return {
    showSections: true,
    bookingId: completedBookingId,
    showGuideSection: !!guideRow,
    guide: guideRow
      ? {
          id: toNumber(guideRow.guide_id),
          name: guideRow.guide_name || "Hướng dẫn viên",
          avatarUrl: guideRow.guide_avatar_url || "",
          specialty: guideRow.specialty || "",
          languages: guideRow.languages || "",
          experienceYears: toNumber(guideRow.experience_years),
          ratingAvg: Number(guideRow.rating_avg || 0),
          ratingCount: toNumber(guideRow.rating_count),
        }
      : null,
    review: reviewRow
      ? {
          id: toNumber(reviewRow.id),
          tourRating: toNumber(reviewRow.rating),
          comment: reviewRow.comment || "",
          guideRating: reviewRow.guide_rating != null ? toNumber(reviewRow.guide_rating) : null,
          guideTags: guideMeta.guideTags,
          guideComment: guideMeta.guideComment,
          status: String(reviewRow.status || "").toLowerCase(),
          dateText: formatDdMmYyyy(reviewRow.created_at),
        }
      : null,
    canPostTourReview: !hasTourReview,
    canPostGuideReview: hasTourReview && !hasGuideReview && !!guideRow,
    guideReviewBlockedReason: !guideRow
      ? "Tour này chưa có hướng dẫn viên được phân công."
      : !hasTourReview
        ? "Vui lòng gửi đánh giá tour trước khi đánh giá hướng dẫn viên."
        : hasGuideReview
          ? "Bạn đã đánh giá hướng dẫn viên cho chuyến đi này."
          : null,
  };
}

export async function submitGuideReview({
  userId,
  tourId,
  bookingId,
  guideRating,
  guideComment,
  guideTags = [],
}) {
  const uid = toNumber(userId, 0);
  const tid = toNumber(tourId, 0);
  const bid = toNumber(bookingId, 0);
  const stars = toNumber(guideRating, 0);
  const text = String(guideComment ?? "").trim();
  const tags = Array.isArray(guideTags)
    ? guideTags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8)
    : [];

  if (!uid || !tid || !bid) {
    const err = new Error("Thiếu thông tin đánh giá");
    err.statusCode = 400;
    throw err;
  }
  if (stars < 1 || stars > 5) {
    const err = new Error("Điểm đánh giá HDV từ 1 đến 5 sao");
    err.statusCode = 400;
    throw err;
  }
  if (text.length > 500) {
    const err = new Error("Nội dung đánh giá HDV tối đa 500 ký tự");
    err.statusCode = 400;
    throw err;
  }

  const [[booking]] = await db.query(
    `
    SELECT b.id
    FROM bookings b
    WHERE b.id = ? AND b.user_id = ? AND b.tour_id = ? AND b.status = 'completed'
    LIMIT 1
    `,
    [bid, uid, tid]
  );
  if (!booking) {
    const err = new Error("Chỉ đánh giá HDV khi booking đã hoàn thành");
    err.statusCode = 403;
    throw err;
  }

  const [[review]] = await db.query(
    `SELECT id, guide_rating FROM reviews WHERE booking_id = ? AND user_id = ? LIMIT 1`,
    [bid, uid]
  );
  if (!review) {
    const err = new Error("Vui lòng gửi đánh giá tour trước khi đánh giá hướng dẫn viên");
    err.statusCode = 403;
    throw err;
  }
  if (review.guide_rating != null && toNumber(review.guide_rating) > 0) {
    const err = new Error("Bạn đã đánh giá hướng dẫn viên cho chuyến đi này");
    err.statusCode = 409;
    throw err;
  }

  const photosPayload = JSON.stringify({
    guide_tags: tags,
    guide_comment: text,
  });

  await db.query(
    `UPDATE reviews SET guide_rating = ?, photos = ?, updated_at = NOW() WHERE id = ?`,
    [stars, photosPayload, review.id]
  );

  return { id: toNumber(review.id), guideRating: stars, bookingId: bid };
}

function formatDdMmYyyy(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export async function getTourReviewSummaryAndList(tourId, { limit = 50 } = {}) {
  const tid = toNumber(tourId, 0);
  if (!tid) {
    const err = new Error("ID tour không hợp lệ");
    err.statusCode = 400;
    throw err;
  }

  const [[exists]] = await db.query(`SELECT id FROM tours WHERE id = ? LIMIT 1`, [tid]);
  if (!exists) {
    const err = new Error("Không tìm thấy tour");
    err.statusCode = 404;
    throw err;
  }

  const [[agg]] = await db.query(
    `
    SELECT
      COUNT(*) AS total,
      COALESCE(AVG(rating), 0) AS avg_rating
    FROM reviews
    WHERE tour_id = ? AND status = 'approved'
    `,
    [tid]
  );

  const total = toNumber(agg?.total);
  const avgRating = total > 0 ? Math.round(Number(agg.avg_rating) * 10) / 10 : 0;

  const [distRows] = await db.query(
    `
    SELECT rating, COUNT(*) AS cnt
    FROM reviews
    WHERE tour_id = ? AND status = 'approved'
    GROUP BY rating
    `,
    [tid]
  );

  const distMap = Object.fromEntries((distRows || []).map((r) => [toNumber(r.rating), toNumber(r.cnt)]));
  const distribution = [5, 4, 3, 2, 1].map((stars) => {
    const count = distMap[stars] || 0;
    const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
    return { stars, count, percent: pct };
  });

  const safeLimit = Math.min(100, Math.max(1, toNumber(limit, 50)));
  const [reviewRows] = await db.query(
    `
    SELECT
      r.id,
      r.rating,
      r.comment,
      r.created_at,
      u.full_name,
      u.avatar_url
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    WHERE r.tour_id = ? AND r.status = 'approved'
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ?
    `,
    [tid, safeLimit]
  );

  const reviews = (reviewRows || []).map((r) => ({
    id: toNumber(r.id),
    rating: toNumber(r.rating),
    comment: r.comment || "",
    dateText: formatDdMmYyyy(r.created_at),
    userName: r.full_name || "Khách hàng",
    userAvatarUrl: r.avatar_url || "",
  }));

  return {
    tourId: tid,
    summary: {
      average: avgRating,
      total,
      distribution,
    },
    reviews,
  };
}

export async function findEligibleBookingForReview(userId, tourId, { bookingId = null } = {}) {
  const uid = toNumber(userId, 0);
  const tid = toNumber(tourId, 0);
  const bid = bookingId != null ? toNumber(bookingId, 0) : 0;
  if (!uid || !tid) return null;

  const placeholders = ELIGIBLE_BOOKING_STATUSES.map(() => "?").join(", ");
  const bookingFilter = bid ? " AND b.id = ? " : "";
  const params = [uid, tid, ...ELIGIBLE_BOOKING_STATUSES];
  if (bid) params.push(bid);

  const [rows] = await db.query(
    `
    SELECT b.id
    FROM bookings b
    INNER JOIN tour_schedules ts ON ts.id = b.schedule_id
    INNER JOIN tours t ON t.id = b.tour_id
    WHERE b.user_id = ?
      AND b.tour_id = ?
      AND b.status IN (${placeholders})
      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id)
      ${bookingFilter}
    ORDER BY (b.status = 'completed') DESC, b.id DESC
    LIMIT 1
    `,
    params
  );

  if (!rows?.length) return null;
  return toNumber(rows[0].id);
}

/** Lý do không được đánh giá (khi mở từ booking cụ thể hoặc cần thông báo rõ). */
export async function getCustomerReviewBlockReason(userId, tourId, bookingId = null) {
  const uid = toNumber(userId, 0);
  const tid = toNumber(tourId, 0);
  const bid = bookingId != null ? toNumber(bookingId, 0) : 0;
  if (!uid || !tid) {
    return "Bạn cần đăng nhập tài khoản khách hàng để gửi đánh giá.";
  }

  if (bid) {
    const [[row]] = await db.query(
      `
      SELECT
        b.id,
        b.status,
        ts.departure_date,
        t.duration_days,
        (SELECT 1 FROM reviews r WHERE r.booking_id = b.id LIMIT 1) AS has_review
      FROM bookings b
      INNER JOIN tour_schedules ts ON ts.id = b.schedule_id
      INNER JOIN tours t ON t.id = b.tour_id
      WHERE b.id = ? AND b.user_id = ? AND b.tour_id = ?
      LIMIT 1
      `,
      [bid, uid, tid]
    );

    if (!row) {
      return "Không tìm thấy booking tương ứng với tour này.";
    }

    const st = String(row.status || "").toLowerCase();
    if (toNumber(row.has_review)) {
      return "Booking này đã được đánh giá.";
    }
    if (st !== "completed") {
      return "Chỉ có thể đánh giá khi booking đã hoàn thành.";
    }

    return null;
  }

  const eligible = await findEligibleBookingForReview(uid, tid);
  if (eligible) return null;

  const pendingCount = await countPendingReviewsOnTour(uid, tid);
  if (pendingCount > 0) {
    return "Bạn đang có đánh giá chờ admin duyệt cho tour này.";
  }

  return "Bạn cần có booking đã hoàn thành và chưa đánh giá để gửi đánh giá.";
}

export async function countPendingReviewsOnTour(userId, tourId) {
  const uid = toNumber(userId, 0);
  const tid = toNumber(tourId, 0);
  if (!uid || !tid) return 0;
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM reviews WHERE user_id = ? AND tour_id = ? AND status = 'pending'`,
    [uid, tid]
  );
  return toNumber(row?.c);
}

export async function getMyLatestReviewOnTour(userId, tourId) {
  const uid = toNumber(userId, 0);
  const tid = toNumber(tourId, 0);
  if (!uid || !tid) return null;

  const [rows] = await db.query(
    `
    SELECT id, rating, comment, status, created_at
    FROM reviews
    WHERE user_id = ? AND tour_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [uid, tid]
  );

  if (!rows?.length) return null;
  const r = rows[0];
  const st = String(r.status || "").toLowerCase();
  return {
    id: toNumber(r.id),
    rating: toNumber(r.rating),
    comment: r.comment || "",
    status: st,
    dateText: formatDdMmYyyy(r.created_at),
  };
}

export async function createTourReview({ userId, tourId, rating, comment, bookingId: preferredBookingId = null }) {
  const uid = toNumber(userId, 0);
  const tid = toNumber(tourId, 0);
  const stars = toNumber(rating, 0);
  const text = String(comment ?? "").trim();

  if (!uid || !tid) {
    const err = new Error("Thiếu thông tin người dùng hoặc tour");
    err.statusCode = 400;
    throw err;
  }
  if (stars < 1 || stars > 5) {
    const err = new Error("Điểm đánh giá từ 1 đến 5 sao");
    err.statusCode = 400;
    throw err;
  }
  if (text.length < 10) {
    const err = new Error("Nội dung đánh giá ít nhất 10 ký tự");
    err.statusCode = 400;
    throw err;
  }
  if (text.length > 2000) {
    const err = new Error("Nội dung đánh giá tối đa 2000 ký tự");
    err.statusCode = 400;
    throw err;
  }

  const pendingCount = await countPendingReviewsOnTour(uid, tid);
  if (pendingCount > 0) {
    const err = new Error("Bạn đang có đánh giá chờ duyệt cho tour này");
    err.statusCode = 409;
    throw err;
  }

  const prefBid = preferredBookingId != null ? toNumber(preferredBookingId, 0) : 0;
  const bookingId = await findEligibleBookingForReview(uid, tid, {
    bookingId: prefBid || null,
  });
  if (!bookingId) {
    const reason = await getCustomerReviewBlockReason(uid, tid, prefBid || null);
    const err = new Error(
      reason || "Bạn cần có booking đã hoàn thành và chưa đánh giá"
    );
    err.statusCode = 403;
    throw err;
  }

  const [[dup]] = await db.query(
    `SELECT id FROM reviews WHERE booking_id = ? LIMIT 1`,
    [bookingId]
  );
  if (dup) {
    const err = new Error("Booking này đã được đánh giá");
    err.statusCode = 409;
    throw err;
  }

  const settings = await getAllSettings();
  const autoApprove = settings.auto_approve_reviews !== false;
  const status = autoApprove ? "approved" : "pending";

  const [result] = await db.query(
    `
    INSERT INTO reviews (user_id, tour_id, booking_id, rating, title, comment, status, created_at)
    VALUES (?, ?, ?, ?, '', ?, ?, NOW())
    `,
    [uid, tid, bookingId, stars, text, status]
  );

  return { id: toNumber(result.insertId), status, bookingId, autoApproved: autoApprove };
}

export async function deleteOwnTourReview(userId, reviewId) {
  const uid = toNumber(userId, 0);
  const rid = toNumber(reviewId, 0);
  if (!uid || !rid) {
    const err = new Error("Thông tin không hợp lệ");
    err.statusCode = 400;
    throw err;
  }

  const [rows] = await db.query(
    `SELECT id, status FROM reviews WHERE id = ? AND user_id = ? LIMIT 1`,
    [rid, uid]
  );
  if (!rows?.length) {
    const err = new Error("Không tìm thấy đánh giá");
    err.statusCode = 404;
    throw err;
  }
  const st = String(rows[0].status || "").toLowerCase();
  if (st !== "pending") {
    const err = new Error("Chỉ có thể xóa đánh giá đang chờ duyệt");
    err.statusCode = 403;
    throw err;
  }

  await db.query(`DELETE FROM reviews WHERE id = ?`, [rid]);
  return { id: rid };
}

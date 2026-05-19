import db from "../config/db.js";
import { BOOKED_PARTICIPANTS_JOIN } from "./providerModel.js";
import { buildTourDeparturePayload } from "../utils/tourDepartureRules.js";

function parseCommaList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLanguagesField(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      const pipeParts = trimmed.split("|").map((s) => s.trim());
      if (pipeParts.length >= 2) {
        return { name: pipeParts[0], level: pipeParts[1] };
      }
      const colonParts = trimmed.split(":").map((s) => s.trim());
      if (colonParts.length >= 2) {
        return { name: colonParts[0], level: colonParts[1] };
      }
      return { name: trimmed, level: "Chưa cập nhật" };
    })
    .filter(Boolean);
}

function serializeLanguages(languages) {
  if (!Array.isArray(languages) || languages.length === 0) return null;
  const parts = languages
    .map((item) => {
      if (typeof item === "string") {
        const text = item.trim();
        return text || null;
      }
      const name = String(item?.name || "").trim();
      const level = String(item?.level || "").trim();
      if (!name) return null;
      return level ? `${name}|${level}` : name;
    })
    .filter(Boolean);
  return parts.length ? parts.join(",") : null;
}

/** Điểm HDV từ reviews.guide_rating (cột guides.rating_* thường không được cập nhật khi khách đánh giá). */
export async function getGuideRatingFromReviews(guideId) {
  const gid = Number(guideId);
  if (!gid) return { rating_avg: 0, rating_count: 0 };

  const [[row]] = await db.query(
    `
    SELECT
      COUNT(*) AS rating_count,
      COALESCE(AVG(r.guide_rating), 0) AS rating_avg
    FROM reviews r
    INNER JOIN tours t ON t.id = r.tour_id
    WHERE t.guide_id = ?
      AND r.guide_rating IS NOT NULL
      AND r.guide_rating > 0
    `,
    [gid]
  );

  const rating_count = Number(row?.rating_count || 0);
  const rating_avg =
    rating_count > 0 ? Math.round(Number(row.rating_avg) * 10) / 10 : 0;

  return { rating_avg, rating_count };
}

export async function refreshGuideRatingAggregate(guideId) {
  const { rating_avg, rating_count } = await getGuideRatingFromReviews(guideId);
  const gid = Number(guideId);
  if (!gid) return { rating_avg, rating_count };

  await db.query(
    `UPDATE guides SET rating_avg = ?, rating_count = ? WHERE id = ?`,
    [rating_avg, rating_count, gid]
  );

  return { rating_avg, rating_count };
}

export async function getGuideDashboardData(guideId) {
  const [[activeToursRow]] = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM tours
    WHERE guide_id = ?
      AND status IN ('active', 'paused', 'full')
      AND guide_completed_at IS NULL
    `,
    [guideId]
  );

  const [[completedToursRow]] = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM tours
    WHERE guide_id = ?
      AND guide_completed_at IS NOT NULL
    `,
    [guideId]
  );

  const [[customersRow]] = await db.query(
    `
    SELECT COALESCE(SUM(max_capacity), 0) AS total
    FROM tours
    WHERE guide_id = ?
      AND status IN ('active', 'paused', 'full', 'archived')
    `,
    [guideId]
  );

  const [[incomeRow]] = await db.query(
    `
    SELECT COALESCE(SUM(COALESCE(final_price, 0)), 0) AS total
    FROM tours
    WHERE guide_id = ?
      AND start_date IS NOT NULL
      AND MONTH(start_date) = MONTH(CURDATE())
      AND YEAR(start_date) = YEAR(CURDATE())
      AND status = 'archived'
    `,
    [guideId]
  );

  const [upcomingTours] = await db.query(
    `
    SELECT
      id,
      title,
      start_date,
      max_capacity,
      status,
      location
    FROM tours
    WHERE guide_id = ?
      AND start_date IS NOT NULL
      AND start_date >= CURDATE()
      AND status IN ('active', 'paused', 'full')
    ORDER BY start_date ASC
    LIMIT 10
    `,
    [guideId]
  );

  return {
    stats: {
      activeTours: Number(activeToursRow?.total || 0),
      totalCustomers: Number(customersRow?.total || 0),
      monthlyIncome: Number(incomeRow?.total || 0),
      completedTours: Number(completedToursRow?.total || 0)
    },
    upcomingTours
  };
}

export async function getGuideSchedules(guideId, filter = "all") {
  let sql = `
    SELECT
      t.id,
      t.title,
      t.location,
      t.start_date,
      t.end_date,
      t.status,
      t.max_capacity,
      t.guide_id,
      t.guide_completed_at,
      COALESCE(bp.booked_participants, 0) AS booked_participants
    FROM tours t
    ${BOOKED_PARTICIPANTS_JOIN}
    WHERE t.guide_id = ?
  `;

  const params = [guideId];

  if (filter === "upcoming") {
    sql += `
      AND t.start_date IS NOT NULL
      AND DATE(t.start_date) > CURDATE()
      AND t.status IN ('active', 'paused', 'full')
      AND t.guide_completed_at IS NULL
    `;
  }

  if (filter === "running") {
    sql += `
      AND t.start_date IS NOT NULL
      AND t.end_date IS NOT NULL
      AND CURDATE() BETWEEN DATE(t.start_date) AND DATE(t.end_date)
      AND t.status IN ('active', 'paused', 'full')
      AND t.guide_completed_at IS NULL
    `;
  }

  if (filter === "done") {
    sql += `
      AND (
        t.guide_completed_at IS NOT NULL
        OR t.status = 'archived'
        OR (t.end_date IS NOT NULL AND DATE(t.end_date) < CURDATE())
      )
    `;
  }

  sql += `
    ORDER BY
      CASE WHEN t.start_date IS NULL THEN 1 ELSE 0 END,
      t.start_date ASC,
      t.id DESC
  `;

  const [rows] = await db.query(sql, params);
  return rows;
}

export async function getCurrentToursByGuide(guideId, keyword = "") {
  let sql = `
    SELECT
      t.id,
      t.title,
      t.location,
      t.start_date,
      t.end_date,
      t.duration_text,
      t.max_capacity,
      t.guide_id,
      t.status,
      COALESCE(bp.booked_participants, 0) AS booked_participants
    FROM tours t
    ${BOOKED_PARTICIPANTS_JOIN}
    WHERE t.guide_id = ?
      AND t.status IN ('active', 'paused', 'full')
      AND t.guide_completed_at IS NULL
  `;

  const params = [guideId];

  if (keyword && String(keyword).trim() !== "") {
    sql += `
      AND (
        t.title LIKE ?
        OR t.location LIKE ?
        OR t.duration_text LIKE ?
      )
    `;
    const likeKeyword = `%${String(keyword).trim()}%`;
    params.push(likeKeyword, likeKeyword, likeKeyword);
  }

  sql += `
    ORDER BY
      CASE WHEN t.start_date IS NULL THEN 1 ELSE 0 END,
      t.start_date ASC,
      t.id DESC
  `;

  const [rows] = await db.query(sql, params);
  return rows;
}

export async function getGuideCustomers(
  guideId,
  keyword = "",
  tourFilter = "all",
  tourIdFilter = null
) {
  let sql = `
    SELECT
      b.id,
      t.id AS tour_id,
      COALESCE(NULLIF(TRIM(b.contact_name), ''), u.full_name) AS customer_name,
      COALESCE(NULLIF(TRIM(b.contact_phone), ''), NULLIF(TRIM(u.phone), '')) AS phone,
      COALESCE(NULLIF(TRIM(b.contact_email), ''), NULLIF(TRIM(u.email), ''), '') AS email,
      t.title AS tour_name,
      t.start_date AS tour_date
    FROM bookings b
    JOIN tours t ON t.id = b.tour_id
    JOIN users u ON u.id = b.user_id
    WHERE t.guide_id = ?
  `;

  const params = [guideId];

  const tourIdNum =
    tourIdFilter != null && String(tourIdFilter).trim() !== ""
      ? Number(tourIdFilter)
      : NaN;
  if (!Number.isNaN(tourIdNum)) {
    sql += ` AND t.id = ? `;
    params.push(tourIdNum);
  }

  if (keyword && String(keyword).trim() !== "") {
    sql += `
      AND (
        u.full_name LIKE ?
        OR u.phone LIKE ?
        OR u.email LIKE ?
        OR b.contact_name LIKE ?
        OR b.contact_phone LIKE ?
        OR b.contact_email LIKE ?
        OR t.title LIKE ?
      )
    `;
    const likeKeyword = `%${String(keyword).trim()}%`;
    params.push(
      likeKeyword,
      likeKeyword,
      likeKeyword,
      likeKeyword,
      likeKeyword,
      likeKeyword,
      likeKeyword
    );
  }

  if (
    Number.isNaN(tourIdNum) &&
    tourFilter &&
    tourFilter !== "all"
  ) {
    sql += ` AND t.title LIKE ? `;
    params.push(`%${String(tourFilter).trim()}%`);
  }

  sql += `
    ORDER BY
      CASE WHEN t.start_date IS NULL THEN 1 ELSE 0 END,
      t.start_date ASC,
      b.id DESC
  `;

  const [rows] = await db.query(sql, params);
  return rows;
}

export async function getGuideIncomeData(guideId, monthRange = 6) {
  const safeMonthRange = [3, 6, 12].includes(Number(monthRange))
    ? Number(monthRange)
    : 6;

  const fromDate = new Date();
  fromDate.setHours(0, 0, 0, 0);
  fromDate.setMonth(fromDate.getMonth() - safeMonthRange);

  const fromDateString = `${fromDate.getFullYear()}-${String(
    fromDate.getMonth() + 1
  ).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;

  const [[totalIncomeRow]] = await db.query(
    `
    SELECT COALESCE(SUM(COALESCE(final_price, 0)), 0) AS total
    FROM tours
    WHERE guide_id = ?
      AND status = 'archived'
    `,
    [guideId]
  );

  const [[monthIncomeRow]] = await db.query(
    `
    SELECT COALESCE(SUM(COALESCE(final_price, 0)), 0) AS total
    FROM tours
    WHERE guide_id = ?
      AND start_date IS NOT NULL
      AND MONTH(start_date) = MONTH(CURDATE())
      AND YEAR(start_date) = YEAR(CURDATE())
      AND status = 'archived'
    `,
    [guideId]
  );

  const [[completedToursRow]] = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM tours
    WHERE guide_id = ?
      AND status = 'archived'
    `,
    [guideId]
  );

  const [[avgIncomeRow]] = await db.query(
    `
    SELECT COALESCE(AVG(COALESCE(final_price, 0)), 0) AS avg_income
    FROM tours
    WHERE guide_id = ?
      AND start_date IS NOT NULL
      AND start_date >= ?
      AND status = 'archived'
    `,
    [guideId, fromDateString]
  );

  const [monthlyRows] = await db.query(
    `
    SELECT
      temp.year_number,
      temp.month_number,
      CONCAT(LPAD(temp.month_number, 2, '0'), '/', temp.year_number) AS month_key,
      temp.income
    FROM (
      SELECT
        YEAR(start_date) AS year_number,
        MONTH(start_date) AS month_number,
        COALESCE(SUM(COALESCE(final_price, 0)), 0) AS income
      FROM tours
      WHERE guide_id = ?
        AND start_date IS NOT NULL
        AND start_date >= ?
        AND status = 'archived'
      GROUP BY YEAR(start_date), MONTH(start_date)
    ) AS temp
    ORDER BY temp.year_number ASC, temp.month_number ASC
    `,
    [guideId, fromDateString]
  );

  const [recentTransactions] = await db.query(
    `
    SELECT
      id,
      title,
      start_date,
      final_price,
      status
    FROM tours
    WHERE guide_id = ?
      AND status = 'archived'
    ORDER BY start_date DESC, id DESC
    LIMIT 10
    `,
    [guideId]
  );

  return {
    stats: {
      totalIncome: Number(totalIncomeRow?.total || 0),
      monthlyIncome: Number(monthIncomeRow?.total || 0),
      averageIncomePerTour: Number(avgIncomeRow?.avg_income || 0),
      completedTours: Number(completedToursRow?.total || 0)
    },
    monthlyIncome: Array.isArray(monthlyRows)
      ? monthlyRows.map((row) => ({
          monthKey: row.month_key,
          monthNumber: Number(row.month_number || 0),
          yearNumber: Number(row.year_number || 0),
          income: Number(row.income || 0)
        }))
      : [],
    recentTransactions: Array.isArray(recentTransactions)
      ? recentTransactions.map((row) => ({
          id: Number(row.id),
          tour: row.title || "Chưa có tên tour",
          date: row.start_date || null,
          amount: Number(row.final_price || 0),
          status: row.status || ""
        }))
      : []
  };
}

/**
 * Lấy danh sách khách (người đặt + thành viên đặt cùng) của một tour mà HDV đang dẫn.
 * Trả về theo từng booking để FE có thể nhóm hoặc render phẳng.
 */
export async function getTourCustomersForGuide(guideId, tourId) {
  const gid = Number(guideId);
  const tid = Number(tourId);
  if (!gid || !tid) return null;

  // Xác nhận HDV thực sự phụ trách tour
  const [[tour]] = await db.query(
    `
    SELECT id, title, start_date, end_date, location
    FROM tours
    WHERE id = ? AND guide_id = ?
    LIMIT 1
    `,
    [tid, gid],
  );
  if (!tour) return null;

  const [bookings] = await db.query(
    `
    SELECT
      b.id AS booking_id,
      b.booking_code,
      b.status,
      b.num_adults,
      b.num_children,
      b.num_infants,
      b.booked_at,
      COALESCE(NULLIF(TRIM(b.contact_name), ''),  u.full_name) AS booker_name,
      COALESCE(NULLIF(TRIM(b.contact_phone), ''), NULLIF(TRIM(u.phone), ''), '') AS booker_phone,
      COALESCE(NULLIF(TRIM(b.contact_email), ''), NULLIF(TRIM(u.email), ''), '') AS booker_email,
      u.id AS booker_user_id
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    WHERE b.tour_id = ?
      AND b.status IN ('confirmed','paid','in_progress','completed')
    ORDER BY b.id ASC
    `,
    [tid],
  );

  if (!bookings.length) {
    return {
      tour: {
        id: tour.id,
        title: tour.title,
        start_date: tour.start_date,
        end_date: tour.end_date,
        location: tour.location || "",
      },
      bookings: [],
      total_customers: 0,
    };
  }

  const bookingIds = bookings.map((b) => b.booking_id);
  const placeholders = bookingIds.map(() => "?").join(",");

  // Một số DB cũ chưa có cột phone — fallback graceful nếu lỗi.
  let travelers = [];
  try {
    const [rows] = await db.query(
      `
      SELECT id, booking_id, full_name, birth_date, gender, id_number, phone, traveler_type
      FROM booking_travelers
      WHERE booking_id IN (${placeholders})
      ORDER BY booking_id ASC, id ASC
      `,
      bookingIds,
    );
    travelers = rows;
  } catch (err) {
    const [rows] = await db.query(
      `
      SELECT id, booking_id, full_name, birth_date, gender, id_number, traveler_type
      FROM booking_travelers
      WHERE booking_id IN (${placeholders})
      ORDER BY booking_id ASC, id ASC
      `,
      bookingIds,
    );
    travelers = rows;
  }

  const grouped = new Map();
  for (const t of travelers) {
    if (!grouped.has(t.booking_id)) grouped.set(t.booking_id, []);
    grouped.get(t.booking_id).push({
      id: Number(t.id),
      full_name: t.full_name || "",
      birth_date: t.birth_date || null,
      gender: t.gender || "other",
      id_number: t.id_number || "",
      phone: t.phone || "",
      traveler_type: t.traveler_type || "adult",
    });
  }

  let totalCustomers = 0;
  const result = bookings.map((b) => {
    const tvs = grouped.get(b.booking_id) || [];
    totalCustomers += 1 + tvs.length;
    return {
      booking_id: Number(b.booking_id),
      booking_code: b.booking_code || "",
      status: b.status,
      num_adults: Number(b.num_adults || 0),
      num_children: Number(b.num_children || 0),
      num_infants: Number(b.num_infants || 0),
      booked_at: b.booked_at,
      booker: {
        user_id: Number(b.booker_user_id || 0),
        name: b.booker_name || "Khách hàng",
        phone: b.booker_phone || "",
        email: b.booker_email || "",
      },
      travelers: tvs,
    };
  });

  return {
    tour: {
      id: tour.id,
      title: tour.title,
      start_date: tour.start_date,
      end_date: tour.end_date,
      location: tour.location || "",
    },
    bookings: result,
    total_customers: totalCustomers,
  };
}

export async function getGuideProfileData(guideId) {
  const [[guideRow]] = await db.query(
    `
    SELECT
      g.id,
      g.provider_id,
      g.user_id,
      g.experience_years,
      g.languages,
      g.rating_avg,
      g.rating_count,
      g.bio,
      g.certification,
      g.specialty,
      g.contract_file_url,
      g.cv_file_url,
      u.full_name,
      u.email,
      u.phone,
      u.avatar_url,
      u.address,
      u.birth_date
    FROM guides g
    JOIN users u ON u.id = g.user_id
    WHERE g.id = ?
    LIMIT 1
    `,
    [guideId]
  );

  if (!guideRow) return null;

  const [[tourCountRow]] = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM tours
    WHERE guide_id = ?
    `,
    [guideId]
  );

  const [[completedRow]] = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM tours
    WHERE guide_id = ?
      AND status = 'archived'
    `,
    [guideId]
  );

  const languages = parseLanguagesField(guideRow.languages);
  const specialties = parseCommaList(guideRow.specialty);
  const certificates = parseCommaList(guideRow.certification);
  const { rating_avg: ratingAvg, rating_count: reviewCount } =
    await getGuideRatingFromReviews(guideId);

  return {
    id: guideRow.id,
    fullName: guideRow.full_name,
    email: guideRow.email,
    phone: guideRow.phone,
    address: guideRow.address || "",
    birthDate: guideRow.birth_date || null,
    avatarUrl: guideRow.avatar_url || "",
    role: "Hướng dẫn viên du lịch",
    badgeText: "Hướng dẫn viên chuyên nghiệp",
    rating: ratingAvg,
    reviewCount,
    experienceYears: Number(guideRow.experience_years || 0),
    bio: guideRow.bio || "",
    certificates,
    specialties,
    languages,
    contractFileUrl: guideRow.contract_file_url || "",
    cvFileUrl: guideRow.cv_file_url || "",
    stats: {
      totalTours: Number(tourCountRow?.total || 0),
      averageRating: ratingAvg,
      experienceYears: Number(guideRow.experience_years || 0),
      satisfactionRate: 98,
      completedTours: Number(completedRow?.total || 0)
    }
  };
}

export async function updateGuideProfile(guideId, payload = {}) {
  const [[guideRow]] = await db.query(
    `SELECT id, user_id FROM guides WHERE id = ? LIMIT 1`,
    [guideId]
  );

  if (!guideRow) return null;

  const userId = guideRow.user_id;
  const {
    fullName,
    phone,
    address,
    birthDate,
    experienceYears,
    bio,
    certificates,
    specialties,
    languages,
  } = payload;

  await db.query(
    `
    UPDATE users
    SET
      full_name = ?,
      phone = ?,
      address = ?,
      birth_date = ?
    WHERE id = ?
    `,
    [
      fullName || null,
      phone || null,
      address || null,
      birthDate || null,
      userId,
    ]
  );

  await db.query(
    `
    UPDATE guides
    SET
      experience_years = ?,
      bio = ?,
      certification = ?,
      specialty = ?,
      languages = ?
    WHERE id = ?
    `,
    [
      Number.isFinite(Number(experienceYears))
        ? Math.max(0, Math.min(60, Number(experienceYears)))
        : 0,
      bio || null,
      Array.isArray(certificates) && certificates.length
        ? certificates.map((c) => String(c).trim()).filter(Boolean).join(",")
        : null,
      Array.isArray(specialties) && specialties.length
        ? specialties.map((s) => String(s).trim()).filter(Boolean).join(",")
        : null,
      serializeLanguages(languages),
      guideId,
    ]
  );

  return getGuideProfileData(guideId);
}

export async function getGuideUserId(guideId) {
  const [[row]] = await db.query(
    `SELECT user_id FROM guides WHERE id = ? LIMIT 1`,
    [guideId]
  );
  return row?.user_id ? Number(row.user_id) : null;
}

export async function getGuideIdByUserId(userId) {
  const uid = Number(userId);
  if (!uid) return null;
  const [[row]] = await db.query(`SELECT id FROM guides WHERE user_id = ? LIMIT 1`, [uid]);
  return row?.id ? Number(row.id) : null;
}

/** Có guides riêng → id HDV mới. Không có → pool cũ (LEGACY_SHARED_GUIDE_ID, mặc định 1). */
export async function resolveGuideScopeId(userId) {
  const own = await getGuideIdByUserId(userId);
  if (own) return own;
  const legacy = Number(process.env.LEGACY_SHARED_GUIDE_ID || 1);
  if (!Number.isFinite(legacy) || legacy <= 0) return null;
  const [[row]] = await db.query(`SELECT id FROM guides WHERE id = ? LIMIT 1`, [legacy]);
  return row?.id ? Number(row.id) : null;
}

export async function getGuideAvailabilityList(guideId) {
  const [rows] = await db.query(
    `
    SELECT
      id,
      DATE_FORMAT(avail_date, '%Y-%m-%d') AS avail_date,
      time_from,
      time_to,
      tour_type,
      note,
      created_at
    FROM guide_availability
    WHERE guide_id = ?
    ORDER BY avail_date ASC, id ASC
    `,
    [guideId]
  );
  return rows;
}

export async function getGuideAssignedToursForCalendar(guideId) {
  const [rows] = await db.query(
    `
    SELECT
      id,
      title,
      location,
      DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
      max_capacity,
      status
    FROM tours
    WHERE guide_id = ?
      AND status IN ('draft', 'active', 'paused', 'full')
      AND start_date IS NOT NULL
      AND guide_completed_at IS NULL
    ORDER BY start_date ASC, id DESC
    `,
    [guideId]
  );
  return rows;
}

export async function upsertGuideAvailability(guideId, payload = {}) {
  const dates = Array.isArray(payload.dates) ? payload.dates : [];
  const timeFrom = String(payload.timeFrom || "08:00").slice(0, 5);
  const timeTo = String(payload.timeTo || "17:00").slice(0, 5);
  const tourType = String(payload.tourType || "Tất cả loại tour").trim();
  const note = payload.note ? String(payload.note).trim() : null;

  for (const rawDate of dates) {
    const dateText = String(rawDate).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) continue;

    await db.query(
      `
      INSERT INTO guide_availability (
        guide_id, avail_date, time_from, time_to, tour_type, note
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        time_from = VALUES(time_from),
        time_to = VALUES(time_to),
        tour_type = VALUES(tour_type),
        note = VALUES(note)
      `,
      [guideId, dateText, timeFrom, timeTo, tourType, note]
    );
  }

  return getGuideAvailabilityList(guideId);
}

export async function deleteGuideAvailability(guideId, availabilityId) {
  const [result] = await db.query(
    `DELETE FROM guide_availability WHERE id = ? AND guide_id = ? LIMIT 1`,
    [availabilityId, guideId]
  );
  return result.affectedRows > 0;
}
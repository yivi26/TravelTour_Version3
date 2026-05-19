import db from "../config/db.js";

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
      t.guide_completed_at
    FROM tours t
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
      t.status
    FROM tours t
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

export async function getTourProviderInfoForGuide(guideId, tourId) {
  const gid = Number(guideId);
  const tid = Number(tourId);
  if (!gid || !tid) return null;

  const [rows] = await db.query(
    `
    SELECT
      t.id AS tour_id,
      t.title AS tour_title,
      t.location AS tour_location,
      p.id AS provider_id,
      p.company_name,
      p.phone AS provider_phone,
      p.hotline AS provider_hotline,
      p.email AS provider_email,
      p.website_url AS provider_website,
      p.address AS provider_address,
      p.description AS provider_description,
      p.logo_url AS provider_logo,
      p.bank_name AS provider_bank_name,
      p.bank_branch AS provider_bank_branch,
      p.bank_account_number AS provider_bank_account_number,
      p.bank_account_name AS provider_bank_account_name,
      p.tax_code AS provider_tax_code,
      u.full_name AS contact_full_name,
      u.email AS contact_email,
      u.phone AS contact_phone,
      u.avatar_url AS contact_avatar
    FROM tours t
    JOIN providers p ON p.id = t.provider_id
    LEFT JOIN users u ON u.id = p.user_id
    WHERE t.id = ?
      AND t.guide_id = ?
    LIMIT 1
    `,
    [tid, gid],
  );

  return rows[0] || null;
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
    rating: Number(guideRow.rating_avg || 0),
    reviewCount: Number(guideRow.rating_count || 0),
    experienceYears: Number(guideRow.experience_years || 0),
    bio: guideRow.bio || "",
    certificates,
    specialties,
    languages,
    stats: {
      totalTours: Number(tourCountRow?.total || 0),
      averageRating: Number(guideRow.rating_avg || 0),
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
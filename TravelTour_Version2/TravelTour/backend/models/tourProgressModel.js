import db from "../config/db.js";
import { createGuideEarningsForCompletedTour } from "./commissionModel.js";
import { assertTourDepartureAllowedForOperations } from "./tourDepartureModel.js";

function toLocalYmd(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function buildInclusiveDateKeys(startYmd, endYmd) {
  const start = toLocalYmd(startYmd);
  const end = toLocalYmd(endYmd) || start;
  if (!start) return [];

  const cursor = new Date(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  );
  const last = new Date(
    Number(end.slice(0, 4)),
    Number(end.slice(5, 7)) - 1,
    Number(end.slice(8, 10)),
  );
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return [];

  const endBound = last < cursor ? cursor : last;
  const keys = [];
  while (cursor <= endBound) {
    keys.push(toLocalYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** Sau khi hoàn thành tour — ghi ngày tour vào lịch rảnh để provider có thể phân công tour mới trùng ngày. */
async function restoreGuideAvailabilityForTour(guideId, startYmd, endYmd) {
  const dateKeys = buildInclusiveDateKeys(startYmd, endYmd);
  if (!dateKeys.length) return;

  for (const dateText of dateKeys) {
    await db.query(
      `
      INSERT INTO guide_availability (
        guide_id, avail_date, time_from, time_to, tour_type, note
      ) VALUES (?, ?, '08:00', '17:00', 'Tất cả loại tour', 'Tự động sau khi hoàn thành tour')
      ON DUPLICATE KEY UPDATE
        updated_at = CURRENT_TIMESTAMP
      `,
      [guideId, dateText],
    );
  }
}

function safeParseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseItineraryToDays(itinerary) {
  const days = safeParseJsonArray(itinerary);
  return days.map((day, dayIdx) => {
    const dayNum =
      day.day != null && String(day.day).trim() !== ""
        ? Number(day.day)
        : dayIdx + 1;
    const title = String(day.title || "").trim();
    const raw = String(day.description || "").trim();
    const lines = raw
      ? raw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
      : [];

    const activities = lines.map((line, slotIdx) => {
      const match = line.match(/^(\d{1,2}:\d{2})\s*[-–—]\s*(.+)$/);
      return {
        id: `d${dayNum}-s${slotIdx}`,
        time: match ? match[1] : "",
        text: match ? match[2].trim() : line,
      };
    });

    if (!activities.length && raw) {
      activities.push({ id: `d${dayNum}-s0`, time: "", text: raw });
    }

    return { dayNum, title, activities };
  });
}

async function getTourRowForProvider(providerId, tourId) {
  const [rows] = await db.query(
    `
    SELECT
      t.id,
      t.title,
      t.itinerary,
      t.guide_id,
      DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(t.end_date, '%Y-%m-%d') AS end_date,
      u.full_name AS guide_name
    FROM tours t
    LEFT JOIN guides g ON g.id = t.guide_id
    LEFT JOIN users u ON u.id = g.user_id
    WHERE t.id = ?
      AND t.provider_id = ?
    LIMIT 1
    `,
    [tourId, providerId],
  );
  return rows[0] || null;
}

async function getTourRowForGuide(guideId, tourId) {
  const [rows] = await db.query(
    `
    SELECT
      t.id,
      t.title,
      t.itinerary,
      t.guide_id,
      t.provider_id,
      DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(t.end_date, '%Y-%m-%d') AS end_date,
      t.guide_completed_at
    FROM tours t
    WHERE t.id = ?
      AND t.guide_id = ?
    LIMIT 1
    `,
    [tourId, guideId],
  );
  return rows[0] || null;
}

async function getProgressRow(tourId) {
  const [rows] = await db.query(
    `
    SELECT
      tour_id,
      guide_id,
      completed_activity_ids,
      guide_completed_at,
      updated_at
    FROM tour_guide_progress
    WHERE tour_id = ?
    LIMIT 1
    `,
    [tourId],
  );
  return rows[0] || null;
}

function normalizeCompletedIds(value) {
  if (value == null || value === "") return [];

  let raw = value;
  if (Buffer.isBuffer(raw)) {
    raw = raw.toString("utf8");
  }

  if (Array.isArray(raw)) {
    return [...new Set(raw.map((id) => String(id).trim()).filter(Boolean))];
  }

  if (typeof raw === "object") {
    return safeParseJsonArray(JSON.stringify(raw))
      .map((id) => String(id).trim())
      .filter(Boolean);
  }

  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.map((id) => String(id).trim()).filter(Boolean))];
      }
    } catch {
      return text
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function buildProgressStats(days, completedIds) {
  const completedSet = new Set(completedIds);
  const total = days.reduce((sum, d) => sum + d.activities.length, 0);
  const done = completedIds.filter((id) =>
    days.some((d) => d.activities.some((a) => a.id === id)),
  ).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return { done, total, percent, completedSet };
}

export async function getTourProgressForProvider(providerId, tourId) {
  const tour = await getTourRowForProvider(providerId, tourId);
  if (!tour) {
    throw new Error("Không tìm thấy tour");
  }

  const progress = await getProgressRow(tourId);
  const completed_activity_ids = progress
    ? normalizeCompletedIds(progress.completed_activity_ids)
    : [];
  const days = parseItineraryToDays(tour.itinerary);
  const stats = buildProgressStats(days, completed_activity_ids);

  return {
    tour: {
      id: Number(tour.id),
      title: tour.title,
      start_date: tour.start_date,
      end_date: tour.end_date,
      guide_name: tour.guide_name || null,
    },
    completed_activity_ids,
    updated_at: progress?.updated_at || null,
    stats,
    days,
  };
}

export async function getTourProgressForGuide(guideId, tourId) {
  const tour = await getTourRowForGuide(guideId, tourId);
  if (!tour) {
    throw new Error("Bạn chưa được phân công tour này");
  }

  const progress = await getProgressRow(tourId);
  const completed_activity_ids = progress
    ? normalizeCompletedIds(progress.completed_activity_ids)
    : [];
  const guide_completed_at =
    progress?.guide_completed_at || tour.guide_completed_at || null;

  return {
    tour_id: Number(tourId),
    completed_activity_ids,
    guide_completed_at,
    updated_at: progress?.updated_at || null,
  };
}

export async function saveTourProgressForGuide(guideId, tourId, completedActivityIds) {
  const tour = await getTourRowForGuide(guideId, tourId);
  if (!tour) {
    throw new Error("Bạn chưa được phân công tour này");
  }

  await assertTourDepartureAllowedForOperations(tourId);

  const ids = normalizeCompletedIds(completedActivityIds);
  const json = JSON.stringify(ids);

  await db.query(
    `
    INSERT INTO tour_guide_progress (tour_id, guide_id, completed_activity_ids)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      guide_id = VALUES(guide_id),
      completed_activity_ids = VALUES(completed_activity_ids),
      updated_at = CURRENT_TIMESTAMP
    `,
    [tourId, guideId, json],
  );

  return getTourProgressForGuide(guideId, tourId);
}

export async function completeTourForGuide(guideId, tourId) {
  const tour = await getTourRowForGuide(guideId, tourId);
  if (!tour) {
    throw new Error("Bạn chưa được phân công tour này");
  }

  await assertTourDepartureAllowedForOperations(tourId);

  const progress = await getProgressRow(tourId);
  if (progress?.guide_completed_at || tour.guide_completed_at) {
    throw new Error("Tour này đã được đánh dấu hoàn thành");
  }

  const days = parseItineraryToDays(tour.itinerary);
  const completedIds = progress
    ? normalizeCompletedIds(progress.completed_activity_ids)
    : [];
  const stats = buildProgressStats(days, completedIds);

  if (stats.total > 0 && stats.done < stats.total) {
    throw new Error(
      `Vui lòng hoàn thành tất cả hoạt động (${stats.done}/${stats.total}) trước khi kết thúc tour.`,
    );
  }

  const idsJson = JSON.stringify(completedIds);

  await db.query(
    `
    INSERT INTO tour_guide_progress (tour_id, guide_id, completed_activity_ids, guide_completed_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      guide_id = VALUES(guide_id),
      completed_activity_ids = VALUES(completed_activity_ids),
      guide_completed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    `,
    [tourId, guideId, idsJson],
  );

  await db.query(
    `
    UPDATE tours
    SET guide_completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND guide_id = ?
    `,
    [tourId, guideId],
  );

  await db.query(
    `
    UPDATE bookings
    SET status = 'completed',
        updated_at = NOW()
    WHERE tour_id = ?
      AND status IN ('confirmed', 'paid', 'in_progress')
    `,
    [tourId],
  );

  await restoreGuideAvailabilityForTour(guideId, tour.start_date, tour.end_date);

  let earningsResult = { created: 0 };
  try {
    earningsResult = await createGuideEarningsForCompletedTour(tourId);
  } catch (err) {
    console.error("createGuideEarningsForCompletedTour:", err);
  }

  const [guideRows] = await db.query(
    `
    SELECT u.full_name AS guide_name
    FROM guides g
    JOIN users u ON u.id = g.user_id
    WHERE g.id = ?
    LIMIT 1
    `,
    [guideId],
  );

  return {
    tour_id: Number(tourId),
    provider_id: Number(tour.provider_id),
    tour_title: tour.title,
    guide_name: guideRows[0]?.guide_name || "Hướng dẫn viên",
    guide_completed_at: new Date().toISOString(),
    stats,
    earnings: earningsResult,
  };
}

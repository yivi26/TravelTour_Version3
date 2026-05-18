import db from "../config/db.js";
import { getProviderReportOverview } from "./providerReportsModel.js";

function safeJsonParse(value, fallback = []) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function createSlug(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function resolvePublicTourPricing(row) {
  const basePrice = Number(row.base_price || 0);
  const salePrice = Number(row.sale_price || 0);
  const appliedPrice = salePrice > 0 && salePrice < basePrice ? salePrice : basePrice;
  const taxPercent = Math.max(0, Number(row.tax_percent ?? 0));
  const hasVat = taxPercent > 0;

  let tax = Math.max(0, Number(row.tax ?? 0));
  let finalPrice = Math.max(0, Number(row.final_price ?? 0));

  if (!hasVat) {
    return {
      tax_percent: 0,
      tax: 0,
      final_price: finalPrice > 0 ? finalPrice : appliedPrice
    };
  }

  if (!tax) {
    tax = Math.round(appliedPrice * (taxPercent / 100));
  }

  if (!finalPrice) {
    finalPrice = appliedPrice + tax;
  }

  return {
    tax_percent: taxPercent,
    tax,
    final_price: finalPrice
  };
}

async function isTourCodeExists(providerId, code, excludeId = null) {
  if (!code) return false;

  let sql = `
    SELECT id
    FROM tours
    WHERE provider_id = ?
      AND code = ?
  `;
  const params = [providerId, code];

  if (excludeId) {
    sql += ` AND id <> ? `;
    params.push(excludeId);
  }

  sql += ` LIMIT 1 `;

  const [rows] = await db.query(sql, params);
  return rows.length > 0;
}

async function isTourSlugExists(providerId, slug, excludeId = null) {
  if (!slug) return false;

  let sql = `
    SELECT id
    FROM tours
    WHERE provider_id = ?
      AND slug = ?
  `;
  const params = [providerId, slug];

  if (excludeId) {
    sql += ` AND id <> ? `;
    params.push(excludeId);
  }

  sql += ` LIMIT 1 `;

  const [rows] = await db.query(sql, params);
  return rows.length > 0;
}

export async function getToursByProvider(providerId) {
  const [rows] = await db.query(
    `
    SELECT *
    FROM tours
    WHERE provider_id = ?
    ORDER BY created_at DESC
    `,
    [providerId]
  );

  return rows.map((row) => {
    const pricing = resolvePublicTourPricing(row);
    const start_date = toLocalYmd(row.start_date);
    const end_date = toLocalYmd(row.end_date);
    const tour_phase = getTourLifecyclePhase(start_date, end_date);
    const unlocked = Boolean(row.management_actions_unlocked);
    const actions_locked =
      !unlocked && !canUseTourManagementActions(start_date, end_date);

    return {
      ...row,
      start_date,
      end_date,
      tour_phase,
      management_actions_unlocked: unlocked,
      actions_locked,
      display_price: pricing.final_price,
      applied_price:
        row.sale_price > 0 && row.sale_price < row.base_price
          ? Number(row.sale_price)
          : Number(row.base_price || 0),
      tax_resolved: pricing.tax,
      final_price_resolved: pricing.final_price,
    };
  });
}

export async function getTourById(providerId, id) {
  const [rows] = await db.query(
    `
    SELECT
      t.*,
      DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date_key,
      DATE_FORMAT(t.end_date, '%Y-%m-%d') AS end_date_key,
      u.full_name AS guide_name
    FROM tours t
    LEFT JOIN guides g ON g.id = t.guide_id
    LEFT JOIN users u ON u.id = g.user_id
    WHERE t.provider_id = ?
      AND t.id = ?
    LIMIT 1
    `,
    [providerId, id]
  );

  if (!rows.length) return null;

  const tour = rows[0];
  if (tour.start_date_key) tour.start_date = tour.start_date_key;
  if (tour.end_date_key) tour.end_date = tour.end_date_key;
  delete tour.start_date_key;
  delete tour.end_date_key;

  const [categoryRows] = await db.query(
    `
    SELECT category_id
    FROM tour_category_map
    WHERE tour_id = ?
    LIMIT 1
    `,
    [id]
  );

  const [imageRows] = await db.query(
    `
    SELECT image_url, is_cover, display_order
    FROM tour_images
    WHERE tour_id = ?
    ORDER BY is_cover DESC, display_order ASC, id ASC
    `,
    [id]
  );

  const coverImage = imageRows.find(item => Number(item.is_cover) === 1) || null;
  const galleryImages = imageRows
    .filter(item => Number(item.is_cover) !== 1)
    .map(item => item.image_url);

  return {
    ...tour,
    category_id: categoryRows.length ? Number(categoryRows[0].category_id) : null,
    short_description: tour.description || "",
    hotel_info: tour.hotel_info || "",
    transport_info: tour.transport_info || "",
    cancel_policy: tour.cancel_policy || "",
    terms_conditions: tour.terms_conditions || "",
    other_notes: tour.other_notes || "",
    highlights: safeJsonParse(tour.highlights, []),
    includes: safeJsonParse(tour.includes, []),
    excludes: safeJsonParse(tour.excludes, []),
    itinerary: safeJsonParse(tour.itinerary, []),
    thumbnail_url: coverImage ? coverImage.image_url : tour.thumbnail_url || null,
    gallery_images: galleryImages
  };
}

export async function createTour(providerId, data) {
  const {
    title,
    slug,
    description,
    short_description,
    location,
    meeting_point,
    latitude,
    longitude,
    base_price,
    sale_price,
    tax_percent,
    tax,
    final_price,
    duration_days,
    duration_text,
    max_capacity,
    thumbnail_url,
    includes,
    excludes,
    status,
    category_id,
    itinerary,
    gallery_images,
    highlights,
    start_date,
    end_date,
    code,
    hotel_info,
    transport_info,
    cancel_policy,
    terms_conditions,
    other_notes
  } = data;

  const finalStatus = ["draft", "active", "paused", "archived", "full"].includes(status)
    ? status
    : "draft";

  let finalSlug = slug || createSlug(title);
  if (!finalSlug) {
    finalSlug = `tour-${Date.now()}`;
  }

  if (await isTourCodeExists(providerId, code)) {
    throw new Error("Mã tour đã tồn tại");
  }

  if (await isTourSlugExists(providerId, finalSlug)) {
    finalSlug = `${finalSlug}-${Date.now()}`;
  }

  const finalItinerary =
    Array.isArray(itinerary) && itinerary.length > 0 ? JSON.stringify(itinerary) : null;

  const finalIncludes =
    Array.isArray(includes) && includes.length > 0 ? JSON.stringify(includes) : null;

  const finalExcludes =
    Array.isArray(excludes) && excludes.length > 0 ? JSON.stringify(excludes) : null;

  const finalHighlights =
    Array.isArray(highlights) && highlights.length > 0 ? JSON.stringify(highlights) : null;

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `
      INSERT INTO tours (
        provider_id,
        title,
        slug,
        code,
        description,
        highlights,
        itinerary,
        location,
        meeting_point,
        latitude,
        longitude,
        base_price,
        sale_price,
        tax_percent,
        tax,
        final_price,
        duration_days,
        duration_text,
        max_capacity,
        thumbnail_url,
        includes,
        excludes,
        start_date,
        end_date,
        hotel_info,
        transport_info,
        cancel_policy,
        terms_conditions,
        other_notes,
        status,
        guide_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        providerId,
        title || null,
        finalSlug,
        code || null,
        short_description || description || null,
        finalHighlights,
        finalItinerary,
        location || null,
        meeting_point || null,
        latitude ?? null,
        longitude ?? null,
        base_price || 0,
        sale_price || 0,
        Number(tax_percent) >= 0 ? Number(tax_percent) : 0,
        Number(tax) >= 0 ? Number(tax) : 0,
        Number(final_price) >= 0 ? Number(final_price) : 0,
        duration_days || 1,
        duration_text || null,
        max_capacity || 1,
        thumbnail_url || null,
        finalIncludes,
        finalExcludes,
        start_date || null,
        end_date || null,
        hotel_info || null,
        transport_info || null,
        cancel_policy || null,
        terms_conditions || null,
        other_notes || null,
        finalStatus,
        null
      ]
    );

    const tourId = result.insertId;

    if (category_id) {
      await conn.query(
        `INSERT INTO tour_category_map (tour_id, category_id) VALUES (?, ?)`,
        [tourId, category_id]
      );
    }

    const insertedUrls = new Set();

    if (thumbnail_url) {
      const normalizedCover = String(thumbnail_url).trim();
      await conn.query(
        `
        INSERT INTO tour_images (tour_id, image_url, display_order, is_cover)
        VALUES (?, ?, 0, 1)
        `,
        [tourId, normalizedCover]
      );
      insertedUrls.add(normalizedCover);
    }

    if (Array.isArray(gallery_images) && gallery_images.length > 0) {
      let displayOrder = 1;

      for (const imageUrl of gallery_images) {
        const normalizedUrl = String(imageUrl || "").trim();
        if (!normalizedUrl || insertedUrls.has(normalizedUrl)) continue;

        await conn.query(
          `
          INSERT INTO tour_images (tour_id, image_url, display_order, is_cover)
          VALUES (?, ?, ?, 0)
          `,
          [tourId, normalizedUrl, displayOrder]
        );

        insertedUrls.add(normalizedUrl);
        displayOrder += 1;
      }
    }

    await conn.commit();
    return tourId;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function updateTour(providerId, id, data) {
  const {
    title,
    slug,
    description,
    short_description,
    location,
    meeting_point,
    latitude,
    longitude,
    base_price,
    sale_price,
    tax_percent,
    tax,
    final_price,
    duration_days,
    duration_text,
    max_capacity,
    thumbnail_url,
    includes,
    excludes,
    status,
    category_id,
    itinerary,
    gallery_images,
    highlights,
    start_date,
    end_date,
    code,
    hotel_info,
    transport_info,
    cancel_policy,
    terms_conditions,
    other_notes
  } = data;

  const finalStatus = ["draft", "active", "paused", "archived", "full"].includes(status)
    ? status
    : "draft";

  let finalSlug = slug || createSlug(title);
  if (!finalSlug) {
    finalSlug = `tour-${id}`;
  }

  if (await isTourCodeExists(providerId, code, id)) {
    throw new Error("Mã tour đã tồn tại");
  }

  if (await isTourSlugExists(providerId, finalSlug, id)) {
    finalSlug = `${finalSlug}-${id}`;
  }

  const finalItinerary =
    Array.isArray(itinerary) && itinerary.length > 0 ? JSON.stringify(itinerary) : null;

  const finalIncludes =
    Array.isArray(includes) && includes.length > 0 ? JSON.stringify(includes) : null;

  const finalExcludes =
    Array.isArray(excludes) && excludes.length > 0 ? JSON.stringify(excludes) : null;

  const finalHighlights =
    Array.isArray(highlights) && highlights.length > 0 ? JSON.stringify(highlights) : null;

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    await conn.query(
      `
      UPDATE tours
      SET
        title = ?,
        slug = ?,
        code = ?,
        description = ?,
        highlights = ?,
        itinerary = ?,
        location = ?,
        meeting_point = ?,
        latitude = ?,
        longitude = ?,
        base_price = ?,
        sale_price = ?,
        tax_percent = ?,
        tax = ?,
        final_price = ?,
        duration_days = ?,
        duration_text = ?,
        max_capacity = ?,
        thumbnail_url = ?,
        includes = ?,
        excludes = ?,
        start_date = ?,
        end_date = ?,
        hotel_info = ?,
        transport_info = ?,
        cancel_policy = ?,
        terms_conditions = ?,
        other_notes = ?,
        status = ?
      WHERE provider_id = ?
        AND id = ?
      `,
      [
        title || null,
        finalSlug,
        code || null,
        short_description || description || null,
        finalHighlights,
        finalItinerary,
        location || null,
        meeting_point || null,
        latitude ?? null,
        longitude ?? null,
        base_price || 0,
        sale_price || 0,
        Number(tax_percent) >= 0 ? Number(tax_percent) : 0,
        Number(tax) >= 0 ? Number(tax) : 0,
        Number(final_price) >= 0 ? Number(final_price) : 0,
        duration_days || 1,
        duration_text || null,
        max_capacity || 1,
        thumbnail_url || null,
        finalIncludes,
        finalExcludes,
        start_date || null,
        end_date || null,
        hotel_info || null,
        transport_info || null,
        cancel_policy || null,
        terms_conditions || null,
        other_notes || null,
        finalStatus,
        providerId,
        id
      ]
    );

    await conn.query(`DELETE FROM tour_category_map WHERE tour_id = ?`, [id]);

    if (category_id) {
      await conn.query(
        `INSERT INTO tour_category_map (tour_id, category_id) VALUES (?, ?)`,
        [id, category_id]
      );
    }

    await conn.query(`DELETE FROM tour_images WHERE tour_id = ?`, [id]);

    const insertedUrls = new Set();

    if (thumbnail_url) {
      const normalizedCover = String(thumbnail_url).trim();

      await conn.query(
        `
        INSERT INTO tour_images (tour_id, image_url, display_order, is_cover)
        VALUES (?, ?, 0, 1)
        `,
        [id, normalizedCover]
      );

      insertedUrls.add(normalizedCover);
    }

    if (Array.isArray(gallery_images) && gallery_images.length > 0) {
      let displayOrder = 1;

      for (const imageUrl of gallery_images) {
        const normalizedUrl = String(imageUrl || "").trim();
        if (!normalizedUrl || insertedUrls.has(normalizedUrl)) continue;

        await conn.query(
          `
          INSERT INTO tour_images (tour_id, image_url, display_order, is_cover)
          VALUES (?, ?, ?, 0)
          `,
          [id, normalizedUrl, displayOrder]
        );

        insertedUrls.add(normalizedUrl);
        displayOrder += 1;
      }
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function deleteTour(id) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM tour_images WHERE tour_id = ?`, [id]);
    await conn.query(`DELETE FROM tour_category_map WHERE tour_id = ?`, [id]);
    await conn.query(`DELETE FROM tours WHERE id = ?`, [id]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function updateTourStatus(id, status) {
  await db.query(`UPDATE tours SET status = ? WHERE id = ?`, [status, id]);
}

export async function getBookingsByProvider(providerId) {
  const [rows] = await db.query(
    `
    SELECT
      b.id AS booking_id,
      b.booking_code,
      b.status AS booking_status,
      b.final_price,
      b.booked_at,
      b.cancelled_reason,
      b.payment_method,
      COALESCE(u.full_name, b.contact_name) AS customer_name,
      COALESCE(u.phone, b.contact_phone) AS customer_phone,
      COALESCE(u.email, b.contact_email) AS customer_email,
      t.title AS tour_title,
      ts.departure_date,
      ts.return_date,
      (
        COALESCE(b.num_adults, 0)
        + COALESCE(b.num_children, 0)
        + COALESCE(b.num_infants, 0)
      ) AS total_pax
    FROM bookings b
    JOIN tours t ON t.id = b.tour_id
    LEFT JOIN tour_schedules ts ON ts.id = b.schedule_id
    LEFT JOIN users u ON u.id = b.user_id
    WHERE t.provider_id = ?
    ORDER BY b.booked_at DESC, b.id DESC
    `,
    [providerId]
  );
  return rows;
}

export async function getProviderBookingById(providerId, bookingId) {
  const [rows] = await db.query(
    `
    SELECT
      b.id AS booking_id,
      b.booking_code,
      b.status AS booking_status,
      b.cancelled_reason,
      b.final_price,
      b.booked_at,
      COALESCE(u.full_name, b.contact_name) AS customer_name
    FROM bookings b
    JOIN tours t ON t.id = b.tour_id
    LEFT JOIN users u ON u.id = b.user_id
    WHERE b.id = ?
      AND t.provider_id = ?
    LIMIT 1
    `,
    [bookingId, providerId],
  );
  return rows[0] || null;
}

export async function updateBookingStatus(bookingId, status) {
  if (status === "cancelled") {
    await db.query(
      `
      UPDATE bookings
      SET status = ?,
          cancelled_at = COALESCE(cancelled_at, NOW()),
          updated_at = NOW()
      WHERE id = ?
      `,
      [status, bookingId],
    );
    return;
  }

  await db.query(
    `UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?`,
    [status, bookingId],
  );
}

export async function approveBookingCancelRequest(providerId, bookingId) {
  const booking = await getProviderBookingById(providerId, bookingId);
  if (!booking) {
    throw new Error("Không tìm thấy booking");
  }
  if (booking.booking_status !== "cancel_requested") {
    throw new Error("Booking không ở trạng thái yêu cầu hủy");
  }
  await updateBookingStatus(bookingId, "cancelled");
  return booking;
}

const GUIDE_ACTIVE_TOUR_STATUSES = ["draft", "active", "paused", "full"];

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

/** before | ongoing | completed | unknown (chưa có ngày bắt đầu) */
export function getTourLifecyclePhase(startDate, endDate) {
  const today = toLocalYmd(new Date());
  const start = toLocalYmd(startDate);
  const end = toLocalYmd(endDate) || start;
  if (!start) return "unknown";
  if (today < start) return "before";
  if (today > end) return "completed";
  return "ongoing";
}

export function getTourActionsLockedMessage(phase) {
  if (phase === "ongoing") {
    return "Tour đang diễn ra. Không thể chỉnh sửa, xóa hoặc đổi trạng thái.";
  }
  if (phase === "completed") {
    return "Tour đã kết thúc. Không thể chỉnh sửa, xóa hoặc đổi trạng thái.";
  }
  return "";
}

export function canUseTourManagementActions(startDate, endDate) {
  const phase = getTourLifecyclePhase(startDate, endDate);
  return phase === "before" || phase === "unknown";
}

export async function assertTourManagementActionsAllowed(providerId, tourId) {
  const [rows] = await db.query(
    `
    SELECT
      DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
      management_actions_unlocked
    FROM tours
    WHERE id = ?
      AND provider_id = ?
    LIMIT 1
    `,
    [tourId, providerId],
  );

  if (!rows.length) {
    throw new Error("Không tìm thấy tour");
  }

  if (rows[0].management_actions_unlocked) {
    return;
  }

  const phase = getTourLifecyclePhase(rows[0].start_date, rows[0].end_date);
  const message = getTourActionsLockedMessage(phase);
  if (message) {
    throw new Error(message);
  }
}

export async function unlockTourManagementActions(providerId, tourId) {
  const [result] = await db.query(
    `
    UPDATE tours
    SET management_actions_unlocked = 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND provider_id = ?
    `,
    [tourId, providerId],
  );

  return result.affectedRows > 0;
}

export async function lockTourManagementActions(providerId, tourId) {
  const [result] = await db.query(
    `
    UPDATE tours
    SET management_actions_unlocked = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND provider_id = ?
    `,
    [tourId, providerId],
  );

  return result.affectedRows > 0;
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

/** Kết thúc ngày 19 → tour mới phải bắt đầu từ ngày 21 (≥2 ngày lịch giữa end và start). */
const MIN_DAYS_BETWEEN_TOUR_END_AND_NEXT_START = 2;

function ymdToLocalDate(ymd) {
  const key = toLocalYmd(ymd);
  if (!key) return null;
  return new Date(
    Number(key.slice(0, 4)),
    Number(key.slice(5, 7)) - 1,
    Number(key.slice(8, 10)),
  );
}

function daysBetweenYmd(fromYmd, toYmd) {
  const from = ymdToLocalDate(fromYmd);
  const to = ymdToLocalDate(toYmd);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function addDaysToYmd(ymd, days) {
  const d = ymdToLocalDate(ymd);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return toLocalYmd(d);
}

function formatDateVNFromYmd(ymd) {
  const key = toLocalYmd(ymd);
  if (!key) return "";
  const [y, m, da] = key.split("-");
  return `${da}/${m}/${y}`;
}

function toursHaveScheduleGap(start1, end1, start2, end2) {
  const s1 = toLocalYmd(start1);
  const e1 = toLocalYmd(end1) || s1;
  const s2 = toLocalYmd(start2);
  const e2 = toLocalYmd(end2) || s2;
  if (!s1 || !s2) return true;

  if (!(e1 < s2 || e2 < s1)) return false;

  if (e1 < s2) {
    const gap = daysBetweenYmd(e1, s2);
    if (gap != null && gap < MIN_DAYS_BETWEEN_TOUR_END_AND_NEXT_START) return false;
  }
  if (e2 < s1) {
    const gap = daysBetweenYmd(e2, s1);
    if (gap != null && gap < MIN_DAYS_BETWEEN_TOUR_END_AND_NEXT_START) return false;
  }
  return true;
}

function buildScheduleConflictMessage(
  newStart,
  newEnd,
  newTitle,
  otherStart,
  otherEnd,
  otherTitle,
) {
  const s1 = toLocalYmd(newStart);
  const e1 = toLocalYmd(newEnd) || s1;
  const s2 = toLocalYmd(otherStart);
  const e2 = toLocalYmd(otherEnd) || s2;
  const otherName = otherTitle || "khác";
  const newName = newTitle || "này";

  if (!s1 || !s2) {
    return `Không thể phân công do thiếu ngày khởi hành/kết thúc của tour.`;
  }

  if (!(e1 < s2 || e2 < s1)) {
    return `Hướng dẫn viên đã được phân công tour "${otherName}" trùng thời gian với tour "${newName}".`;
  }

  if (e1 < s2) {
    const minOtherStart = addDaysToYmd(e1, MIN_DAYS_BETWEEN_TOUR_END_AND_NEXT_START);
    return `Tour "${otherName}" phải bắt đầu từ ${formatDateVNFromYmd(minOtherStart)} trở đi (sau tour "${newName}" kết thúc ${formatDateVNFromYmd(e1)}, cần ít nhất 1 ngày nghỉ).`;
  }

  const minNewStart = addDaysToYmd(e2, MIN_DAYS_BETWEEN_TOUR_END_AND_NEXT_START);
  return `Tour "${newName}" phải bắt đầu từ ${formatDateVNFromYmd(minNewStart)} trở đi (sau tour "${otherName}" kết thúc ${formatDateVNFromYmd(e2)}, cần ít nhất 1 ngày nghỉ).`;
}

async function getAssignedToursByGuideMap(providerId) {
  const statusPlaceholders = GUIDE_ACTIVE_TOUR_STATUSES.map(() => "?").join(", ");
  const [rows] = await db.query(
    `
    SELECT
      t.guide_id,
      t.id,
      t.title,
      DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(t.end_date, '%Y-%m-%d') AS end_date
    FROM tours t
    WHERE t.provider_id = ?
      AND t.guide_id IS NOT NULL
      AND t.status IN (${statusPlaceholders})
      AND t.guide_completed_at IS NULL
    `,
    [providerId, ...GUIDE_ACTIVE_TOUR_STATUSES],
  );

  const map = new Map();
  for (const row of rows) {
    const gid = Number(row.guide_id);
    if (!map.has(gid)) map.set(gid, []);
    map.get(gid).push({
      id: Number(row.id),
      title: row.title || "",
      start_date: row.start_date,
      end_date: row.end_date,
    });
  }
  return map;
}

async function assertGuideTourScheduleNoConflict(providerId, tourId, guideId) {
  const [newTourRows] = await db.query(
    `
    SELECT
      title,
      DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
    FROM tours
    WHERE id = ?
      AND provider_id = ?
    LIMIT 1
    `,
    [tourId, providerId],
  );

  if (!newTourRows.length) {
    throw new Error("Không tìm thấy tour");
  }

  const newTour = newTourRows[0];
  if (!toLocalYmd(newTour.start_date)) {
    throw new Error(
      "Tour chưa có ngày khởi hành/kết thúc. Vui lòng cập nhật lịch tour trước khi phân công HDV.",
    );
  }

  const statusPlaceholders = GUIDE_ACTIVE_TOUR_STATUSES.map(() => "?").join(", ");
  const [otherRows] = await db.query(
    `
    SELECT
      id,
      title,
      DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
    FROM tours
    WHERE guide_id = ?
      AND provider_id = ?
      AND id <> ?
      AND status IN (${statusPlaceholders})
      AND guide_completed_at IS NULL
    `,
    [guideId, providerId, tourId, ...GUIDE_ACTIVE_TOUR_STATUSES],
  );

  for (const other of otherRows) {
    if (
      toursHaveScheduleGap(
        newTour.start_date,
        newTour.end_date,
        other.start_date,
        other.end_date,
      )
    ) {
      continue;
    }
    throw new Error(
      buildScheduleConflictMessage(
        newTour.start_date,
        newTour.end_date,
        newTour.title,
        other.start_date,
        other.end_date,
        other.title,
      ),
    );
  }
}

function computeScheduleMatchFromFreeDates(freeDates, tourDays) {
  const freeSet = new Set(
    (Array.isArray(freeDates) ? freeDates : [])
      .map((d) => toLocalYmd(d))
      .filter(Boolean),
  );
  let matched = 0;
  for (const day of tourDays) {
    if (freeSet.has(day)) matched += 1;
  }
  const total = tourDays.length;
  let schedule_match = "none";
  if (total && matched === total) schedule_match = "full";
  else if (matched > 0) schedule_match = "partial";
  return {
    schedule_match,
    matched_days: matched,
    total_tour_days: total,
  };
}

export async function getGuides(providerId) {
  const statusPlaceholders = GUIDE_ACTIVE_TOUR_STATUSES.map(() => "?").join(", ");
  const [rows] = await db.query(
    `
    SELECT
      g.*,
      u.full_name,
      u.avatar_url,
      (
        SELECT t.id
        FROM tours t
        WHERE t.guide_id = g.id
          AND t.provider_id = g.provider_id
          AND t.status IN (${statusPlaceholders})
          AND t.guide_completed_at IS NULL
        ORDER BY t.start_date ASC, t.id DESC
        LIMIT 1
      ) AS active_tour_id,
      (
        SELECT t.title
        FROM tours t
        WHERE t.guide_id = g.id
          AND t.provider_id = g.provider_id
          AND t.status IN (${statusPlaceholders})
          AND t.guide_completed_at IS NULL
        ORDER BY t.start_date ASC, t.id DESC
        LIMIT 1
      ) AS active_tour_title
    FROM guides g
    JOIN users u ON g.user_id = u.id
    WHERE g.provider_id = ?
    `,
    [...GUIDE_ACTIVE_TOUR_STATUSES, ...GUIDE_ACTIVE_TOUR_STATUSES, providerId]
  );
  return rows;
}

export async function getGuidesForAssignment(providerId, tourId = null) {
  const guides = await getGuides(providerId);
  const tourIdNum = tourId != null ? Number(tourId) : null;

  const [allAvailRowsBase] = await db.query(
    `
    SELECT ga.guide_id, DATE_FORMAT(ga.avail_date, '%Y-%m-%d') AS avail_date
    FROM guide_availability ga
    INNER JOIN guides g ON g.id = ga.guide_id
    WHERE g.provider_id = ?
    `,
    [providerId],
  );
  const allFreeByGuideBase = new Map();
  for (const row of allAvailRowsBase) {
    const gid = Number(row.guide_id);
    const key = toLocalYmd(row.avail_date);
    if (!key) continue;
    if (!allFreeByGuideBase.has(gid)) allFreeByGuideBase.set(gid, []);
    allFreeByGuideBase.get(gid).push(key);
  }

  const activeTourIds = [
    ...new Set(
      guides
        .map((g) => (g.active_tour_id != null ? Number(g.active_tour_id) : null))
        .filter(Boolean),
    ),
  ];
  const activeTourMap = new Map();
  if (activeTourIds.length) {
    const [activeTourRows] = await db.query(
      `
      SELECT
        id,
        DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
      FROM tours
      WHERE id IN (?)
        AND provider_id = ?
      `,
      [activeTourIds, providerId],
    );
    for (const row of activeTourRows) {
      activeTourMap.set(Number(row.id), row);
    }
  }

  let suggestTourDays = [];
  let targetTourForConflict = null;
  if (tourIdNum) {
    const [tourRows] = await db.query(
      `
      SELECT
        title,
        DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
      FROM tours
      WHERE id = ? AND provider_id = ?
      LIMIT 1
      `,
      [tourIdNum, providerId],
    );
    if (tourRows.length) {
      targetTourForConflict = tourRows[0];
      suggestTourDays = buildInclusiveDateKeys(
        tourRows[0].start_date,
        tourRows[0].end_date,
      );
    }
  }

  const assignedByGuide = await getAssignedToursByGuideMap(providerId);

  return guides.map((guide) => {
    const gid = Number(guide.id);
    const freeDates = allFreeByGuideBase.get(gid) || [];
    const activeTourId =
      guide.active_tour_id != null ? Number(guide.active_tour_id) : null;

    let activeMatch = {
      schedule_match: "unknown",
      matched_days: 0,
      total_tour_days: 0,
    };
    if (activeTourId && activeTourMap.has(activeTourId)) {
      const activeTour = activeTourMap.get(activeTourId);
      const activeDays = buildInclusiveDateKeys(
        activeTour.start_date,
        activeTour.end_date,
      );
      activeMatch = computeScheduleMatchFromFreeDates(freeDates, activeDays);
    }

    let suggestMatch = {
      schedule_match: "unknown",
      matched_days: 0,
      total_tour_days: 0,
    };
    if (suggestTourDays.length) {
      suggestMatch = computeScheduleMatchFromFreeDates(freeDates, suggestTourDays);
    }

    const assigned_tours = assignedByGuide.get(gid) || [];
    let has_schedule_conflict = false;
    if (targetTourForConflict && toLocalYmd(targetTourForConflict.start_date)) {
      has_schedule_conflict = assigned_tours.some(
        (t) =>
          Number(t.id) !== tourIdNum &&
          !toursHaveScheduleGap(
            targetTourForConflict.start_date,
            targetTourForConflict.end_date,
            t.start_date,
            t.end_date,
          ),
      );
    }
    const is_suggested =
      suggestMatch.schedule_match === "full" && !has_schedule_conflict;
    const has_invalid_active_tour =
      Boolean(activeTourId) &&
      activeMatch.total_tour_days > 0 &&
      activeMatch.schedule_match !== "full";

    return {
      ...guide,
      free_dates: freeDates,
      assigned_tours,
      has_schedule_conflict,
      schedule_match: suggestMatch.schedule_match,
      matched_days: suggestMatch.matched_days,
      total_tour_days: suggestMatch.total_tour_days,
      is_suggested,
      active_tour_schedule_match: activeMatch.schedule_match,
      active_tour_matched_days: activeMatch.matched_days,
      active_tour_total_days: activeMatch.total_tour_days,
      has_invalid_active_tour,
    };
  });
}

export async function getToursForGuideAssignment(providerId) {
  const [rows] = await db.query(
    `
    SELECT
      t.id,
      t.title,
      t.location,
      DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(t.end_date, '%Y-%m-%d') AS end_date,
      t.max_capacity,
      t.status,
      t.guide_id,
      u.full_name AS guide_name
    FROM tours t
    LEFT JOIN guides g ON g.id = t.guide_id
    LEFT JOIN users u ON u.id = g.user_id
    WHERE t.provider_id = ?
      AND t.status IN ('draft', 'active', 'paused', 'full')
    ORDER BY
      CASE WHEN t.start_date IS NULL THEN 1 ELSE 0 END,
      t.start_date ASC,
      t.id DESC
    `,
    [providerId]
  );

  return rows;
}

async function assertGuideHasFullAvailabilityForTour(providerId, tourId, guideId) {
  const [tourRows] = await db.query(
    `
    SELECT
      DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
      title
    FROM tours
    WHERE id = ?
      AND provider_id = ?
    LIMIT 1
    `,
    [tourId, providerId],
  );

  if (!tourRows.length) {
    throw new Error("Không tìm thấy tour");
  }

  const tourDays = buildInclusiveDateKeys(
    tourRows[0].start_date,
    tourRows[0].end_date,
  );

  if (!tourDays.length) {
    throw new Error(
      "Tour chưa có ngày khởi hành/kết thúc. Vui lòng cập nhật lịch tour trước khi phân công HDV.",
    );
  }

  const [availRows] = await db.query(
    `
    SELECT avail_date
    FROM guide_availability
    WHERE guide_id = ?
      AND avail_date BETWEEN ? AND ?
    `,
    [guideId, tourDays[0], tourDays[tourDays.length - 1]],
  );

  const freeSet = new Set(
    availRows.map((row) => toLocalYmd(row.avail_date)).filter(Boolean),
  );

  let matched = 0;
  for (const day of tourDays) {
    if (freeSet.has(day)) matched += 1;
  }

  if (matched !== tourDays.length) {
    const missing = tourDays.filter((day) => !freeSet.has(day));
    const rangeText =
      tourDays.length > 1
        ? `${tourDays[0]} → ${tourDays[tourDays.length - 1]}`
        : tourDays[0];

    for (const tourDay of missing) {
      const monthDay = tourDay.slice(5);
      const sameCalendarDay = [...freeSet].find((d) => d.slice(5) === monthDay);
      if (sameCalendarDay && sameCalendarDay !== tourDay) {
        throw new Error(
          `Tour cần ngày ${tourDay} nhưng HDV chỉ đăng ký rảnh ${sameCalendarDay} (khác năm). ` +
            `Hãy cập nhật ngày tour trong Quản lý tour cho khớp năm ${sameCalendarDay.slice(0, 4)}, ` +
            `hoặc yêu cầu HDV đăng ký đúng ngày ${tourDay} trong Lịch trình.`,
        );
      }
    }

    throw new Error(
      `Hướng dẫn viên chưa đăng ký đủ ngày rảnh cho tour (${matched}/${tourDays.length} ngày, lịch tour: ${rangeText}). Còn thiếu: ${missing.join(", ")}.`,
    );
  }
}

export async function assignGuideToTour(providerId, tourId, guideId) {
  const [tourRows] = await db.query(
    `
    SELECT id
    FROM tours
    WHERE id = ?
      AND provider_id = ?
    LIMIT 1
    `,
    [tourId, providerId]
  );

  if (!tourRows.length) {
    throw new Error("Không tìm thấy tour");
  }

  const [guideRows] = await db.query(
    `
    SELECT id
    FROM guides
    WHERE id = ?
      AND provider_id = ?
    LIMIT 1
    `,
    [guideId, providerId]
  );

  if (!guideRows.length) {
    throw new Error("Không tìm thấy hướng dẫn viên");
  }

  await assertGuideTourScheduleNoConflict(providerId, tourId, guideId);
  await assertGuideHasFullAvailabilityForTour(providerId, tourId, guideId);

  await db.query(
    `
    UPDATE tours
    SET guide_id = ?
    WHERE id = ?
      AND provider_id = ?
    `,
    [guideId, tourId, providerId]
  );

  const [rows] = await db.query(
    `
    SELECT
      t.id,
      t.title,
      t.location,
      t.start_date,
      t.max_capacity,
      t.status,
      t.guide_id,
      u.full_name AS guide_name
    FROM tours t
    LEFT JOIN guides g ON g.id = t.guide_id
    LEFT JOIN users u ON u.id = g.user_id
    WHERE t.id = ?
      AND t.provider_id = ?
    LIMIT 1
    `,
    [tourId, providerId]
  );

  return rows[0] || null;
}

export async function unassignGuideFromTour(providerId, tourId) {
  const [tourRows] = await db.query(
    `
    SELECT id, guide_id
    FROM tours
    WHERE id = ?
      AND provider_id = ?
    LIMIT 1
    `,
    [tourId, providerId],
  );

  if (!tourRows.length) {
    throw new Error("Không tìm thấy tour");
  }

  if (tourRows[0].guide_id == null) {
    throw new Error("Tour này chưa có hướng dẫn viên được phân công");
  }

  await db.query(
    `
    UPDATE tours
    SET guide_id = NULL
    WHERE id = ?
      AND provider_id = ?
    `,
    [tourId, providerId],
  );

  const [rows] = await db.query(
    `
    SELECT
      t.id,
      t.title,
      t.location,
      t.start_date,
      t.max_capacity,
      t.status,
      t.guide_id,
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

export async function getProviderProfile(providerId) {
  const [rows] = await db.query(
    `
    SELECT
      p.id,
      p.user_id,
      p.company_name,
      p.description,
      p.address,
      p.website_url,
      p.license_number,
      p.tax_code,
      p.phone,
      p.hotline,
      p.email,
      p.logo_url,
      p.bank_name,
      p.bank_branch,
      p.bank_account_number,
      p.bank_account_name,
      p.status,
      p.created_at,
      p.updated_at,
      u.full_name AS account_name,
      u.email AS account_email
    FROM providers p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
    LIMIT 1
    `,
    [providerId]
  );

  if (!rows.length) return null;

  const provider = rows[0];

  const [[tourStats]] = await db.query(
    `SELECT COUNT(*) AS total_tours FROM tours WHERE provider_id = ?`,
    [providerId]
  );

  const [[customerStats]] = await db.query(
    `
    SELECT COUNT(DISTINCT b.user_id) AS total_customers
    FROM bookings b
    JOIN tours t ON b.tour_id = t.id
    WHERE t.provider_id = ?
    `,
    [providerId]
  );

  return {
    companyName: provider.company_name || "",
    companyShortName: provider.company_name || "",
    companyDisplayName: provider.company_name || "",
    providerType: "Nhà cung cấp tour du lịch",
    taxCode: provider.tax_code || "",
    businessLicense: provider.license_number || "",
    companyDescription: provider.description || "",
    phone: provider.phone || "",
    hotline: provider.hotline || provider.phone || "",
    contactEmail: provider.email || provider.account_email || "",
    address: provider.address || "",
    website: provider.website_url || "",
    bankName: provider.bank_name || "",
    bankBranch: provider.bank_branch || "",
    bankAccountNumber: provider.bank_account_number || "",
    bankAccountName: provider.bank_account_name || "",
    logoUrl: provider.logo_url || "",
    rating: 4.9,
    totalTours: Number(tourStats?.total_tours || 0),
    totalReviews: 0,
    totalCustomers: Number(customerStats?.total_customers || 0),
    memberSince: provider.created_at || null,
    accountName: provider.account_name || "Provider",
    accountEmail: provider.account_email || provider.email || "",
    certificates: [
      {
        name: "Giấy phép kinh doanh",
        status: provider.license_number ? "Đã xác minh" : "Chưa cập nhật"
      }
    ]
  };
}

export async function updateProviderProfile(providerId, data) {
  const {
    companyName,
    taxCode,
    businessLicense,
    companyDescription,
    phone,
    hotline,
    contactEmail,
    address,
    website,
    bankName,
    bankBranch,
    bankAccountNumber,
    bankAccountName,
    logoUrl
  } = data;

  await db.query(
    `
    UPDATE providers
    SET
      company_name = ?,
      tax_code = ?,
      license_number = ?,
      description = ?,
      phone = ?,
      hotline = ?,
      email = ?,
      address = ?,
      website_url = ?,
      bank_name = ?,
      bank_branch = ?,
      bank_account_number = ?,
      bank_account_name = ?,
      logo_url = ?
    WHERE id = ?
    `,
    [
      companyName || null,
      taxCode || null,
      businessLicense || null,
      companyDescription || null,
      phone || null,
      hotline || null,
      contactEmail || null,
      address || null,
      website || null,
      bankName || null,
      bankBranch || null,
      bankAccountNumber || null,
      bankAccountName || null,
      logoUrl || null,
      providerId
    ]
  );

  return getProviderProfile(providerId);
}

function mapProviderDashboardBookingStatus(status) {
  const s = String(status || "").toLowerCase();
  if (["confirmed", "paid", "in_progress"].includes(s)) {
    return { label: "Đã xác nhận", statusClass: "confirmed" };
  }
  if (s === "completed") {
    return { label: "Hoàn thành", statusClass: "confirmed" };
  }
  if (s === "cancelled" || s === "canceled") {
    return { label: "Đã hủy", statusClass: "pending" };
  }
  if (s === "pending_payment") {
    return { label: "Thanh toán đang chờ xử lý", statusClass: "pending" };
  }
  if (s === "pending") {
    return { label: "Chờ xử lý", statusClass: "pending" };
  }
  if (s === "refunded") {
    return { label: "Đã hoàn tiền", statusClass: "pending" };
  }
  return { label: status || "Không xác định", statusClass: "pending" };
}

export async function getDashboardDataByProvider(providerId) {
  const [[totalToursRow]] = await db.query(
    `SELECT COUNT(*) AS totalTours FROM tours WHERE provider_id = ?`,
    [providerId]
  );

  const [[activeToursRow]] = await db.query(
    `SELECT COUNT(*) AS activeTours FROM tours WHERE provider_id = ? AND status = 'active'`,
    [providerId]
  );

  const [[bookingsTodayRow]] = await db.query(
    `
    SELECT COUNT(*) AS bookingsToday
    FROM bookings b
    JOIN tours t ON b.tour_id = t.id
    WHERE t.provider_id = ?
      AND DATE(b.booked_at) = CURDATE()
    `,
    [providerId]
  );

  const [[revenueMonthRow]] = await db.query(
    `
    SELECT COALESCE(SUM(COALESCE(b.final_price, 0)), 0) AS revenueMonth
    FROM bookings b
    JOIN tours t ON b.tour_id = t.id
    WHERE t.provider_id = ?
      AND b.status IN ('confirmed', 'paid', 'in_progress', 'completed')
      AND MONTH(b.booked_at) = MONTH(CURDATE())
      AND YEAR(b.booked_at) = YEAR(CURDATE())
    `,
    [providerId]
  );

  const defaultCharts = {
    labels: ["T1", "T2", "T3", "T4", "T5", "T6"],
    revenue: [0, 0, 0, 0, 0, 0],
    bookings: [0, 0, 0, 0, 0, 0]
  };

  let charts = { ...defaultCharts };
  try {
    const overview = await getProviderReportOverview({ providerId, months: 6, topLimit: 5 });
    if (overview?.monthlyBookings?.length) {
      charts = {
        labels: overview.monthlyBookings.map((m) => m.label),
        revenue: overview.monthlyRevenue.map((m) => Number(m.value) || 0),
        bookings: overview.monthlyBookings.map((m) => Number(m.value) || 0)
      };
    }
  } catch {
    /* giữ defaultCharts */
  }

  let recentBookings = [];
  try {
    const [rows] = await db.query(
      `
      SELECT
        b.status,
        b.booked_at,
        u.full_name AS customer_name,
        t.title AS tour_title
      FROM bookings b
      JOIN tours t ON t.id = b.tour_id
      LEFT JOIN users u ON u.id = b.user_id
      WHERE t.provider_id = ?
      ORDER BY b.booked_at DESC, b.id DESC
      LIMIT 8
      `,
      [providerId]
    );
    recentBookings = (rows || []).map((b) => {
      const m = mapProviderDashboardBookingStatus(b.status);
      return {
        customer: b.customer_name || "Khách hàng",
        tour: b.tour_title || "Tour",
        date: b.booked_at,
        status: m.label,
        statusClass: m.statusClass
      };
    });
  } catch {
    recentBookings = [];
  }

  let upcomingTours = [];
  try {
    const [rows] = await db.query(
      `
      SELECT
        t.title,
        t.start_date,
        t.max_capacity,
        COALESCE(u.full_name, 'Chưa phân công') AS guide_name
      FROM tours t
      LEFT JOIN guides g ON g.id = t.guide_id
      LEFT JOIN users u ON u.id = g.user_id
      WHERE t.provider_id = ?
        AND t.start_date IS NOT NULL
        AND DATE(t.start_date) >= CURDATE()
        AND t.status IN ('active', 'paused', 'full')
      ORDER BY t.start_date ASC
      LIMIT 8
      `,
      [providerId]
    );
    upcomingTours = (rows || []).map((t) => ({
      name: t.title || "Tour",
      guide: `HDV: ${t.guide_name || "Chưa phân công"}`,
      date: t.start_date,
      guests: t.max_capacity != null ? `${Number(t.max_capacity)} chỗ` : "—"
    }));
  } catch {
    upcomingTours = [];
  }

  return {
    stats: {
      totalTours: Number(totalToursRow?.totalTours || 0),
      bookingsToday: Number(bookingsTodayRow?.bookingsToday || 0),
      activeTours: Number(activeToursRow?.activeTours || 0),
      revenueMonth: Number(revenueMonthRow?.revenueMonth || 0)
    },
    charts,
    recentBookings,
    upcomingTours
  };
}

function toIsoDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export async function getProviderNotifications(providerId, limit = 12) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 12));
  const notifications = [];

  const [providerRows] = await db.query(
    `
    SELECT status, updated_at
    FROM providers
    WHERE id = ?
    LIMIT 1
    `,
    [providerId]
  );

  if (providerRows.length > 0) {
    const provider = providerRows[0];
    const status = String(provider.status || "").toLowerCase();
    let subtitle = "Tài khoản nhà cung cấp của bạn có cập nhật mới từ admin.";
    let tone = "blue";

    if (status === "active") {
      subtitle = "Admin đã duyệt tài khoản nhà cung cấp của bạn.";
      tone = "green";
    } else if (status === "pending") {
      subtitle = "Tài khoản đang chờ admin phê duyệt.";
      tone = "orange";
    } else if (status === "blocked" || status === "inactive") {
      subtitle = "Tài khoản nhà cung cấp đang bị tạm khóa bởi admin.";
      tone = "red";
    }

    notifications.push({
      id: "provider-status",
      type: "admin_provider_status",
      title: "Thông báo từ Admin",
      subtitle,
      date: toIsoDate(provider.updated_at),
      href: "profile.html",
      tone
    });
  }

  const [tourRows] = await db.query(
    `
    SELECT id, title, status, updated_at
    FROM tours
    WHERE provider_id = ?
      AND status IN ('active', 'paused', 'archived', 'full')
    ORDER BY updated_at DESC, id DESC
    LIMIT 20
    `,
    [providerId]
  );

  for (const row of tourRows) {
    const status = String(row.status || "").toLowerCase();
    let subtitle = `${row.title || "Tour"} có cập nhật trạng thái mới.`;
    let tone = "blue";

    if (status === "active") {
      subtitle = `Admin đã duyệt tour "${row.title || "Tour"}".`;
      tone = "green";
    } else if (status === "paused") {
      subtitle = `Tour "${row.title || "Tour"}" đang bị tạm dừng bởi admin.`;
      tone = "orange";
    } else if (status === "archived") {
      subtitle = `Tour "${row.title || "Tour"}" đã bị ẩn bởi admin.`;
      tone = "red";
    } else if (status === "full") {
      subtitle = `Tour "${row.title || "Tour"}" đã đủ chỗ.`;
      tone = "purple";
    }

    notifications.push({
      id: `tour-${row.id}`,
      type: "admin_tour_status",
      title: "Thông báo từ Admin",
      subtitle,
      date: toIsoDate(row.updated_at),
      href: "tour_management.html",
      tone
    });
  }

  const [bookingRows] = await db.query(
    `
    SELECT
      b.id,
      b.booked_at,
      b.status,
      t.title AS tour_title,
      u.full_name AS customer_name
    FROM bookings b
    JOIN tours t ON t.id = b.tour_id
    LEFT JOIN users u ON u.id = b.user_id
    WHERE t.provider_id = ?
    ORDER BY b.booked_at DESC, b.id DESC
    LIMIT 12
    `,
    [providerId]
  );

  for (const row of bookingRows || []) {
    notifications.push({
      id: `booking-${row.id}`,
      type: "booking",
      title: "Hoạt động booking",
      subtitle: `${row.customer_name || "Khách hàng"} · ${row.tour_title || "Tour"}`,
      date: toIsoDate(row.booked_at),
      href: "booking_management.html",
      tone: "blue"
    });
  }

  const [guideCompletedRows] = await db.query(
    `
    SELECT
      t.id,
      t.title,
      t.guide_completed_at,
      u.full_name AS guide_name
    FROM tours t
    LEFT JOIN guides g ON g.id = t.guide_id
    LEFT JOIN users u ON u.id = g.user_id
    WHERE t.provider_id = ?
      AND t.guide_completed_at IS NOT NULL
    ORDER BY t.guide_completed_at DESC, t.id DESC
    LIMIT 12
    `,
    [providerId],
  );

  for (const row of guideCompletedRows || []) {
    notifications.push({
      id: `guide-complete-${row.id}`,
      type: "guide_tour_completed",
      title: "HDV đã hoàn thành tour",
      subtitle: `${row.guide_name || "Hướng dẫn viên"} · ${row.title || "Tour"}`,
      date: toIsoDate(row.guide_completed_at),
      href: "tour_management.html",
      tone: "green",
    });
  }

  notifications.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  return {
    total: notifications.length,
    items: notifications.slice(0, safeLimit)
  };
}

export async function getPublicFeaturedTours(limit = 10) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 20);

  const [rows] = await db.query(
    `
    SELECT
      t.id,
      t.title,
      t.slug,
      t.description,
      t.location,
      t.meeting_point,
      t.latitude,
      t.longitude,
      t.base_price,
      t.sale_price,
      t.tax_percent,
      t.tax,
      t.final_price,
      t.duration_days,
      t.max_capacity,
      t.thumbnail_url,
      t.status,
      t.created_at,
      p.company_name AS provider_name,
      COALESCE(bc.booking_count, 0) AS booking_count,
      COALESCE(rv.rating_avg, 0) AS rating_avg,
      COALESCE(rv.rating_count, 0) AS rating_count,
      (
        COALESCE(bc.booking_count, 0) * 10
        + COALESCE(rv.rating_avg, 0) * COALESCE(rv.rating_count, 0)
      ) AS popularity_score
    FROM tours t
    LEFT JOIN providers p ON t.provider_id = p.id
    INNER JOIN (
      SELECT tour_id, COUNT(*) AS booking_count
      FROM bookings
      WHERE status IN ('confirmed', 'paid', 'in_progress', 'completed')
      GROUP BY tour_id
      HAVING COUNT(*) > 0
    ) bc ON bc.tour_id = t.id
    LEFT JOIN (
      SELECT
        tour_id,
        AVG(rating) AS rating_avg,
        COUNT(*) AS rating_count
      FROM reviews
      WHERE status = 'approved'
      GROUP BY tour_id
    ) rv ON rv.tour_id = t.id
    WHERE t.status = 'active'
    ORDER BY
      popularity_score DESC,
      booking_count DESC,
      rating_avg DESC,
      rating_count DESC,
      t.created_at DESC
    LIMIT ?
    `,
    [safeLimit]
  );

  return rows.map(row => {
    const pricing = resolvePublicTourPricing(row);
    const ratingAvg = Number(row.rating_avg || 0);
    const ratingCount = Number(row.rating_count || 0);
    const bookingCount = Number(row.booking_count || 0);

    return {
      ...row,
      ...pricing,
      booking_count: bookingCount,
      rating_count: ratingCount,
      rating_avg: ratingCount > 0 ? Math.round(ratingAvg * 10) / 10 : null,
      popularity_score: Number(row.popularity_score || 0)
    };
  });
}

export async function getPublicTours(filters = {}) {
  const { destination = "", limit = 20 } = filters;

  let sql = `
    SELECT
      t.id,
      t.title,
      t.slug,
      t.description,
      t.location,
      t.meeting_point,
      t.latitude,
      t.longitude,

      t.base_price,
      t.sale_price,
      t.tax_percent,
      t.tax,
      t.final_price,

      t.duration_days,
      t.duration_text,
      DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(t.end_date, '%Y-%m-%d') AS end_date,
      t.max_capacity,
      t.thumbnail_url,
      t.status,
      t.created_at,
      p.company_name AS provider_name,
      tcm.category_id,
      COALESCE(bc.booking_count, 0) AS booking_count,
      COALESCE(rv.rating_avg, 0) AS rating_avg,
      COALESCE(rv.rating_count, 0) AS rating_count
    FROM tours t
    LEFT JOIN providers p ON t.provider_id = p.id
    LEFT JOIN (
      SELECT tour_id, MIN(category_id) AS category_id
      FROM tour_category_map
      GROUP BY tour_id
    ) tcm ON tcm.tour_id = t.id
    LEFT JOIN (
      SELECT tour_id, COUNT(*) AS booking_count
      FROM bookings
      WHERE status IN ('confirmed', 'paid', 'in_progress', 'completed')
      GROUP BY tour_id
    ) bc ON bc.tour_id = t.id
    LEFT JOIN (
      SELECT
        tour_id,
        AVG(rating) AS rating_avg,
        COUNT(*) AS rating_count
      FROM reviews
      WHERE status = 'approved'
      GROUP BY tour_id
    ) rv ON rv.tour_id = t.id
    WHERE t.status = 'active'
  `;

  const params = [];

  if (destination) {
    sql += ` AND t.location LIKE ? `;
    params.push(`%${destination}%`);
  }

  sql += ` ORDER BY t.created_at DESC LIMIT ? `;
  params.push(Number(limit));

  const [rows] = await db.query(sql, params);

  return rows.map((row) => {
    const pricing = resolvePublicTourPricing(row);
    const ratingAvg = Number(row.rating_avg || 0);
    const ratingCount = Number(row.rating_count || 0);
    const bookingCount = Number(row.booking_count || 0);

    return {
      ...row,
      tax_percent: pricing.tax_percent,
      tax: pricing.tax,
      final_price: pricing.final_price,
      display_price: pricing.final_price,
      booking_count: bookingCount,
      rating_count: ratingCount,
      rating_avg: ratingCount > 0 ? Math.round(ratingAvg * 10) / 10 : null,
      rating:
        ratingCount > 0 ? Math.round(ratingAvg * 10) / 10 : null
    };
  });
}
export async function getPublicDiscountedTours(limit = 6) {
  const [rows] = await db.query(
    `
    SELECT
      t.id,
      t.title,
      t.slug,
      t.description,
      t.location,
      t.base_price,
      t.sale_price,
      t.tax_percent,
      t.tax,
      t.final_price,
      t.thumbnail_url,
      t.start_date,
      t.end_date,
      t.status,
      t.created_at,
      p.company_name AS provider_name
    FROM tours t
    LEFT JOIN providers p ON t.provider_id = p.id
    WHERE t.status = 'active'
      AND t.sale_price > 0
      AND t.sale_price < t.base_price
    ORDER BY t.created_at DESC
    LIMIT ?
    `,
    [Number(limit)]
  );

  return rows.map(row => {
    const pricing = resolvePublicTourPricing(row);
    return { ...row, ...pricing };
  });
}

export async function getPublicTourById(tourId) {
  const [rows] = await db.query(
    `
    SELECT
      t.id,
      t.title,
      t.slug,
      t.description,
      t.location,
      t.meeting_point,
      t.latitude,
      t.longitude,
      t.base_price,
      t.sale_price,
      t.tax_percent,
      t.tax,
      t.final_price,
      t.duration_days,
      t.duration_text,
      t.max_capacity,
      t.thumbnail_url,
      t.includes,
      t.excludes,
      t.itinerary,
      t.start_date,
      t.end_date,
      t.hotel_info,
      t.transport_info,
      t.cancel_policy,
      t.terms_conditions,
      t.other_notes,
      t.status,
      t.created_at,
      p.company_name AS provider_name
    FROM tours t
    LEFT JOIN providers p ON t.provider_id = p.id
    WHERE t.id = ?
      AND t.status = 'active'
    LIMIT 1
    `,
    [tourId]
  );

  if (!rows.length) return null;

  const tour = rows[0];
  const pricing = resolvePublicTourPricing(tour);

  const [imageRows] = await db.query(
    `
    SELECT image_url, is_cover, display_order
    FROM tour_images
    WHERE tour_id = ?
    ORDER BY is_cover DESC, display_order ASC, id ASC
    `,
    [tourId]
  );

  return {
    ...tour,
    ...pricing,
    cancel_policy: tour.cancel_policy || "",
    terms_conditions: tour.terms_conditions || "",
    other_notes: tour.other_notes || "",
    hotel_info: tour.hotel_info || "",
    transport_info: tour.transport_info || "",
    images: imageRows || []
  };
}

export async function getProviderIdByUserId(userId) {
  const uid = Number(userId);
  if (!uid) return null;
  const [[row]] = await db.query(`SELECT id FROM providers WHERE user_id = ? LIMIT 1`, [uid]);
  return row?.id ? Number(row.id) : null;
}

/**
 * Tài khoản role=provider đôi khi không có dòng `providers` (đổi role thủ công, seed cũ).
 * Tạo hồ sơ tối thiểu để /api/provider/* không trả 403.
 */
export async function ensureProviderRowForUser(userId) {
  const uid = Number(userId);
  if (!uid) return null;
  const existing = await getProviderIdByUserId(uid);
  if (existing) return existing;

  const [[user]] = await db.query(
    `SELECT id, email, full_name FROM users WHERE id = ? LIMIT 1`,
    [uid],
  );
  if (!user?.id) return null;

  const email = String(user.email || "").trim();
  const companyName =
    String(user.full_name || "").trim() ||
    email ||
    `Nhà cung cấp #${uid}`;

  try {
    await db.query(
      `INSERT INTO providers (user_id, company_name, email, status) VALUES (?, ?, ?, 'approved')`,
      [uid, companyName, email || null],
    );
  } catch (e) {
    const msg = String(e?.sqlMessage || e?.message || "");
    if (msg.includes("Unknown column 'email'")) {
      try {
        await db.query(
          `INSERT INTO providers (user_id, company_name, status) VALUES (?, ?, 'approved')`,
          [uid, companyName],
        );
      } catch (e2) {
        if (e2?.code !== "ER_DUP_ENTRY") throw e2;
      }
    } else if (e?.code !== "ER_DUP_ENTRY") {
      throw e;
    }
  }

  return getProviderIdByUserId(uid);
}

/** Có hồ sơ riêng → dùng id đó (acc admin cấp, dữ liệu rỗng). Không có → pool cũ (LEGACY_SHARED_PROVIDER_ID, mặc định 1). */
export async function resolveProviderScopeId(userId) {
  let own = await getProviderIdByUserId(userId);
  if (!own) {
    own = await ensureProviderRowForUser(userId);
  }
  if (own) return own;
  const legacy = Number(process.env.LEGACY_SHARED_PROVIDER_ID || 1);
  if (!Number.isFinite(legacy) || legacy <= 0) return null;
  const [[row]] = await db.query(`SELECT id FROM providers WHERE id = ? LIMIT 1`, [legacy]);
  return row?.id ? Number(row.id) : null;
}
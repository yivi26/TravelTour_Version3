import db from "../config/db.js";

export const createBooking = async (bookingData) => {
  const {
    user_id,
    tour_id,
    schedule_id,
    booking_code,
    num_adults,
    num_children,
    num_infants,
    total_price,
    discount_amount,
    final_price,
    status,
    contact_name,
    contact_phone,
    contact_email,
    special_requests,
    payment_method,
  } = bookingData;

  const sql = `
    INSERT INTO bookings (
      user_id,
      tour_id,
      schedule_id,
      booking_code,
      num_adults,
      num_children,
      num_infants,
      total_price,
      discount_amount,
      final_price,
      status,
      contact_name,
      contact_phone,
      contact_email,
      special_requests,
      payment_method,
      booked_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;

  const [result] = await db.execute(sql, [
    user_id,
    tour_id,
    schedule_id,
    booking_code,
    num_adults,
    num_children,
    num_infants,
    total_price,
    discount_amount,
    final_price,
    status,
    contact_name,
    contact_phone,
    contact_email,
    special_requests,
    payment_method,
  ]);

  return result;
};

export const createBookingTravelers = async (bookingId, travelers) => {
  // Đảm bảo cột phone tồn tại (idempotent — không ảnh hưởng nếu đã có)
  try {
    await db.query(
      `ALTER TABLE booking_travelers ADD COLUMN phone VARCHAR(20) NULL AFTER id_number`,
    );
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") {
      // Bỏ qua lỗi quyền/đang chạy, log nhẹ
      console.warn("booking_travelers ADD phone:", err.message);
    }
  }

  const sql = `
    INSERT INTO booking_travelers (
      booking_id,
      full_name,
      birth_date,
      gender,
      id_number,
      phone,
      traveler_type
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  for (const traveler of travelers) {
    await db.execute(sql, [
      bookingId,
      traveler.full_name,
      traveler.birth_date,
      traveler.gender,
      traveler.id_number || null,
      traveler.phone ? String(traveler.phone).slice(0, 20) : null,
      traveler.traveler_type,
    ]);
  }
};

export const getTourPriceById = async (tourId) => {
  const sql = `
    SELECT id, base_price, sale_price
    FROM tours
    WHERE id = ?
    LIMIT 1
  `;

  const [rows] = await db.execute(sql, [tourId]);
  return rows[0] || null;
};

export const updateBookedSlots = async (scheduleId, totalGuests) => {
  const sql = `
    UPDATE tour_schedules
    SET booked_slots = booked_slots + ?
    WHERE id = ?
  `;

  const [result] = await db.execute(sql, [totalGuests, scheduleId]);
  return result;
};
export const getRecentBookingsByUser = async (userId) => {
  const sql = `
    SELECT 
      b.id AS booking_id,
      b.booking_code,
      b.status,
      b.final_price,
      b.booked_at,

      t.title AS tour_name,
      t.location,

      ts.departure_date

    FROM bookings b
    JOIN tours t ON b.tour_id = t.id
    JOIN tour_schedules ts ON b.schedule_id = ts.id

    WHERE b.user_id = ?
    ORDER BY b.booked_at DESC
    LIMIT 3
  `;

  const [rows] = await db.execute(sql, [userId]);
  return rows;
};
export const getBookingDetailById = async (bookingId, userId) => {
  const sql = `
    SELECT
      b.id AS booking_id,
      b.booking_code,
      b.status,
      b.num_adults,
      b.num_children,
      b.num_infants,
      b.total_price,
      b.discount_amount,
      b.final_price,
      b.contact_name,
      b.contact_phone,
      b.contact_email,
      b.special_requests,
      b.payment_method,
      b.booked_at,

      t.id AS tour_id,
      t.title AS tour_name,
      t.location,

      ts.departure_date

    FROM bookings b
    JOIN tours t ON b.tour_id = t.id
    JOIN tour_schedules ts ON b.schedule_id = ts.id
    WHERE b.id = ? AND b.user_id = ?
    LIMIT 1
  `;

  const [rows] = await db.execute(sql, [bookingId, userId]);
  return rows[0] || null;
};

export const getBookingTravelersByBookingId = async (bookingId) => {
  const sql = `
    SELECT
      id,
      full_name,
      birth_date,
      gender,
      id_number,
      traveler_type
    FROM booking_travelers
    WHERE booking_id = ?
    ORDER BY id ASC
  `;

  const [rows] = await db.execute(sql, [bookingId]);
  return rows;
};
export const getBookingHistoryByUser = async (userId) => {
  const sql = `
    SELECT
      b.id AS booking_id,
      b.tour_id,
      b.booking_code,
      b.status,
      b.payment_method,
      b.final_price,
      b.booked_at,

      t.title AS tour_name,
      t.location,
      t.duration_days,

      ts.departure_date

    FROM bookings b
    JOIN tours t ON b.tour_id = t.id
    JOIN tour_schedules ts ON b.schedule_id = ts.id

    WHERE b.user_id = ?
    ORDER BY b.booked_at DESC
  `;

  const [rows] = await db.execute(sql, [userId]);
  return rows;
};
export const getMyBookingsByUser = async (userId) => {
  const sql = `
    SELECT
      b.id AS booking_id,
      b.tour_id,
      b.booking_code,
      b.status,
      b.payment_method,
      b.final_price,
      b.booked_at,
      b.num_adults,
      b.num_children,
      b.num_infants,

      t.title AS tour_name,
      t.location,
      t.duration_days,
      t.thumbnail_url,

      DATE_FORMAT(ts.departure_date, '%Y-%m-%d') AS departure_date,
      DATE_FORMAT(ts.return_date, '%Y-%m-%d') AS return_date

    FROM bookings b
    JOIN tours t ON b.tour_id = t.id
    JOIN tour_schedules ts ON b.schedule_id = ts.id
    WHERE b.user_id = ?
    ORDER BY ts.departure_date ASC
  `;

  const [rows] = await db.execute(sql, [userId]);
  return rows;
};
export async function countBookingsByUser(userId) {
  const [rows] = await db.query(
    "SELECT COUNT(*) AS total FROM bookings WHERE user_id = ?",
    [userId],
  );
  return Number(rows[0]?.total || 0);
}
export const getBookingSummaryData = async (tourId) => {
  const [rows] = await db.execute(
    `
    SELECT
      t.id,
      t.title,
      t.location,
      t.base_price,
      t.sale_price,
      t.tax_percent,
      t.tax,
      t.final_price,
      t.thumbnail_url,
      t.max_capacity,
      t.provider_id,
      COALESCE(bp.booked_participants, 0) AS booked_participants
    FROM tours t
    LEFT JOIN (
      SELECT
        tour_id,
        COALESCE(
          SUM(
            COALESCE(num_adults, 0)
            + COALESCE(num_children, 0)
            + COALESCE(num_infants, 0)
          ),
          0
        ) AS booked_participants
      FROM bookings
      WHERE status IN ('pending_payment', 'confirmed', 'paid', 'in_progress', 'completed')
      GROUP BY tour_id
    ) bp ON bp.tour_id = t.id
    WHERE t.id = ?
    LIMIT 1
    `,
    [tourId],
  );

  return rows[0] || null;
};
export const cancelBookingById = async (bookingId, userId, reason) => {
  const sql = `
    UPDATE bookings
    SET 
      status = 'cancelled',
      cancelled_reason = ?,
      cancelled_at = NOW(),
      updated_at = NOW()
    WHERE id = ?
      AND user_id = ?
      AND status IN ('pending', 'pending_payment', 'confirmed')
  `;

  const [result] = await db.execute(sql, [reason, bookingId, userId]);
  return result;
};
export const getCancelableBookingById = async (bookingId, userId) => {
  const sql = `
    SELECT
      b.id,
      b.user_id,
      b.status,
      b.final_price,
      b.cancelled_at,
      ts.departure_date
    FROM bookings b
    JOIN tour_schedules ts ON b.schedule_id = ts.id
    WHERE b.id = ?
      AND b.user_id = ?
    LIMIT 1
  `;

  const [rows] = await db.execute(sql, [bookingId, userId]);
  return rows[0] || null;
};

const ACTIVE_BOOKING_STATUSES = [
  "pending",
  "pending_payment",
  "confirmed",
  "paid",
  "in_progress",
  "cancel_requested",
];

function toYmdFromDb(value) {
  if (value == null || value === "") return "";
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getTodayYmdVn() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
}

function mapEligibilityBookingRow(row) {
  if (!row) return null;
  return {
    booking_id: row.id,
    booking_code: row.booking_code,
    tour_id: row.tour_id,
    status: row.status,
    booking_date: row.booked_at,
    departure_date: row.departure_date,
    return_date: row.return_date,
    num_adults: row.num_adults,
    num_children: row.num_children,
    num_infants: row.num_infants,
    final_price: row.final_price,
    payment_method: row.payment_method,
  };
}

/** Tối đa số đơn đang xử lý cùng một tour mà khách có thể giữ (đặt lần 2 để thêm khách). */
const MAX_ACTIVE_BOOKINGS_PER_TOUR = 2;

/**
 * Khách có thể có tối đa MAX_ACTIVE_BOOKINGS_PER_TOUR đơn đang xử lý cho cùng tour.
 * Đã hoàn thành → chỉ đặt lại khi provider cập nhật start/end tour khác lịch chuyến đã đi.
 */
export async function getUserTourBookingEligibility(userId, tourId) {
  const uid = Number(userId);
  const tid = Number(tourId);
  if (!uid || !tid) {
    return { canBook: true };
  }

  const [[tourRow]] = await db.query(
    `SELECT id, start_date, end_date FROM tours WHERE id = ? LIMIT 1`,
    [tid],
  );
  if (!tourRow) {
    return { canBook: false, reason: "tour_not_found" };
  }

  const tourStartYmd = toYmdFromDb(tourRow.start_date);
  const tourEndYmd = toYmdFromDb(tourRow.end_date);
  const todayYmd = getTodayYmdVn();

  const statusPlaceholders = ACTIVE_BOOKING_STATUSES.map(() => "?").join(", ");
  const [activeRows] = await db.query(
    `
    SELECT
      b.id,
      b.tour_id,
      b.booking_code,
      b.status,
      b.booked_at,
      b.final_price,
      b.payment_method,
      b.num_adults,
      b.num_children,
      b.num_infants,
      ts.departure_date,
      ts.return_date
    FROM bookings b
    JOIN tour_schedules ts ON ts.id = b.schedule_id
    WHERE b.user_id = ? AND b.tour_id = ?
      AND b.status IN (${statusPlaceholders})
    ORDER BY b.booked_at DESC, b.id DESC
    LIMIT ?
    `,
    [uid, tid, ...ACTIVE_BOOKING_STATUSES, MAX_ACTIVE_BOOKINGS_PER_TOUR],
  );

  const activeCount = activeRows.length;

  if (activeCount >= MAX_ACTIVE_BOOKINGS_PER_TOUR) {
    return {
      canBook: false,
      reason: "max_active_bookings",
      message:
        "Bạn đã có 2 đơn đặt tour này. Không thể đặt thêm cho đến khi một đơn hoàn tất hoặc được hủy.",
      existingBooking: mapEligibilityBookingRow(activeRows[0]),
      activeBookingCount: activeCount,
    };
  }

  if (activeCount === 1) {
    return {
      canBook: true,
      reason: "has_active_booking",
      message:
        "Bạn đã có 1 đơn đặt tour này. Bạn có thể đặt thêm 1 lần nữa (ví dụ để bổ sung số khách).",
      existingBooking: mapEligibilityBookingRow(activeRows[0]),
      activeBookingCount: activeCount,
    };
  }

  const [completedRows] = await db.query(
    `
    SELECT
      b.id,
      b.tour_id,
      b.booking_code,
      b.status,
      b.booked_at,
      b.final_price,
      b.payment_method,
      b.num_adults,
      b.num_children,
      b.num_infants,
      ts.departure_date,
      ts.return_date
    FROM bookings b
    JOIN tour_schedules ts ON ts.id = b.schedule_id
    WHERE b.user_id = ? AND b.tour_id = ? AND b.status = 'completed'
    ORDER BY ts.departure_date DESC, b.id DESC
    LIMIT 1
    `,
    [uid, tid],
  );

  if (!completedRows.length) {
    return { canBook: true };
  }

  const last = completedRows[0];
  const bookedDepart = toYmdFromDb(last.departure_date);
  const bookedReturn = toYmdFromDb(last.return_date);

  const tourHasFutureStart =
    tourStartYmd && tourStartYmd >= todayYmd && tourStartYmd !== bookedDepart;

  const tourDatesUpdated =
    tourHasFutureStart ||
    (tourEndYmd &&
      tourEndYmd !== bookedReturn &&
      tourStartYmd &&
      tourStartYmd >= todayYmd);

  if (tourDatesUpdated) {
    return {
      canBook: true,
      reason: "new_schedule",
      previousCompleted: {
        departure_date: bookedDepart,
        return_date: bookedReturn,
      },
    };
  }

  return {
    canBook: false,
    reason: "completed_same_schedule",
    message:
      "Bạn đã hoàn thành tour này. Chỉ có thể đặt lại khi nhà cung cấp cập nhật lịch khởi hành / kết thúc mới.",
    existingBooking: mapEligibilityBookingRow(last),
  };
}

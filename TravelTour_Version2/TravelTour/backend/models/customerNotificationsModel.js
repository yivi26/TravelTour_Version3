import db from "../config/db.js";

let tableReady = false;

export async function ensureCustomerNotificationsTable() {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS customer_notifications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL,
      booking_id BIGINT UNSIGNED NULL,
      tour_id INT UNSIGNED NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'info',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_customer_notifications_user (user_id, is_read, created_at),
      KEY idx_customer_notifications_tour (tour_id),
      KEY idx_customer_notifications_booking (booking_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tableReady = true;
}

export async function createCustomerNotification({
  userId,
  bookingId,
  tourId,
  type,
  title,
  body,
}) {
  if (!userId || !title || !body) return null;
  await ensureCustomerNotificationsTable();
  const [result] = await db.query(
    `
    INSERT INTO customer_notifications
      (user_id, booking_id, tour_id, type, title, body, is_read)
    VALUES (?, ?, ?, ?, ?, ?, 0)
    `,
    [
      Number(userId),
      bookingId ? Number(bookingId) : null,
      tourId ? Number(tourId) : null,
      String(type || "info"),
      String(title),
      String(body),
    ],
  );
  return { id: result.insertId };
}

/**
 * Tạo thông báo cho toàn bộ khách có booking đang hoạt động (chưa cancel/refund) trong tour.
 */
export async function notifyTourCustomers(
  tourId,
  { type, title, body, excludeStatuses = ["cancelled", "refunded"] } = {},
) {
  if (!tourId || !title || !body) return { created: 0 };
  await ensureCustomerNotificationsTable();

  const exclusion = excludeStatuses
    .map((s) => `'${String(s).replace(/'/g, "\\'")}'`)
    .join(",");

  const [bookings] = await db.query(
    `
    SELECT b.id AS booking_id, b.user_id
    FROM bookings b
    WHERE b.tour_id = ?
      AND b.status NOT IN (${exclusion || "''"})
    `,
    [tourId],
  );

  if (!bookings.length) return { created: 0 };

  const values = bookings.map(() => "(?, ?, ?, ?, ?, ?, 0)").join(", ");
  const params = [];
  for (const row of bookings) {
    params.push(
      Number(row.user_id),
      Number(row.booking_id),
      Number(tourId),
      String(type || "info"),
      String(title),
      String(body),
    );
  }

  await db.query(
    `
    INSERT INTO customer_notifications
      (user_id, booking_id, tour_id, type, title, body, is_read)
    VALUES ${values}
    `,
    params,
  );

  return { created: bookings.length };
}

function mapRow(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    bookingId: row.booking_id,
    tourId: row.tour_id,
    tourTitle: row.tour_title || null,
    isRead: Number(row.is_read) === 1,
    createdAt: row.created_at,
  };
}

export async function getCustomerNotifications(userId, options = {}) {
  await ensureCustomerNotificationsTable();
  const safeLimit = Math.max(1, Math.min(50, Number(options.limit) || 25));
  const unreadOnly = Boolean(options.unreadOnly);
  const whereUnread = unreadOnly ? " AND n.is_read = 0 " : "";

  const [rows] = await db.query(
    `
    SELECT
      n.id, n.type, n.title, n.body, n.booking_id, n.tour_id, n.is_read, n.created_at,
      t.title AS tour_title
    FROM customer_notifications n
    LEFT JOIN tours t ON t.id = n.tour_id
    WHERE n.user_id = ? ${whereUnread}
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT ?
    `,
    [Number(userId), safeLimit],
  );

  const [[countRow]] = await db.query(
    `SELECT COUNT(*) AS unread FROM customer_notifications WHERE user_id = ? AND is_read = 0`,
    [Number(userId)],
  );

  return {
    items: rows.map(mapRow),
    unreadCount: Number(countRow?.unread || 0),
  };
}

export async function markCustomerNotificationsRead(userId, ids = null) {
  await ensureCustomerNotificationsTable();
  if (!ids) {
    const [r] = await db.query(
      `UPDATE customer_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
      [Number(userId)],
    );
    return { updated: r.affectedRows || 0 };
  }
  const list = (Array.isArray(ids) ? ids : [ids])
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x > 0);
  if (!list.length) return { updated: 0 };
  const placeholders = list.map(() => "?").join(",");
  const [r] = await db.query(
    `UPDATE customer_notifications SET is_read = 1 WHERE user_id = ? AND id IN (${placeholders})`,
    [Number(userId), ...list],
  );
  return { updated: r.affectedRows || 0 };
}

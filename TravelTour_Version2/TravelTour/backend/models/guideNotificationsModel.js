import db from "../config/db.js";

let tableReady = false;

export async function ensureGuideNotificationsTable() {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS guide_notifications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      guide_id INT UNSIGNED NOT NULL,
      tour_id INT UNSIGNED NOT NULL,
      provider_id INT UNSIGNED NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'tour_assigned',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_guide_notifications_guide (guide_id, is_read, created_at),
      KEY idx_guide_notifications_tour (tour_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tableReady = true;
}

export async function createGuideTourAssignedNotification(
  guideId,
  tourId,
  providerId,
) {
  const gid = Number(guideId);
  const tid = Number(tourId);
  const pid = Number(providerId);
  if (!gid || !tid) return null;

  await ensureGuideNotificationsTable();

  const [[tourRow]] = await db.query(
    `
    SELECT t.id, t.title, t.location, t.start_date, t.end_date, t.thumbnail_url
    FROM tours t
    WHERE t.id = ?
    LIMIT 1
    `,
    [tid],
  );

  if (!tourRow) return null;

  let providerLabel = "Nhà cung cấp tour";
  if (pid) {
    const [[providerRow]] = await db.query(
      `
      SELECT p.company_name, u.full_name
      FROM providers p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.id = ?
      LIMIT 1
      `,
      [pid],
    );
    if (providerRow) {
      providerLabel =
        String(providerRow.company_name || "").trim() ||
        String(providerRow.full_name || "").trim() ||
        providerLabel;
    }
  }

  const tourTitle = String(tourRow.title || "Tour").trim();
  const title = "Phân công tour mới";
  const body = `${providerLabel} đã phân công bạn tour "${tourTitle}".`;

  const [result] = await db.query(
    `
    INSERT INTO guide_notifications
      (guide_id, tour_id, provider_id, type, title, body, is_read)
    VALUES (?, ?, ?, 'tour_assigned', ?, ?, 0)
    `,
    [gid, tid, pid || null, title, body],
  );

  return {
    id: result.insertId,
    guide_id: gid,
    tour_id: tid,
    title,
    body,
  };
}

function mapNotificationRow(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    subtitle: row.body,
    tourId: row.tour_id,
    tourTitle: row.tour_title || null,
    tourLocation: row.tour_location || null,
    tourThumbnail: row.tour_thumbnail || null,
    providerName: row.provider_name || null,
    date: row.created_at,
    isRead: Number(row.is_read) === 1,
    href: "lichtrinh.html",
  };
}

export async function getGuideNotifications(guideId, options = {}) {
  const gid = Number(guideId);
  if (!gid) return { total: 0, unreadCount: 0, items: [] };

  await ensureGuideNotificationsTable();

  const safeLimit = Math.max(1, Math.min(50, Number(options.limit) || 20));
  const unreadOnly = Boolean(options.unreadOnly);

  const whereUnread = unreadOnly ? " AND gn.is_read = 0 " : "";

  const [rows] = await db.query(
    `
    SELECT
      gn.id,
      gn.type,
      gn.title,
      gn.body,
      gn.tour_id,
      gn.is_read,
      gn.created_at,
      t.title AS tour_title,
      t.location AS tour_location,
      t.thumbnail_url AS tour_thumbnail,
      COALESCE(p.company_name, pu.full_name, 'Nhà cung cấp') AS provider_name
    FROM guide_notifications gn
    JOIN tours t ON t.id = gn.tour_id
    LEFT JOIN providers p ON p.id = gn.provider_id
    LEFT JOIN users pu ON pu.id = p.user_id
    WHERE gn.guide_id = ?
    ${whereUnread}
    ORDER BY gn.created_at DESC, gn.id DESC
    LIMIT ?
    `,
    [gid, safeLimit],
  );

  const [[countRow]] = await db.query(
    `
    SELECT COUNT(*) AS unread_count
    FROM guide_notifications
    WHERE guide_id = ? AND is_read = 0
    `,
    [gid],
  );

  const items = (rows || []).map(mapNotificationRow);

  return {
    total: items.length,
    unreadCount: Number(countRow?.unread_count || 0),
    items,
  };
}

export async function markGuideNotificationsRead(guideId, notificationIds = null) {
  const gid = Number(guideId);
  if (!gid) return { updated: 0 };

  await ensureGuideNotificationsTable();

  if (!notificationIds) {
    const [result] = await db.query(
      `
      UPDATE guide_notifications
      SET is_read = 1
      WHERE guide_id = ? AND is_read = 0
      `,
      [gid],
    );
    return { updated: result.affectedRows || 0 };
  }

  const ids = (Array.isArray(notificationIds) ? notificationIds : [notificationIds])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (!ids.length) return { updated: 0 };

  const placeholders = ids.map(() => "?").join(", ");
  const [result] = await db.query(
    `
    UPDATE guide_notifications
    SET is_read = 1
    WHERE guide_id = ? AND id IN (${placeholders})
    `,
    [gid, ...ids],
  );

  return { updated: result.affectedRows || 0 };
}

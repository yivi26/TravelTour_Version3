import db from "../config/db.js";

let tableReady = false;

export async function ensureTourGuideHistoryTable() {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS tour_guide_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tour_id INT UNSIGNED NOT NULL,
      guide_id INT UNSIGNED NULL,
      action ENUM('assigned','unassigned','replaced') NOT NULL,
      reason VARCHAR(255) NULL,
      by_user_id INT UNSIGNED NULL,
      previous_guide_id INT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_tour_guide_history_tour (tour_id, created_at),
      KEY idx_tour_guide_history_guide (guide_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tableReady = true;
}

export async function logTourGuideHistory({
  tourId,
  guideId,
  previousGuideId,
  action,
  reason,
  byUserId,
}) {
  if (!tourId || !action) return null;
  await ensureTourGuideHistoryTable();
  const [r] = await db.query(
    `
    INSERT INTO tour_guide_history
      (tour_id, guide_id, previous_guide_id, action, reason, by_user_id)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      Number(tourId),
      guideId != null ? Number(guideId) : null,
      previousGuideId != null ? Number(previousGuideId) : null,
      String(action),
      reason ? String(reason) : null,
      byUserId != null ? Number(byUserId) : null,
    ],
  );
  return { id: r.insertId };
}

export async function getTourGuideHistory(tourId) {
  await ensureTourGuideHistoryTable();
  const [rows] = await db.query(
    `
    SELECT
      h.id, h.tour_id, h.guide_id, h.previous_guide_id, h.action, h.reason, h.created_at,
      ug.full_name AS guide_name,
      upg.full_name AS previous_guide_name,
      ub.full_name AS by_user_name
    FROM tour_guide_history h
    LEFT JOIN guides g ON g.id = h.guide_id
    LEFT JOIN users ug ON ug.id = g.user_id
    LEFT JOIN guides pg ON pg.id = h.previous_guide_id
    LEFT JOIN users upg ON upg.id = pg.user_id
    LEFT JOIN users ub ON ub.id = h.by_user_id
    WHERE h.tour_id = ?
    ORDER BY h.created_at DESC, h.id DESC
    LIMIT 100
    `,
    [Number(tourId)],
  );
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    reason: row.reason,
    createdAt: row.created_at,
    guide: row.guide_id
      ? { id: row.guide_id, fullName: row.guide_name }
      : null,
    previousGuide: row.previous_guide_id
      ? { id: row.previous_guide_id, fullName: row.previous_guide_name }
      : null,
    byUserName: row.by_user_name || null,
  }));
}

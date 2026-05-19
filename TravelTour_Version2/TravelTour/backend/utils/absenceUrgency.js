/**
 * Mức độ khẩn theo khoảng cách tới ngày khởi hành tour.
 * ≤48h: urgent | ≤7 ngày: medium | >7 ngày: low
 */
export function computeAbsenceUrgency(startDate) {
  if (!startDate) return "medium";
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return "medium";
  const diffHours = (start.getTime() - Date.now()) / (1000 * 60 * 60);
  if (diffHours <= 48) return "urgent";
  if (diffHours <= 7 * 24) return "medium";
  return "low";
}

/** Thứ tự sắp xếp SQL (0 = khẩn nhất). */
export const ABSENCE_URGENCY_ORDER_SQL = `
  CASE
    WHEN t.start_date IS NULL THEN 2
    WHEN TIMESTAMPDIFF(HOUR, NOW(), t.start_date) <= 48 THEN 0
    WHEN TIMESTAMPDIFF(HOUR, NOW(), t.start_date) <= 168 THEN 1
    ELSE 2
  END
`;

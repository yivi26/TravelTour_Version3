import db from "../config/db.js";
import { toNumber } from "../utils/modelHelpers.js";
import {
  buildTourDeparturePayload,
  formatTourDepartureBlockMessage,
  evaluateTourDepartureEligibility,
} from "../utils/tourDepartureRules.js";

const BOOKED_PARTICIPANTS_SUBQUERY = `
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
`;

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

export async function getTourDepartureRow(tourId) {
  const tid = toNumber(tourId, 0);
  if (!tid) return null;

  const [[row]] = await db.query(
    `
    SELECT
      t.id,
      t.guide_id,
      t.max_capacity,
      DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(t.end_date, '%Y-%m-%d') AS end_date,
      COALESCE(bp.booked_participants, 0) AS booked_participants
    FROM tours t
    ${BOOKED_PARTICIPANTS_SUBQUERY}
    WHERE t.id = ?
    LIMIT 1
    `,
    [tid]
  );

  return row || null;
}

export async function getTourDepartureEligibilityByTourId(tourId) {
  const row = await getTourDepartureRow(tourId);
  if (!row) return null;
  return buildTourDeparturePayload(row);
}

export function isTourInOperationalWindow(row, todayYmd = toLocalYmd(new Date())) {
  const start = toLocalYmd(row?.start_date);
  const end = toLocalYmd(row?.end_date) || start;
  if (!start || !todayYmd) return false;
  return todayYmd >= start && todayYmd <= end;
}

/**
 * Chặn thao tác vận hành tour (tiến độ / hoàn thành) khi chưa đủ >50% khách hoặc chưa có HDV.
 */
export async function assertTourDepartureAllowedForOperations(tourId) {
  const row = await getTourDepartureRow(tourId);
  if (!row) {
    const err = new Error("Không tìm thấy tour");
    err.statusCode = 404;
    throw err;
  }

  const payload = buildTourDeparturePayload(row);
  if (!payload.can_depart) {
    const err = new Error(formatTourDepartureBlockMessage(payload));
    err.statusCode = 400;
    err.departureEligibility = payload;
    throw err;
  }

  return payload;
}

import db from "../config/db.js";
import { BOOKED_PARTICIPANTS_JOIN } from "../models/providerModel.js";
import { getCurrentToursByGuide } from "../models/guideModel.js";

const USER_ID = 18;

const [users] = await db.query(
  `SELECT id, email, full_name, role FROM users WHERE id = ?`,
  [USER_ID],
);
console.log("=== USER ===");
console.table(users);

const [guides] = await db.query(
  `SELECT id, user_id, provider_id, status FROM guides WHERE user_id = ?`,
  [USER_ID],
);
console.log("\n=== GUIDE ROW ===");
console.table(guides);

const guideId = guides[0]?.id;
if (!guideId) {
  console.log("Không có guides.id cho user_id =", USER_ID);
  process.exit(0);
}

const [tours] = await db.query(
  `
  SELECT id, title, provider_id, guide_id, status,
    DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
    DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
    guide_completed_at
  FROM tours
  WHERE guide_id = ?
  ORDER BY id DESC
  `,
  [guideId],
);
console.log(`\n=== TOURS guide_id = ${guideId} ===`);
console.table(tours);

console.log(`\n=== Gọi đúng getCurrentToursByGuide(${guideId}) ===`);
const result = await getCurrentToursByGuide(guideId, "");
console.table(result);

process.exit(0);

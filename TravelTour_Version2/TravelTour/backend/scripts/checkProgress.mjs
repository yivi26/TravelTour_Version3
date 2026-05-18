import db from "../config/db.js";

const [rows] = await db.query("SELECT * FROM tour_guide_progress");
console.log("progress rows:", JSON.stringify(rows, null, 2));
const [tours] = await db.query(
  "SELECT id, title, guide_id FROM tours WHERE id IN (3, 1, 2)",
);
console.log("tours:", tours);
process.exit(0);

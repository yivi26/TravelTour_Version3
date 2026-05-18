/**
 * Đồng bộ schema MySQL với backend TravelTour (idempotent).
 * Chạy: node scripts/ensureAppSchema.mjs   (từ thư mục backend)
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const USER_COLUMNS = [
  "ALTER TABLE users ADD COLUMN address VARCHAR(300) NULL",
  "ALTER TABLE users ADD COLUMN birth_date DATE NULL",
];

const PROVIDER_COLUMNS = [
  "ALTER TABLE providers ADD COLUMN phone VARCHAR(20) NULL",
  "ALTER TABLE providers ADD COLUMN hotline VARCHAR(20) NULL",
  "ALTER TABLE providers ADD COLUMN email VARCHAR(100) NULL",
  "ALTER TABLE providers ADD COLUMN website_url VARCHAR(300) NULL",
  "ALTER TABLE providers ADD COLUMN logo_url VARCHAR(500) NULL",
  "ALTER TABLE providers ADD COLUMN bank_name VARCHAR(150) NULL",
  "ALTER TABLE providers ADD COLUMN bank_branch VARCHAR(150) NULL",
  "ALTER TABLE providers ADD COLUMN bank_account_number VARCHAR(50) NULL",
  "ALTER TABLE providers ADD COLUMN bank_account_name VARCHAR(150) NULL",
  "ALTER TABLE providers ADD COLUMN tax_code VARCHAR(50) NULL",
  "ALTER TABLE providers ADD COLUMN license_number VARCHAR(100) NULL",
  "ALTER TABLE providers ADD COLUMN description TEXT NULL",
  "ALTER TABLE providers ADD COLUMN address VARCHAR(300) NULL",
];

const TOUR_COLUMNS = [
  "ALTER TABLE tours ADD COLUMN meeting_point VARCHAR(512) NULL",
  "ALTER TABLE tours ADD COLUMN latitude DECIMAL(10, 8) NULL",
  "ALTER TABLE tours ADD COLUMN longitude DECIMAL(11, 8) NULL",
  "ALTER TABLE tours ADD COLUMN sale_price DECIMAL(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE tours ADD COLUMN tax_percent DECIMAL(5, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE tours ADD COLUMN tax DECIMAL(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE tours ADD COLUMN final_price DECIMAL(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE tours ADD COLUMN duration_text VARCHAR(255) NULL",
  "ALTER TABLE tours ADD COLUMN start_date DATE NULL",
  "ALTER TABLE tours ADD COLUMN end_date DATE NULL",
  "ALTER TABLE tours ADD COLUMN hotel_info TEXT NULL",
  "ALTER TABLE tours ADD COLUMN transport_info TEXT NULL",
  "ALTER TABLE tours ADD COLUMN cancel_policy TEXT NULL",
  "ALTER TABLE tours ADD COLUMN terms_conditions TEXT NULL",
  "ALTER TABLE tours ADD COLUMN other_notes TEXT NULL",
  "ALTER TABLE tours ADD COLUMN guide_id INT UNSIGNED NULL",
  "ALTER TABLE tours ADD COLUMN management_actions_unlocked TINYINT(1) NOT NULL DEFAULT 0",
  "ALTER TABLE tours ADD COLUMN guide_completed_at DATETIME NULL",
];

const TOUR_GUIDE_PROGRESS_COLUMNS = [
  "ALTER TABLE tour_guide_progress ADD COLUMN guide_completed_at DATETIME NULL",
];

const BOOKING_STATUS_ENUM = `
'pending','pending_payment','cancel_requested',
'confirmed','paid','in_progress','completed','cancelled','refunded'
`.replace(/\s+/g, " ");

async function indexExists(conn, table, keyName) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
     LIMIT 1`,
    [table, keyName]
  );
  return rows.length > 0;
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
     LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
});

for (const sql of USER_COLUMNS) {
  try {
    await conn.query(sql);
    console.log("users +", sql.match(/ADD COLUMN ([^\s(]+)/)?.[1]);
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("users exists", sql.match(/ADD COLUMN ([^\s(]+)/)?.[1]);
    } else {
      throw e;
    }
  }
}

for (const sql of PROVIDER_COLUMNS) {
  try {
    await conn.query(sql);
    console.log("providers +", sql.match(/ADD COLUMN ([^\s(]+)/)?.[1]);
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("providers exists", sql.match(/ADD COLUMN ([^\s(]+)/)?.[1]);
    } else {
      throw e;
    }
  }
}

for (const sql of TOUR_COLUMNS) {
  try {
    await conn.query(sql);
    console.log("tours +", sql.match(/ADD COLUMN ([^\s(]+)/)?.[1]);
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("tours exists", sql.match(/ADD COLUMN ([^\s(]+)/)?.[1]);
    } else {
      throw e;
    }
  }
}

for (const sql of TOUR_GUIDE_PROGRESS_COLUMNS) {
  try {
    await conn.query(sql);
    console.log("tour_guide_progress +", sql.match(/ADD COLUMN ([^\s(]+)/)?.[1]);
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("tour_guide_progress exists", sql.match(/ADD COLUMN ([^\s(]+)/)?.[1]);
    } else {
      throw e;
    }
  }
}

if (!(await columnExists(conn, "bookings", "payment_method"))) {
  await conn.query(
    `ALTER TABLE bookings ADD COLUMN payment_method VARCHAR(32) NOT NULL DEFAULT 'momo' AFTER final_price`
  );
  console.log("bookings +payment_method");
} else {
  console.log("bookings payment_method ok");
}

try {
  await conn.query(`
    ALTER TABLE bookings MODIFY COLUMN status ENUM(
      ${BOOKING_STATUS_ENUM}
    ) NOT NULL DEFAULT 'pending'
  `);
  console.log("bookings status ENUM aligned");
} catch (e) {
  console.warn("bookings MODIFY status:", e.message);
}

try {
  await conn.query(`
    ALTER TABLE tours MODIFY COLUMN status ENUM(
      'draft','active','paused','full','archived'
    ) NOT NULL DEFAULT 'draft'
  `);
  console.log("tours status ENUM aligned (incl. full)");
} catch (e) {
  console.warn("tours MODIFY status:", e.message);
}

try {
  await conn.query(`
    ALTER TABLE providers MODIFY COLUMN status ENUM(
      'pending','approved','active','suspended'
    ) NOT NULL DEFAULT 'pending'
  `);
  console.log("providers status ENUM aligned (incl. active)");
} catch (e) {
  console.warn("providers MODIFY status:", e.message);
}

if (await indexExists(conn, "tours", "uk_tours_slug")) {
  try {
    await conn.query("ALTER TABLE tours DROP INDEX uk_tours_slug");
    console.log("tours dropped uk_tours_slug");
  } catch (e) {
    console.warn("drop uk_tours_slug:", e.message);
  }
}

if (!(await indexExists(conn, "tours", "uq_tours_provider_slug"))) {
  try {
    await conn.query(
      "ALTER TABLE tours ADD UNIQUE KEY uq_tours_provider_slug (provider_id, slug)"
    );
    console.log("tours added uq_tours_provider_slug");
  } catch (e) {
    if (e.code === "ER_DUP_KEYNAME") {
      console.log("tours uq_tours_provider_slug already present");
    } else if (e.code === "ER_DUP_ENTRY" || e.errno === 1062) {
      console.warn(
        "tours: cannot add uq_tours_provider_slug — duplicate (provider_id, slug); fix data then re-run"
      );
    } else {
      throw e;
    }
  }
} else {
  console.log("tours uq_tours_provider_slug ok");
}

try {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS guide_availability (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      guide_id INT UNSIGNED NOT NULL,
      avail_date DATE NOT NULL,
      time_from VARCHAR(5) NOT NULL DEFAULT '08:00',
      time_to VARCHAR(5) NOT NULL DEFAULT '17:00',
      tour_type VARCHAR(80) NOT NULL DEFAULT 'Tất cả loại tour',
      note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_guide_avail_date (guide_id, avail_date),
      INDEX idx_guide_avail_guide (guide_id),
      CONSTRAINT fk_guide_avail_guide FOREIGN KEY (guide_id) REFERENCES guides(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("guide_availability table ok");
} catch (e) {
  console.warn("guide_availability:", e.message);
}

try {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS tour_guide_progress (
      tour_id INT UNSIGNED NOT NULL,
      guide_id INT UNSIGNED NOT NULL,
      completed_activity_ids JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (tour_id),
      INDEX idx_tour_guide_progress_guide (guide_id),
      CONSTRAINT fk_tgp_tour FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE,
      CONSTRAINT fk_tgp_guide FOREIGN KEY (guide_id) REFERENCES guides(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("tour_guide_progress table ok");
} catch (e) {
  console.warn("tour_guide_progress:", e.message);
}

await conn.end();
console.log("ensureAppSchema: done.");

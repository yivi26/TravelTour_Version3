/**
 * Xóa toàn bộ dữ liệu nghiệp vụ, chỉ giữ user có role = 'admin'.
 *
 * Cách dùng:
 *   node scripts/reset-db-keep-admin.mjs           # xem trước (dry-run)
 *   node scripts/reset-db-keep-admin.mjs --execute # thực thi (KHÔNG hoàn tác)
 */
import db from "../config/db.js";

const EXECUTE = process.argv.includes("--execute");

async function main() {
  const dbName = process.env.DB_NAME || "traveltour";
  console.log(`Database: ${dbName}`);
  console.log(EXECUTE ? "MODE: EXECUTE" : "MODE: dry-run (thêm --execute để chạy thật)\n");

  const [adminRows] = await db.query(
    `SELECT id, email, full_name FROM users WHERE role = 'admin' ORDER BY id`,
  );
  if (!adminRows.length) {
    console.error("Không tìm thấy user admin. Dừng để tránh xóa nhầm toàn bộ users.");
    process.exit(1);
  }

  console.log("Sẽ GIỮ các tài khoản admin:");
  console.table(adminRows);

  const [tableRows] = await db.query(
    `SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'`,
  );
  const tableKey = Object.keys(tableRows[0] || {}).find((k) =>
    k.toLowerCase().startsWith("tables_in"),
  );
  const tables = tableRows
    .map((r) => r[tableKey])
    .filter((name) => name !== "users");

  const [[userCount]] = await db.query(
    `SELECT COUNT(*) AS c FROM users WHERE role <> 'admin'`,
  );
  const deleteUserCount = Number(userCount.c || 0);

  console.log(`\nSẽ TRUNCATE ${tables.length} bảng (trừ users):`);
  console.log(tables.join(", "));
  console.log(`\nSẽ DELETE ${deleteUserCount} user không phải admin.`);

  if (!EXECUTE) {
    console.log("\n→ Chạy lệnh sau để thực hiện:");
    console.log("  node scripts/reset-db-keep-admin.mjs --execute");
    process.exit(0);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    for (const table of tables) {
      await conn.query(`TRUNCATE TABLE \`${table}\``);
      console.log(`  truncated ${table}`);
    }

    const [delResult] = await conn.query(`DELETE FROM users WHERE role <> 'admin'`);
    console.log(`  deleted ${delResult.affectedRows} non-admin users`);

    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    await conn.commit();

    const [[remaining]] = await conn.query(`SELECT COUNT(*) AS c FROM users`);
    console.log(`\nHoàn tất. Còn ${remaining.c} user trong bảng users.`);
    console.log(
      "Lưu ý: file upload trong thư mục uploads/ không tự xóa — xóa thủ công nếu cần.",
    );
  } catch (err) {
    await conn.rollback();
    console.error("Lỗi — đã rollback:", err.message);
    process.exit(1);
  } finally {
    conn.release();
  }
}

main().finally(() => process.exit(0));

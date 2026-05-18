/**
 * One-off: tạo user role guide + bản ghi guides (gắn provider đầu tiên).
 * Đăng nhập bằng EMAIL (ứng dụng dùng email), không phải username.
 *
 * Chạy: node scripts/seedGuide1TestUser.mjs
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const GUIDE_EMAIL = "guide1@traveltour.test";
const GUIDE_PASSWORD = "123456";
const FULL_NAME = "Guide 1 (test)";

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "traveltour",
  });

  const [[existing]] = await conn.query(
    "SELECT id, email, role FROM users WHERE email = ? LIMIT 1",
    [GUIDE_EMAIL],
  );

  if (existing?.id) {
    const [[g]] = await conn.query(
      "SELECT id, provider_id, status FROM guides WHERE user_id = ? LIMIT 1",
      [existing.id],
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: "already_exists",
          loginEmail: GUIDE_EMAIL,
          password: GUIDE_PASSWORD,
          userId: existing.id,
          role: existing.role,
          guidesRow: g || null,
        },
        null,
        2,
      ),
    );
    await conn.end();
    return;
  }

  const [[prov]] = await conn.query(
    "SELECT id FROM providers ORDER BY id ASC LIMIT 1",
  );

  if (!prov?.id) {
    console.error(
      "Không có nhà cung cấp (providers) nào trong DB. Tạo ít nhất một provider trước, rồi chạy lại script.",
    );
    process.exitCode = 1;
    await conn.end();
    return;
  }

  const passwordHash = await bcrypt.hash(GUIDE_PASSWORD, 10);

  await conn.beginTransaction();
  try {
    const [ins] = await conn.query(
      `
      INSERT INTO users (email, password_hash, full_name, phone, role, is_active, email_verified, last_login_at)
      VALUES (?, ?, ?, NULL, 'guide', 1, 1, NULL)
      `,
      [GUIDE_EMAIL, passwordHash, FULL_NAME],
    );
    const userId = ins.insertId;

    await conn.query(
      `INSERT INTO guides (user_id, provider_id, status) VALUES (?, ?, 'active')`,
      [userId, prov.id],
    );

    await conn.commit();

    console.log(
      JSON.stringify(
        {
          ok: true,
          created: true,
          loginEmail: GUIDE_EMAIL,
          password: GUIDE_PASSWORD,
          fullName: FULL_NAME,
          userId,
          providerIdForGuide: prov.id,
          note:
            "Đăng nhập form nhập email + mật khẩu (không có trường username riêng).",
        },
        null,
        2,
      ),
    );
  } catch (e) {
    await conn.rollback();
    console.error(e);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();

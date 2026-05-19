import db from "../config/db.js";
import bcrypt from "bcryptjs";
import { buildPages, normalizeKeyword, toNumber } from "../utils/modelHelpers.js";

function mapRole(role) {
  const r = String(role || "").toLowerCase();
  if (r === "provider") return { label: "Nhà cung cấp", key: "supplier" };
  if (r === "guide") return { label: "Hướng dẫn viên", key: "guide" };
  if (r === "admin") return { label: "Admin", key: "admin" };
  return { label: "Khách hàng", key: "customer" };
}

function mapStatus(isActive) {
  const active = Boolean(isActive);
  return active
    ? { label: "Hoạt động", key: "active" }
    : { label: "Đã khóa", key: "locked" };
}

export async function getUserStats() {
  const [[totalRow]] = await db.query(`SELECT COUNT(*) AS total FROM users`);
  const [[customerRow]] = await db.query(
    `SELECT COUNT(*) AS total FROM users WHERE role = 'customer'`
  );
  const [[providerRow]] = await db.query(
    `SELECT COUNT(*) AS total FROM users WHERE role = 'provider'`
  );
  const [[guideRow]] = await db.query(`SELECT COUNT(*) AS total FROM users WHERE role = 'guide'`);

  return [
    { label: "Tổng người dùng", value: toNumber(totalRow?.total).toLocaleString("vi-VN") },
    {
      label: "Khách hàng",
      value: toNumber(customerRow?.total).toLocaleString("vi-VN"),
      badge: "customer"
    },
    {
      label: "Nhà cung cấp",
      value: toNumber(providerRow?.total).toLocaleString("vi-VN"),
      badge: "supplier"
    },
    {
      label: "Hướng dẫn viên",
      value: toNumber(guideRow?.total).toLocaleString("vi-VN"),
      badge: "guide"
    }
  ];
}

const FILTER_ROLE_TO_DB = Object.freeze({
  customer: "customer",
  supplier: "provider",
  guide: "guide",
  admin: "admin"
});

export async function listUsers({
  page = 1,
  pageSize = 8,
  q = "",
  role = "",
  active = ""
} = {}) {
  const safePageSize = Math.max(5, Math.min(50, toNumber(pageSize, 8)));
  const safePage = Math.max(1, toNumber(page, 1));
  const keyword = normalizeKeyword(q);

  const conditions = [];
  const params = [];

  if (keyword) {
    conditions.push(`(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)`);
    const like = `%${keyword}%`;
    params.push(like, like, like);
  }

  const roleKey = String(role || "").toLowerCase();
  const dbRole = FILTER_ROLE_TO_DB[roleKey];
  if (dbRole) {
    conditions.push(`u.role = ?`);
    params.push(dbRole);
  }

  const activeKey = String(active || "").toLowerCase();
  if (activeKey === "active") {
    conditions.push(`u.is_active = 1`);
  } else if (activeKey === "locked") {
    conditions.push(`u.is_active = 0`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [[countRow]] = await db.query(
    `SELECT COUNT(*) AS total FROM users u ${where}`,
    params
  );
  const total = toNumber(countRow?.total);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safePageSize;

  const [rows] = await db.query(
    `
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.phone,
      u.role,
      u.is_active,
      u.created_at
    FROM users u
    ${where}
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safePageSize, offset]
  );

  const items = (rows || []).map((row) => {
    const role = mapRole(row.role);
    const status = mapStatus(row.is_active);
    return {
      id: toNumber(row.id),
      name: row.full_name || "Chưa có tên",
      email: row.email || "",
      role: role.label,
      roleKey: role.key,
      status: status.label,
      statusKey: status.key,
      is_active: Boolean(row.is_active)
    };
  });

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + safePageSize, total);

  return {
    users: items,
    paging: {
      page: currentPage,
      pageSize: safePageSize,
      total,
      totalPages,
      text: `Hiển thị ${from}-${to} trong ${total.toLocaleString("vi-VN")} người dùng`,
      pages: buildPages(currentPage, totalPages)
    }
  };
}

export async function setUserActive(userId, isActive) {
  const id = toNumber(userId, 0);
  if (!id) {
    const err = new Error("ID người dùng không hợp lệ");
    err.statusCode = 400;
    throw err;
  }

  const active = Boolean(isActive);

  await db.query(`UPDATE users SET is_active = ? WHERE id = ?`, [active ? 1 : 0, id]);

  const [[row]] = await db.query(
    `
    SELECT id, full_name, email, role, is_active
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );

  if (!row) {
    const err = new Error("Không tìm thấy người dùng");
    err.statusCode = 404;
    throw err;
  }

  const role = mapRole(row.role);
  const status = mapStatus(row.is_active);

  return {
    id: toNumber(row.id),
    name: row.full_name || "Chưa có tên",
    email: row.email || "",
    role: role.label,
    roleKey: role.key,
    status: status.label,
    statusKey: status.key,
    is_active: Boolean(row.is_active)
  };
}

export async function createPartnerUser({ full_name, email, password, role, provider_id } = {}) {
  const name = String(full_name || "").trim();
  let mail = String(email || "").trim();
  const pass = String(password || "").trim();
  const r = String(role || "").toLowerCase();

  if (!name) {
    const err = new Error("Vui lòng nhập họ tên");
    err.statusCode = 400;
    throw err;
  }
  if (!mail) {
    const err = new Error("Vui lòng nhập email / tên đăng nhập");
    err.statusCode = 400;
    throw err;
  }
  const lowMail = mail.toLowerCase();
  let suffixLen = 0;
  if (lowMail.endsWith("@traveltour.vn")) suffixLen = "@traveltour.vn".length;
  else if (lowMail.endsWith("@gmail.com")) suffixLen = "@gmail.com".length;
  else {
    const err = new Error("Email / tên đăng nhập chỉ được dùng đuôi @gmail.com hoặc @traveltour.vn");
    err.statusCode = 400;
    throw err;
  }
  const localPart = lowMail.slice(0, lowMail.length - suffixLen);
  if (!localPart || localPart.includes("@")) {
    const err = new Error("Email / tên đăng nhập không hợp lệ");
    err.statusCode = 400;
    throw err;
  }
  mail = lowMail;

  if (!pass || pass.length < 4) {
    const err = new Error("Mật khẩu tối thiểu 4 ký tự");
    err.statusCode = 400;
    throw err;
  }
  if (r !== "provider" && r !== "guide") {
    const err = new Error("Role không hợp lệ (chỉ Provider/Guide)");
    err.statusCode = 400;
    throw err;
  }

  const [[exists]] = await db.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [mail]);
  if (exists?.id) {
    const err = new Error("Tài khoản đã tồn tại");
    err.statusCode = 409;
    throw err;
  }

  let guideProviderId = null;
  if (r === "guide") {
    let pid = toNumber(provider_id, 0);
    if (!pid) {
      const [[firstProv]] = await db.query(
        `SELECT id FROM providers ORDER BY id ASC LIMIT 1`,
      );
      pid = toNumber(firstProv?.id, 0);
    }
    if (!pid) {
      const err = new Error(
        "Chưa có nhà cung cấp trong hệ thống — không thể tạo hướng dẫn viên. Hãy tạo tài khoản Provider trước.",
      );
      err.statusCode = 400;
      throw err;
    }
    const [[prov]] = await db.query(`SELECT id FROM providers WHERE id = ? LIMIT 1`, [pid]);
    if (!prov?.id) {
      const err = new Error("Nhà cung cấp không tồn tại");
      err.statusCode = 400;
      throw err;
    }
    guideProviderId = pid;
  }

  const password_hash = await bcrypt.hash(pass, 10);
  const conn = await db.getConnection();
  let guideId = null;
  let providerId = null;

  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `
      INSERT INTO users (email, password_hash, full_name, phone, role, is_active, email_verified, last_login_at)
      VALUES (?, ?, ?, NULL, ?, 1, 1, NULL)
      `,
      [mail, password_hash, name, r]
    );
    const userId = result.insertId;

    if (r === "provider") {
      try {
        const [provInsert] = await conn.query(
          `
          INSERT INTO providers (user_id, company_name, email, status)
          VALUES (?, ?, ?, 'approved')
          `,
          [userId, name, mail]
        );
        providerId = provInsert.insertId;
      } catch (e) {
        if (String(e?.sqlMessage || e?.message || "").includes("Unknown column 'email'")) {
          const [provInsert] = await conn.query(
            `
            INSERT INTO providers (user_id, company_name, status)
            VALUES (?, ?, 'approved')
            `,
            [userId, name]
          );
          providerId = provInsert.insertId;
        } else {
          throw e;
        }
      }
    } else if (r === "guide") {
      const [guideInsert] = await conn.query(
        `INSERT INTO guides (user_id, provider_id, status) VALUES (?, ?, 'active')`,
        [userId, guideProviderId]
      );
      guideId = guideInsert.insertId;
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    if (e?.code === "ER_DUP_ENTRY") {
      const err = new Error("Tài khoản hoặc hồ sơ đã tồn tại");
      err.statusCode = 409;
      throw err;
    }
    throw e;
  } finally {
    conn.release();
  }

  const [[row]] = await db.query(
    `SELECT id, full_name, email, role, is_active, created_at FROM users WHERE email = ? LIMIT 1`,
    [mail]
  );

  return {
    id: toNumber(row?.id),
    guideId: guideId ? toNumber(guideId) : null,
    providerId: providerId ? toNumber(providerId) : null,
    name: row?.full_name || name,
    email: row?.email || mail,
    role: row?.role || r,
    is_active: Boolean(row?.is_active)
  };
}


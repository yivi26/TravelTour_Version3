import db from "../config/db.js";

const emails = ["genz@traveltour.vn", "provider1@traveltour.vn"];

const [users] = await db.query(
  `
  SELECT u.id AS user_id, u.email, u.full_name, u.role, p.id AS provider_id, p.company_name, p.status
  FROM users u
  LEFT JOIN providers p ON p.user_id = u.id
  WHERE u.email IN (?)
  `,
  [emails],
);

console.log("=== USERS / PROVIDERS ===");
console.table(users);

const [tours] = await db.query(
  `SELECT provider_id, COUNT(*) AS cnt FROM tours GROUP BY provider_id`,
);
console.log("\n=== TOURS BY provider_id ===");
console.table(tours);

const [guides] = await db.query(
  `SELECT provider_id, COUNT(*) AS cnt FROM guides GROUP BY provider_id`,
);
console.log("\n=== GUIDES BY provider_id ===");
console.table(guides);

for (const u of users) {
  const pid = u.provider_id;
  if (!pid) {
    console.log(`\n${u.email}: chưa có dòng providers`);
    continue;
  }
  const [[t]] = await db.query(
    `SELECT COUNT(*) AS c FROM tours WHERE provider_id = ?`,
    [pid],
  );
  const [[g]] = await db.query(
    `SELECT COUNT(*) AS c FROM guides WHERE provider_id = ? AND status = 'active'`,
    [pid],
  );
  console.log(
    `\n${u.email} → provider_id=${pid} | tours=${t.c} | HDV active=${g.c}`,
  );
}

process.exit(0);

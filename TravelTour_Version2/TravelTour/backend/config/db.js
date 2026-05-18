import mysql from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

function isTransientDbError(err) {
  const code = err?.code;
  if (
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR"
  ) {
    return true;
  }
  const msg = String(err?.message || "");
  return /server has gone away|read ECONNRESET|write ECONNRESET|socket hang up/i.test(
    msg,
  );
}

async function withQueryRetry(run) {
  try {
    return await run();
  } catch (e) {
    if (!isTransientDbError(e)) throw e;
    await new Promise((r) => setTimeout(r, 120));
    return await run();
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 20000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

pool.on("error", (err) => {
  console.error("[mysql pool]", err?.code || "", err?.message || err);
});

const db = {
  query(...args) {
    return withQueryRetry(() => pool.query(...args));
  },
  execute(...args) {
    return withQueryRetry(() => pool.execute(...args));
  },
  getConnection(...args) {
    return pool.getConnection(...args);
  },
};

export default db;

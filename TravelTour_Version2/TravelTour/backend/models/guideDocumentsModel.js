import db from "../config/db.js";
import { toNumber } from "../utils/modelHelpers.js";

export function buildGuideDocumentPublicUrl(filename) {
  if (!filename) return "";
  const name = String(filename).replace(/^\/+/, "");
  if (name.startsWith("uploads/")) return `/${name}`;
  return `/uploads/guide-documents/${name}`;
}

export async function getGuideIdByUserId(userId) {
  const [[row]] = await db.query(
    `SELECT id FROM guides WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  return row?.id ? toNumber(row.id) : null;
}

export async function updateGuideDocuments(guideId, { contract_file_url, cv_file_url } = {}) {
  const gid = toNumber(guideId, 0);
  if (!gid) {
    const err = new Error("Guide ID không hợp lệ");
    err.statusCode = 400;
    throw err;
  }

  const fields = [];
  const params = [];

  if (contract_file_url !== undefined) {
    fields.push("contract_file_url = ?");
    params.push(contract_file_url || null);
  }
  if (cv_file_url !== undefined) {
    fields.push("cv_file_url = ?");
    params.push(cv_file_url || null);
  }

  if (!fields.length) return getGuideDocuments(gid);

  params.push(gid);
  await db.query(
    `UPDATE guides SET ${fields.join(", ")} WHERE id = ? LIMIT 1`,
    params,
  );

  return getGuideDocuments(gid);
}

export async function getGuideDocuments(guideId) {
  const [[row]] = await db.query(
    `
    SELECT contract_file_url, cv_file_url
    FROM guides
    WHERE id = ?
    LIMIT 1
    `,
    [guideId],
  );
  if (!row) return null;
  return {
    contractFileUrl: row.contract_file_url || "",
    cvFileUrl: row.cv_file_url || "",
  };
}

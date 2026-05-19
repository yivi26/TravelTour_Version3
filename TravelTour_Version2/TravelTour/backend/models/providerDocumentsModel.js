import db from "../config/db.js";
import { toNumber } from "../utils/modelHelpers.js";

export function buildProviderDocumentPublicUrl(filename) {
  if (!filename) return "";
  const name = String(filename).replace(/^\/+/, "");
  if (name.startsWith("uploads/")) return `/${name}`;
  return `/uploads/provider-documents/${name}`;
}

export async function updateProviderDocuments(
  providerId,
  { contract_file_url, certificate_file_url } = {},
) {
  const pid = toNumber(providerId, 0);
  if (!pid) {
    const err = new Error("ID nhà cung cấp không hợp lệ");
    err.statusCode = 400;
    throw err;
  }

  const fields = [];
  const params = [];

  if (contract_file_url !== undefined) {
    fields.push("contract_file_url = ?");
    params.push(contract_file_url || null);
  }
  if (certificate_file_url !== undefined) {
    fields.push("certificate_file_url = ?");
    params.push(certificate_file_url || null);
  }

  if (!fields.length) return getProviderDocuments(pid);

  params.push(pid);
  await db.query(
    `UPDATE providers SET ${fields.join(", ")} WHERE id = ? LIMIT 1`,
    params,
  );

  return getProviderDocuments(pid);
}

export async function getProviderDocuments(providerId) {
  const [[row]] = await db.query(
    `
    SELECT contract_file_url, certificate_file_url
    FROM providers
    WHERE id = ?
    LIMIT 1
    `,
    [providerId],
  );
  if (!row) return null;
  return {
    contractFileUrl: row.contract_file_url || "",
    certificateFileUrl: row.certificate_file_url || "",
  };
}

/**
 * Chuẩn hóa avatar_url lưu DB → URL tuyệt đối cho client.
 * Hỗ trợ: /uploads/avatars/x.jpg, http(s)://..., hoặc URL Google.
 */
export function formatPublicAvatarUrl(stored, req = null) {
  if (stored == null || String(stored).trim() === "") return "";

  const raw = String(stored).trim();
  if (/^https?:\/\//i.test(raw)) return raw;

  const base =
    process.env.PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
    (req
      ? `${req.protocol}://${req.get("host")}`
      : `http://localhost:${process.env.PORT || 3000}`);

  if (raw.startsWith("/")) return `${base}${raw}`;
  return `${base}/${raw}`;
}

/** Đường dẫn tương đối trong DB (/uploads/avatars/...) để xóa file. */
export function toStoredAvatarPath(stored) {
  if (!stored || typeof stored !== "string") return null;
  const trimmed = stored.trim();
  const m = trimmed.match(/\/uploads\/avatars\/([^/]+)$/i);
  if (m) return `/uploads/avatars/${m[1]}`;
  try {
    const u = new URL(trimmed);
    const pathMatch = u.pathname.match(/^\/uploads\/avatars\/([^/]+)$/i);
    if (pathMatch) return `/uploads/avatars/${pathMatch[1]}`;
  } catch {
    /* ignore */
  }
  return null;
}

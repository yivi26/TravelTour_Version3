/**
 * Chuẩn hóa vai trò từ DB / JWT / UI admin (supplier = nhà cung cấp).
 */
export function normalizeTravelTourRole(role) {
  const r = String(role ?? "")
    .trim()
    .toLowerCase();
  if (r === "supplier") return "provider";
  if (!r) return "customer";
  return r;
}

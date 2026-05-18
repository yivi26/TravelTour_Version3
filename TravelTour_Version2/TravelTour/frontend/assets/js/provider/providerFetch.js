/** Header Bearer cho /api/provider/* (token sau đăng nhập). */
function providerAuthHeaders() {
  const token =
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    "";
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Điền tên + email trên header trang provider từ localStorage (tránh placeholder sai). */
function syncProviderHeaderFromStorage() {
  try {
    var raw = localStorage.getItem("traveltour_user");
    if (!raw) return;
    var u = JSON.parse(raw);
    var name = u.fullName || u.full_name || "";
    var email = u.email || "";
    var r = String(u.role || "").toLowerCase();
    var label =
      r === "provider" || r === "supplier"
        ? "Nhà cung cấp"
        : r === "guide"
          ? "Hướng dẫn viên"
          : r === "admin"
            ? "Admin"
            : "Khách hàng";
    var nameEl =
      document.getElementById("headerUserName") ||
      document.querySelector(".user-area .profile .name");
    var emailEl =
      document.getElementById("headerUserEmail") ||
      document.querySelector(".user-area .profile .email");
    if (nameEl) nameEl.textContent = name || label;
    if (emailEl && email) emailEl.textContent = email;
  } catch (e) {
    /* ignore */
  }
}

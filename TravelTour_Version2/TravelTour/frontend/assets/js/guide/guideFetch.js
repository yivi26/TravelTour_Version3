/** Header Bearer cho /api/guide/* (token sau đăng nhập). */
function guideAuthHeaders() {
  const token =
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    "";
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Điền tên trên topbar từ phiên (trước khi API profile trả về). */
function syncGuideTopbarFromStorage() {
  try {
    var raw = localStorage.getItem("traveltour_user");
    if (!raw) return;
    var u = JSON.parse(raw);
    var name = u.fullName || u.full_name || "";
    var el = document.getElementById("topbarUserName");
    if (el && name) el.textContent = name;
  } catch (e) {
    /* ignore */
  }
}

/** 403 “Chỉ tài khoản HDV” → phiên không phải HDV, chuyển đăng nhập. */
function redirectGuidePortalIfForbiddenMessage(message) {
  var msg = message == null ? "" : String(message);
  if (msg.indexOf("Chỉ tài khoản hướng dẫn viên") === -1) return;
  var ret = encodeURIComponent(
    window.location.pathname + (window.location.search || ""),
  );
  window.location.href = "/pages/dangnhap/login.html?return_to=" + ret;
}

function assertGuideFetchOk(response, result, fallbackMsg) {
  if (response.ok) return;
  if (typeof redirectGuidePortalIfForbiddenMessage === "function") {
    redirectGuidePortalIfForbiddenMessage(result && result.message);
  }
  const msg =
    (result && (result.message || result.error)) || fallbackMsg || "Lỗi API";
  throw new Error(msg);
}

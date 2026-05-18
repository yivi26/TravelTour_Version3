/**
 * Khi API trả 403 + code ACCOUNT_LOCKED (tài khoản bị admin khóa), xóa phiên và chuyển về trang đăng nhập.
 * Tải file này trước các script gọi /api/* (trang chủ, customer, hoặc kèm guideFetch/providerFetch).
 */
(function installTravelTourAccountLockFetch() {
  if (typeof window === "undefined" || window.__travelTourAccountLockFetchInstalled) return;
  window.__travelTourAccountLockFetchInstalled = true;

  const LOCK_CODE = "ACCOUNT_LOCKED";
  const LOGIN_PATH = "/login";

  function requestHadAuth(init) {
    if (!init || !init.headers) return false;
    const headers = init.headers;
    if (headers instanceof Headers) {
      return headers.has("Authorization") || headers.has("authorization");
    }
    return Boolean(headers.Authorization || headers.authorization);
  }

  const orig = window.fetch.bind(window);
  window.fetch = async function travelTourFetchWithLockCheck(...args) {
    const res = await orig(...args);
    const reqUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (typeof reqUrl !== "string" || !reqUrl.includes("/api/")) return res;

    const init = args[1] || {};
    const hadAuth = requestHadAuth(init);

    if (res.status === 401 && hadAuth && !window.__travelTourAuthRedirecting) {
      window.__travelTourAuthRedirecting = true;
      try {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("token");
        localStorage.removeItem("traveltour_user");
        localStorage.removeItem("traveltour_remember");
        sessionStorage.removeItem("traveltour-booking");
        sessionStorage.removeItem("traveltour-last-booking");
      } catch (_) {
        /* ignore */
      }
      const returnTo = encodeURIComponent(
        window.location.pathname + window.location.search,
      );
      window.location.href = `${LOGIN_PATH}?return_to=${returnTo}`;
      return res;
    }

    if (res.status !== 403) return res;

    let body = {};
    try {
      body = await res.clone().json();
    } catch {
      return res;
    }

    if (body && body.code === LOCK_CODE && !window.__travelTourLockRedirecting) {
      window.__travelTourLockRedirecting = true;
      try {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("traveltour_user");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        sessionStorage.removeItem("traveltour-booking");
        sessionStorage.removeItem("traveltour-last-booking");
      } catch (_) {
        /* ignore */
      }
      window.location.href = LOGIN_PATH + "?reason=locked";
    }

    return res;
  };
})();

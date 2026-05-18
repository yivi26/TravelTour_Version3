(function () {
  const LOGIN_PATH = "/login";

  function getAccessToken() {
    const raw =
      localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
    const token = String(raw).trim();
    if (!token || token === "null" || token === "undefined") return "";
    return token;
  }

  function getStoredUser() {
    try {
      const raw = localStorage.getItem("traveltour_user");
      if (!raw) return null;
      const user = JSON.parse(raw);
      return user && typeof user === "object" ? user : null;
    } catch {
      return null;
    }
  }

  function clearAuthSession() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("token");
    localStorage.removeItem("traveltour_user");
    localStorage.removeItem("traveltour_remember");
    sessionStorage.removeItem("traveltour-booking");
    sessionStorage.removeItem("traveltour-last-booking");
  }

  function getAuthHeaders(extraHeaders) {
    const token = getAccessToken();
    const headers = { ...(extraHeaders || {}) };
    if (token) {
      headers.Authorization = "Bearer " + token;
    }
    return headers;
  }

  function redirectToLogin(returnTo) {
    if (window.__travelTourAuthRedirecting) return;
    window.__travelTourAuthRedirecting = true;
    clearAuthSession();
    const target =
      returnTo && String(returnTo).startsWith("/")
        ? `${LOGIN_PATH}?return_to=${encodeURIComponent(returnTo)}`
        : LOGIN_PATH;
    window.location.href = target;
  }

  function ensureAuthenticated(options = {}) {
    const { role = null, returnTo = window.location.pathname } = options;
    const token = getAccessToken();
    if (!token) {
      redirectToLogin(returnTo);
      return false;
    }

    if (role) {
      const user = getStoredUser();
      const userRole = String(user?.role || "").toLowerCase();
      if (userRole && userRole !== String(role).toLowerCase()) {
        redirectToLogin(returnTo);
        return false;
      }
    }

    const existing = getAccessToken();
    if (existing && !localStorage.getItem("accessToken")) {
      localStorage.setItem("accessToken", existing);
    }

    return true;
  }

  async function authFetch(url, options = {}) {
    const headers = getAuthHeaders(options.headers || {});
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      redirectToLogin(window.location.pathname);
      throw new Error("UNAUTHORIZED");
    }

    return response;
  }

  window.AuthSession = {
    getAccessToken,
    getStoredUser,
    clearAuthSession,
    getAuthHeaders,
    redirectToLogin,
    ensureAuthenticated,
    authFetch,
  };
})();

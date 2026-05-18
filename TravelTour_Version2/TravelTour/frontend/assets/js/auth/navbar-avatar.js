/**
 * Đồng bộ ảnh đại diện lên .user-icon / #navbarUserAvatar (customer).
 */
(function () {
  function getDefaultAvatarSrc() {
    const path = window.location.pathname.replace(/\\/g, "/");
    if (path.includes("/pages/tours/")) return "../../assets/img/default-avatar.svg";
    if (path.includes("/pages/customer/")) return "../../assets/img/default-avatar.svg";
    if (path.includes("/pages/")) return "../assets/img/default-avatar.svg";
    return "./assets/img/default-avatar.svg";
  }

  function normalizeAvatarUrl(avatarUrl) {
    if (avatarUrl == null || String(avatarUrl).trim() === "") return "";
    const raw = String(avatarUrl).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("/")) return `${window.location.origin}${raw}`;
    return raw;
  }

  function setSafeAvatar(imgElement, avatarUrl) {
    if (!imgElement) return;
    const normalized = normalizeAvatarUrl(avatarUrl);
    const fallback = getDefaultAvatarSrc();
    imgElement.src = normalized || fallback;
    imgElement.onerror = function () {
      this.onerror = null;
      this.src = fallback;
    };
  }

  function ensureUserIconAvatarMarkup(userIcon) {
    if (!userIcon) return null;

    let img = userIcon.querySelector("#navbarUserAvatar, img.nav-user-avatar");
    if (!img) {
      userIcon.textContent = "";
      img = document.createElement("img");
      img.id = "navbarUserAvatar";
      img.className = "nav-user-avatar";
      img.width = 36;
      img.height = 36;
      img.alt = "Hồ sơ";
      userIcon.appendChild(img);
    }

    userIcon.classList.add("nav-user-link");
    return img;
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

  async function fetchCustomerAvatarFromApi() {
    const token =
      window.AuthSession?.getAccessToken?.() ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("token") ||
      "";
    if (!token) return "";

    const origin = window.location.origin || "http://localhost:3000";
    const response = await fetch(`${origin}/api/customer/profile`, {
      headers: { Authorization: "Bearer " + token },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success || !result.data) return "";

    return result.data.avatar_url != null ? String(result.data.avatar_url) : "";
  }

  async function syncNavbarUserAvatar() {
    const userIcon = document.querySelector(".nav-actions .user-icon");
    const img =
      document.getElementById("navbarUserAvatar") ||
      ensureUserIconAvatarMarkup(userIcon);

    if (!img) return;

    const token =
      window.AuthSession?.getAccessToken?.() ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("token") ||
      "";
    if (!token) {
      setSafeAvatar(img, "");
      return;
    }

    const stored = getStoredUser();
    const role = String(stored?.role || "").toLowerCase();

    if (role === "customer") {
      try {
        const avatar = await fetchCustomerAvatarFromApi();
        if (avatar) {
          setSafeAvatar(img, avatar);
          localStorage.setItem(
            "traveltour_user",
            JSON.stringify({
              ...(stored || {}),
              avatarUrl: normalizeAvatarUrl(avatar),
            }),
          );
          return;
        }
      } catch (e) {
        console.warn("Không đồng bộ được avatar navbar:", e);
      }
    }

    if (stored?.avatarUrl) {
      setSafeAvatar(img, stored.avatarUrl);
    } else {
      setSafeAvatar(img, "");
    }
  }

  window.NavbarAvatar = {
    getDefaultAvatarSrc,
    normalizeAvatarUrl,
    setSafeAvatar,
    ensureUserIconAvatarMarkup,
    syncNavbarUserAvatar,
  };

  window.syncCustomerTopbarFromServer = syncNavbarUserAvatar;
  window.syncCustomerNavbarFromServer = syncNavbarUserAvatar;
})();

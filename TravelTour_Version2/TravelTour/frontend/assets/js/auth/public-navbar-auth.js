(function () {
  function getAccessToken() {
    if (window.AuthSession?.getAccessToken) {
      return window.AuthSession.getAccessToken();
    }
    const raw =
      localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
    const token = String(raw).trim();
    if (!token || token === "null" || token === "undefined") return "";
    return token;
  }

  function getCurrentUser() {
    const accessToken = getAccessToken();
    if (!accessToken) {
      localStorage.removeItem("traveltour_user");
      return null;
    }

    const savedUser = localStorage.getItem("traveltour_user");
    if (!savedUser) return null;

    try {
      const user = JSON.parse(savedUser);
      if (!user || typeof user !== "object") {
        localStorage.removeItem("traveltour_user");
        return null;
      }
      return user;
    } catch (error) {
      console.warn("Không đọc được thông tin người dùng:", error);
      localStorage.removeItem("traveltour_user");
      return null;
    }
  }

  function getLoginHref() {
    return "/login";
  }

  function getCustomerHref() {
    return "/pages/customer/customer.html";
  }

  function getTourListHref() {
    return "/pages/tours/dstour.html";
  }

  function getHomeHref() {
    return "/index.html";
  }

  function syncPublicNavbarAuth() {
    const isLoggedIn = !!getCurrentUser();
    const authBtn = document.getElementById("btnAuth") || document.getElementById("btnLogout");

    if (authBtn) {
      authBtn.id = "btnAuth";
      authBtn.textContent = isLoggedIn ? "Đăng xuất" : "Đăng nhập";
    }

    const userIcon = document.querySelector(".nav-actions .user-icon");
    if (userIcon) {
      if (isLoggedIn) {
        userIcon.style.display = "";
        userIcon.removeAttribute("hidden");
        userIcon.removeAttribute("aria-hidden");
        userIcon.href = getCustomerHref();
        if (window.NavbarAvatar?.ensureUserIconAvatarMarkup) {
          window.NavbarAvatar.ensureUserIconAvatarMarkup(userIcon);
        }
        const role = String(getCurrentUser()?.role || "").toLowerCase();
        if (role === "customer" && window.NavbarAvatar?.syncNavbarUserAvatar) {
          void window.NavbarAvatar.syncNavbarUserAvatar();
        } else if (window.NavbarAvatar?.setSafeAvatar) {
          const img =
            document.getElementById("navbarUserAvatar") ||
            userIcon.querySelector("img");
          if (img) {
            window.NavbarAvatar.setSafeAvatar(img, getCurrentUser()?.avatarUrl || "");
          }
        }
      } else {
        userIcon.style.display = "none";
        userIcon.setAttribute("hidden", "");
        userIcon.setAttribute("aria-hidden", "true");
        userIcon.href = getLoginHref();
      }
    }
  }

  function bindPublicNavbarAuth() {
    syncPublicNavbarAuth();

    const authBtn = document.getElementById("btnAuth");
    if (!authBtn || authBtn.dataset.authBound === "1") return;

    authBtn.dataset.authBound = "1";
    authBtn.addEventListener("click", () => {
      if (!getCurrentUser()) {
        window.location.href = getLoginHref();
        return;
      }

      localStorage.removeItem("accessToken");
      localStorage.removeItem("traveltour_user");
      localStorage.removeItem("traveltour_remember");
      syncPublicNavbarAuth();
      window.location.href = getHomeHref();
    });
  }

  function bindPublicNavbarBookingButton() {
    const bookingButton = document.querySelector(".nav-actions .btn.btn-primary");
    if (!bookingButton || bookingButton.dataset.bookingBound === "1") return;

    bookingButton.dataset.bookingBound = "1";
    bookingButton.addEventListener("click", () => {
      window.location.href = getTourListHref();
    });
  }

  function initPublicNavbar() {
    bindPublicNavbarAuth();
    bindPublicNavbarBookingButton();
  }

  window.PublicNavbarAuth = {
    getCurrentUser,
    syncPublicNavbarAuth,
    bindPublicNavbarAuth,
    bindPublicNavbarBookingButton,
    initPublicNavbar,
    getTourListHref,
    getLoginHref,
    getCustomerHref,
    getHomeHref
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (!document.querySelector(".nav-actions")) return;
    if (document.getElementById("our-tours-list") || document.getElementById("featured-tours-list")) {
      return;
    }
    initPublicNavbar();
  });
})();

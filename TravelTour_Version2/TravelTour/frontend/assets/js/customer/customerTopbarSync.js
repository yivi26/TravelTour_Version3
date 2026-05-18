/**
 * Đồng bộ avatar navbar customer — dùng NavbarAvatar chung.
 */
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    if (!document.getElementById("navbarUserAvatar")) return;
    if (window.NavbarAvatar?.syncNavbarUserAvatar) {
      void window.NavbarAvatar.syncNavbarUserAvatar();
    }
  });
})();

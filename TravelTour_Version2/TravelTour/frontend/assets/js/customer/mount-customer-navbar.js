/**
 * Navbar site thay cho topbar dashboard — chạy ngay sau <body>.
 */
(function () {
  if (document.getElementById("siteNavbar")) return;

  document.body.classList.add("customer-app");

  document.body.insertAdjacentHTML(
    "afterbegin",
    '<nav class="navbar site-navbar" id="siteNavbar" aria-label="Điều hướng chính">' +
      '<div class="container nav-container">' +
      '<button type="button" class="menu-toggle customer-nav-menu-toggle" id="menuToggle" aria-label="Mở menu">☰</button>' +
      '<a href="../../index.html" class="logo" aria-label="TravelTour — trang chủ">TravelTour</a>' +
      '<ul class="nav-menu">' +
      '<li><a href="../../index.html">Trang chủ</a></li>' +
      '<li><a href="../../index.html#about">Giới thiệu</a></li>' +
      '<li><a href="../../pages/tours/dstour.html">Tour</a></li>' +
      "</ul>" +
      '<div class="nav-actions">' +
      '<button type="button" class="btn btn-primary">Đặt tour</button>' +
      '<button type="button" class="btn btn-outline" id="btnAuth">Đăng nhập</button>' +
      '<a href="customer.html" class="user-icon nav-user-link" id="navUserLink" hidden aria-hidden="true">' +
      '<img id="navbarUserAvatar" class="nav-user-avatar" src="../../assets/img/default-avatar.svg" alt="Hồ sơ" width="36" height="36" />' +
      "</a>" +
      "</div>" +
      "</div>" +
      "</nav>"
  );
})();

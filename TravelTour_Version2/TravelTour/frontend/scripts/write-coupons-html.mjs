import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const D = "div";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "../pages/customer/coupons.html");

const html = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>M\u00e3 gi\u1ea3m gi\u00e1 c\u1ee7a t\u00f4i - TravelTour</title>
    <link rel="stylesheet" href="../../assets/css/style.css" />
    <link rel="stylesheet" href="../../assets/css/customer/customer.css" />
    <link rel="stylesheet" href="../../assets/css/customer/customer-site-nav.css" />
    <link rel="stylesheet" href="../../assets/css/customer/coupons.css" />
  </head>
  <body>
    <script src="../../assets/js/customer/mount-customer-navbar.js"></script>
    <${D} class="dashboard">
      <${D} class="dashboard-body">
        <aside class="sidebar" id="sidebar">
          <nav class="sidebar-menu">
            <a href="customer.html" class="menu-item"><span class="menu-icon">\ud83d\udc64</span><span>Th\u00f4ng tin c\u00e1 nh\u00e2n</span></a>
            <a href="history.html" class="menu-item"><span class="menu-icon">\ud83d\udd58</span><span>L\u1ecbch s\u1eed \u0111\u1eb7t tour</span></a>
            <a href="booking.html" class="menu-item"><span class="menu-icon">\ud83d\udcc5</span><span>Booking c\u1ee7a t\u00f4i</span></a>
            <a href="coupons.html" class="menu-item active"><span class="menu-icon">\ud83c\udf81</span><span>M\u00e3 gi\u1ea3m gi\u00e1</span></a>
            <a href="changepass.html" class="menu-item"><span class="menu-icon">\ud83d\udd12</span><span>\u0110\u1ed5i m\u1eadt kh\u1ea9u</span></a>
            <button class="menu-item logout-btn" type="button"><span class="menu-icon">\ud83d\udeaa</span><span>\u0110\u0103ng xu\u1ea5t</span></button>
          </nav>
        </aside>
        <${D} class="sidebar-overlay" id="sidebarOverlay"></${D}>
        <main class="main-content">
          <${D} class="page-container coupons-page">
            <section class="page-header">
              <h1>M\u00e3 gi\u1ea3m gi\u00e1 c\u1ee7a t\u00f4i</h1>
              <p>M\u00e3 t\u1eb7ng khi tour b\u1ecb h\u1ee7y s\u1ebd t\u1ef1 \u00e1p d\u1ee5ng khi b\u1ea1n \u0111\u1eb7t tour c\u00f9ng nh\u00e0 cung c\u1ea5p.</p>
            </section>
            <${D} id="couponsList" class="coupons-list"><p class="coupons-empty">\u0110ang t\u1ea3i...</p></${D}>
          </${D}>
        </main>
      </${D}>
    </${D}>
    <${D} class="modal hidden" id="logoutModal">
      <${D} class="modal-content">
        <h3>B\u1ea1n c\u00f3 mu\u1ed1n \u0111\u0103ng xu\u1ea5t kh\u00f4ng?</h3>
        <${D} class="modal-actions">
          <button class="btn-cancel" id="cancelLogout">H\u1ee7y</button>
          <button class="btn-confirm" id="confirmLogout">\u0110\u0103ng xu\u1ea5t</button>
        </${D}>
      </${D}>
    </${D}>
    <script src="../../assets/js/auth/account-lock-fetch.js"></script>
    <script src="../../assets/js/auth/navbar-avatar.js"></script>
    <script src="../../assets/js/customer/customer-notifications.js"></script>
    <script src="../../assets/js/auth/public-navbar-auth.js"></script>
    <script src="../../assets/js/customer/customerTopbarSync.js"></script>
    <script src="../../assets/js/customer/customer-coupons.js"></script>
  </body>
</html>
`;

fs.writeFileSync(out, html, "utf8");
console.log("wrote", out);

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(__dirname, "../pages/customer");
const link = `
            <a href="coupons.html" class="menu-item">
              <span class="menu-icon">🎁</span>
              <span>Mã giảm giá</span>
            </a>
`;

const files = ["customer.html", "history.html", "booking.html", "changepass.html"];

for (const file of files) {
  const fp = path.join(pagesDir, file);
  let html = fs.readFileSync(fp, "utf8");
  if (html.includes('href="coupons.html"')) {
    console.log("skip", file);
    continue;
  }
  const marker = '<a href="changepass.html" class="menu-item">';
  if (!html.includes(marker)) {
    console.warn("no marker in", file);
    continue;
  }
  html = html.replace(marker, link + "\n" + marker);
  fs.writeFileSync(fp, html, "utf8");
  console.log("patched", file);
}

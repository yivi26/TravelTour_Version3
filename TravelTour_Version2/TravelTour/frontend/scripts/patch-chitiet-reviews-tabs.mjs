import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "../pages/tours/chitiet.html");
const D = "motion".replace("motion", "div");

let html = fs.readFileSync(htmlPath, "utf8");

if (html.includes('id="reviews-tabs"')) {
  console.log("Already patched tabs");
} else {
  const tabsBlock = `
            <${D} class="reviews-tabs" id="reviews-tabs" role="tablist" aria-label="Lo\u1ea1i \u0111\u00e1nh gi\u00e1">
              <button type="button" class="reviews-tab is-active" role="tab" id="reviews-tab-tour-btn" data-reviews-tab="tour" aria-selected="true" aria-controls="reviews-panel-tour">
                \u0110\u00e1nh gi\u00e1 tour
              </button>
              <button type="button" class="reviews-tab" role="tab" id="reviews-tab-guide-btn" data-reviews-tab="guide" aria-selected="false" aria-controls="reviews-panel-guide" tabindex="-1">
                H\u01b0\u1edbng d\u1eabn vi\u00ean
              </button>
            </${D}>

            <${D} id="reviews-panel-tour" class="reviews-tab-panel" role="tabpanel" aria-labelledby="reviews-tab-tour-btn">
`;

  html = html.replace(
    /(<h2>\u0110\u00e1nh gi\u00e1 t\u1eeb kh\u00e1ch h\u00e0ng<\/h2>\s*\n)/,
    `$1${tabsBlock}`
  );

  html = html.replace(
    /(\s*<${D} id="reviews-list" class="reviews-list"><\/${D}>\s*\n)(\s*<\/section>\s*\n\s*<section class="section-card guide-review-section")/,
    `$1            </${D}>
            <button type="button" class="reviews-view-all-btn" id="reviews-view-all-tour" hidden>
              Xem t\u1ea5t c\u1ea3 \u0111\u00e1nh gi\u00e1 tour
            </button>
            </${D}>

            <${D} id="reviews-panel-guide" class="reviews-tab-panel" role="tabpanel" aria-labelledby="reviews-tab-guide-btn" hidden>
              <${D} id="guide-reviews-public-profile" class="guide-reviews-public-profile" hidden></${D}>
              <${D} id="guide-reviews-summary-root" class="reviews-summary-wrap"></${D}>
              <${D} id="guide-reviews-public-list" class="reviews-list"></${D}>
              <button type="button" class="reviews-view-all-btn" id="reviews-view-all-guide" hidden>
                Xem t\u1ea5t c\u1ea3 \u0111\u00e1nh gi\u00e1 HDV
              </button>
            </${D}>
$2`
  );
}

if (!html.includes('id="reviews-modal"')) {
  const modal = `
    <${D} id="reviews-modal" class="reviews-modal" hidden aria-hidden="true">
      <${D} class="reviews-modal__backdrop" data-reviews-modal-close></${D}>
      <${D} class="reviews-modal__panel" role="dialog" aria-modal="true" aria-labelledby="reviews-modal-title">
        <header class="reviews-modal__header">
          <h2 id="reviews-modal-title" class="reviews-modal__title">\u0110\u00e1nh gi\u00e1</h2>
          <button type="button" class="reviews-modal__close" data-reviews-modal-close aria-label="\u0110\u00f3ng">&times;</button>
        </header>
        <${D} class="reviews-modal__body">
          <${D} id="reviews-modal-summary" class="reviews-summary-wrap reviews-modal__summary"></${D}>
          <${D} id="reviews-modal-list" class="reviews-list"></${D}>
          <nav id="reviews-modal-pagination" class="reviews-pagination" aria-label="Ph\u00e2n trang \u0111\u00e1nh gi\u00e1"></nav>
        </${D}>
      </${D}>
    </${D}>

`;
  html = html.replace(/(\s*<script src="https:\/\/unpkg.com\/leaflet)/, `${modal}$1`);
}

fs.writeFileSync(htmlPath, html, { encoding: "utf8" });
console.log("Done");

import fs from "fs";

const p = "tourdangdan.js";
let s = fs.readFileSync(p, "utf8");
const start = s.indexOf("function ensureAbsenceConsentModal");
const end = s.indexOf("function closeAbsenceConsentModal");
if (start < 0 || end < 0) throw new Error("markers not found");

const block = `function ensureAbsenceConsentModal() {
  let modal = document.getElementById("absenceConsentModal");
  if (modal) return modal;

  modal = document.createElement("motionless-div");
  modal = document.createElement("motionless-div");
  modal = document.createElement("div");
  modal.id = "absenceConsentModal";
  modal.className = "absence-modal absence-modal--consent";
  modal.hidden = true;
  modal.innerHTML = \`
    <div class="absence-modal__backdrop" data-close-consent></div>
    <div class="absence-modal__dialog" role="dialog" aria-modal="true">
      <h2 class="absence-modal__title">Báo bận khẩn cấp</h2>
      <p class="absence-consent__text">
        Nhà cung cấp sẽ hỗ trợ bạn tìm kiếm người thay thế. Nếu không có hướng dẫn viên phù hợp thì bạn phải chịu mức đền bù <strong>2%</strong> trên tổng giá trị tour.
        Bạn vui lòng đợi phản hồi từ phía Nhà Cung Cấp.
      </p>
      <div class="absence-modal__actions">
        <button type="button" class="absence-modal__btn absence-modal__btn--ghost" data-close-consent>Thoát</button>
        <button type="button" class="absence-modal__btn absence-modal__btn--primary" data-role="consent-agree">Đồng ý</button>
      </div>
    </div>
  \`;
  document.body.appendChild(modal);
  return modal;
}

`;

// fix motionless typo in block
const clean = block
  .replace('modal = document.createElement("motionless-div");\n  modal = document.createElement("motionless-div");\n  modal = document.createElement("div");', 'modal = document.createElement("div");');

s = s.slice(0, start) + clean + s.slice(end);
fs.writeFileSync(p, s);
console.log("ok");

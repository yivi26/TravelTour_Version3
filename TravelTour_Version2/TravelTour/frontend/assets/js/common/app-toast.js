/**
 * Toast & xác nhận dùng chung — thay alert/confirm trình duyệt.
 * Load sớm trên mọi trang: /assets/js/common/app-toast.js
 */
(function (global) {
  "use strict";

  const DEFAULT_DURATION = 4200;
  let toastHideTimer = null;

  function inferToastType(message) {
    const text = String(message ?? "").trim();
    if (/^❌|^⚠️?/u.test(text)) return "error";
    if (
      /thất bại|không thể|không tìm|không có|không đúng|không load|không tải|không xuất|không tạo|không cập nhật|không lưu|không mở|không ràng|không thực|không hoàn|không gửi|không kích|lỗi |^lỗi|sai |vui lòng|thiếu |chưa có|chưa load|chưa tải|chưa chọn|chỉ chấp nhận|chỉ được|tối đa |tối thiểu /i.test(
        text,
      )
    ) {
      return "error";
    }
    if (
      /^✅/u.test(text) ||
      /thành công|đã lưu|đã cập nhật|đã gửi|đã tạo|đã xóa|đã duyệt|đã bỏ|đã đánh dấu|đã hoàn|đã khôi|đã xác nhận|đã chấp nhận|đã phân công|đã gỡ|đã đăng ký/i.test(
        text,
      )
    ) {
      return "success";
    }
    return "info";
  }

  function cleanToastMessage(message) {
    return String(message ?? "")
      .replace(/^✅\s*/u, "")
      .replace(/^❌\s*/u, "")
      .replace(/^⚠️?\s*/u, "")
      .trim();
  }

  function ensureToastElement() {
    let el = document.getElementById("app-toast");
    if (!el && document.body) {
      el = document.createElement("div");
      el.id = "app-toast";
      el.className = "app-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    return el;
  }

  function showAppToast(message, typeOrOpts) {
    if (typeof document === "undefined") return;

    let type;
    let duration = DEFAULT_DURATION;

    if (typeof typeOrOpts === "string") {
      type = typeOrOpts;
    } else if (typeOrOpts && typeof typeOrOpts === "object") {
      type = typeOrOpts.type;
      duration = typeOrOpts.duration ?? duration;
    }

    const raw = String(message ?? "").trim();
    if (!raw) return;

    if (!type) type = inferToastType(raw);
    const text = cleanToastMessage(raw);
    if (!text) return;

    const el = ensureToastElement();
    if (!el) return;

    el.textContent = text;
    el.className = `app-toast app-toast--${type} is-visible`;

    if (toastHideTimer) clearTimeout(toastHideTimer);
    toastHideTimer = setTimeout(() => {
      el.classList.remove("is-visible");
    }, duration);
  }

  function ensureConfirmModal() {
    let root = document.getElementById("app-confirm");
    if (root) return root;

    root = document.createElement("div");
    root.id = "app-confirm";
    root.className = "app-confirm";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.innerHTML = `
      <div class="app-confirm__backdrop" data-app-confirm-cancel tabindex="-1"></div>
      <div class="app-confirm__panel" role="document">
        <p class="app-confirm__message" id="appConfirmMessage"></p>
        <div class="app-confirm__actions">
          <button type="button" class="app-confirm__btn app-confirm__btn--cancel" data-app-confirm-cancel>Hủy</button>
          <button type="button" class="app-confirm__btn app-confirm__btn--ok" data-app-confirm-ok>Đồng ý</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    root.addEventListener("click", (event) => {
      if (
        event.target.closest("[data-app-confirm-cancel]") &&
        typeof root._resolve === "function"
      ) {
        const resolve = root._resolve;
        root._resolve = null;
        root.hidden = true;
        resolve(false);
      }
    });

    root.querySelector("[data-app-confirm-ok]")?.addEventListener("click", () => {
      if (typeof root._resolve === "function") {
        const resolve = root._resolve;
        root._resolve = null;
        root.hidden = true;
        resolve(true);
      }
    });

    return root;
  }

  /**
   * @param {string} message
   * @param {{ confirmLabel?: string, cancelLabel?: string, danger?: boolean }} [options]
   * @returns {Promise<boolean>}
   */
  function showAppConfirm(message, options = {}) {
    if (typeof document === "undefined") {
      return Promise.resolve(false);
    }

    const root = ensureConfirmModal();
    const msgEl = root.querySelector("#appConfirmMessage");
    const okBtn = root.querySelector("[data-app-confirm-ok]");
    const cancelBtn = root.querySelector(
      ".app-confirm__btn--cancel[data-app-confirm-cancel]",
    );

    if (msgEl) msgEl.textContent = String(message ?? "");
    if (okBtn) {
      okBtn.textContent = options.confirmLabel || "Đồng ý";
      okBtn.classList.toggle("app-confirm__btn--danger", Boolean(options.danger));
      okBtn.classList.toggle("app-confirm__btn--ok", !options.danger);
    }
    if (cancelBtn) {
      cancelBtn.textContent = options.cancelLabel || "Hủy";
    }

    root.hidden = false;
    okBtn?.focus();

    return new Promise((resolve) => {
      root._resolve = resolve;
    });
  }

  global.showAppToast = showAppToast;
  global.showAppConfirm = showAppConfirm;

  if (!global.showToast) {
    global.showToast = function (message, type) {
      if (type === "error" || type === false) {
        showAppToast(message, "error");
      } else if (type === "success" || type === true) {
        showAppToast(message, "success");
      } else {
        showAppToast(message, type || "info");
      }
    };
  }

  if (!global.__appToastAlertPatched) {
    global.__appToastAlertPatched = true;
    global.alert = function (message) {
      showAppToast(message, inferToastType(message));
    };
  }
})(typeof window !== "undefined" ? window : globalThis);

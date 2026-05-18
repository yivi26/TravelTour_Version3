/**
 * Dropdown chọn số khách — UI đồng bộ với date picker hero.
 */
(function () {
  const DEFAULT_OPTIONS = [
    { value: "1", label: "1 người" },
    { value: "2", label: "2 người" },
    { value: "3", label: "3 người" },
    { value: "4", label: "4 người" },
    { value: "5", label: "5+ người" }
  ];

  window.initHeroPassengerPicker = function initHeroPassengerPicker(root, options = {}) {
    if (!root) return null;

    const trigger = root.querySelector(".passenger-picker__trigger");
    const dropdown = root.querySelector(".passenger-picker__dropdown");
    const listEl = root.querySelector(".passenger-picker__list");
    const valueEl = root.querySelector(".passenger-picker__value");
    const hiddenInput = root.querySelector('input[type="hidden"]');

    if (!trigger || !dropdown || !listEl || !hiddenInput) return null;

    const items = Array.isArray(options.options) ? options.options : DEFAULT_OPTIONS;
    const placeholder =
      options.placeholder ||
      valueEl?.getAttribute("data-placeholder") ||
      "Chọn số khách";

    function setValue(value, silent) {
      const next = value || "";
      hiddenInput.value = next;

      const selected = items.find((item) => item.value === next);

      if (valueEl) {
        if (selected) {
          valueEl.textContent = selected.label;
          valueEl.classList.add("is-set");
        } else {
          valueEl.textContent = placeholder;
          valueEl.classList.remove("is-set");
        }
      }

      listEl.querySelectorAll(".passenger-picker__option").forEach((btn) => {
        btn.classList.toggle("is-selected", btn.dataset.value === next);
        btn.setAttribute("aria-selected", btn.dataset.value === next ? "true" : "false");
      });

      if (!silent && typeof options.onChange === "function") {
        options.onChange(next);
      }
    }

    function open() {
      dropdown.removeAttribute("hidden");
      trigger.setAttribute("aria-expanded", "true");
      root.classList.add("is-open");
    }

    function close() {
      dropdown.setAttribute("hidden", "");
      trigger.setAttribute("aria-expanded", "false");
      root.classList.remove("is-open");
    }

    function toggle() {
      if (dropdown.hidden) open();
      else close();
    }

    listEl.innerHTML = "";

    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "passenger-picker__option";
      btn.dataset.value = item.value;
      btn.textContent = item.label;
      btn.setAttribute("role", "option");
      btn.addEventListener("click", () => {
        setValue(item.value);
        close();
      });
      listEl.appendChild(btn);
    });

    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });

    dropdown.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    document.addEventListener(
      "click",
      (e) => {
        if (!root.contains(e.target)) close();
      },
      true
    );

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });

    setValue(hiddenInput.value || "", true);

    return {
      getValue: () => hiddenInput.value,
      setValue,
      open,
      close
    };
  };
})();

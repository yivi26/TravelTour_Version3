/**
 * Date picker cho thanh tìm kiếm hero — chỉ chọn từ hôm nay trở đi.
 */
(function () {
  const WEEKDAYS = ["Th 2", "Th 3", "Th 4", "Th 5", "Th 6", "Th 7", "CN"];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toYmd(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function parseYmd(ymd) {
    if (!ymd) return null;
    const m = String(ymd).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDisplayVi(ymd) {
    const d = parseYmd(ymd);
    if (!d) return "";
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function isSameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function monthLabel(date) {
    return `Tháng ${date.getMonth() + 1} | ${date.getFullYear()}`;
  }

  window.initHeroDatePicker = function initHeroDatePicker(root, options = {}) {
    if (!root) return null;

    const trigger = root.querySelector(".date-picker__trigger");
    const dropdown = root.querySelector(".date-picker__dropdown");
    const monthEl = root.querySelector(".date-picker__month");
    const daysEl = root.querySelector(".date-picker__days");
    const valueEl = root.querySelector(".date-picker__value");
    const hiddenInput = root.querySelector('input[type="hidden"]');
    const btnPrev = root.querySelector(".date-picker__nav--prev");
    const btnNext = root.querySelector(".date-picker__nav--next");

    if (!trigger || !dropdown || !daysEl || !hiddenInput) return null;

    const today = startOfDay(new Date());
    const minYmd = options.minDate || toYmd(today);
    const minDate = parseYmd(minYmd) || today;

    let viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
    let selectedYmd = hiddenInput.value || "";

    function setValue(ymd, silent) {
      const parsed = parseYmd(ymd);
      if (parsed && parsed < minDate) {
        ymd = toYmd(minDate);
      }

      selectedYmd = ymd || "";
      hiddenInput.value = selectedYmd;

      if (valueEl) {
        if (selectedYmd) {
          valueEl.textContent = formatDisplayVi(selectedYmd);
          valueEl.classList.add("is-set");
        } else {
          valueEl.textContent =
            valueEl.getAttribute("data-placeholder") || "Chọn ngày";
          valueEl.classList.remove("is-set");
        }
      }

      if (selectedYmd) {
        const sel = parseYmd(selectedYmd);
        if (sel) {
          viewDate = new Date(sel.getFullYear(), sel.getMonth(), 1);
        }
      }

      renderCalendar();

      if (!silent && typeof options.onChange === "function") {
        options.onChange(selectedYmd);
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

    function renderCalendar() {
      monthEl.textContent = monthLabel(viewDate);

      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      const minMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      const viewMonth = new Date(year, month, 1);

      if (btnPrev) {
        btnPrev.disabled = viewMonth <= minMonth;
      }

      daysEl.innerHTML = "";

      for (let i = 0; i < firstWeekday; i += 1) {
        const spacer = document.createElement("span");
        spacer.className = "date-picker__day date-picker__day--empty";
        spacer.setAttribute("aria-hidden", "true");
        daysEl.appendChild(spacer);
      }

      for (let day = 1; day <= daysInMonth; day += 1) {
        const cellDate = new Date(year, month, day);
        const ymd = toYmd(cellDate);
        const isPast = cellDate < minDate;
        const isSunday = cellDate.getDay() === 0;
        const isSelected = selectedYmd === ymd;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "date-picker__day";
        btn.textContent = String(day);

        if (isSunday) btn.classList.add("is-sunday");
        if (isPast) {
          btn.classList.add("is-disabled");
          btn.disabled = true;
        }
        if (isSelected) btn.classList.add("is-selected");

        if (!isPast) {
          btn.addEventListener("click", () => {
            setValue(ymd);
            close();
          });
        }

        daysEl.appendChild(btn);
      }
    }

    const weekdaysEl = root.querySelector(".date-picker__weekdays");
    if (weekdaysEl && !weekdaysEl.childElementCount) {
      WEEKDAYS.forEach((label, index) => {
        const span = document.createElement("span");
        span.textContent = label;
        if (index === 6) span.classList.add("is-sunday");
        weekdaysEl.appendChild(span);
      });
    }

    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });

    dropdown.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    btnPrev?.addEventListener("click", (e) => {
      e.preventDefault();
      viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
      renderCalendar();
    });

    btnNext?.addEventListener("click", (e) => {
      e.preventDefault();
      viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
      renderCalendar();
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

    renderCalendar();
    if (hiddenInput.value) setValue(hiddenInput.value, true);

    return {
      getValue: () => hiddenInput.value,
      setValue,
      getMinDate: () => minYmd,
      open,
      close
    };
  };

  window.heroDatePickerUtils = {
    toYmd,
    parseYmd,
    formatDisplayVi,
    todayYmd: () => toYmd(startOfDay(new Date()))
  };
})();

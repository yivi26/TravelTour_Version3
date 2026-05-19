(() => {
  let currentFilter = "pending";
  let absenceItems = [];
  let selectedRequestId = null;
  let candidatesCache = new Map();

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("vi-VN");
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("vi-VN");
  }

  function urgencyLabel() {
    return { text: "Báo bận khẩn cấp", className: "is-urgent" };
  }

  function statusLabel(status) {
    if (status === "approved") return { text: "Đã duyệt", className: "is-approved" };
    if (status === "rejected") return { text: "Đã từ chối", className: "is-rejected" };
    if (status === "cancelled") return { text: "Đã huỷ", className: "is-cancelled" };
    return { text: "Chờ xử lý", className: "is-pending" };
  }

  async function fetchAbsences(filter) {
    const params = new URLSearchParams();
    if (filter && filter !== "all") params.set("status", filter);
    const res = await fetch(
      `/api/provider/absence-requests${params.toString() ? "?" + params : ""}`,
      { headers: providerAuthHeaders() },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || "Không tải được danh sách");
    return Array.isArray(json?.data) ? json.data : [];
  }

  async function fetchCandidates(tourId) {
    if (candidatesCache.has(tourId)) return candidatesCache.get(tourId);
    const res = await fetch(
      `/api/provider/tours/${encodeURIComponent(tourId)}/replacement-candidates`,
      { headers: providerAuthHeaders() },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || "Không lấy được danh sách HDV");
    const list = Array.isArray(json?.data) ? json.data : [];
    candidatesCache.set(tourId, list);
    return list;
  }

  async function approveRequest(id, replacementGuideId, note) {
    const res = await fetch(
      `/api/provider/absence-requests/${encodeURIComponent(id)}/approve`,
      {
        method: "POST",
        headers: providerAuthHeaders(),
        body: JSON.stringify({
          replacement_guide_id: replacementGuideId,
          note,
        }),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json?.message || "Duyệt yêu cầu thất bại");
    }
    return json.data;
  }

  async function rejectRequest(id, note) {
    const res = await fetch(
      `/api/provider/absence-requests/${encodeURIComponent(id)}/reject`,
      {
        method: "POST",
        headers: providerAuthHeaders(),
        body: JSON.stringify({ note }),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json?.message || "Từ chối yêu cầu thất bại");
    }
    return json.data;
  }

  async function cancelTourForRequest(id, { note, customerDiscountPercent }) {
    const res = await fetch(
      `/api/provider/absence-requests/${encodeURIComponent(id)}/cancel-tour`,
      {
        method: "POST",
        headers: providerAuthHeaders(),
        body: JSON.stringify({
          note,
          customer_discount_percent: Number(customerDiscountPercent) || 0,
        }),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json?.message || "Huỷ tour thất bại");
    }
    return json.data;
  }

  function ensureCancelCompensationModal() {
    let modal = document.getElementById("absenceCancelCompModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "absenceCancelCompModal";
    modal.className = "absence-comp-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="absence-comp-modal__backdrop" data-close-comp></div>
      <div class="absence-comp-modal__dialog" role="dialog" aria-modal="true">
        <button type="button" class="absence-comp-modal__close" data-close-comp aria-label="Đóng">&times;</button>
        <h2 class="absence-comp-modal__title">Bồi thường khách hàng</h2>
        <p class="absence-comp-modal__hint">
          Vui lòng nhập <strong>phần trăm giảm giá</strong> để bồi thường cho khách của tour này.
          Mỗi khách sẽ nhận một mã giảm giá <em>vô thời hạn</em> áp dụng cho tour kế tiếp thuộc nhà cung cấp của bạn.
        </p>
        <label class="absence-comp-modal__field">
          <span>Phần trăm giảm giá (0 – 100%)</span>
          <input type="number" min="0" max="100" step="1" value="10" data-role="comp-percent" />
        </label>
        <label class="absence-comp-modal__field">
          <span>Ghi chú (tùy chọn)</span>
          <textarea rows="3" data-role="comp-note" placeholder="VD: Không bố trí được HDV thay thế..."></textarea>
        </label>
        <p class="absence-comp-modal__error" data-role="comp-error" hidden></p>
        <div class="absence-comp-modal__actions">
          <button type="button" class="absence-comp-modal__btn absence-comp-modal__btn--ghost" data-close-comp>Huỷ</button>
          <button type="button" class="absence-comp-modal__btn absence-comp-modal__btn--primary" data-role="comp-confirm">
            Xác nhận huỷ tour
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function openCancelCompensationModal() {
    const modal = ensureCancelCompensationModal();
    modal.querySelector("[data-role='comp-percent']").value = 10;
    modal.querySelector("[data-role='comp-note']").value =
      document.getElementById("absenceProviderNote")?.value || "";
    const err = modal.querySelector("[data-role='comp-error']");
    err.hidden = true;
    err.textContent = "";
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("is-visible"));
  }

  function closeCancelCompensationModal() {
    const modal = document.getElementById("absenceCancelCompModal");
    if (!modal) return;
    modal.classList.remove("is-visible");
    window.setTimeout(() => {
      if (!modal.classList.contains("is-visible")) modal.hidden = true;
    }, 180);
  }

  function renderList() {
    const host = document.getElementById("absenceList");
    if (!host) return;

    if (!absenceItems.length) {
      host.innerHTML =
        '<p class="absence-empty">Không có yêu cầu nào.</p>';
      return;
    }

    host.innerHTML = absenceItems
      .map((item) => {
        const u = urgencyLabel();
        const s = statusLabel(item.status);
        const active = String(item.id) === String(selectedRequestId)
          ? "is-active"
          : "";
        return `
          <button
            type="button"
            class="absence-item ${active}"
            data-action="select"
            data-id="${escapeHtml(item.id)}"
          >
            <div class="absence-item__head">
              <span class="absence-item__guide">${escapeHtml(item.guide?.fullName || "HDV")}</span>
              <span class="absence-tag ${u.className}">${u.text}</span>
            </div>
            <div class="absence-item__tour">${escapeHtml(item.tour?.title || "Tour")}</div>
            <div class="absence-item__meta">
              <span><i class="fa-regular fa-calendar"></i> ${formatDate(item.tour?.startDate)} – ${formatDate(item.tour?.endDate)}</span>
              <span class="absence-tag ${s.className}">${s.text}</span>
            </div>
            <div class="absence-item__time">${formatDateTime(item.requestedAt)}</div>
          </button>
        `;
      })
      .join("");
  }

  function renderDetailEmpty() {
    const host = document.getElementById("absenceDetailCard");
    if (!host) return;
    host.innerHTML = `
      <div class="absence-detail-empty">
        <i class="fa-regular fa-circle-question"></i>
        <p>Chọn một yêu cầu ở danh sách để xem chi tiết và xử lý.</p>
      </div>
    `;
  }

  function renderCandidatesOptions(candidates, currentGuideId) {
    if (!candidates.length) {
      return '<option value="">Không có HDV phù hợp</option>';
    }
    return [
      '<option value="">— Chọn HDV thay thế —</option>',
      ...candidates
        .filter((g) => Number(g.id) !== Number(currentGuideId))
        .map((g) => {
          const name = escapeHtml(g.full_name || g.fullName || `HDV #${g.id}`);
          const blocked = g.has_schedule_conflict || g.hasScheduleConflict;
          const incomplete = g.has_incomplete_availability || g.hasIncompleteAvailability;
          let label = name;
          if (blocked) label += " · trùng lịch";
          if (incomplete) label += " · thiếu ngày rảnh";
          return `<option value="${g.id}" ${blocked || incomplete ? "disabled" : ""}>${label}</option>`;
        }),
    ].join("");
  }

  async function renderDetail(item) {
    const host = document.getElementById("absenceDetailCard");
    if (!host) return;

    const u = urgencyLabel();
    const s = statusLabel(item.status);

    host.innerHTML = `
      <header class="absence-detail__header">
        <div>
          <h3>${escapeHtml(item.guide?.fullName || "Hướng dẫn viên")}</h3>
          <p class="absence-detail__contact">
            ${item.guide?.phone ? `<a href="tel:${escapeHtml(item.guide.phone)}"><i class="fa-solid fa-phone"></i> ${escapeHtml(item.guide.phone)}</a>` : ""}
            ${item.guide?.email ? `<a href="mailto:${escapeHtml(item.guide.email)}"><i class="fa-regular fa-envelope"></i> ${escapeHtml(item.guide.email)}</a>` : ""}
          </p>
        </div>
        <div class="absence-detail__tags">
          <span class="absence-tag ${u.className}">${u.text}</span>
          <span class="absence-tag ${s.className}">${s.text}</span>
        </div>
      </header>

      <section class="absence-detail__tour">
        <div class="absence-detail__field">
          <span>Tour</span>
          <strong>${escapeHtml(item.tour?.title || "—")}</strong>
        </div>
        <div class="absence-detail__field">
          <span>Địa điểm</span>
          <strong>${escapeHtml(item.tour?.location || "—")}</strong>
        </div>
        <div class="absence-detail__field">
          <span>Khởi hành – Kết thúc</span>
          <strong>${formatDate(item.tour?.startDate)} – ${formatDate(item.tour?.endDate)}</strong>
        </div>
        <div class="absence-detail__field">
          <span>Thời điểm gửi yêu cầu</span>
          <strong>${formatDateTime(item.requestedAt)}</strong>
        </div>
      </section>

      <section class="absence-detail__reason">
        <h4>Lý do</h4>
        <p>${escapeHtml(item.reason)}</p>
        ${item.evidenceUrl ? `<p><a class="absence-detail__evidence" href="${escapeHtml(item.evidenceUrl)}" target="_blank" rel="noopener">📎 Tệp đính kèm</a></p>` : ""}
      </section>

      ${item.status === "pending"
        ? `
        <section class="absence-detail__action">
          <h4>Phân công HDV thay thế</h4>
          <div class="absence-detail__field">
            <label for="absenceReplacementSelect">HDV thay thế</label>
            <select id="absenceReplacementSelect">
              <option value="">Đang tải HDV phù hợp...</option>
            </select>
            <p class="absence-detail__hint">
              Hệ thống ưu tiên HDV đã đăng ký đủ ngày rảnh và không trùng lịch.
            </p>
          </div>
          <div class="absence-detail__field">
            <label for="absenceProviderNote">Ghi chú (tuỳ chọn)</label>
            <textarea id="absenceProviderNote" rows="3" placeholder="Ghi chú nội bộ hoặc dành cho HDV..."></textarea>
          </div>
          <p class="absence-detail__error" id="absenceActionError" hidden></p>
          <div class="absence-detail__buttons">
            <button type="button" class="absence-btn absence-btn--danger" data-action="cancel-tour">
              Không có HDV thay — Huỷ tour
            </button>
            <button type="button" class="absence-btn absence-btn--approve" data-action="approve">
              Duyệt & Phân công
            </button>
          </div>
          <p class="absence-detail__hint">
            Nếu không tìm được HDV thay thế, chọn <strong>Không có HDV thay — Huỷ tour</strong>: tour chuyển <em>ngưng hoạt động</em>, HDV báo bận bị phạt <strong>2%</strong> giá trị tour và nhận thông báo.
          </p>
        </section>
      `
        : `
        <section class="absence-detail__resolved">
          <h4>Kết quả xử lý</h4>
          ${item.replacementGuide ? `<p>HDV thay thế: <strong>${escapeHtml(item.replacementGuide.fullName)}</strong></p>` : ""}
          ${item.providerNote ? `<p>Ghi chú: ${escapeHtml(item.providerNote)}</p>` : ""}
          ${item.resolvedAt ? `<p>Xử lý lúc: ${formatDateTime(item.resolvedAt)}</p>` : ""}
        </section>
      `}
    `;

    if (item.status === "pending") {
      try {
        const candidates = await fetchCandidates(item.tour.id);
        const select = document.getElementById("absenceReplacementSelect");
        if (select) {
          select.innerHTML = renderCandidatesOptions(candidates, item.guideId);
        }
      } catch (err) {
        const select = document.getElementById("absenceReplacementSelect");
        if (select) {
          select.innerHTML = `<option value="">${escapeHtml(err.message)}</option>`;
        }
      }
    }
  }

  async function loadAndRender() {
    const host = document.getElementById("absenceList");
    if (host) host.innerHTML = '<p class="absence-empty">Đang tải...</p>';
    try {
      absenceItems = await fetchAbsences(currentFilter);
    } catch (err) {
      absenceItems = [];
      if (host) host.innerHTML = `<p class="absence-empty">${escapeHtml(err.message)}</p>`;
      return;
    }

    if (!absenceItems.some((it) => String(it.id) === String(selectedRequestId))) {
      selectedRequestId = absenceItems[0]?.id ?? null;
    }

    renderList();

    const selected = absenceItems.find(
      (it) => String(it.id) === String(selectedRequestId),
    );
    if (selected) {
      await renderDetail(selected);
    } else {
      renderDetailEmpty();
    }

    if (typeof refreshProviderAbsenceBadge === "function") {
      refreshProviderAbsenceBadge();
    }
  }

  function bindEvents() {
    document.querySelectorAll(".absence-filter__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".absence-filter__btn")
          .forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        currentFilter = btn.dataset.filter || "pending";
        selectedRequestId = null;
        candidatesCache.clear();
        void loadAndRender();
      });
    });

    document.getElementById("refreshAbsenceBtn")?.addEventListener("click", () => {
      candidatesCache.clear();
      void loadAndRender();
    });

    document.addEventListener("click", async (event) => {
      const selectBtn = event.target.closest('[data-action="select"]');
      if (selectBtn) {
        selectedRequestId = selectBtn.getAttribute("data-id");
        renderList();
        const selected = absenceItems.find(
          (it) => String(it.id) === String(selectedRequestId),
        );
        if (selected) await renderDetail(selected);
        return;
      }

      const approveBtn = event.target.closest('[data-action="approve"]');
      if (approveBtn) {
        const select = document.getElementById("absenceReplacementSelect");
        const errBox = document.getElementById("absenceActionError");
        const note = document.getElementById("absenceProviderNote")?.value || "";
        if (!select?.value) {
          if (errBox) {
            errBox.textContent = "Vui lòng chọn HDV thay thế.";
            errBox.hidden = false;
          }
          return;
        }
        approveBtn.disabled = true;
        approveBtn.textContent = "Đang xử lý...";
        try {
          await approveRequest(selectedRequestId, Number(select.value), note);
          candidatesCache.clear();
          await loadAndRender();
          alert("Đã duyệt và phân công HDV thay thế.");
        } catch (err) {
          if (errBox) {
            errBox.textContent = err.message;
            errBox.hidden = false;
          }
        } finally {
          approveBtn.disabled = false;
          approveBtn.textContent = "Duyệt & Phân công";
        }
        return;
      }

      const cancelBtn = event.target.closest('[data-action="cancel-tour"]');
      if (cancelBtn) {
        openCancelCompensationModal();
        return;
      }
    });

    document.addEventListener("click", async (event) => {
      if (event.target.closest("[data-close-comp]")) {
        closeCancelCompensationModal();
        return;
      }

      const confirmBtn = event.target.closest("[data-role='comp-confirm']");
      if (!confirmBtn) return;
      if (!selectedRequestId) return;

      const modal = document.getElementById("absenceCancelCompModal");
      if (!modal) return;
      const percentInput = modal.querySelector("[data-role='comp-percent']");
      const noteInput = modal.querySelector("[data-role='comp-note']");
      const errBox = modal.querySelector("[data-role='comp-error']");
      errBox.hidden = true;
      errBox.textContent = "";

      const percent = Number(percentInput.value);
      if (Number.isNaN(percent) || percent < 0 || percent > 100) {
        errBox.textContent = "Phần trăm phải nằm trong khoảng 0 – 100";
        errBox.hidden = false;
        return;
      }

      confirmBtn.disabled = true;
      const originalText = confirmBtn.textContent;
      confirmBtn.textContent = "Đang xử lý...";
      try {
        await cancelTourForRequest(selectedRequestId, {
          note: noteInput.value || "",
          customerDiscountPercent: percent,
        });
        closeCancelCompensationModal();
        await loadAndRender();
        alert(
          percent > 0
            ? `Đã huỷ tour. Mỗi khách của tour này được tặng mã giảm ${percent}% cho lần đặt tour kế tiếp.`
            : "Đã huỷ tour.",
        );
      } catch (err) {
        errBox.textContent = err.message || "Không huỷ được tour";
        errBox.hidden = false;
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (typeof syncProviderHeaderFromStorage === "function") {
      syncProviderHeaderFromStorage();
    }
    bindEvents();
    void loadAndRender();
  });
})();

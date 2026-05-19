import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsPath = path.join(__dirname, "../assets/js/tours/chitiet.js");
let js = fs.readFileSync(jsPath, "utf8");

// Use div for HTML in injected JS strings
const TAG = "div";

const NEW_FUNCTIONS = `  function renderGuideProfileCard(guide, profileEl) {
    if (!profileEl) return;
    if (!guide?.id) {
      profileEl.hidden = true;
      profileEl.innerHTML = "";
      return;
    }
    profileEl.hidden = false;
    const avatarUrl = normalizeImageUrl(guide.avatarUrl);
    const initials = reviewerInitials(guide.name);
    const avatarBlock =
      guide.avatarUrl && String(guide.avatarUrl).trim()
        ? \`<img class="guide-reviews-public-profile__avatar" src="\${escapeHtml(avatarUrl)}" alt="" />\`
        : \`<${TAG} class="guide-reviews-public-profile__avatar guide-reviews-public-profile__avatar--placeholder">\${escapeHtml(initials)}</${TAG}>\`;
    profileEl.innerHTML = \`
      \${avatarBlock}
      <${TAG} class="guide-reviews-public-profile__body">
        <p class="guide-reviews-public-profile__label">Hướng dẫn viên</p>
        <p class="guide-reviews-public-profile__name">\${escapeHtml(guide.name)}</p>
      </${TAG}>
    \`;
  }

  function renderReviewsListEl(listEl, reviews, emptyText, cardOpts) {
    if (!listEl) return;
    if (!reviews.length) {
      listEl.innerHTML = \`<p class="meeting-point-empty">\${escapeHtml(emptyText)}</p>\`;
      return;
    }
    listEl.innerHTML = reviews.map((r) => renderReviewCardHtml(r, cardOpts)).join("");
  }

  function updateReviewsViewAllButton(scope) {
    const btnId = scope === "guide" ? "reviews-view-all-guide" : "reviews-view-all-tour";
    const btn = document.getElementById(btnId);
    const data = scope === "guide" ? reviewsCache.guide : reviewsCache.tour;
    if (!btn || !data) return;
    const total = Number(data.summary?.total || 0);
    btn.hidden = total <= REVIEW_PREVIEW_COUNT;
    if (!btn.hidden) {
      btn.textContent =
        scope === "guide"
          ? \`Xem tất cả \${total} đánh giá hướng dẫn viên\`
          : \`Xem tất cả \${total} đánh giá tour\`;
    }
  }

  function renderGuideTabPanel() {
    const data = reviewsCache.guide;
    const profileEl = document.getElementById("guide-reviews-public-profile");
    const summaryRoot = document.getElementById("guide-reviews-summary-root");
    const listEl = document.getElementById("guide-reviews-public-list");
    const guideTabBtn = document.getElementById("reviews-tab-guide-btn");

    if (!data?.guide?.id) {
      if (guideTabBtn) {
        guideTabBtn.disabled = true;
        guideTabBtn.title = "Tour chưa có hướng dẫn viên";
      }
      if (summaryRoot) summaryRoot.innerHTML = "";
      if (listEl) {
        listEl.innerHTML =
          '<p class="meeting-point-empty">Tour này chưa có hướng dẫn viên được phân công.</p>';
      }
      updateReviewsViewAllButton("guide");
      return;
    }

    if (guideTabBtn) {
      guideTabBtn.disabled = false;
      guideTabBtn.title = "";
    }

    renderGuideProfileCard(data.guide, profileEl);
    if (summaryRoot) summaryRoot.innerHTML = renderReviewSummaryBlock(data.summary);
    renderReviewsListEl(
      listEl,
      data.reviews || [],
      "Chưa có đánh giá hướng dẫn viên đã duyệt nào.",
      { emptyComment: "Khách đã chấm sao, không ghi thêm nhận xét." }
    );
    updateReviewsViewAllButton("guide");
  }

  function renderTourTabPanel() {
    const data = reviewsCache.tour;
    const summaryRoot = document.getElementById("reviews-summary-root");
    const listEl = document.getElementById("reviews-list");
    if (summaryRoot) summaryRoot.innerHTML = renderReviewSummaryBlock(data?.summary || {});
    renderReviewsListEl(
      listEl,
      data?.reviews || [],
      "Chưa có đánh giá tour đã duyệt nào."
    );
    updateReviewsViewAllButton("tour");
  }

  function setActiveReviewsTab(tab) {
    const next = tab === "guide" ? "guide" : "tour";
    activeReviewsTab = next;

    const tourBtn = document.getElementById("reviews-tab-tour-btn");
    const guideBtn = document.getElementById("reviews-tab-guide-btn");
    const tourPanel = document.getElementById("reviews-panel-tour");
    const guidePanel = document.getElementById("reviews-panel-guide");
    const tabsWrap = document.getElementById("reviews-tabs");

    if (tabsWrap && !tabsWrap.hidden) {
      [tourBtn, guideBtn].forEach((btn) => {
        if (!btn) return;
        const isActive = btn.dataset.reviewsTab === next;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
        btn.tabIndex = isActive ? 0 : -1;
      });
      if (tourPanel) tourPanel.hidden = next !== "tour";
      if (guidePanel) guidePanel.hidden = next !== "guide";
    }

    if (next === "guide") renderGuideTabPanel();
    else renderTourTabPanel();
  }

  function renderReviewsPagination(container, pagination, onPage) {
    if (!container) return;
    const page = Number(pagination?.page || 1);
    const totalPages = Number(pagination?.totalPages || 0);
    const total = Number(pagination?.total || 0);
    reviewsModalState.page = page;
    reviewsModalState.totalPages = totalPages;

    if (totalPages <= 1) {
      container.innerHTML =
        total > 0
          ? \`<p class="reviews-pagination__info">Hiển thị \${total} đánh giá</p>\`
          : "";
      return;
    }

    const prevDisabled = page <= 1;
    const nextDisabled = page >= totalPages;
    container.innerHTML = \`
      <p class="reviews-pagination__info">Trang \${page} / \${totalPages} · \${total} đánh giá</p>
      <${TAG} class="reviews-pagination__actions">
        <button type="button" class="ghost-button reviews-pagination__btn" data-page="\${page - 1}" \${prevDisabled ? "disabled" : ""}>Trước</button>
        <button type="button" class="ghost-button reviews-pagination__btn" data-page="\${page + 1}" \${nextDisabled ? "disabled" : ""}>Sau</button>
      </${TAG}>
    \`;

    container.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = Number(btn.getAttribute("data-page"));
        if (p >= 1 && p <= totalPages) onPage(p);
      });
    });
  }

  async function fetchReviewsModalPage(scope, page) {
    const tourId = reviewsTourId || getEffectiveTourId();
    if (!tourId) return null;
    const qs = new URLSearchParams({
      scope: scope === "guide" ? "guide" : "tour",
      page: String(page),
      pageSize: String(REVIEW_MODAL_PAGE_SIZE),
    });
    const res = await fetch(
      \`\${API_BASE}/api/provider/public/tours/\${encodeURIComponent(tourId)}/reviews/pages?\${qs}\`,
      { headers: getAuthHeaders(false) }
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.message || "Không tải được đánh giá");
    return payload.data || null;
  }

  async function loadReviewsModalPage(page) {
    const listEl = document.getElementById("reviews-modal-list");
    const summaryEl = document.getElementById("reviews-modal-summary");
    const paginationEl = document.getElementById("reviews-modal-pagination");
    if (!listEl) return;

    listEl.innerHTML = '<p class="meeting-point-empty">Đang tải...</p>';
    try {
      const data = await fetchReviewsModalPage(reviewsModalState.scope, page);
      const scope = reviewsModalState.scope;
      const summary =
        scope === "guide" ? reviewsCache.guide?.summary : reviewsCache.tour?.summary;
      if (summaryEl && summary) summaryEl.innerHTML = renderReviewSummaryBlock(summary);

      const emptyText =
        scope === "guide"
          ? "Chưa có đánh giá hướng dẫn viên."
          : "Chưa có đánh giá tour.";
      const cardOpts =
        scope === "guide"
          ? { emptyComment: "Khách đã chấm sao, không ghi thêm nhận xét." }
          : undefined;
      renderReviewsListEl(listEl, data?.reviews || [], emptyText, cardOpts);
      renderReviewsPagination(paginationEl, data?.pagination, (p) => loadReviewsModalPage(p));
    } catch (err) {
      listEl.innerHTML = \`<p class="meeting-point-empty">\${escapeHtml(err.message || "Lỗi")}</p>\`;
      if (paginationEl) paginationEl.innerHTML = "";
    }
  }

  function closeReviewsModal() {
    const modal = document.getElementById("reviews-modal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("reviews-modal-open");
  }

  function openReviewsModal(scope) {
    const modal = document.getElementById("reviews-modal");
    const titleEl = document.getElementById("reviews-modal-title");
    if (!modal) return;

    reviewsModalState.scope = scope === "guide" ? "guide" : "tour";
    reviewsModalState.page = 1;

    if (titleEl) {
      titleEl.textContent =
        reviewsModalState.scope === "guide"
          ? "Tất cả đánh giá hướng dẫn viên"
          : "Tất cả đánh giá tour";
    }

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("reviews-modal-open");
    loadReviewsModalPage(1);
  }

  function bindReviewsTabsOnce() {
    const tabsWrap = document.getElementById("reviews-tabs");
    if (!tabsWrap || tabsWrap.dataset.bound) return;
    tabsWrap.dataset.bound = "1";

    tabsWrap.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-reviews-tab]");
      if (!btn || btn.disabled) return;
      setActiveReviewsTab(btn.dataset.reviewsTab);
    });

    document.getElementById("reviews-view-all-tour")?.addEventListener("click", () => {
      openReviewsModal("tour");
    });
    document.getElementById("reviews-view-all-guide")?.addEventListener("click", () => {
      openReviewsModal("guide");
    });

    document.querySelectorAll("[data-reviews-modal-close]").forEach((el) => {
      el.addEventListener("click", closeReviewsModal);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const modal = document.getElementById("reviews-modal");
        if (modal && !modal.hidden) closeReviewsModal();
      }
    });
  }

  function applyReviewsTabsForReviewOnly() {
    const tabsWrap = document.getElementById("reviews-tabs");
    const tourPanel = document.getElementById("reviews-panel-tour");
    const guidePanel = document.getElementById("reviews-panel-guide");
    const type = getReviewOnlyType();

    if (!isReviewOnlyMode()) {
      if (tabsWrap) tabsWrap.hidden = false;
      setActiveReviewsTab(activeReviewsTab);
      return;
    }

    if (tabsWrap) tabsWrap.hidden = true;
    if (type === "guide") {
      if (tourPanel) tourPanel.hidden = true;
      if (guidePanel) guidePanel.hidden = false;
      renderGuideTabPanel();
    } else {
      if (guidePanel) guidePanel.hidden = true;
      if (tourPanel) tourPanel.hidden = false;
      renderTourTabPanel();
    }
  }

`;

const startMarker = "  function renderGuideReviewsPublic(guideReviews) {";
const endMarker = "  async function fetchTourDetail(id) {";

const startIdx = js.indexOf(startMarker);
const endIdx = js.indexOf(endMarker);
if (startIdx === -1 || endIdx === -1) {
  console.error("Could not find function markers");
  process.exit(1);
}

js = js.slice(0, startIdx) + NEW_FUNCTIONS + js.slice(endIdx);

const newLoadBlock = `      const data = payload.data || {};
      const viewer = data.viewer || { role: "guest" };
      const role = String(viewer.role || "guest");

      reviewsCache.tour = {
        summary: data.summary || { average: 0, total: 0, distribution: [] },
        reviews: data.reviews || [],
      };
      reviewsCache.guide = data.guideReviews || {
        guide: null,
        summary: { average: 0, total: 0, distribution: [] },
        reviews: [],
      };
      reviewsCache.viewer = viewer;

      setReviewsSectionVisible(true);
      if (hintEl) {
        hintEl.hidden = true;
        hintEl.textContent = "";
      }
      if (compose) compose.style.display = "none";
      if (delBtn) delBtn.style.display = "none";
      setReviewsMessage(msgEl, "", false);

      bindReviewsTabsOnce();
      applyReviewsTabsForReviewOnly();`;

const loadReplaceRe =
  /      const data = payload\.data \|\| \{\};\s*const summary = data\.summary[\s\S]*?renderGuideReviewsPublic\(guideReviews\);/;

if (!loadReplaceRe.test(js)) {
  console.error("Could not find loadAndRenderReviews block");
  process.exit(1);
}

js = js.replace(loadReplaceRe, newLoadBlock);

js = js.replace(
  /if \(!reviewOnlyMode \|\| reviewOnlyType === "tour"\) \{\s*await loadAndRenderReviews\(tourId\);\s*\}/,
  "await loadAndRenderReviews(tourId);"
);

if (!js.includes("REVIEW_PREVIEW_COUNT")) {
  console.error("Missing REVIEW_PREVIEW_COUNT");
  process.exit(1);
}

fs.writeFileSync(jsPath, js, "utf8");
console.log("Patched chitiet.js");

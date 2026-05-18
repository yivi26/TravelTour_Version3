const fallbackFeatures = [
  {
    icon: "🛡️",
    title: "Uy tín",
    description: "Đảm bảo chất lượng dịch vụ tốt nhất"
  },
  {
    icon: "🧭",
    title: "Đa dạng tour",
    description: "Hàng trăm điểm đến hấp dẫn"
  },
  {
    icon: "🏆",
    title: "Hướng dẫn viên chuyên nghiệp",
    description: "Đội ngũ HDV giàu kinh nghiệm"
  },
  {
    icon: "💵",
    title: "Giá tốt",
    description: "Cam kết giá cạnh tranh nhất"
  }
];

const fallbackPromotions = [
  {
    id: 1,
    title: "Ưu đãi đặt sớm",
    description: "Đặt tour sớm để nhận nhiều khuyến mãi hấp dẫn",
    discount: "10%",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    validUntil: "30/12/2026"
  },
  {
    id: 2,
    title: "Ưu đãi nhóm khách",
    description: "Áp dụng ưu đãi tốt hơn cho nhóm từ 4 khách trở lên",
    discount: "15%",
    image:
      "https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=1200&q=80",
    validUntil: "31/12/2026"
  }
];

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("vi-VN") + "đ";
}

function getDurationText(days) {
  const totalDays = Number(days || 1);
  if (totalDays <= 1) return "1 ngày";
  return `${totalDays} ngày ${Math.max(totalDays - 1, 0)} đêm`;
}

function getTourImage(tour) {
  const rawUrl = String(tour.thumbnail_url || "").trim();

  if (!rawUrl) {
    return "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80";
  }

  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }

  if (rawUrl.startsWith("/assets/") || rawUrl.startsWith("/uploads/")) {
    return rawUrl;
  }

  if (rawUrl.startsWith("assets/") || rawUrl.startsWith("uploads/")) {
    return "/" + rawUrl;
  }

  return `/uploads/${rawUrl}`;
}

function getAppliedPrice(tour) {
  const basePrice = Number(tour?.base_price || 0);
  const salePrice = Number(tour?.sale_price || 0);

  if (salePrice > 0 && salePrice < basePrice) {
    return salePrice;
  }

  return basePrice;
}

function getTaxPercent(tour) {
  const p = Number(tour?.tax_percent);
  return Number.isFinite(p) && p > 0 ? p : 0;
}

function getTaxAmount(tour) {
  const taxPercent = getTaxPercent(tour);
  if (taxPercent <= 0) return 0;

  const tax = Number(tour?.tax || 0);
  if (tax > 0) return tax;

  const appliedPrice = getAppliedPrice(tour);
  return Math.round(appliedPrice * (taxPercent / 100));
}

function getDisplayPrice(tour) {
  const finalPrice = Number(tour?.final_price || 0);
  if (finalPrice > 0) return finalPrice;

  const appliedPrice = getAppliedPrice(tour);
  const tax = getTaxAmount(tour);

  return appliedPrice + tax;
}

function goToTourList(query = "") {
  const baseUrl = "./pages/tours/dstour.html";
  window.location.href = query ? `${baseUrl}?${query}` : baseUrl;
}

function goToTourDetail(tourId) {
  window.location.href = `./pages/tours/chitiet.html?id=${tourId}`;
}

const FEATURED_TOURS_LIMIT = 10;

async function fetchAllTours() {
  const response = await fetch(
    "http://localhost:3000/api/provider/public/tours?limit=500"
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Không thể lấy danh sách tour");
  }

  const result = await response.json();
  return result.data || [];
}

async function fetchFeaturedTours() {
  const response = await fetch(
    `http://localhost:3000/api/provider/public/featured-tours?limit=${FEATURED_TOURS_LIMIT}`
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Không thể lấy tour nổi bật");
  }

  const result = await response.json();
  const tours = result.data || [];
  return tours.filter((tour) => Number(tour?.booking_count || 0) > 0);
}

async function fetchDiscountedTours(limit = 6) {
  const response = await fetch(
    `http://localhost:3000/api/provider/public/discounted-tours?limit=${encodeURIComponent(
      String(limit)
    )}`
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Không thể lấy tour ưu đãi");
  }

  const result = await response.json();
  return result.data || [];
}

function computeDiscountPercent(basePrice, salePrice) {
  const base = Number(basePrice) || 0;
  const sale = Number(salePrice) || 0;
  if (base <= 0 || sale <= 0 || sale >= base) return 0;
  return Math.round(((base - sale) / base) * 100);
}

function formatDateVi(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function formatTourPopularityMeta(tour) {
  const bookingCount = Number(tour?.booking_count || 0);
  const ratingCount = Number(tour?.rating_count || 0);
  const ratingAvg = tour?.rating_avg != null ? Number(tour.rating_avg) : null;

  const parts = [];
  if (ratingAvg != null && ratingCount > 0) {
    parts.push(`⭐ ${ratingAvg} (${ratingCount})`);
  }
  if (bookingCount > 0) {
    parts.push(`${bookingCount} lượt đặt`);
  }
  return parts.join(" · ");
}

function buildTourCardHtml(tour) {
  const appliedPrice = getAppliedPrice(tour);
  const tax = getTaxAmount(tour);
  const finalPrice = getDisplayPrice(tour);
  const vatDetailLine =
    getTaxPercent(tour) > 0 && tax > 0
      ? `<p class="muted tour-vat-note">
            Giá áp dụng ${formatCurrency(appliedPrice)} + VAT ${formatCurrency(tax)}
          </p>`
      : "";
  const popularity = formatTourPopularityMeta(tour);
  const duration = getDurationText(tour.duration_days);
  const ratingLine = [popularity, duration].filter(Boolean).join(" · ");

  return `
    <div class="tour-card">
      <img
        src="${getTourImage(tour)}"
        alt="${tour.title || "Tour du lịch"}"
        onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80';"
      >
      <div class="tour-content">
        <h3>${tour.title || "Chưa có tên tour"}</h3>
        <p class="muted">${tour.description || "Tour du lịch hấp dẫn từ TravelTour"}</p>
        <div class="tour-rating">
          <span>📍 ${tour.location || "Chưa cập nhật"}</span>
          <span class="reviews">${ratingLine}</span>
        </div>
        <div class="tour-bottom">
          <div>
            <p class="muted">Giá từ</p>
            <div class="price home-tour-price">${
              typeof TourPriceDisplay !== "undefined"
                ? TourPriceDisplay.renderPriceHtml(tour)
                : formatCurrency(finalPrice)
            }</div>
            ${vatDetailLine}
          </div>
          <button type="button" class="btn btn-primary btn-detail" data-tour-id="${tour.id}">
            Xem chi tiết
          </button>
        </div>
      </div>
    </div>
  `;
}

const CAROUSEL_AUTOPLAY_MS = 5000;
const tourCarouselState = new Map();

function getCarouselVisibleCount(carouselEl) {
  const styles = getComputedStyle(carouselEl);
  const configured = parseInt(styles.getPropertyValue("--tour-carousel-visible"), 10);
  const baseVisible = Number.isFinite(configured) && configured > 0 ? configured : 3;
  return window.matchMedia("(max-width: 992px)").matches ? 1 : baseVisible;
}

function sizeCarouselItems(carouselEl, itemSelector) {
  const viewport = carouselEl?.querySelector(".tour-carousel__viewport");
  const track = carouselEl?.querySelector(".tour-carousel__track");
  if (!viewport || !track) return;

  const gap =
    parseFloat(
      getComputedStyle(carouselEl).getPropertyValue("--tour-carousel-gap")
    ) || 24;
  const visible = getCarouselVisibleCount(carouselEl);
  const viewportWidth = viewport.clientWidth;
  const cardWidth =
    visible > 0
      ? (viewportWidth - gap * Math.max(visible - 1, 0)) / visible
      : viewportWidth;

  track.querySelectorAll(itemSelector).forEach((card) => {
    card.style.flex = `0 0 ${cardWidth}px`;
    card.style.width = `${cardWidth}px`;
  });
}

function equalizeCarouselHeights(carouselEl, itemSelector) {
  if (!carouselEl) return;

  const items = carouselEl.querySelectorAll(itemSelector);
  if (!items.length) return;

  items.forEach((card) => {
    card.style.height = "";
  });

  let maxHeight = 0;
  items.forEach((card) => {
    maxHeight = Math.max(maxHeight, card.getBoundingClientRect().height);
  });

  if (maxHeight <= 0) return;

  const heightPx = `${Math.ceil(maxHeight)}px`;
  items.forEach((card) => {
    card.style.height = heightPx;
  });
}

function layoutCarousel(carouselEl, itemSelector) {
  sizeCarouselItems(carouselEl, itemSelector);
  equalizeCarouselHeights(carouselEl, itemSelector);
}

function updateCarouselNav(carouselEl) {
  const state = tourCarouselState.get(carouselEl);
  if (!state) return;

  const { prevBtn, nextBtn, maxIndex, index, loop } = state;
  if (loop) {
    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) nextBtn.disabled = false;
    return;
  }

  if (prevBtn) prevBtn.disabled = index <= 0;
  if (nextBtn) nextBtn.disabled = index >= maxIndex;
}

function applyCarouselTransform(state) {
  state.track.style.transform = `translateX(-${state.index * state.step}px)`;
}

function setCarouselIndex(carouselEl, nextIndex, { animate = true } = {}) {
  const state = tourCarouselState.get(carouselEl);
  if (!state) return;

  if (!animate) {
    state.track.style.transition = "none";
  }

  let target = nextIndex;
  if (state.loop && state.maxIndex > 0) {
    if (target < 0) target = state.maxIndex;
    if (target > state.maxIndex) target = 0;
  } else {
    target = Math.max(0, Math.min(nextIndex, state.maxIndex));
  }

  state.index = target;
  applyCarouselTransform(state);
  updateCarouselNav(carouselEl);

  if (!animate) {
    state.track.offsetHeight;
    state.track.style.transition = "";
  }
}

function stopCarouselAutoplay(state) {
  if (state.autoplayTimer) {
    clearInterval(state.autoplayTimer);
    state.autoplayTimer = null;
  }
}

function startCarouselAutoplay(carouselEl, state) {
  stopCarouselAutoplay(state);
  if (!state.autoplay || state.maxIndex <= 0) return;

  state.autoplayTimer = setInterval(() => {
    if (document.hidden || state.isPaused) return;
    setCarouselIndex(carouselEl, state.index + 1);
  }, state.autoplayMs);
}

function resetCarouselAutoplay(carouselEl, state) {
  if (!state.autoplay) return;
  stopCarouselAutoplay(state);
  startCarouselAutoplay(carouselEl, state);
}

function destroyCarousel(carouselEl) {
  const state = tourCarouselState.get(carouselEl);
  if (!state) return;

  stopCarouselAutoplay(state);
  if (state.onResize) {
    window.removeEventListener("resize", state.onResize);
  }
  if (state.onVisibilityChange) {
    document.removeEventListener("visibilitychange", state.onVisibilityChange);
  }
  if (state.prevBtn && state.prevHandler) {
    state.prevBtn.removeEventListener("click", state.prevHandler);
  }
  if (state.nextBtn && state.nextHandler) {
    state.nextBtn.removeEventListener("click", state.nextHandler);
  }
  if (state.onMouseEnter) {
    carouselEl.removeEventListener("mouseenter", state.onMouseEnter);
  }
  if (state.onMouseLeave) {
    carouselEl.removeEventListener("mouseleave", state.onMouseLeave);
  }
  tourCarouselState.delete(carouselEl);
}

function initCarousel(carouselId, options = {}) {
  const {
    itemSelector = ".tour-card",
    autoplay = true,
    autoplayMs = CAROUSEL_AUTOPLAY_MS,
    loop = true
  } = options;

  const carouselEl = document.getElementById(carouselId);
  if (!carouselEl) return;

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const enableAutoplay = autoplay && !prefersReducedMotion;

  const track = carouselEl.querySelector(".tour-carousel__track");
  const prevBtn = carouselEl.querySelector(".tour-carousel__nav--prev");
  const nextBtn = carouselEl.querySelector(".tour-carousel__nav--next");
  if (!track || !prevBtn || !nextBtn) return;

  destroyCarousel(carouselEl);

  track.style.transform = "translateX(0)";
  track.style.transition = "";

  const items = track.querySelectorAll(itemSelector);
  const visible = getCarouselVisibleCount(carouselEl);
  const needsNav = items.length > visible;

  prevBtn.hidden = !needsNav;
  nextBtn.hidden = !needsNav;

  layoutCarousel(carouselEl, itemSelector);

  if (!needsNav) {
    return;
  }

  const gap =
    parseFloat(
      getComputedStyle(carouselEl).getPropertyValue("--tour-carousel-gap")
    ) || 24;
  const itemWidth = items[0]?.offsetWidth || 0;
  const step = itemWidth + gap;
  const maxIndex = Math.max(0, items.length - visible);

  const state = {
    track,
    prevBtn,
    nextBtn,
    itemSelector,
    step,
    maxIndex,
    index: 0,
    loop,
    autoplay: enableAutoplay && maxIndex > 0,
    autoplayMs,
    isPaused: false,
    autoplayTimer: null,
    prevHandler: () => {
      setCarouselIndex(carouselEl, state.index - 1);
      resetCarouselAutoplay(carouselEl, state);
    },
    nextHandler: () => {
      setCarouselIndex(carouselEl, state.index + 1);
      resetCarouselAutoplay(carouselEl, state);
    },
    onResize: () => {
      layoutCarousel(carouselEl, itemSelector);
      const refreshedItems = track.querySelectorAll(itemSelector);
      const refreshedVisible = getCarouselVisibleCount(carouselEl);
      const refreshedGap =
        parseFloat(
          getComputedStyle(carouselEl).getPropertyValue("--tour-carousel-gap")
        ) || 24;
      const refreshedWidth = refreshedItems[0]?.offsetWidth || 0;
      state.step = refreshedWidth + refreshedGap;
      state.maxIndex = Math.max(0, refreshedItems.length - refreshedVisible);
      if (state.index > state.maxIndex) {
        state.index = state.maxIndex;
      }
      applyCarouselTransform(state);
      updateCarouselNav(carouselEl);
    },
    onVisibilityChange: () => {
      if (!document.hidden && state.autoplay) {
        resetCarouselAutoplay(carouselEl, state);
      }
    },
    onMouseEnter: () => {
      state.isPaused = true;
      carouselEl.classList.add("is-paused");
    },
    onMouseLeave: () => {
      state.isPaused = false;
      carouselEl.classList.remove("is-paused");
      resetCarouselAutoplay(carouselEl, state);
    }
  };

  tourCarouselState.set(carouselEl, state);
  prevBtn.addEventListener("click", state.prevHandler);
  nextBtn.addEventListener("click", state.nextHandler);
  window.addEventListener("resize", state.onResize);
  document.addEventListener("visibilitychange", state.onVisibilityChange);
  carouselEl.addEventListener("mouseenter", state.onMouseEnter);
  carouselEl.addEventListener("mouseleave", state.onMouseLeave);
  updateCarouselNav(carouselEl);
  startCarouselAutoplay(carouselEl, state);

  carouselEl.querySelectorAll(`${itemSelector} img`).forEach((img) => {
    if (img.complete) return;
    img.addEventListener(
      "load",
      () => layoutCarousel(carouselEl, itemSelector),
      { once: true }
    );
  });
}

function initTourCarousel(carouselId) {
  initCarousel(carouselId, { itemSelector: ".tour-card" });
}

function initPromoCarousel(carouselId) {
  initCarousel(carouselId, { itemSelector: ".promo-card" });
}

function renderOurTours(tours) {
  const container = document.getElementById("our-tours-list");
  if (!container) return;

  if (!Array.isArray(tours) || tours.length === 0) {
    container.innerHTML = `
      <div class="tour-card">
        <div class="tour-content">
          <h3>Chưa có tour</h3>
          <p class="muted">Hiện chưa có tour nào trên hệ thống.</p>
        </div>
      </div>
    `;
    initTourCarousel("our-tours-carousel");
    return;
  }

  container.innerHTML = tours.map((tour) => buildTourCardHtml(tour)).join("");
  initTourCarousel("our-tours-carousel");
}

function renderTours(tours) {
  const container = document.getElementById("featured-tours-list");
  if (!container) return;

  if (!Array.isArray(tours) || tours.length === 0) {
    container.innerHTML = `
      <div class="tour-card">
        <div class="tour-content">
          <h3>Chưa có tour</h3>
          <p class="muted">Chưa có tour nào có lượt đặt để hiển thị.</p>
        </div>
      </div>
    `;
    initTourCarousel("featured-tours-carousel");
    return;
  }

  container.innerHTML = tours
    .slice(0, FEATURED_TOURS_LIMIT)
    .map((tour) => buildTourCardHtml(tour))
    .join("");
  initTourCarousel("featured-tours-carousel");
}

function renderFeatures() {
  const container = document.getElementById("features-list");
  if (!container) return;

  container.innerHTML = fallbackFeatures
    .map(
      (feature) => `
      <div class="feature-card">
        <div class="feature-icon">${feature.icon}</div>
        <h3>${feature.title}</h3>
        <p>${feature.description}</p>
      </div>
    `
    )
    .join("");
}

function renderPromotions() {
  const container = document.getElementById("promotions-list");
  if (!container) return;

  container.innerHTML = fallbackPromotions
    .map(
      (promo) => `
      <div class="promo-card">
        <div class="promo-badge">-${promo.discount}</div>
        <img src="${promo.image}" alt="${promo.title}">
        <div class="promo-content">
          <h3>${promo.title}</h3>
          <p>${promo.description}</p>
          <p class="muted">Có hiệu lực đến: ${promo.validUntil}</p>
          <button
            type="button"
            class="btn btn-primary btn-book-now"
            data-promo-id="${promo.id}"
            style="margin-top:16px;"
          >
            Đặt tour ngay
          </button>
        </div>
      </div>
    `
    )
    .join("");
  initPromoCarousel("promotions-carousel");
}

function renderPromotionsFromTours(tours) {
  const container = document.getElementById("promotions-list");
  if (!container) return;

  if (!Array.isArray(tours) || tours.length === 0) {
    renderPromotions();
    return;
  }

  container.innerHTML = tours
    .map((tour) => {
      const discountPercent = computeDiscountPercent(tour.base_price, tour.sale_price);
      const validUntil = formatDateVi(tour.end_date);
      const description =
        (tour.description || "").trim() || "Tour du lịch ưu đãi hấp dẫn từ TravelTour";
      const image = getTourImage(tour);
      const finalPrice = getDisplayPrice(tour);

      return `
      <div class="promo-card" data-tour-id="${tour.id}">
        <div class="promo-badge">-${discountPercent || 0}%</div>
        <img
          src="${image}"
          alt="${tour.title || "Ưu đãi tour"}"
          onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80';"
        >
        <div class="promo-content">
          <h3>${tour.title || "Ưu đãi tour"}</h3>
          <p>${description}</p>
          <div style="margin-top:8px;">
            ${
              typeof TourPriceDisplay !== "undefined"
                ? TourPriceDisplay.renderPriceHtml(tour)
                : `<span style="font-weight:700;color:#10b981;">${formatCurrency(finalPrice)}</span>`
            }
          </div>
          ${
            validUntil
              ? `<p class="muted">Có hiệu lực đến: ${validUntil}</p>`
              : `<p class="muted">Số lượng ưu đãi có hạn</p>`
          }
          <button
            type="button"
            class="btn btn-primary btn-book-now"
            data-tour-id="${tour.id}"
            style="margin-top:16px;"
          >
            Xem chi tiết
          </button>
        </div>
      </div>
    `;
    })
    .join("");
  initPromoCarousel("promotions-carousel");
}

function bindNavbarBookingButton() {
  if (window.PublicNavbarAuth?.bindPublicNavbarBookingButton) {
    window.PublicNavbarAuth.bindPublicNavbarBookingButton();
    return;
  }

  const bookingButton = document.querySelector(".nav-actions .btn.btn-primary");
  if (!bookingButton) return;

  bookingButton.addEventListener("click", () => {
    goToTourList();
  });
}

function bindTourDetailButtons() {
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".btn-detail");
    if (!btn) return;

    const tourId = btn.dataset.tourId;
    if (!tourId) return;

    goToTourDetail(tourId);
  });
}

function bindPromotionButtons() {
  document.addEventListener("click", function (e) {
    const bookNowBtn = e.target.closest(".btn-book-now");
    if (bookNowBtn) {
      e.preventDefault();
      e.stopPropagation();

      const tourId = bookNowBtn.dataset.tourId;
      if (tourId) {
        goToTourDetail(tourId);
        return;
      }

      goToTourList();
      return;
    }

    const promoCard = e.target.closest(".promo-card");
    if (!promoCard) return;

    const tourId = promoCard.dataset.tourId;
    if (tourId) {
      goToTourDetail(tourId);
      return;
    }
  });

  const promoCards = document.querySelectorAll(".promo-card");
  promoCards.forEach((card) => {
    card.style.cursor = "pointer";
  });
}

function bindSearchForm() {
  const searchBox = document.querySelector(".search-box");
  const searchButton = document.querySelector(".btn-search");

  if (!searchBox || !searchButton) return;

  const destinationInput = searchBox.querySelector('input[type="text"]');
  const dateInput = searchBox.querySelector('input[type="date"]');
  const passengerSelect = searchBox.querySelector("select");

  searchButton.addEventListener("click", () => {
    const destination = destinationInput?.value.trim() || "";
    const departureDate = dateInput?.value || "";
    const passengers = passengerSelect?.value || "";

    const params = new URLSearchParams();

    if (destination) params.append("destination", destination);
    if (departureDate) params.append("date", departureDate);
    if (passengers) params.append("passengers", passengers);

    goToTourList(params.toString());
  });
}

function bindHeaderMenu() {
  const menuLinks = document.querySelectorAll(".nav-menu a");

  menuLinks.forEach((link) => {
    const href = (link.getAttribute("href") || "").trim();
    if (href && href !== "#") return;

    const text = link.textContent.trim().toLowerCase();

    link.addEventListener("click", (event) => {
      event.preventDefault();

      if (text.includes("trang chủ")) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (text.includes("giới thiệu")) {
        document.querySelector(".why-section")?.scrollIntoView({
          behavior: "smooth"
        });
      }
    });
  });
}

function bindUserIcon() {
  if (window.PublicNavbarAuth?.bindPublicNavbarAuth) return;
}

function getCurrentUser() {
  if (window.PublicNavbarAuth?.getCurrentUser) {
    return window.PublicNavbarAuth.getCurrentUser();
  }

  const accessToken = localStorage.getItem("accessToken");
  if (!accessToken) {
    localStorage.removeItem("traveltour_user");
    return null;
  }

  const savedUser = localStorage.getItem("traveltour_user");
  if (!savedUser) return null;

  try {
    const user = JSON.parse(savedUser);
    if (!user || typeof user !== "object") {
      localStorage.removeItem("traveltour_user");
      return null;
    }

    return user;
  } catch (error) {
    console.warn("Không đọc được thông tin người dùng:", error);
    localStorage.removeItem("traveltour_user");
    return null;
  }
}

function bindAuthButton() {
  const btnAuth = document.getElementById("btnAuth");
  if (!btnAuth) return;

  const currentUser = getCurrentUser();
  const isLoggedIn = !!currentUser;
  btnAuth.textContent = isLoggedIn ? "Đăng xuất" : "Đăng nhập";

  btnAuth.addEventListener("click", () => {
    if (!getCurrentUser()) {
      window.location.href = "/login";
      return;
    }

    localStorage.removeItem("accessToken");
    localStorage.removeItem("traveltour_user");
    localStorage.removeItem("traveltour_remember");
    btnAuth.textContent = "Đăng nhập";
    window.location.href = "/index.html";
  });
}

async function initHomePage() {
  try {
    const [allTours, featuredTours, discountedTours] = await Promise.all([
      fetchAllTours(),
      fetchFeaturedTours(),
      fetchDiscountedTours(6).catch(() => [])
    ]);

    renderOurTours(allTours);
    renderTours(featuredTours);
    renderFeatures();
    renderPromotionsFromTours(discountedTours);

    if (window.PublicNavbarAuth?.initPublicNavbar) {
      window.PublicNavbarAuth.initPublicNavbar();
    } else {
      bindNavbarBookingButton();
      bindUserIcon();
      bindAuthButton();
    }
    bindTourDetailButtons();
    bindPromotionButtons();
    bindSearchForm();
    bindHeaderMenu();
    bindChatbot();
  } catch (error) {
    console.error("Lỗi tải dữ liệu trang chủ:", error);

    renderOurTours([]);
    renderTours([]);
    renderFeatures();
    renderPromotions();

    if (window.PublicNavbarAuth?.initPublicNavbar) {
      window.PublicNavbarAuth.initPublicNavbar();
    } else {
      bindNavbarBookingButton();
      bindUserIcon();
      bindAuthButton();
    }
    bindTourDetailButtons();
    bindPromotionButtons();
    bindSearchForm();
    bindHeaderMenu();
    bindChatbot();
  }
}

document.addEventListener("DOMContentLoaded", initHomePage);

function addChatMessage(role, content) {
  const messages = document.getElementById("chatbotMessages");
  if (!messages) return;

  const messageEl = document.createElement("div");
  messageEl.className = `chatbot-message ${role}`;
  messageEl.textContent = content;
  messages.appendChild(messageEl);

  messages.scrollTop = messages.scrollHeight;
}

async function callChatbotApi(message) {
  const response = await fetch("http://localhost:3000/api/chatbot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: message,
      userId: "guest_user"
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Không gọi được chatbot API");
  }

  const result = await response.json();
  return result.reply || result.message || result.data || "Xin lỗi, tôi chưa có phản hồi.";
}

function bindChatbot() {
  const chatbotToggle = document.getElementById("chatbotToggle");
  const chatbotClose = document.getElementById("chatbotClose");
  const chatbotBox = document.getElementById("chatbotBox");
  const chatbotSend = document.getElementById("chatbotSend");
  const chatbotInput = document.getElementById("chatbotInput");
  const chatbotChips = document.querySelectorAll(".chatbot-chip");

  if (!chatbotToggle || !chatbotClose || !chatbotBox || !chatbotSend || !chatbotInput) {
    return;
  }

  chatbotToggle.addEventListener("click", () => {
    chatbotBox.classList.toggle("open");
  });

  chatbotClose.addEventListener("click", () => {
    chatbotBox.classList.remove("open");
  });

  async function handleSendMessage() {
    const userMessage = chatbotInput.value.trim();
    if (!userMessage) return;

    addChatMessage("user", userMessage);
    chatbotInput.value = "";

    addChatMessage("bot", "Đang trả lời...");

    try {
      const messages = document.getElementById("chatbotMessages");
      const loadingMessage = messages.lastElementChild;

      const botReply = await callChatbotApi(userMessage);

      if (loadingMessage) {
        loadingMessage.textContent = botReply;
      }
    } catch (error) {
      console.error("Chatbot error:", error);

      const messages = document.getElementById("chatbotMessages");
      const loadingMessage = messages.lastElementChild;

      if (loadingMessage) {
        loadingMessage.textContent = "Xin lỗi, hệ thống chatbot đang bận. Vui lòng thử lại sau.";
      }
    }
  }

  chatbotSend.addEventListener("click", handleSendMessage);

  chatbotInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      handleSendMessage();
    }
  });

  chatbotChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const text = chip.textContent.trim();
      if (!text) return;
      chatbotInput.value = text;
      handleSendMessage();
    });
  });
}
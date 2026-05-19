let profileData = null;
let isEditing = false;
let guideBankData = null;

function formatDateVN(dateString) {
  if (!dateString) return "Chưa cập nhật";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";
  return date.toLocaleDateString("vi-VN");
}

function toInputDate(dateString) {
  if (!dateString) return "";
  const text = String(dateString).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "HĐV";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatRating(value) {
  const num = Number(value || 0);
  return num > 0 ? num.toFixed(1) : "0.0";
}

function resolveAvatarUrl(url) {
  if (!url) return "";
  const text = String(url).trim();
  if (!text) return "";
  if (text.startsWith("http://") || text.startsWith("https://")) return text;
  if (text.startsWith("/")) return text;
  return `/${text.replace(/^\/+/, "")}`;
}

function parseTextLines(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToTextareaLines(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return items
    .map((item) => (typeof item === "string" ? item : item?.name || ""))
    .filter(Boolean)
    .join("\n");
}

function getGuideToken() {
  return localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchGuideBankInfo() {
  const response = await fetch("/api/guide/bank-info", {
    method: "GET",
    headers: guideAuthHeaders(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    assertGuideFetchOk(response, result, "Không thể tải thông tin ngân hàng");
  }
  return result.data || {};
}

async function saveGuideBankInfo(payload) {
  const response = await fetch("/api/guide/bank-info", {
    method: "PUT",
    headers: guideAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    assertGuideFetchOk(response, result, "Không thể cập nhật thông tin ngân hàng");
  }
  return result.data || {};
}

function renderGuideBankInfo(bank) {
  guideBankData = bank || {};
  const host = document.getElementById("guideBankInfo");
  const editBtn = document.getElementById("bankEditBtn");
  if (!host) return;

  const hasBank =
    guideBankData.bank_account_number && guideBankData.bank_account_name;

  if (editBtn) {
    editBtn.hidden = false;
    editBtn.textContent = hasBank ? "Cập nhật" : "Thêm STK";
  }

  if (!hasBank) {
    host.innerHTML = `
      <p class="bank-info-empty">
        Bạn chưa có tài khoản ngân hàng. Hãy cập nhật để nhà cung cấp có thể chuyển khoản hoa hồng.
      </p>`;
    return;
  }

  host.innerHTML = `
    <div class="bank-info-fields">
      <div class="info-item simple-box bank-info-field">
        <p class="info-label">Ngân hàng</p>
        <p class="info-value">${escapeHtml(guideBankData.bank_name || "—")}</p>
      </div>
      <div class="info-item simple-box bank-info-field">
        <p class="info-label">Số tài khoản</p>
        <p class="info-value">${escapeHtml(guideBankData.bank_account_number)}</p>
      </div>
      <div class="info-item simple-box bank-info-field">
        <p class="info-label">Chủ tài khoản</p>
        <p class="info-value">${escapeHtml(guideBankData.bank_account_name)}</p>
      </div>
      <div class="info-item simple-box bank-info-field">
        <p class="info-label">Chi nhánh</p>
        <p class="info-value">${escapeHtml(guideBankData.bank_branch || "—")}</p>
      </div>
    </div>`;
}

function openGuideBankModal() {
  const bank = guideBankData || {};
  const existing = document.getElementById("bankModal");
  if (existing) existing.remove();

  const html = `
    <div class="bank-modal" id="bankModal">
      <div class="bank-modal__backdrop" data-close-bank></div>
      <div class="bank-modal__dialog">
        <header>
          <h3>Cập nhật tài khoản ngân hàng</h3>
          <button type="button" data-close-bank aria-label="Đóng">×</button>
        </header>
        <form id="bankForm">
          <label>Ngân hàng
            <input name="bank_name" value="${escapeHtml(bank.bank_name || "")}" placeholder="Vietcombank" required />
          </label>
          <label>Số tài khoản
            <input name="bank_account_number" value="${escapeHtml(bank.bank_account_number || "")}" placeholder="0123456789" required />
          </label>
          <label>Chủ tài khoản (in hoa, không dấu)
            <input name="bank_account_name" value="${escapeHtml(bank.bank_account_name || "")}" placeholder="NGUYEN VAN A" required />
          </label>
          <label>Chi nhánh (tuỳ chọn)
            <input name="bank_branch" value="${escapeHtml(bank.bank_branch || "")}" placeholder="Chi nhánh Hà Nội" />
          </label>
          <div class="bank-modal__actions">
            <button type="button" class="btn btn--ghost" data-close-bank>Hủy</button>
            <button type="submit" class="btn btn--primary">Lưu</button>
          </div>
        </form>
      </div>
    </div>`;

  document.body.insertAdjacentHTML("beforeend", html);

  const modal = document.getElementById("bankModal");
  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-bank]")) modal.remove();
  });

  document.getElementById("bankForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const updated = await saveGuideBankInfo({
        bank_name: fd.get("bank_name"),
        bank_account_number: fd.get("bank_account_number"),
        bank_account_name: fd.get("bank_account_name"),
        bank_branch: fd.get("bank_branch"),
      });
      modal.remove();
      renderGuideBankInfo(updated);
      alert("Đã cập nhật thông tin ngân hàng");
    } catch (error) {
      alert(error.message || "Cập nhật thất bại");
    }
  });
}

function persistGuideUser(profile) {
  try {
    const raw = localStorage.getItem("traveltour_user");
    const user = raw ? JSON.parse(raw) : {};
    const fullName = profile?.fullName || profile?.full_name || "";
    if (fullName) {
      user.fullName = fullName;
      user.full_name = fullName;
    }
    if (profile?.phone) user.phone = profile.phone;
    if (profile?.avatarUrl) user.avatarUrl = profile.avatarUrl;
    localStorage.setItem("traveltour_user", JSON.stringify(user));
  } catch (error) {
    console.warn("persistGuideUser:", error);
  }
}

function setProfileSaveError(message) {
  const el = document.getElementById("profileSaveError");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

async function fetchGuideProfile() {
  const response = await fetch("/api/guide/profile", {
    method: "GET",
    headers: guideAuthHeaders(),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    assertGuideFetchOk(response, result, "Không thể tải hồ sơ hướng dẫn viên");
  }

  return result.data || null;
}

async function saveGuideProfile(payload) {
  const response = await fetch("/api/guide/profile", {
    method: "PUT",
    headers: guideAuthHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    assertGuideFetchOk(response, result, "Không thể cập nhật hồ sơ");
  }

  return result.data || null;
}

async function uploadGuideAvatar(file) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF");
  }

  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Ảnh không được vượt quá 2MB");
  }

  const formData = new FormData();
  formData.append("avatar", file);

  const token = getGuideToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch("/api/guide/profile/avatar", {
    method: "POST",
    headers,
    body: formData,
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    assertGuideFetchOk(response, result, "Không thể cập nhật ảnh đại diện");
  }

  return result.data || null;
}

function renderProfileAvatar(data) {
  const box = document.getElementById("profileAvatarBox");
  if (!box) return;

  const fullName = data.fullName || data.full_name || "Hướng dẫn viên";
  const avatarUrl = resolveAvatarUrl(data.avatarUrl);

  if (avatarUrl) {
    box.innerHTML = `<img src="${avatarUrl}" alt="${fullName}" class="profile-avatar-img" />`;
    return;
  }

  box.innerHTML = `<span id="profileAvatarText">${getInitials(fullName)}</span>`;
}

function renderHeader(data) {
  const fullName = data.fullName || data.full_name || "Chưa cập nhật";
  const role = data.role || "Hướng dẫn viên du lịch";
  const avatarUrl =
    resolveAvatarUrl(data.avatarUrl) ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=16a34a&color=fff`;

  const topbarUserName = document.getElementById("topbarUserName");
  const topbarUserRole = document.getElementById("topbarUserRole");
  const topbarUserAvatar = document.getElementById("topbarUserAvatar");
  const profileFullName = document.getElementById("profileFullName");
  const profileRole = document.getElementById("profileRole");
  const profileBadgeText = document.getElementById("profileBadgeText");
  const profileRatingText = document.getElementById("profileRatingText");

  if (topbarUserName) topbarUserName.textContent = fullName;
  if (topbarUserRole) topbarUserRole.textContent = role;

  if (topbarUserAvatar) {
    topbarUserAvatar.src = avatarUrl;
    topbarUserAvatar.alt = fullName;
  }

  renderProfileAvatar(data);

  if (profileFullName) profileFullName.textContent = fullName;
  if (profileRole) profileRole.textContent = role;

  if (profileBadgeText) {
    profileBadgeText.textContent =
      data.badgeText || "Hướng dẫn viên chuyên nghiệp";
  }

  if (profileRatingText) {
    profileRatingText.textContent = `⭐ ${formatRating(data.rating)}/5.0 (${
      data.reviewCount || 0
    } đánh giá)`;
  }
}

function fileNameFromUrl(url) {
  if (!url) return "";
  const parts = String(url).split("/");
  return parts[parts.length - 1] || "Tài liệu";
}

function renderGuideDocuments(data) {
  const container = document.getElementById("guideDocumentsInfo");
  if (!container) return;

  const contractUrl = resolveAvatarUrl(data.contractFileUrl);
  const cvUrl = resolveAvatarUrl(data.cvFileUrl);

  const contractHtml = contractUrl
    ? `<a class="guide-doc-link" href="${escapeHtml(contractUrl)}" target="_blank" rel="noopener noreferrer">📄 ${escapeHtml(fileNameFromUrl(contractUrl))}</a>`
    : `<p class="guide-doc-empty">Chưa có hợp đồng</p>`;

  const cvHtml = cvUrl
    ? `<a class="guide-doc-link" href="${escapeHtml(cvUrl)}" target="_blank" rel="noopener noreferrer">📎 ${escapeHtml(fileNameFromUrl(cvUrl))}</a>`
    : `<p class="guide-doc-empty">Chưa có CV</p>`;

  container.innerHTML = `
    <div class="guide-doc-row">
      <p class="info-label">Hợp đồng</p>
      ${contractHtml}
    </div>
    <div class="guide-doc-row">
      <p class="info-label">CV</p>
      ${cvHtml}
    </div>
  `;
}

function renderPersonalInfo(data) {
  const infoFullName = document.getElementById("infoFullName");
  const infoPhone = document.getElementById("infoPhone");
  const infoEmail = document.getElementById("infoEmail");
  const infoBirthDate = document.getElementById("infoBirthDate");
  const infoAddress = document.getElementById("infoAddress");

  if (infoFullName) infoFullName.textContent = data.fullName || "Chưa cập nhật";
  if (infoPhone) infoPhone.textContent = data.phone || "Chưa cập nhật";
  if (infoEmail) infoEmail.textContent = data.email || "Chưa cập nhật";
  if (infoBirthDate) infoBirthDate.textContent = formatDateVN(data.birthDate);
  if (infoAddress) infoAddress.textContent = data.address || "Chưa cập nhật";
}

function renderProfessionalInfo(data) {
  const infoExperience = document.getElementById("infoExperience");
  const specialtyTagList = document.getElementById("specialtyTagList");

  if (infoExperience) {
    infoExperience.textContent = `${data.experienceYears || 0} năm kinh nghiệm hướng dẫn viên du lịch`;
  }

  if (specialtyTagList) {
    const specialties = Array.isArray(data.specialties) ? data.specialties : [];
    const colorClasses = ["green-tag", "blue-tag", "purple-tag", "yellow-tag"];

    specialtyTagList.innerHTML = specialties.length
      ? specialties
          .map((item, index) => {
            const text = typeof item === "string" ? item : item.name || "Chuyên môn";
            const className = colorClasses[index % colorClasses.length];
            return `<span class="tag ${className}">${text}</span>`;
          })
          .join("")
      : `<span class="tag green-tag">Chưa cập nhật</span>`;
  }

  renderGuideDocuments(data);
}

function renderProfileStats(data) {
  const container = document.getElementById("profileStatsGrid");
  if (!container) return;

  const stats = [
    {
      value: String(data?.stats?.totalTours || 0),
      label: "Tour đã dẫn",
      className: "value-green",
    },
    {
      value: formatRating(data?.stats?.averageRating || 0),
      label: "Đánh giá trung bình",
      className: "value-blue",
    },
    {
      value: String(data?.stats?.experienceYears || 0),
      label: "Năm kinh nghiệm",
      className: "value-purple",
    },
    {
      value: `${data?.stats?.satisfactionRate || 0}%`,
      label: "Khách hài lòng",
      className: "value-yellow",
    },
  ];

  container.innerHTML = stats
    .map(
      (item) => `
        <div class="profile-stat-card">
          <p class="profile-stat-value ${item.className}">${item.value}</p>
          <p class="profile-stat-label">${item.label}</p>
        </div>
      `
    )
    .join("");
}

function populateInlineForm(data) {
  const editFullName = document.getElementById("editFullName");
  const editPhone = document.getElementById("editPhone");
  const editBirthDate = document.getElementById("editBirthDate");
  const editAddress = document.getElementById("editAddress");
  const editExperienceYears = document.getElementById("editExperienceYears");
  const editSpecialties = document.getElementById("editSpecialties");

  if (editFullName) editFullName.value = data.fullName || "";
  if (editPhone) editPhone.value = data.phone || "";
  if (editBirthDate) editBirthDate.value = toInputDate(data.birthDate);
  if (editAddress) editAddress.value = data.address || "";
  if (editExperienceYears) editExperienceYears.value = data.experienceYears || 0;
  if (editSpecialties) editSpecialties.value = listToTextareaLines(data.specialties);
}

function collectInlinePayload() {
  return {
    fullName: document.getElementById("editFullName")?.value.trim() || "",
    phone: document.getElementById("editPhone")?.value.trim() || "",
    address: document.getElementById("editAddress")?.value.trim() || "",
    birthDate: document.getElementById("editBirthDate")?.value || "",
    bio: profileData?.bio || "",
    experienceYears: Number(
      document.getElementById("editExperienceYears")?.value || 0
    ),
    specialties: parseTextLines(
      document.getElementById("editSpecialties")?.value || ""
    ),
  };
}

function setEditMode(editing) {
  isEditing = editing;

  const grid = document.getElementById("profileInfoGrid");
  const editBtn = document.getElementById("editBtn");
  const headerCard = document.querySelector(".profile-header-card");

  if (grid) grid.classList.toggle("profile-editing", editing);
  if (headerCard) headerCard.classList.toggle("profile-editing", editing);

  if (editBtn) {
    editBtn.disabled = false;
    editBtn.textContent = editing ? "✓ Cập nhật" : "✏️ Chỉnh sửa";
    editBtn.classList.toggle("is-update", editing);
  }

  if (editing) {
    populateInlineForm(profileData || {});
    setProfileSaveError("");
    document.getElementById("editFullName")?.focus();
  }
}

function renderProfile(data) {
  profileData = data;
  renderHeader(data);
  renderPersonalInfo(data);
  renderProfessionalInfo(data);
  renderProfileStats(data);
  persistGuideUser(data);
}

async function handleSaveProfile() {
  const payload = collectInlinePayload();

  if (payload.fullName.length < 2) {
    setProfileSaveError("Họ tên phải có ít nhất 2 ký tự.");
    return;
  }

  if (!/^(0\d{9})$/.test(payload.phone)) {
    setProfileSaveError("Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).");
    return;
  }

  if (payload.address && payload.address.length < 5) {
    setProfileSaveError("Địa chỉ phải có ít nhất 5 ký tự.");
    return;
  }

  const editBtn = document.getElementById("editBtn");

  try {
    if (editBtn) {
      editBtn.disabled = true;
      editBtn.textContent = "Đang lưu...";
    }

    const updated = await saveGuideProfile({
      fullName: payload.fullName,
      phone: payload.phone,
      address: payload.address || null,
      birthDate: payload.birthDate || null,
      bio: payload.bio || null,
      experienceYears: payload.experienceYears,
      certificates: Array.isArray(profileData?.certificates)
        ? profileData.certificates
        : [],
      specialties: payload.specialties,
      languages: Array.isArray(profileData?.languages) ? profileData.languages : [],
    });

    if (!updated) throw new Error("Không nhận được dữ liệu sau khi cập nhật");

    renderProfile(updated);
    setEditMode(false);
    setProfileSaveError("");
  } catch (error) {
    console.error("Lỗi lưu hồ sơ guide:", error);
    setProfileSaveError(error.message || "Không thể cập nhật hồ sơ.");
    if (editBtn) {
      editBtn.disabled = false;
      editBtn.textContent = "✓ Cập nhật";
    }
  }
}

function handleEditBtnClick() {
  if (!isEditing) {
    setEditMode(true);
    return;
  }
  handleSaveProfile();
}

async function handleAvatarSelected(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  const cameraBtn = document.getElementById("cameraBtn");
  try {
    if (cameraBtn) cameraBtn.disabled = true;

    const updated = await uploadGuideAvatar(file);
    if (!updated) throw new Error("Không nhận được dữ liệu sau khi upload");

    renderProfile(updated);
  } catch (error) {
    console.error("Lỗi upload avatar guide:", error);
    alert(error.message || "Không thể cập nhật ảnh đại diện.");
  } finally {
    if (cameraBtn) cameraBtn.disabled = false;
  }
}

function guideLogout() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("traveltour_user");
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/pages/dangnhap/login.html";
}

function bindEvents() {
  const editBtn = document.getElementById("editBtn");
  const cameraBtn = document.getElementById("cameraBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const avatarInput = document.getElementById("avatarFileInput");

  editBtn?.addEventListener("click", handleEditBtnClick);
  cameraBtn?.addEventListener("click", () => avatarInput?.click());
  avatarInput?.addEventListener("change", handleAvatarSelected);
  logoutBtn?.addEventListener("click", guideLogout);

  document.getElementById("bankEditBtn")?.addEventListener("click", openGuideBankModal);
}

async function initPage() {
  try {
    if (typeof syncGuideTopbarFromStorage === "function") {
      syncGuideTopbarFromStorage();
    }

    profileData = await fetchGuideProfile();
    if (!profileData) {
      throw new Error("Không có dữ liệu hồ sơ");
    }

    renderProfile(profileData);
    bindEvents();

    try {
      const bank = await fetchGuideBankInfo();
      renderGuideBankInfo(bank);
    } catch (bankErr) {
      console.warn("bank info:", bankErr);
      const host = document.getElementById("guideBankInfo");
      if (host) {
        host.innerHTML =
          '<p class="bank-info-empty">Không tải được thông tin ngân hàng.</p>';
      }
    }
  } catch (error) {
    console.error("Lỗi tải hồ sơ guide:", error);

    const profileStatsGrid = document.getElementById("profileStatsGrid");
    if (profileStatsGrid) {
      profileStatsGrid.innerHTML = `
        <div class="empty-state">Không tải được dữ liệu hồ sơ.</div>
      `;
    }
  }
}

document.addEventListener("DOMContentLoaded", initPage);

let profileData = null;
let isEditing = false;

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

function parseLanguageLines(value) {
  return parseTextLines(value).map((line) => {
    const parts = line.split("|").map((item) => item.trim());
    if (parts.length >= 2) {
      return { name: parts[0], level: parts[1] };
    }
    return { name: line, level: "Chưa cập nhật" };
  });
}

function listToTextareaLines(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return items
    .map((item) => (typeof item === "string" ? item : item?.name || ""))
    .filter(Boolean)
    .join("\n");
}

function languagesToTextareaLines(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return items
    .map((item) => {
      if (typeof item === "string") return item;
      const name = item?.name || "";
      const level = item?.level || "Chưa cập nhật";
      return name ? `${name} | ${level}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function getGuideToken() {
  return localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
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
  const certificateList = document.getElementById("certificateList");
  const specialtyTagList = document.getElementById("specialtyTagList");
  const languageList = document.getElementById("languageList");

  if (infoExperience) {
    infoExperience.textContent = `${data.experienceYears || 0} năm kinh nghiệm hướng dẫn viên du lịch`;
  }

  if (certificateList) {
    const certificates = Array.isArray(data.certificates) ? data.certificates : [];
    certificateList.innerHTML = certificates.length
      ? certificates
          .map(
            (item) => `
              <div class="certificate-item">
                <span class="dot green-dot"></span>
                <span>${typeof item === "string" ? item : item.name || "Chứng chỉ"}</span>
              </div>
            `
          )
          .join("")
      : `<div class="certificate-item"><span>Chưa cập nhật chứng chỉ</span></div>`;
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

  if (languageList) {
    const languages = Array.isArray(data.languages) ? data.languages : [];
    languageList.innerHTML = languages.length
      ? languages
          .map((item) => {
            const name = typeof item === "string" ? item : item.name || "Ngôn ngữ";
            const level =
              typeof item === "string" ? "Chưa cập nhật" : item.level || "Chưa cập nhật";
            const levelClass =
              level.toLowerCase().includes("bản ngữ") ||
              level.toLowerCase().includes("thành thạo")
                ? "green-text"
                : "yellow-text";

            return `
              <div class="language-row">
                <span>${name}</span>
                <span class="lang-level ${levelClass}">${level}</span>
              </div>
            `;
          })
          .join("")
      : `<div class="language-row"><span>Chưa cập nhật</span><span class="lang-level yellow-text">--</span></div>`;
  }
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
  const editCertificates = document.getElementById("editCertificates");
  const editSpecialties = document.getElementById("editSpecialties");
  const editLanguages = document.getElementById("editLanguages");

  if (editFullName) editFullName.value = data.fullName || "";
  if (editPhone) editPhone.value = data.phone || "";
  if (editBirthDate) editBirthDate.value = toInputDate(data.birthDate);
  if (editAddress) editAddress.value = data.address || "";
  if (editExperienceYears) editExperienceYears.value = data.experienceYears || 0;
  if (editCertificates) editCertificates.value = listToTextareaLines(data.certificates);
  if (editSpecialties) editSpecialties.value = listToTextareaLines(data.specialties);
  if (editLanguages) editLanguages.value = languagesToTextareaLines(data.languages);
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
    certificates: parseTextLines(
      document.getElementById("editCertificates")?.value || ""
    ),
    specialties: parseTextLines(
      document.getElementById("editSpecialties")?.value || ""
    ),
    languages: parseLanguageLines(
      document.getElementById("editLanguages")?.value || ""
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
      certificates: payload.certificates,
      specialties: payload.specialties,
      languages: payload.languages,
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

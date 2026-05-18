import fs from "fs";
import path from "path";
import db from "../config/db.js";
import { getResolvedUploadsDir } from "../utils/uploadsPath.js";
import { getUserProfileById } from "../models/userModel.js";
import {
  getGuideDashboardData,
  getGuideSchedules,
  getCurrentToursByGuide,
  getGuideCustomers,
  getGuideIncomeData,
  getGuideProfileData,
  updateGuideProfile,
  getGuideUserId,
  getGuideAvailabilityList,
  getGuideAssignedToursForCalendar,
  upsertGuideAvailability,
  deleteGuideAvailability,
} from "../models/guideModel.js";

function unlinkLocalAvatarIfExists(storedPath) {
  if (!storedPath || typeof storedPath !== "string") return;
  const trimmed = storedPath.trim();
  const m = trimmed.match(/^\/uploads\/avatars\/([^/]+)$/);
  if (!m) return;
  const safeName = path.basename(m[1]);
  if (!safeName || safeName !== m[1]) return;
  const root = path.resolve(getResolvedUploadsDir());
  const filePath = path.join(root, "avatars", safeName);
  const avatarsDir = path.join(root, "avatars");
  if (!filePath.startsWith(path.resolve(avatarsDir))) return;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function parseStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (value == null || value === "") return [];
  return String(value)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLanguagesPayload(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          const text = item.trim();
          if (!text) return null;
          const parts = text.split("|").map((s) => s.trim());
          if (parts.length >= 2) {
            return { name: parts[0], level: parts[1] };
          }
          return { name: text, level: "Chưa cập nhật" };
        }
        const name = String(item?.name || "").trim();
        const level = String(item?.level || "Chưa cập nhật").trim();
        if (!name) return null;
        return { name, level };
      })
      .filter(Boolean);
  }
  if (!value) return [];
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((s) => s.trim());
      if (parts.length >= 2) {
        return { name: parts[0], level: parts[1] };
      }
      return { name: line, level: "Chưa cập nhật" };
    });
}

/** DATE từ MySQL → chuỗi YYYY-MM-DD theo giờ local server (tránh lệch UTC khi JSON). */
function toLocalYmd(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function mapScheduleType(tour) {
  const now = new Date();
  const start = tour.start_date ? new Date(tour.start_date) : null;
  const end = tour.end_date ? new Date(tour.end_date) : null;

  if (tour.guide_completed_at) {
    return {
      type: "done",
      statusText: "Đã hoàn thành",
    };
  }

  if (tour.status === "archived") {
    return {
      type: "done",
      statusText: "Đã xong"
    };
  }

  if (
    start &&
    end &&
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    now >= start &&
    now <= end
  ) {
    return {
      type: "running",
      statusText: "Đang diễn ra"
    };
  }

  if (end && !Number.isNaN(end.getTime()) && now > end) {
    return {
      type: "done",
      statusText: "Đã xong"
    };
  }

  return {
    type: "upcoming",
    statusText: "Sắp diễn ra"
  };
}

function mapTourStatusText(status) {
  const map = {
    active: "Đang hoạt động",
    paused: "Tạm dừng",
    full: "Đã đủ khách",
    archived: "Đã xong",
    draft: "Nháp"
  };

  return map[status] || status || "Không xác định";
}

function mapIncomeStatusText(status) {
  const map = {
    active: "Đã phân công",
    full: "Đã đủ khách",
    archived: "Đã thanh toán"
  };

  return map[status] || "Đã ghi nhận";
}

export async function getGuideDashboardController(req, res) {
  try {
    const dashboard = await getGuideDashboardData(req.guideId);

    return res.status(200).json({
      message: "Lấy dashboard guide thành công",
      data: {
        stats: {
          activeTours: Number(dashboard?.stats?.activeTours || 0),
          totalCustomers: Number(dashboard?.stats?.totalCustomers || 0),
          monthlyIncome: Number(dashboard?.stats?.monthlyIncome || 0),
          monthlyIncomeText: `${(
            Number(dashboard?.stats?.monthlyIncome || 0) / 1000000
          ).toFixed(1)}M`,
          completedTours: Number(dashboard?.stats?.completedTours || 0)
        },
        upcomingTours: Array.isArray(dashboard?.upcomingTours)
          ? dashboard.upcomingTours
          : []
      }
    });
  } catch (err) {
    console.error("❌ GUIDE DASHBOARD ERROR:", err);
    return res.status(500).json({
      message: "Lỗi lấy dashboard guide",
      error: err.sqlMessage || err.message
    });
  }
}

export async function getGuideAvailabilityController(req, res) {
  try {
    const availability = await getGuideAvailabilityList(req.guideId);
    const tours = await getGuideAssignedToursForCalendar(req.guideId);

    const data = {
      availability: availability.map((row) => ({
        id: Number(row.id),
        date: toLocalYmd(row.avail_date),
        timeFrom: row.time_from,
        timeTo: row.time_to,
        tourType: row.tour_type,
        note: row.note || "",
      })),
      assignedTours: tours.map((tour) => ({
        id: Number(tour.id),
        tourName: tour.title || "Chưa có tên tour",
        startDate: toLocalYmd(tour.start_date),
        endDate: toLocalYmd(tour.end_date),
        location: tour.location || "Chưa cập nhật",
        customers: Number(tour.max_capacity || 0),
        status: tour.status,
      })),
    };

    return res.status(200).json({
      message: "Lấy lịch rảnh thành công",
      data,
    });
  } catch (err) {
    console.error("❌ GUIDE AVAILABILITY GET ERROR:", err);
    return res.status(500).json({
      message: "Lỗi lấy lịch rảnh",
      error: err.sqlMessage || err.message,
    });
  }
}

export async function saveGuideAvailabilityController(req, res) {
  try {
    const dates = Array.isArray(req.body?.dates) ? req.body.dates : [];
    if (!dates.length) {
      return res.status(400).json({
        message: "Vui lòng chọn ít nhất một ngày",
      });
    }

    const list = await upsertGuideAvailability(req.guideId, {
      dates,
      timeFrom: req.body?.timeFrom || req.body?.time_from,
      timeTo: req.body?.timeTo || req.body?.time_to,
      tourType: req.body?.tourType || req.body?.tour_type,
      note: req.body?.note,
    });

    return res.status(200).json({
      message: "Đăng ký ngày rảnh thành công",
      data: list.map((row) => ({
        id: Number(row.id),
        date: toLocalYmd(row.avail_date),
        timeFrom: row.time_from,
        timeTo: row.time_to,
        tourType: row.tour_type,
        note: row.note || "",
      })),
    });
  } catch (err) {
    console.error("❌ GUIDE AVAILABILITY SAVE ERROR:", err);
    return res.status(500).json({
      message: "Lỗi đăng ký ngày rảnh",
      error: err.sqlMessage || err.message,
    });
  }
}

export async function deleteGuideAvailabilityController(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Thiếu id lịch rảnh" });
    }

    const ok = await deleteGuideAvailability(req.guideId, id);
    if (!ok) {
      return res.status(404).json({ message: "Không tìm thấy lịch rảnh" });
    }

    return res.status(200).json({ message: "Đã xóa lịch rảnh" });
  } catch (err) {
    console.error("❌ GUIDE AVAILABILITY DELETE ERROR:", err);
    return res.status(500).json({
      message: "Lỗi xóa lịch rảnh",
      error: err.sqlMessage || err.message,
    });
  }
}

export async function getGuideSchedulesController(req, res) {
  try {
    const filter = String(req.query.filter || "all").trim();
    const allowedFilters = ["all", "upcoming", "running", "done"];

    if (!allowedFilters.includes(filter)) {
      return res.status(400).json({
        message: "Bộ lọc không hợp lệ"
      });
    }

    const schedules = await getGuideSchedules(req.guideId, filter);

    const data = schedules.map((tour) => {
      const mapped = mapScheduleType(tour);

      return {
        id: Number(tour.id),
        tourName: tour.title || "Chưa có tên tour",
        startDate: toLocalYmd(tour.start_date),
        endDate: toLocalYmd(tour.end_date),
        location: tour.location || "Chưa cập nhật",
        customers: Number(tour.max_capacity || 0),
        guideCompletedAt: tour.guide_completed_at || null,
        type: mapped.type,
        status: mapped.statusText
      };
    });

    return res.status(200).json({
      message: "Lấy lịch trình guide thành công",
      data
    });
  } catch (err) {
    console.error("❌ GUIDE SCHEDULE ERROR:", err);
    return res.status(500).json({
      message: "Lỗi lấy lịch trình guide",
      error: err.sqlMessage || err.message
    });
  }
}

export async function getCurrentToursController(req, res) {
  try {
    const keyword = String(req.query.keyword || "").trim();

    const tours = await getCurrentToursByGuide(req.guideId, keyword);

    const data = tours.map((tour) => ({
      id: Number(tour.id),
      name: tour.title || "Chưa có tên tour",
      customers: Number(tour.max_capacity || 0),
      startDate: tour.start_date || null,
      endDate: tour.end_date || null,
      duration: tour.duration_text || "Chưa cập nhật",
      location: tour.location || "Chưa cập nhật",
      status: tour.status || "active",
      statusText: mapTourStatusText(tour.status)
    }));

    return res.status(200).json({
      message: "Lấy danh sách tour đang dẫn thành công",
      data
    });
  } catch (err) {
    console.error("❌ GUIDE CURRENT TOURS ERROR:", err);
    return res.status(500).json({
      message: "Lỗi lấy danh sách tour đang dẫn",
      error: err.sqlMessage || err.message
    });
  }
}

export async function getGuideCustomersController(req, res) {
  try {
    const keyword = String(req.query.keyword || "").trim();
    const tourFilter = String(req.query.tour || "all").trim();
    const tourIdRaw = req.query.tourId;
    const tourIdParsed =
      tourIdRaw != null && String(tourIdRaw).trim() !== ""
        ? Number(tourIdRaw)
        : NaN;
    const tourIdFilter = Number.isNaN(tourIdParsed) ? null : tourIdParsed;

    const customers = await getGuideCustomers(
      req.guideId,
      keyword,
      tourFilter,
      tourIdFilter
    );

    const data = customers.map((customer) => {
      const phoneTrim =
        customer.phone == null ? "" : String(customer.phone).trim();
      return {
      id: Number(customer.id),
      tourId: Number(customer.tour_id),
      name: customer.customer_name || "Chưa có tên",
      phone: phoneTrim || null,
      email: customer.email || "Chưa cập nhật",
      tour: customer.tour_name || "Chưa có tour",
      tourDate: customer.tour_date || null
      };
    });

    return res.status(200).json({
      message: "Lấy danh sách khách hàng của guide thành công",
      data
    });
  } catch (err) {
    console.error("❌ GUIDE CUSTOMERS ERROR:", err);
    return res.status(500).json({
      message: "Lỗi lấy danh sách khách hàng",
      error: err.sqlMessage || err.message
    });
  }
}

export async function getGuideIncomeController(req, res) {
  try {
    const range = Number(req.query.range || 6);
    const safeRange = [3, 6, 12].includes(range) ? range : 6;

    const incomeData = await getGuideIncomeData(req.guideId, safeRange);

    return res.status(200).json({
      message: "Lấy dữ liệu thu nhập guide thành công",
      data: {
        stats: {
          totalIncome: Number(incomeData?.stats?.totalIncome || 0),
          monthlyIncome: Number(incomeData?.stats?.monthlyIncome || 0),
          averageIncomePerTour: Number(incomeData?.stats?.averageIncomePerTour || 0),
          completedTours: Number(incomeData?.stats?.completedTours || 0)
        },
        monthlyIncome: Array.isArray(incomeData?.monthlyIncome)
          ? incomeData.monthlyIncome
          : [],
        recentTransactions: Array.isArray(incomeData?.recentTransactions)
          ? incomeData.recentTransactions.map((item) => ({
              id: Number(item.id),
              tour: item.tour || "Chưa có tên tour",
              date: item.date || null,
              amount: Number(item.amount || 0),
              status: mapIncomeStatusText(item.status)
            }))
          : []
      }
    });
  } catch (err) {
    console.error("❌ GUIDE INCOME ERROR:", err);
    return res.status(500).json({
      message: "Lỗi lấy dữ liệu thu nhập",
      error: err.sqlMessage || err.message
    });
  }
}
export async function getGuideProfileController(req, res) {
  try {
    const profile = await getGuideProfileData(req.guideId);

    if (!profile) {
      return res.status(404).json({
        message: "Không tìm thấy hồ sơ hướng dẫn viên"
      });
    }

    return res.status(200).json({
      message: "Lấy hồ sơ guide thành công",
      data: profile
    });
  } catch (err) {
    console.error("❌ GUIDE PROFILE ERROR:", err);
    return res.status(500).json({
      message: "Lỗi lấy hồ sơ guide",
      error: err.sqlMessage || err.message
    });
  }
}

export async function updateGuideProfileController(req, res) {
  try {
    const fullName = String(req.body?.fullName || req.body?.full_name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const address = String(req.body?.address || "").trim();
    const birthDate = req.body?.birthDate || req.body?.birth_date || null;
    const bio = String(req.body?.bio || "").trim();
    const experienceYears = Number(req.body?.experienceYears ?? req.body?.experience_years ?? 0);

    if (!fullName || fullName.length < 2) {
      return res.status(400).json({
        message: "Họ tên phải có ít nhất 2 ký tự"
      });
    }

    if (!phone) {
      return res.status(400).json({
        message: "Vui lòng nhập số điện thoại"
      });
    }

    const phoneRegex = /^(0\d{9})$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        message: "Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0)"
      });
    }

    if (address && address.length < 5) {
      return res.status(400).json({
        message: "Địa chỉ phải có ít nhất 5 ký tự"
      });
    }

    let normalizedBirthDate = null;
    if (birthDate) {
      const parsed = new Date(birthDate);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({
          message: "Ngày sinh không hợp lệ"
        });
      }
      normalizedBirthDate = parsed.toISOString().slice(0, 10);
    }

    const profile = await updateGuideProfile(req.guideId, {
      fullName,
      phone,
      address: address || null,
      birthDate: normalizedBirthDate,
      bio: bio || null,
      experienceYears,
      certificates: parseStringList(req.body?.certificates),
      specialties: parseStringList(req.body?.specialties),
      languages: parseLanguagesPayload(req.body?.languages),
    });

    if (!profile) {
      return res.status(404).json({
        message: "Không tìm thấy hồ sơ hướng dẫn viên"
      });
    }

    return res.status(200).json({
      message: "Cập nhật hồ sơ thành công",
      data: profile
    });
  } catch (err) {
    console.error("❌ GUIDE UPDATE PROFILE ERROR:", err);
    return res.status(500).json({
      message: "Lỗi cập nhật hồ sơ",
      error: err.sqlMessage || err.message
    });
  }
}

export async function updateGuideAvatarController(req, res) {
  try {
    const userId = await getGuideUserId(req.guideId);

    if (!userId) {
      return res.status(404).json({
        message: "Không tìm thấy tài khoản hướng dẫn viên"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Vui lòng chọn ảnh đại diện"
      });
    }

    const existing = await getUserProfileById(userId);
    if (existing?.avatar_url) {
      unlinkLocalAvatarIfExists(existing.avatar_url);
    }

    const avatarPath = `/uploads/avatars/${req.file.filename}`;
    await db.execute("UPDATE users SET avatar_url = ? WHERE id = ?", [
      avatarPath,
      userId,
    ]);

    const profile = await getGuideProfileData(req.guideId);

    return res.status(200).json({
      message: "Cập nhật ảnh đại diện thành công",
      data: profile
    });
  } catch (err) {
    console.error("❌ GUIDE AVATAR ERROR:", err);
    return res.status(500).json({
      message: "Lỗi cập nhật ảnh đại diện",
      error: err.sqlMessage || err.message
    });
  }
}
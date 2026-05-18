import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import db from "../config/db.js";
import { getResolvedUploadsDir } from "../utils/uploadsPath.js";
import {
  getUserProfileById,
  updateUserProfileById,
  getUserPasswordById,
  updateUserPasswordById,
} from "../models/userModel.js";
import {
  createTourReview,
  deleteOwnTourReview,
  getCustomerTourReviewContext,
  submitGuideReview,
} from "../models/tourReviewsModel.js";
import { formatPublicAvatarUrl, toStoredAvatarPath } from "../utils/avatarUrl.js";

export const getCustomerProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await getUserProfileById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin khách hàng",
      });
    }

    const userData = {
      ...user,
      avatar_url: formatPublicAvatarUrl(user.avatar_url, req),
    };

    return res.status(200).json({
      success: true,
      data: userData,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCustomerProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const full_name = String(req.body?.full_name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const address = String(req.body?.address || "").trim();

    if (!full_name || !phone || !address) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ họ tên, số điện thoại và địa chỉ",
      });
    }

    if (address.length < 5) {
      return res.status(400).json({
        success: false,
        message: "Địa chỉ phải có ít nhất 5 ký tự",
      });
    }

    const phoneRegex = /^(0\d{9})$/;

    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Số điện thoại không hợp lệ",
      });
    }

    const currentUser = await getUserProfileById(userId);

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khách hàng",
      });
    }

    await updateUserProfileById(userId, {
      full_name,
      phone,
      address,
    });

    const updatedUser = await getUserProfileById(userId);

    return res.status(200).json({
      success: true,
      message: "Cập nhật thông tin thành công",
      data: {
        ...updatedUser,
        avatar_url: formatPublicAvatarUrl(updatedUser?.avatar_url, req),
      },
    });
  } catch (error) {
    next(error);
  }
};
function unlinkLocalAvatarIfExists(storedPath) {
  const relative = toStoredAvatarPath(storedPath);
  if (!relative) return;
  const m = relative.match(/^\/uploads\/avatars\/([^/]+)$/);
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

export const deleteCustomerAvatar = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await getUserProfileById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    unlinkLocalAvatarIfExists(user.avatar_url);

    await db.execute("UPDATE users SET avatar_url = NULL WHERE id = ?", [userId]);

    return res.status(200).json({
      success: true,
      message: "Đã gỡ ảnh đại diện",
      data: {
        avatar_url: "",
      },
    });
  } catch (error) {
    console.error("deleteCustomerAvatar error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi gỡ ảnh đại diện",
    });
  }
};

export const updateCustomerAvatar = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Không tìm thấy user",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn ảnh đại diện",
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

    return res.status(200).json({
      success: true,
      message: "Cập nhật ảnh đại diện thành công",
      data: {
        avatar_url: formatPublicAvatarUrl(avatarPath, req),
      },
    });
  } catch (error) {
    console.error("updateCustomerAvatar error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi cập nhật ảnh đại diện",
    });
  }
};
export const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ thông tin.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Xác nhận mật khẩu mới không khớp.",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu mới không được trùng mật khẩu hiện tại.",
      });
    }

    const hasMinLength = newPassword.length >= 8;
    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecialChar = /[^A-Za-z0-9]/.test(newPassword);

    if (
      !hasMinLength ||
      !hasUpperCase ||
      !hasLowerCase ||
      !hasNumber ||
      !hasSpecialChar
    ) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu mới chưa đúng yêu cầu bảo mật.",
      });
    }

    const user = await getUserPasswordById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng.",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu hiện tại không đúng.",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await updateUserPasswordById(userId, hashedPassword);

    return res.status(200).json({
      success: true,
      message: "Cập nhật mật khẩu thành công.",
    });
  } catch (error) {
    console.error("changePassword error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi đổi mật khẩu.",
    });
  }
};

export const getCustomerTourReviewContextController = async (req, res) => {
  try {
    const tourId = req.params.tourId;
    const bookingId = req.query.booking_id || null;
    const data = await getCustomerTourReviewContext(req.user.id, tourId, bookingId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({
      success: false,
      message: err.message || "Không tải được ngữ cảnh đánh giá",
    });
  }
};

export const postCustomerGuideReview = async (req, res) => {
  try {
    const tourId = req.params.tourId;
    const { booking_id: bookingId, guide_rating: guideRating, guide_comment: guideComment, guide_tags: guideTags } =
      req.body || {};
    const result = await submitGuideReview({
      userId: req.user.id,
      tourId,
      bookingId,
      guideRating,
      guideComment,
      guideTags,
    });
    return res.status(200).json({
      success: true,
      message: "Đã gửi đánh giá hướng dẫn viên. Cảm ơn bạn!",
      data: result,
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({
      success: false,
      message: err.message || "Không gửi được đánh giá HDV",
    });
  }
};

export const postCustomerTourReview = async (req, res) => {
  try {
    const tourId = req.params.tourId;
    const { rating, comment, booking_id: bookingId } = req.body || {};
    const created = await createTourReview({
      userId: req.user.id,
      tourId,
      rating,
      comment,
      bookingId,
    });
    const message =
      created.status === "approved"
        ? "Đánh giá đã được đăng và hiển thị công khai."
        : "Đã gửi đánh giá. Vui lòng chờ admin duyệt trước khi hiển thị công khai.";
    return res.status(201).json({
      success: true,
      message,
      data: created,
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({
      success: false,
      message: err.message || "Không gửi được đánh giá",
    });
  }
};

export const deleteCustomerTourReview = async (req, res) => {
  try {
    const reviewId = req.params.reviewId;
    const result = await deleteOwnTourReview(req.user.id, reviewId);
    return res.status(200).json({
      success: true,
      message: "Đã xóa đánh giá",
      data: result,
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({
      success: false,
      message: err.message || "Không xóa được đánh giá",
    });
  }
};

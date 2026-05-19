import {
  getCustomerNotifications,
  markCustomerNotificationsRead,
} from "../models/customerNotificationsModel.js";

export async function getCustomerNotificationsController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Phiên đăng nhập không hợp lệ." });
    }
    const limit = Number(req.query.limit) || 25;
    const unreadOnly = String(req.query.unread || "") === "1";
    const data = await getCustomerNotifications(userId, { limit, unreadOnly });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("getCustomerNotificationsController:", err);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi tải thông báo" });
  }
}

export async function markCustomerNotificationsReadController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Phiên đăng nhập không hợp lệ." });
    }
    const ids = req.body?.ids;
    const markAll = req.body?.all === true || ids == null;
    const result = await markCustomerNotificationsRead(
      userId,
      markAll ? null : ids,
    );
    const data = await getCustomerNotifications(userId, { limit: 25 });
    return res.status(200).json({
      success: true,
      message: "Đã cập nhật trạng thái đọc",
      data: {
        updated: result.updated,
        unreadCount: data.unreadCount,
        items: data.items,
      },
    });
  } catch (err) {
    console.error("markCustomerNotificationsReadController:", err);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi cập nhật thông báo" });
  }
}

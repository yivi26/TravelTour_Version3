import {
  getGuideNotifications,
  markGuideNotificationsRead,
} from "../models/guideNotificationsModel.js";

export async function getGuideNotificationsController(req, res) {
  try {
    const limit = Number(req.query.limit) || 20;
    const unreadOnly = String(req.query.unread || "") === "1";

    const data = await getGuideNotifications(req.guideId, {
      limit,
      unreadOnly,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("getGuideNotificationsController error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi tải thông báo",
    });
  }
}

export async function markGuideNotificationsReadController(req, res) {
  try {
    const ids = req.body?.ids;
    const markAll = req.body?.all === true || ids == null;

    const result = await markGuideNotificationsRead(
      req.guideId,
      markAll ? null : ids,
    );

    const data = await getGuideNotifications(req.guideId, { limit: 20 });

    return res.status(200).json({
      success: true,
      message: "Đã cập nhật trạng thái đọc",
      data: {
        updated: result.updated,
        unreadCount: data.unreadCount,
      },
    });
  } catch (error) {
    console.error("markGuideNotificationsReadController error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi cập nhật thông báo",
    });
  }
}

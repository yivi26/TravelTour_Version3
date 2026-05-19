import {
  getTourProgressForProvider,
  getTourProgressForGuide,
  saveTourProgressForGuide,
  completeTourForGuide,
} from "../models/tourProgressModel.js";

export async function getProviderTourProgressController(req, res) {
  try {
    const tourId = Number(req.params.tourId || req.params.id);
    if (!tourId) {
      return res.status(400).json({ message: "ID tour không hợp lệ" });
    }

    const data = await getTourProgressForProvider(req.providerId, tourId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("GET PROVIDER TOUR PROGRESS:", err);
    const status = err.message === "Không tìm thấy tour" ? 404 : 500;
    return res.status(status).json({
      message: err.message || "Không tải được tiến độ tour",
    });
  }
}

export async function getGuideTourProgressController(req, res) {
  try {
    const tourId = Number(req.params.tourId);
    if (!tourId) {
      return res.status(400).json({ message: "ID tour không hợp lệ" });
    }

    const data = await getTourProgressForGuide(req.guideId, tourId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("GET GUIDE TOUR PROGRESS:", err);
    const status =
      err.message === "Bạn chưa được phân công tour này" ? 403 : 500;
    return res.status(status).json({
      message: err.message || "Không tải được tiến độ tour",
    });
  }
}

export async function completeGuideTourController(req, res) {
  try {
    const tourId = Number(req.params.tourId);
    if (!tourId) {
      return res.status(400).json({ message: "ID tour không hợp lệ" });
    }

    const result = await completeTourForGuide(req.guideId, tourId);

    return res.status(200).json({
      success: true,
      message:
        "Đã hoàn thành tour. Nhà cung cấp đã được thông báo và trạng thái tour đã cập nhật.",
      data: result,
    });
  } catch (err) {
    console.error("COMPLETE GUIDE TOUR:", err);
    const msg = err.message || "Không hoàn thành được tour";
    let status = err.statusCode || 500;
    if (msg.includes("phân công")) status = 403;
    else if (
      msg.includes("hoạt động") ||
      msg.includes("đã được đánh dấu") ||
      msg.includes("khởi hành")
    ) {
      status = 400;
    }
    return res.status(status).json({
      message: msg,
      departureEligibility: err.departureEligibility || null,
    });
  }
}

export async function saveGuideTourProgressController(req, res) {
  try {
    const tourId = Number(req.params.tourId);
    if (!tourId) {
      return res.status(400).json({ message: "ID tour không hợp lệ" });
    }

    const ids = Array.isArray(req.body?.completedActivityIds)
      ? req.body.completedActivityIds
      : Array.isArray(req.body?.completed_activity_ids)
        ? req.body.completed_activity_ids
        : [];

    const data = await saveTourProgressForGuide(req.guideId, tourId, ids);
    return res.status(200).json({
      success: true,
      message: "Đã lưu tiến độ tour",
      data,
    });
  } catch (err) {
    console.error("SAVE GUIDE TOUR PROGRESS:", err);
    const status = err.statusCode || (err.message === "Bạn chưa được phân công tour này" ? 403 : 500);
    return res.status(status).json({
      message: err.message || "Không lưu được tiến độ tour",
      departureEligibility: err.departureEligibility || null,
    });
  }
}

import {
  createGuideAbsenceRequest,
  listGuideAbsenceRequestsForGuide,
  listGuideAbsenceRequestsForProvider,
  approveGuideAbsenceAndReassign,
  rejectGuideAbsence,
  cancelTourForAbsence,
  countPendingAbsenceForProvider,
  getGuideAbsenceYearlyStats,
} from "../models/guideAbsenceModel.js";
import { getGuidesForAssignment } from "../models/providerModel.js";

/** HDV: gửi yêu cầu báo bận (kèm ảnh upload tuỳ chọn). */
export async function createGuideAbsenceController(req, res) {
  try {
    const { tour_id, reason } = req.body || {};
    const evidenceUrl = req.file
      ? `/uploads/absence-evidence/${req.file.filename}`
      : null;

    const result = await createGuideAbsenceRequest({
      guideId: req.guideId,
      tourId: Number(tour_id),
      reason,
      evidenceUrl,
    });

    return res.status(201).json({
      success: true,
      message: "Đã gửi yêu cầu báo bận tới nhà cung cấp",
      data: result,
    });
  } catch (err) {
    console.error("createGuideAbsenceController:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Không gửi được yêu cầu báo bận",
    });
  }
}

/** HDV: thống kê báo bận trong năm (cảnh báo lịch trình). */
export async function getGuideAbsenceYearlyStatsController(req, res) {
  try {
    const data = await getGuideAbsenceYearlyStats(req.guideId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("getGuideAbsenceYearlyStatsController:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi tải thống kê báo bận",
    });
  }
}

/** HDV: xem các yêu cầu báo bận của mình. */
export async function listGuideOwnAbsenceController(req, res) {
  try {
    const items = await listGuideAbsenceRequestsForGuide(req.guideId);
    return res.status(200).json({ success: true, data: items });
  } catch (err) {
    console.error("listGuideOwnAbsenceController:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi tải danh sách yêu cầu báo bận",
    });
  }
}

/** Provider: danh sách yêu cầu báo bận của các HDV thuộc provider. */
export async function listProviderAbsenceController(req, res) {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const items = await listGuideAbsenceRequestsForProvider(req.providerId, {
      status,
    });
    return res.status(200).json({ success: true, data: items });
  } catch (err) {
    console.error("listProviderAbsenceController:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi tải danh sách yêu cầu báo bận",
    });
  }
}

/** Provider: số yêu cầu báo bận đang chờ (badge sidebar). */
export async function countPendingProviderAbsenceController(req, res) {
  try {
    const count = await countPendingAbsenceForProvider(req.providerId);
    return res.status(200).json({ success: true, count });
  } catch (err) {
    console.error("countPendingProviderAbsenceController:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi đếm yêu cầu báo bận",
    });
  }
}

/** Provider: lấy danh sách HDV có thể thay thế cho một tour. */
export async function getReplacementCandidatesController(req, res) {
  try {
    const tourId = Number(req.params.tourId);
    if (!tourId) {
      return res
        .status(400)
        .json({ success: false, message: "Tour ID không hợp lệ" });
    }
    const guides = await getGuidesForAssignment(req.providerId, tourId);
    return res.status(200).json({ success: true, data: guides });
  } catch (err) {
    console.error("getReplacementCandidatesController:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Lỗi lấy danh sách HDV thay thế",
    });
  }
}

/** Provider: duyệt yêu cầu + tự động chuyển tour sang HDV mới. */
export async function approveProviderAbsenceController(req, res) {
  try {
    const requestId = Number(req.params.id);
    const { replacement_guide_id, note } = req.body || {};
    const data = await approveGuideAbsenceAndReassign(
      req.providerId,
      requestId,
      {
        replacementGuideId: Number(replacement_guide_id),
        note,
        resolvedByUserId: req.user?.id,
      },
    );
    return res.status(200).json({
      success: true,
      message: "Đã duyệt và phân công HDV thay thế",
      data,
    });
  } catch (err) {
    console.error("approveProviderAbsenceController:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Duyệt yêu cầu thất bại",
    });
  }
}

/** Provider: huỷ tour do không có HDV thay. */
export async function cancelTourForAbsenceController(req, res) {
  try {
    const requestId = Number(req.params.id);
    const { note, customer_discount_percent } = req.body || {};
    const data = await cancelTourForAbsence(req.providerId, requestId, {
      note,
      resolvedByUserId: req.user?.id,
      customerDiscountPercent: Number(customer_discount_percent) || 0,
    });
    return res.status(200).json({
      success: true,
      message: "Đã huỷ tour và gửi thông báo tới khách hàng",
      data,
    });
  } catch (err) {
    console.error("cancelTourForAbsenceController:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Huỷ tour thất bại",
    });
  }
}

/** Provider: từ chối yêu cầu báo bận. */
export async function rejectProviderAbsenceController(req, res) {
  try {
    const requestId = Number(req.params.id);
    const { note } = req.body || {};
    const data = await rejectGuideAbsence(req.providerId, requestId, {
      note,
      resolvedByUserId: req.user?.id,
    });
    return res.status(200).json({
      success: true,
      message: "Đã từ chối yêu cầu",
      data,
    });
  } catch (err) {
    console.error("rejectProviderAbsenceController:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Từ chối yêu cầu thất bại",
    });
  }
}

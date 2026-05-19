import db from "../config/db.js";
import {
  getAdminCommissionOverview,
  getAdminCommissionBreakdown,
  getProviderCommissionSummary,
  getTourPayableGuideForProvider,
  providerMarkEarningPaid,
  guideConfirmEarning,
  getGuideEarningsSummary,
  listGuideEarningsForGuide,
  getGuideBankInfo,
  updateGuideBankInfo,
} from "../models/commissionModel.js";

// ===== Admin =====
export async function adminCommissionOverviewController(req, res) {
  try {
    const data = await getAdminCommissionOverview({
      from: req.query.from || null,
      to: req.query.to || null,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error("adminCommissionOverview:", err);
    res.status(500).json({ success: false, message: err.message || "Lỗi tải tổng hợp hoa hồng" });
  }
}

export async function adminCommissionBreakdownController(req, res) {
  try {
    const data = await getAdminCommissionBreakdown({
      from: req.query.from || null,
      to: req.query.to || null,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error("adminCommissionBreakdown:", err);
    res.status(500).json({ success: false, message: err.message || "Lỗi tải chi tiết hoa hồng" });
  }
}

// ===== Provider =====
export async function providerCommissionSummaryController(req, res) {
  try {
    const months = Number(req.query.months) || 6;
    const data = await getProviderCommissionSummary(req.providerId, months);
    res.json({ success: true, data });
  } catch (err) {
    console.error("providerCommissionSummary:", err);
    res.status(500).json({ success: false, message: err.message || "Lỗi tải tổng hợp doanh thu" });
  }
}

export async function providerTourPayableGuideController(req, res) {
  try {
    const tourId = Number(req.params.tourId);
    if (!tourId) {
      return res.status(400).json({ success: false, message: "tourId không hợp lệ" });
    }
    const data = await getTourPayableGuideForProvider(req.providerId, tourId);
    if (!data) {
      return res.status(404).json({ success: false, message: "Không tìm thấy tour" });
    }
    res.json({ success: true, data });
  } catch (err) {
    console.error("providerTourPayableGuide:", err);
    res.status(500).json({ success: false, message: err.message || "Lỗi tải thông tin thanh toán HDV" });
  }
}

export async function providerMarkEarningPaidController(req, res) {
  try {
    const earningId = Number(req.params.earningId);
    if (!earningId) {
      return res.status(400).json({ success: false, message: "earningId không hợp lệ" });
    }
    const paymentRef = req.body?.paymentRef || req.body?.payment_ref || null;
    const result = await providerMarkEarningPaid({
      providerId: req.providerId,
      earningId,
      paymentRef,
    });

    // Tạo notification cho HDV: provider đã thanh toán → xác nhận
    try {
      const [[info]] = await db.query(
        `
        SELECT ge.guide_id, ge.tour_id, ge.gross_amount, t.title AS tour_title
        FROM guide_earnings ge
        JOIN tours t ON t.id = ge.tour_id
        WHERE ge.id = ?
        `,
        [earningId],
      );
      if (info) {
        await db.query(
          `
          INSERT INTO guide_notifications (guide_id, tour_id, provider_id, type, title, body)
          VALUES (?, ?, ?, 'earning_paid', ?, ?)
          `,
          [
            info.guide_id,
            info.tour_id,
            req.providerId,
            "Provider đã thanh toán hoa hồng",
            `Hãy mở trang Thu nhập và xác nhận đã nhận khoản hoa hồng cho tour "${info.tour_title || ""}".`,
          ],
        );
      }
    } catch (err) {
      console.warn("notify guide earning_paid:", err.message);
    }

    res.json({
      success: true,
      message: "Đã đánh dấu thanh toán, chờ HDV xác nhận",
      data: result,
    });
  } catch (err) {
    console.error("providerMarkEarningPaid:", err);
    res.status(400).json({ success: false, message: err.message || "Đánh dấu thanh toán thất bại" });
  }
}

// ===== Guide =====
export async function guideEarningsSummaryController(req, res) {
  try {
    const data = await getGuideEarningsSummary(req.guideId, Number(req.query.range) || 6);
    res.json({ success: true, data });
  } catch (err) {
    console.error("guideEarningsSummary:", err);
    res.status(500).json({ success: false, message: err.message || "Lỗi tải thu nhập" });
  }
}

export async function listGuideEarningsController(req, res) {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const data = await listGuideEarningsForGuide(req.guideId, status);
    res.json({ success: true, data });
  } catch (err) {
    console.error("listGuideEarnings:", err);
    res.status(500).json({ success: false, message: err.message || "Lỗi tải danh sách thu nhập" });
  }
}

export async function guideConfirmEarningController(req, res) {
  try {
    const earningId = Number(req.params.earningId);
    if (!earningId) {
      return res.status(400).json({ success: false, message: "earningId không hợp lệ" });
    }
    const result = await guideConfirmEarning({
      guideId: req.guideId,
      earningId,
    });
    res.json({
      success: true,
      message: "Đã xác nhận nhận thanh toán",
      data: result,
    });
  } catch (err) {
    console.error("guideConfirmEarning:", err);
    res.status(400).json({ success: false, message: err.message || "Xác nhận thất bại" });
  }
}

export async function getGuideBankInfoController(req, res) {
  try {
    const data = await getGuideBankInfo(req.guideId);
    res.json({ success: true, data: data || {} });
  } catch (err) {
    console.error("getGuideBankInfo:", err);
    res.status(500).json({ success: false, message: err.message || "Lỗi tải thông tin ngân hàng" });
  }
}

export async function updateGuideBankInfoController(req, res) {
  try {
    const data = await updateGuideBankInfo(req.guideId, req.body || {});
    res.json({
      success: true,
      message: "Đã cập nhật thông tin ngân hàng",
      data,
    });
  } catch (err) {
    console.error("updateGuideBankInfo:", err);
    res.status(400).json({ success: false, message: err.message || "Cập nhật thất bại" });
  }
}

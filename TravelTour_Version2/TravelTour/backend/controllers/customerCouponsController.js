import {
  claimCustomerCoupon,
  listCustomerCoupons,
  getBestActiveCouponForTour,
} from "../models/customerCouponsModel.js";

export async function listCustomerCouponsController(req, res) {
  try {
    const data = await listCustomerCoupons(req.user.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("listCustomerCouponsController:", err);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi tải mã giảm giá" });
  }
}

export async function claimCustomerCouponController(req, res) {
  try {
    const couponId = Number(req.params.id);
    const result = await claimCustomerCoupon(req.user.id, couponId);
    return res.status(200).json({
      success: true,
      data: result,
      message: result.alreadyActive
        ? "Mã giảm giá đã được kích hoạt trước đó"
        : "Đã kích hoạt mã giảm giá. Mã sẽ tự động áp dụng khi đặt tour của nhà cung cấp này.",
    });
  } catch (err) {
    console.error("claimCustomerCouponController:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Kích hoạt mã giảm giá thất bại",
    });
  }
}

export async function getBestActiveCouponForTourController(req, res) {
  try {
    const tourId = Number(req.params.tourId);
    const data = await getBestActiveCouponForTour(req.user.id, tourId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("getBestActiveCouponForTourController:", err);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi tìm mã giảm giá phù hợp" });
  }
}

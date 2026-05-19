import { toNumber } from "../utils/modelHelpers.js";
import {
  getTourReviewSummaryAndList,
  getTourGuideReviewSummaryAndList,
  getPaginatedTourReviews,
  getPaginatedGuideReviews,
  findEligibleBookingForReview,
  getCustomerReviewBlockReason,
  shouldShowTourReviewsSection,
  getMyLatestReviewOnTour,
  countPendingReviewsOnTour,
} from "../models/tourReviewsModel.js";

function viewerReviewContext(user, tourId) {
  if (!user?.id) {
    return {
      role: "guest",
      canPost: false,
      postBlockedReason: "Đăng nhập tài khoản khách hàng để có thể gửi đánh giá.",
      myReview: null,
      hasEligibleBooking: false,
    };
  }

  const role = String(user.role || "").toLowerCase();
  if (role !== "customer") {
    return {
      role,
      canPost: false,
      postBlockedReason: "Chỉ khách hàng (customer) đã đặt tour mới được gửi đánh giá tại đây.",
      myReview: null,
      hasEligibleBooking: false,
    };
  }

  return {
    role: "customer",
    canPost: null,
    postBlockedReason: null,
    myReview: null,
    hasEligibleBooking: false,
  };
}

export async function getPublicTourReviewsController(req, res) {
  try {
    const tourId = req.params.tourId || req.params.id;
    const viewingUserId = req.user?.id ? toNumber(req.user.id, 0) : null;
    const previewLimit = 1;
    const [data, guideReviews] = await Promise.all([
      getTourReviewSummaryAndList(tourId, { limit: previewLimit, viewingUserId }),
      getTourGuideReviewSummaryAndList(tourId, { limit: previewLimit, viewingUserId }),
    ]);

    const base = viewerReviewContext(req.user, tourId);
    let viewer = { ...base, showSection: true };

    const contextBookingId = toNumber(req.query.booking_id, 0) || null;
    const role = String(req.user?.role || "").toLowerCase();

    if (role === "customer" && req.user?.id) {
      const showComposeSection = await shouldShowTourReviewsSection(
        req.user.id,
        tourId,
        contextBookingId
      );

      const hasEligible = !!(await findEligibleBookingForReview(req.user.id, tourId, {
        bookingId: contextBookingId,
      }));
      const myReview = await getMyLatestReviewOnTour(req.user.id, tourId);
      const pendingCount = await countPendingReviewsOnTour(req.user.id, tourId);
      const blockedByPending = pendingCount > 0;

      let canPost = showComposeSection && hasEligible && !blockedByPending;
      let postBlockedReason = null;
      if (!showComposeSection) {
        canPost = false;
        postBlockedReason = null;
      } else if (!hasEligible) {
        postBlockedReason = await getCustomerReviewBlockReason(
          req.user.id,
          tourId,
          contextBookingId
        );
      } else if (blockedByPending) {
        postBlockedReason = "Bạn đang có đánh giá chờ admin duyệt cho tour này.";
        canPost = false;
      }

      viewer = {
        role: "customer",
        showSection: true,
        showComposeSection,
        hasEligibleBooking: hasEligible,
        myReview,
        canPost,
        postBlockedReason,
      };
    }

    return res.status(200).json({
      success: true,
      data: { ...data, guideReviews, viewer },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({
      success: false,
      message: err.message || "Không tải được đánh giá",
    });
  }
}

/** Phân trang đánh giá (modal): ?scope=tour|guide&page=1&pageSize=10 */
export async function getPublicTourReviewsPageController(req, res) {
  try {
    const tourId = req.params.tourId || req.params.id;
    const scope = String(req.query.scope || "tour").toLowerCase() === "guide" ? "guide" : "tour";
    const page = toNumber(req.query.page, 1);
    const pageSize = toNumber(req.query.pageSize, 10);
    const viewingUserId = req.user?.id ? toNumber(req.user.id, 0) : null;

    const payload =
      scope === "guide"
        ? await getPaginatedGuideReviews(tourId, { page, pageSize, viewingUserId })
        : await getPaginatedTourReviews(tourId, { page, pageSize, viewingUserId });

    return res.status(200).json({ success: true, data: { scope, ...payload } });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({
      success: false,
      message: err.message || "Không tải được danh sách đánh giá",
    });
  }
}

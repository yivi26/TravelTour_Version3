import { toNumber } from "../utils/modelHelpers.js";
import {
  getTourReviewSummaryAndList,
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
    const data = await getTourReviewSummaryAndList(tourId);

    const base = viewerReviewContext(req.user, tourId);
    let viewer = { ...base, showSection: true };

    const contextBookingId = toNumber(req.query.booking_id, 0) || null;
    const role = String(req.user?.role || "").toLowerCase();

    if (role === "customer" && req.user?.id) {
      const showSection = await shouldShowTourReviewsSection(
        req.user.id,
        tourId,
        contextBookingId
      );
      viewer.showSection = showSection;
      if (!showSection) {
        return res.status(200).json({
          success: true,
          data: {
            tourId: toNumber(tourId),
            summary: { average: 0, total: 0, distribution: [] },
            reviews: [],
            viewer: {
              ...viewer,
              canPost: false,
              hasEligibleBooking: false,
              postBlockedReason: null,
            },
          },
        });
      }
    } else if (!req.user?.id) {
      viewer.showSection = false;
      return res.status(200).json({
        success: true,
        data: {
          tourId: toNumber(tourId),
          summary: { average: 0, total: 0, distribution: [] },
          reviews: [],
          viewer: { ...viewer, canPost: false, hasEligibleBooking: false },
        },
      });
    }

    if (req.user?.id && role === "customer") {
      const hasEligible = !!(await findEligibleBookingForReview(req.user.id, tourId, {
        bookingId: contextBookingId,
      }));
      const myReview = await getMyLatestReviewOnTour(req.user.id, tourId);
      const pendingCount = await countPendingReviewsOnTour(req.user.id, tourId);
      const blockedByPending = pendingCount > 0;

      let canPost = hasEligible && !blockedByPending;
      let postBlockedReason = null;
      if (!hasEligible) {
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
        showSection: viewer.showSection !== false,
        hasEligibleBooking: hasEligible,
        myReview,
        canPost,
        postBlockedReason,
      };
    }

    return res.status(200).json({
      success: true,
      data: { ...data, viewer },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({
      success: false,
      message: err.message || "Không tải được đánh giá",
    });
  }
}

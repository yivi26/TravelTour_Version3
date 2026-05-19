import express from "express";
import optionalAuthMiddleware from "../middleware/optionalAuthMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { getPublicTourReviewsController } from "../controllers/tourReviewsController.js";
import { resolveProviderScopeId } from "../models/providerModel.js";
import {
  getDashboardData,
  getTours,
  getTourDetailController,
  createNewTour,
  updateTourController,
  deleteTourController,
  updateTourStatusController,
  unlockTourManagementActionsController,
  lockTourManagementActionsController,
  getToursForGuideAssignmentController,
  getBookings,
  updateBooking,
  approveBookingCancelController,
  getAllGuides,
  assignGuideToTourController,
  unassignGuideFromTourController,
  getPublicFeaturedToursController,
  getPublicToursController,
  getPublicDiscountedToursController,
  getPublicTourDetailController,
  getProfile,
  updateProfile,
  getProviderReportOverviewController,
  getProviderNotificationsController,
  uploadTourImagesController,
} from "../controllers/providerController.js";
import { getProviderTourProgressController } from "../controllers/tourProgressController.js";
import uploadTourImages from "../middleware/uploadTourImages.js";
import {
  listProviderAbsenceController,
  countPendingProviderAbsenceController,
  getReplacementCandidatesController,
  approveProviderAbsenceController,
  rejectProviderAbsenceController,
  cancelTourForAbsenceController,
} from "../controllers/guideAbsenceController.js";
import {
  providerCommissionSummaryController,
  providerTourPayableGuideController,
  providerMarkEarningPaidController,
} from "../controllers/commissionController.js";

const router = express.Router();

router.get("/public/featured-tours", getPublicFeaturedToursController);
router.get("/public/tours", getPublicToursController);
router.get("/public/discounted-tours", getPublicDiscountedToursController);
router.get(
  "/public/tours/:tourId/reviews",
  optionalAuthMiddleware,
  getPublicTourReviewsController
);
router.get("/public/tours/:id", getPublicTourDetailController);

const protectedRouter = express.Router();
protectedRouter.use(authMiddleware);
protectedRouter.use(async (req, res, next) => {
  try {
    const role = String(req.user?.role || "")
      .trim()
      .toLowerCase();
    if (role !== "provider") {
      return res.status(403).json({ message: "Chỉ tài khoản nhà cung cấp được truy cập." });
    }

    const pid = await resolveProviderScopeId(req.user.id);
    if (!pid) {
      return res.status(403).json({
        message: "Không xác định được nhà cung cấp. Liên hệ quản trị viên.",
      });
    }
    req.providerId = pid;
    next();
  } catch (err) {
    next(err);
  }
});

protectedRouter.get("/profile", getProfile);
protectedRouter.put("/profile", updateProfile);
protectedRouter.get("/dashboard", getDashboardData);
protectedRouter.get("/notifications", getProviderNotificationsController);
protectedRouter.get("/report", getProviderReportOverviewController);
protectedRouter.get("/tours/guide-assignment", getToursForGuideAssignmentController);
protectedRouter.get("/tours", getTours);
protectedRouter.get("/tours/:id", getTourDetailController);
protectedRouter.get("/tours/:tourId/progress", getProviderTourProgressController);
protectedRouter.post(
  "/uploads/images",
  uploadTourImages.array("images", 15),
  uploadTourImagesController
);
protectedRouter.post("/tours", createNewTour);
protectedRouter.put("/tours/:id", updateTourController);
protectedRouter.patch("/tours/:id/status", updateTourStatusController);
protectedRouter.post("/tours/:id/unlock-actions", unlockTourManagementActionsController);
protectedRouter.post("/tours/:id/lock-actions", lockTourManagementActionsController);
protectedRouter.delete("/tours/:id", deleteTourController);
protectedRouter.get("/bookings", getBookings);
protectedRouter.put("/bookings/:id", updateBooking);
protectedRouter.post("/bookings/:id/approve-cancel", approveBookingCancelController);
protectedRouter.get("/guides", getAllGuides);
protectedRouter.post("/assign-guide-to-tour", assignGuideToTourController);
protectedRouter.post("/unassign-guide-from-tour", unassignGuideFromTourController);
protectedRouter.get(
  "/absence-requests/pending-count",
  countPendingProviderAbsenceController,
);
protectedRouter.get("/absence-requests", listProviderAbsenceController);
protectedRouter.get(
  "/tours/:tourId/replacement-candidates",
  getReplacementCandidatesController,
);
protectedRouter.post(
  "/absence-requests/:id/approve",
  approveProviderAbsenceController,
);
protectedRouter.post(
  "/absence-requests/:id/reject",
  rejectProviderAbsenceController,
);
protectedRouter.post(
  "/absence-requests/:id/cancel-tour",
  cancelTourForAbsenceController,
);

protectedRouter.get("/commissions/summary", providerCommissionSummaryController);
protectedRouter.get(
  "/tours/:tourId/payable-guide",
  providerTourPayableGuideController,
);
protectedRouter.post(
  "/guide-earnings/:earningId/mark-paid",
  providerMarkEarningPaidController,
);

router.use(protectedRouter);

export default router;

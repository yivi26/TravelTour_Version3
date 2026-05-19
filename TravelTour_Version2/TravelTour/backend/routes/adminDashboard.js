import express from "express";
import { getAdminDashboardController } from "../controllers/adminDashboardController.js";
import { getAdminNotificationsController } from "../controllers/adminNotificationsController.js";
import {
  getAdminUsersController,
  patchAdminUserActiveController,
} from "../controllers/adminUsersController.js";
import {
  getAdminGuideDocumentsController,
  getAdminProviderDocumentsController,
  patchAdminGuideDocumentsController,
  patchAdminProviderDocumentsController,
  postAdminPartnerUserController,
} from "../controllers/adminGuideDocumentsController.js";
import {
  uploadGuideDocumentsFields,
  uploadPartnerDocumentsFields,
  uploadProviderDocumentsFields,
} from "../middleware/uploadPartnerDocuments.js";
import {
  getAdminProvidersController,
  patchAdminProviderStatusController
} from "../controllers/adminProvidersController.js";
import {
  getAdminGuidesController,
  patchAdminGuideActiveController
} from "../controllers/adminGuidesController.js";
import {
  getAdminToursController,
  patchAdminTourStatusController,
  deleteAdminTourController
} from "../controllers/adminToursController.js";
import {
  getAdminBookingsController,
  getAdminBookingDetailController,
  patchAdminBookingStatusController
} from "../controllers/adminBookingsController.js";
import {
  getAdminReviewsController,
  getAdminReviewDetailController,
  patchAdminReviewStatusController,
  deleteAdminReviewController
} from "../controllers/adminReviewsController.js";
import { getAdminReportsOverviewController } from "../controllers/adminReportsController.js";
import {
  adminCommissionOverviewController,
  adminCommissionBreakdownController,
} from "../controllers/commissionController.js";

const router = express.Router();

function handleUpload(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          message: err.message || "Upload file thất bại",
        });
      }
      next();
    });
  };
}

router.get("/dashboard", getAdminDashboardController);
router.get("/notifications", getAdminNotificationsController);
router.get("/users", getAdminUsersController);
router.post(
  "/users/partner",
  handleUpload(uploadPartnerDocumentsFields),
  postAdminPartnerUserController,
);
router.patch("/users/:id/active", patchAdminUserActiveController);
router.get("/providers", getAdminProvidersController);
router.patch("/providers/:id/status", patchAdminProviderStatusController);
router.get("/providers/:id/documents", getAdminProviderDocumentsController);
router.patch(
  "/providers/:id/documents",
  handleUpload(uploadProviderDocumentsFields),
  patchAdminProviderDocumentsController,
);
router.get("/guides", getAdminGuidesController);
router.patch("/guides/:id/active", patchAdminGuideActiveController);
router.get("/guides/:id/documents", getAdminGuideDocumentsController);
router.patch(
  "/guides/:id/documents",
  handleUpload(uploadGuideDocumentsFields),
  patchAdminGuideDocumentsController,
);
router.get("/tours", getAdminToursController);
router.patch("/tours/:id/status", patchAdminTourStatusController);
router.delete("/tours/:id", deleteAdminTourController);
router.get("/bookings", getAdminBookingsController);
router.get("/bookings/:id", getAdminBookingDetailController);
router.patch("/bookings/:id/status", patchAdminBookingStatusController);
router.get("/reviews", getAdminReviewsController);
router.get("/reviews/:id", getAdminReviewDetailController);
router.patch("/reviews/:id/status", patchAdminReviewStatusController);
router.delete("/reviews/:id", deleteAdminReviewController);
router.get("/reports/overview", getAdminReportsOverviewController);
router.get("/commissions/overview", adminCommissionOverviewController);
router.get("/commissions/breakdown", adminCommissionBreakdownController);

export default router;


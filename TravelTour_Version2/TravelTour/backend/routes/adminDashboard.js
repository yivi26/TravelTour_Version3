import express from "express";
import { getAdminDashboardController } from "../controllers/adminDashboardController.js";
import { getAdminNotificationsController } from "../controllers/adminNotificationsController.js";
import {
  getAdminUsersController,
  patchAdminUserActiveController,
  postAdminPartnerUserController
} from "../controllers/adminUsersController.js";
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

const router = express.Router();

router.get("/dashboard", getAdminDashboardController);
router.get("/notifications", getAdminNotificationsController);
router.get("/users", getAdminUsersController);
router.post("/users/partner", postAdminPartnerUserController);
router.patch("/users/:id/active", patchAdminUserActiveController);
router.get("/providers", getAdminProvidersController);
router.patch("/providers/:id/status", patchAdminProviderStatusController);
router.get("/guides", getAdminGuidesController);
router.patch("/guides/:id/active", patchAdminGuideActiveController);
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

export default router;


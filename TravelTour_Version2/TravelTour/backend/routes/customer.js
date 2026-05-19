import express from "express";
import uploadAvatar from "../middleware/uploadAvatar.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireCustomerRole from "../middleware/requireCustomerRole.js";
import {
  getCustomerProfile,
  updateCustomerProfile,
  changePassword,
  updateCustomerAvatar,
  deleteCustomerAvatar,
  postCustomerTourReview,
  postCustomerGuideReview,
  deleteCustomerTourReview,
  getCustomerTourReviewContextController,
} from "../controllers/customerController.js";
import {
  getCustomerNotificationsController,
  markCustomerNotificationsReadController,
} from "../controllers/customerNotificationsController.js";

const router = express.Router();
router.use(authMiddleware);

router.get("/tours/:tourId/review-context", requireCustomerRole, getCustomerTourReviewContextController);
router.post("/tours/:tourId/reviews", requireCustomerRole, postCustomerTourReview);
router.post("/tours/:tourId/guide-reviews", requireCustomerRole, postCustomerGuideReview);
router.delete("/reviews/:reviewId", requireCustomerRole, deleteCustomerTourReview);

router.get("/profile", getCustomerProfile);
router.put("/profile", updateCustomerProfile);
router.put("/change-password", changePassword);

router.get("/notifications", getCustomerNotificationsController);
router.patch("/notifications/read", markCustomerNotificationsReadController);

router.post("/avatar", uploadAvatar.single("avatar"), updateCustomerAvatar);
router.delete("/avatar", deleteCustomerAvatar);

export default router;

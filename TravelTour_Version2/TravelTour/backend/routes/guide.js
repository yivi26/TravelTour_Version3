import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { normalizeTravelTourRole } from "../utils/roles.js";
import { getGuideIdByUserId, resolveGuideScopeId } from "../models/guideModel.js";
import uploadAvatar from "../middleware/uploadAvatar.js";
import {
  getGuideDashboardController,
  getGuideSchedulesController,
  getCurrentToursController,
  getGuideCustomersController,
  getGuideIncomeController,
  getGuideProfileController,
  updateGuideProfileController,
  updateGuideAvatarController,
  getGuideAvailabilityController,
  saveGuideAvailabilityController,
  deleteGuideAvailabilityController,
} from "../controllers/guideController.js";
import {
  getGuideTourProgressController,
  saveGuideTourProgressController,
  completeGuideTourController,
} from "../controllers/tourProgressController.js";

const router = express.Router();

router.use(authMiddleware);
router.use(async (req, res, next) => {
  try {
    const uid = Number(req.user?.id);
    if (!Number.isFinite(uid) || uid <= 0) {
      return res.status(401).json({
        success: false,
        message: "Phiên đăng nhập không hợp lệ.",
      });
    }

    // Có bản ghi guides → luôn coi là HDV (tránh lệch ENUM/role trong DB hoặc JWT cũ).
    const ownGuideId = await getGuideIdByUserId(uid);
    if (ownGuideId) {
      req.guideId = ownGuideId;
      return next();
    }

    const role = normalizeTravelTourRole(req.user?.role);
    if (role !== "guide") {
      return res.status(403).json({ message: "Chỉ tài khoản hướng dẫn viên được truy cập." });
    }

    const gid = await resolveGuideScopeId(uid);
    if (!gid) {
      return res.status(403).json({
        message: "Không xác định được hướng dẫn viên. Liên hệ quản trị viên.",
      });
    }
    req.guideId = gid;
    next();
  } catch (err) {
    next(err);
  }
});

router.get("/dashboard", getGuideDashboardController);
router.get("/availability", getGuideAvailabilityController);
router.post("/availability", saveGuideAvailabilityController);
router.delete("/availability/:id", deleteGuideAvailabilityController);
router.get("/schedules", getGuideSchedulesController);
router.get("/current-tours", getCurrentToursController);
router.get("/tours/:tourId/progress", getGuideTourProgressController);
router.put("/tours/:tourId/progress", saveGuideTourProgressController);
router.post("/tours/:tourId/complete", completeGuideTourController);
router.get("/customers", getGuideCustomersController);
router.get("/income", getGuideIncomeController);
router.get("/profile", getGuideProfileController);
router.put("/profile", updateGuideProfileController);
router.post("/profile/avatar", uploadAvatar.single("avatar"), updateGuideAvatarController);

export default router;

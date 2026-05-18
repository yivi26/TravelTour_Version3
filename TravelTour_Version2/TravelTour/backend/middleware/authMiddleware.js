import jwt from "jsonwebtoken";
import { getUserProfileById } from "../models/userModel.js";
import { ACCOUNT_LOCKED_MESSAGE, ACCOUNT_LOCKED_CODE } from "../constants/authMessages.js";
import { normalizeTravelTourRole } from "../utils/roles.js";

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET || "traveltour_dev_secret";
    const decoded = jwt.verify(token, secret);

    const rawId = decoded?.id;
    const userId =
      typeof rawId === "number" && Number.isFinite(rawId)
        ? rawId
        : Number(rawId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Token không hợp lệ",
      });
    }

    const row = await getUserProfileById(userId);
    if (!row) {
      return res.status(401).json({
        success: false,
        message: "Tài khoản không tồn tại",
      });
    }
    if (Number(row.is_active) !== 1) {
      return res.status(403).json({
        success: false,
        message: ACCOUNT_LOCKED_MESSAGE,
        code: ACCOUNT_LOCKED_CODE,
      });
    }

    // Role must reflect DB (JWT có thể cũ sau khi admin đổi vai trò).
    const role = normalizeTravelTourRole(row?.role ?? decoded?.role ?? "customer");
    req.user = {
      id: userId,
      role,
      email: row.email || decoded.email || "",
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Token không hợp lệ",
    });
  }
};

export default authMiddleware;

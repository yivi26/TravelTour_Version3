import { OAuth2Client } from "google-auth-library";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  findUserByEmail,
  createGoogleUser,
  updateGoogleUser,
  createLocalUser,
  updateLastLogin,
  getUserProfileById,
} from "../models/userModel.js";
import { ACCOUNT_LOCKED_MESSAGE, ACCOUNT_LOCKED_CODE } from "../constants/authMessages.js";
import { normalizeTravelTourRole } from "../utils/roles.js";
import { formatPublicAvatarUrl } from "../utils/avatarUrl.js";

dotenv.config();

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function userRowIsActive(row) {
  return Number(row?.is_active) === 1;
}

function generateAccessToken(user) {
  const secret = process.env.JWT_SECRET || "traveltour_dev_secret";
  const role = normalizeTravelTourRole(user.role);
  return jwt.sign(
    {
      id: user.id,
      role,
      email: user.email || "",
    },
    secret,
    { expiresIn: "7d" },
  );
}

export async function register(req, res) {
  const { fullName, email, password, phone } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({
      message: "Vui lòng nhập đầy đủ họ tên, email và mật khẩu"
    });
  }

  try {
    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      return res.status(409).json({
        message: "Email đã tồn tại"
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await createLocalUser(fullName, email, passwordHash, phone);

    return res.status(201).json({
      message: "Đăng ký thành công",
      user
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({
      message: "Đăng ký thất bại",
      error: error.message
    });
  }
}

export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Vui lòng nhập email và mật khẩu"
    });
  }

  try {
    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng"
      });
    }

    if (!user.password_hash) {
      return res.status(401).json({
        message: "Tài khoản này không hỗ trợ đăng nhập bằng mật khẩu"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng"
      });
    }

    if (!userRowIsActive(user)) {
      return res.status(403).json({
        message: ACCOUNT_LOCKED_MESSAGE,
        code: ACCOUNT_LOCKED_CODE
      });
    }

    await updateLastLogin(user.id);
    const freshUser = (await getUserProfileById(user.id)) || user;
    const accessToken = generateAccessToken(freshUser);
    const role = normalizeTravelTourRole(freshUser.role);

    return res.status(200).json({
      message: "Đăng nhập thành công",
      accessToken,
      token: accessToken,
      user: {
        id: freshUser.id,
        email: freshUser.email,
        full_name: freshUser.full_name,
        phone: freshUser.phone,
        avatar_url: formatPublicAvatarUrl(freshUser.avatar_url, req),
        role,
        is_active: freshUser.is_active,
        email_verified: freshUser.email_verified
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Đăng nhập thất bại",
      error: error.message
    });
  }
}

export function getGoogleClientId(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return res.status(503).json({
      message: "Chưa cấu hình GOOGLE_CLIENT_ID"
    });
  }

  return res.status(200).json({ clientId });
}

export async function googleLogin(req, res) {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      message: "Thiếu token Google"
    });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(400).json({
        message: "Không lấy được thông tin từ Google"
      });
    }

    const email = payload.email;
    const fullName = payload.name || "Google User";
    const avatarUrl = payload.picture || null;

    let user = await findUserByEmail(email);

    if (!user) {
      user = await createGoogleUser(fullName, email, avatarUrl);
    } else {
      user = await updateGoogleUser(user.id, fullName, avatarUrl);
    }

    if (!userRowIsActive(user)) {
      return res.status(403).json({
        message: ACCOUNT_LOCKED_MESSAGE,
        code: ACCOUNT_LOCKED_CODE
      });
    }

    await updateLastLogin(user.id);
    const freshUser = (await getUserProfileById(user.id)) || user;
    const accessToken = generateAccessToken(freshUser);
    const role = normalizeTravelTourRole(freshUser.role);

    return res.status(200).json({
      message: "Google login thành công",
      accessToken,
      token: accessToken,
      user: {
        id: freshUser.id,
        email: freshUser.email,
        full_name: freshUser.full_name,
        phone: freshUser.phone,
        avatar_url: formatPublicAvatarUrl(freshUser.avatar_url, req),
        role,
        is_active: freshUser.is_active,
        email_verified: user.email_verified,
      },
    });
  } catch (error) {
    console.error("Google login error:", error);

    // Token Google không hợp lệ / bị chặn do cấu hình OAuth → trả 401 thay vì 500
    const msg = String(error?.message || "");
    const isAuthError =
      msg.includes("Wrong number of segments") ||
      msg.includes("Invalid token") ||
      msg.includes("No pem found") ||
      msg.includes("audience") ||
      msg.includes("invalid_grant") ||
      msg.includes("Token used too late") ||
      msg.includes("issuer") ||
      msg.toLowerCase().includes("jwt");

    if (isAuthError) {
      return res.status(401).json({
        message:
          "Token Google không hợp lệ. Hãy kiểm tra cấu hình OAuth (Authorized JavaScript origins) và thử lại.",
        error: msg
      });
    }

    return res.status(500).json({
      message: "Đăng nhập Google thất bại",
      error: msg
    });
  }
}
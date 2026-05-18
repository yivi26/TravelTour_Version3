import path from "path";
import multer from "multer";
import { getResolvedUploadsDir } from "../utils/uploadsPath.js";

const uploadsDir = getResolvedUploadsDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
    const base = path
      .basename(file.originalname || "image", ext)
      .replace(/[^\w.\-()+\s]/g, "_")
      .slice(0, 120);
    cb(null, `${base || "tour"}-${Date.now()}${safeExt}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new Error("Chỉ chấp nhận file ảnh (jpg, png, webp, gif)"));
};

const uploadTourImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export default uploadTourImages;

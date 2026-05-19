import path from "path";
import multer from "multer";
import { getAbsenceEvidenceDir } from "../utils/uploadsPath.js";

const evidenceDir = getAbsenceEvidenceDir();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, evidenceDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"].includes(ext)
      ? ext
      : ".jpg";
    cb(
      null,
      `evidence-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`,
    );
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new Error("Chỉ chấp nhận file ảnh (jpg, png, webp, gif) hoặc PDF"));
};

const uploadAbsenceEvidence = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});

export default uploadAbsenceEvidence;

import path from "path";
import multer from "multer";
import { getGuideDocumentsDir } from "../utils/uploadsPath.js";

const documentsDir = getGuideDocumentsDir();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, documentsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const field = file.fieldname === "cv" ? "cv" : "contract";
    const safeExt =
      field === "cv"
        ? ".pdf"
        : [".doc", ".docx"].includes(ext)
          ? ext
          : ".docx";
    cb(
      null,
      `${field}-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`,
    );
  },
});

function contractFilter(req, file, cb) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const allowed = [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (
    allowed.includes(file.mimetype) ||
    ext === ".doc" ||
    ext === ".docx"
  ) {
    cb(null, true);
    return;
  }
  cb(new Error("Hợp đồng chỉ chấp nhận file Word (.doc, .docx)"));
}

function cvFilter(req, file, cb) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (file.mimetype === "application/pdf" || ext === ".pdf") {
    cb(null, true);
    return;
  }
  cb(new Error("CV chỉ chấp nhận file PDF (.pdf)"));
}

const uploadGuideDocuments = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "contract") return contractFilter(req, file, cb);
    if (file.fieldname === "cv") return cvFilter(req, file, cb);
    cb(new Error("Trường file không hợp lệ"));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadGuideContract = uploadGuideDocuments.single("contract");
export const uploadGuideCv = uploadGuideDocuments.single("cv");

export const uploadGuideDocumentsFields = uploadGuideDocuments.fields([
  { name: "contract", maxCount: 1 },
  { name: "cv", maxCount: 1 },
]);

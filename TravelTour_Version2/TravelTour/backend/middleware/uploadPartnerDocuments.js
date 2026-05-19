import path from "path";
import multer from "multer";
import {
  getGuideDocumentsDir,
  getProviderDocumentsDir,
} from "../utils/uploadsPath.js";

function isPdf(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  return file.mimetype === "application/pdf" || ext === ".pdf";
}

function isWord(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const allowed = [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  return allowed.includes(file.mimetype) || ext === ".doc" || ext === ".docx";
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const role = String(req.body?.role || "").toLowerCase();
    if (file.fieldname === "cv" || (file.fieldname === "contract" && role === "guide")) {
      cb(null, getGuideDocumentsDir());
      return;
    }
    cb(null, getProviderDocumentsDir());
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    let prefix = "file";
    if (file.fieldname === "contract") prefix = "contract";
    else if (file.fieldname === "cv") prefix = "cv";
    else if (file.fieldname === "certificate") prefix = "certificate";

    const role = String(req.body?.role || "").toLowerCase();
    let safeExt = ext || ".pdf";
    if (file.fieldname === "cv") safeExt = ".pdf";
    else if (file.fieldname === "certificate") safeExt = ".pdf";
    else if (file.fieldname === "contract" && role === "guide") {
      safeExt = [".doc", ".docx"].includes(ext) ? ext : ".docx";
    } else if (file.fieldname === "contract") {
      safeExt = ".pdf";
    }

    cb(null, `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const uploadPartnerDocuments = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const role = String(req.body?.role || "").toLowerCase();

    if (file.fieldname === "cv") {
      if (isPdf(file)) return cb(null, true);
      return cb(new Error("CV chỉ chấp nhận file PDF (.pdf)"));
    }

    if (file.fieldname === "certificate") {
      if (isPdf(file)) return cb(null, true);
      return cb(new Error("Giấy chứng nhận chỉ chấp nhận file PDF (.pdf)"));
    }

    if (file.fieldname === "contract") {
      if (role === "guide") {
        if (isWord(file)) return cb(null, true);
        return cb(new Error("Hợp đồng HDV chỉ chấp nhận file Word (.doc, .docx)"));
      }
      if (isPdf(file)) return cb(null, true);
      return cb(new Error("Hợp đồng NCC chỉ chấp nhận file PDF (.pdf)"));
    }

    cb(new Error("Trường file không hợp lệ"));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadPartnerDocumentsFields = uploadPartnerDocuments.fields([
  { name: "contract", maxCount: 1 },
  { name: "cv", maxCount: 1 },
  { name: "certificate", maxCount: 1 },
]);

/** Chỉ hợp đồng + giấy chứng nhận NCC (cập nhật). */
export const uploadProviderDocumentsFields = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, getProviderDocumentsDir()),
    filename: (req, file, cb) => {
      const prefix = file.fieldname === "certificate" ? "certificate" : "contract";
      cb(null, `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (isPdf(file)) return cb(null, true);
    cb(new Error("Chỉ chấp nhận file PDF (.pdf)"));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
}).fields([
  { name: "contract", maxCount: 1 },
  { name: "certificate", maxCount: 1 },
]);

/** Chỉ hợp đồng + CV HDV (cập nhật). */
export { uploadGuideDocumentsFields } from "./uploadGuideDocuments.js";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendDir = path.join(__dirname, "..");
const uploadsDirInBackend = path.join(backendDir, "uploads");
const uploadsDirOutsideBackend = path.join(backendDir, "..", "uploads");

/**
 * Cùng logic với express.static("/uploads"): ưu tiên thư mục `TravelTour/uploads`
 * nếu có, không thì dùng `backend/uploads`.
 */
export function getResolvedUploadsDir() {
  return fs.existsSync(uploadsDirOutsideBackend)
    ? uploadsDirOutsideBackend
    : uploadsDirInBackend;
}

/** Thư mục lưu avatar — luôn nằm dưới root đang được serve tĩnh. */
export function getAvatarsDir() {
  const root = getResolvedUploadsDir();
  const dir = path.join(root, "avatars");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Thư mục lưu ảnh xác minh báo bận của HDV. */
export function getAbsenceEvidenceDir() {
  const root = getResolvedUploadsDir();
  const dir = path.join(root, "absence-evidence");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Multer memory upload middleware for image endpoints.
import path from "path";
import multer from "multer";
import { ApiError } from "../utils/ApiError.js";

const storage = multer.memoryStorage();
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function fileFilter(req, file, cb) {
  const extension = path.extname(file.originalname || "").toLowerCase();
  if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(extension)) {
    return cb(new ApiError("Only JPG, PNG, WebP, and GIF image uploads are allowed.", 400));
  }
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
});

export const carouselUpload = multer({
  storage,
  fileFilter(req, file, cb) {
    const extension = path.extname(file.originalname || "").toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype) || ![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) return cb(new ApiError("Carousel images must be JPEG, PNG, or WebP.", 400));
    cb(null, true);
  },
  limits: { fileSize: 8 * 1024 * 1024, files: 2 },
});

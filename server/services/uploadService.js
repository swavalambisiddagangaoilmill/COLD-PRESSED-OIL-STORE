// Upload service prepared for Cloudinary integration.
import cloudinary from "../config/cloudinary.js";
import { ApiError } from "../utils/ApiError.js";
import { isServiceAvailable, logExternalFailure } from "./serviceStatusService.js";

function hasValidImageSignature(file) {
  const buffer = file.buffer;
  if (!buffer || buffer.length < 12) return false;
  const hex = buffer.subarray(0, 12).toString("hex");
  const ascii = buffer.subarray(0, 12).toString("ascii");
  return (
    hex.startsWith("ffd8ff") ||
    hex.startsWith("89504e470d0a1a0a") ||
    ascii.startsWith("GIF87a") ||
    ascii.startsWith("GIF89a") ||
    (ascii.startsWith("RIFF") && buffer.subarray(8, 12).toString("ascii") === "WEBP")
  );
}

export async function uploadImage(file, folder = "products") {
  if (!hasValidImageSignature(file)) throw new ApiError("Uploaded file is not a valid image.", 400);
  if (!isServiceAvailable("cloudinary")) throw new ApiError("Image uploads are temporarily unavailable.", 503);
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  try {
    const safeFolder = ["products", "carousel"].includes(folder) ? folder : "products";
    const result = await cloudinary.uploader.upload(dataUri, { folder: `ss-oil-mill/${safeFolder}`, resource_type: "image", quality: "auto:good", fetch_format: "auto" });
    if (safeFolder === "carousel" && (result.width < 800 || result.height < 300)) {
      await cloudinary.uploader.destroy(result.public_id);
      throw new ApiError("Carousel images must be at least 800 × 300 pixels.", 400);
    }
    const ratio = result.width / result.height;
    return { url: result.secure_url, publicId: result.public_id, provider: "cloudinary", width: result.width, height: result.height, aspectWarning: safeFolder === "carousel" && Math.abs(ratio - (16 / 9)) > 0.25 ? "Image differs from the recommended 16:9 carousel ratio." : "" };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logExternalFailure("cloudinary", error, { action: "upload_image" });
    throw new ApiError("Image uploads are temporarily unavailable.", 503);
  }
}

export async function deleteImage(publicId) {
  if (!publicId) return { deleted: false };
  if (!isServiceAvailable("cloudinary")) return { deleted: false, provider: "cloudinary", reason: "CLOUDINARY_UNAVAILABLE" };
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return { deleted: result.result === "ok", provider: "cloudinary", result };
  } catch (error) {
    logExternalFailure("cloudinary", error, { action: "delete_image" });
    return { deleted: false, provider: "cloudinary", reason: "CLOUDINARY_UNAVAILABLE" };
  }
}

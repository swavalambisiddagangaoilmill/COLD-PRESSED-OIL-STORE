// Upload controller handles product media upload requests.
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { deleteImage, uploadImage } from "../services/uploadService.js";

export const uploadSingleImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError("Image file is required.", 400);
  if (req.body.folder === "carousel" && !["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype)) throw new ApiError("Carousel images must be JPEG, PNG, or WebP.", 400);
  const image = await uploadImage(req.file, req.body.folder);
  sendSuccess(res, 201, "Image uploaded successfully", { image });
});

export const deleteSingleImage = asyncHandler(async (req, res) => {
  const image = await deleteImage(req.body.publicId);
  sendSuccess(res, 200, "Image deleted successfully", { image });
});

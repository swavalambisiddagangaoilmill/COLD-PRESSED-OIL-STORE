import CarouselImage from "../models/CarouselImage.js";
import { ApiError } from "../utils/ApiError.js";
import { deleteImage, uploadImage } from "./uploadService.js";

const sort = { category: 1, order: 1, createdAt: 1 };
const categories = new Set(["desktop", "mobile"]);

function normalizeCategory(value) {
  if (!categories.has(value)) throw new ApiError("Desktop or mobile carousel category is required.", 400);
  return value;
}

function aspectWarning(item) {
  if (!item?.width || !item?.height) return "";
  const target = item.category === "mobile" ? { width: 1080, height: 1350 } : { width: 1920, height: 700 };
  return item.width === target.width && item.height === target.height ? "" : `Image is ${item.width} × ${item.height}px; recommendation is ${target.width} × ${target.height}px.`;
}

function withWarning(item, warning = "") {
  const value = item?.toObject ? item.toObject() : item;
  return { ...value, aspectWarning: warning || aspectWarning(value) };
}

export async function listActiveCarouselImages() {
  const items = await CarouselImage.find({ isActive: true }).select("imageUrl category order width height").sort(sort).lean();
  return items.map((item) => ({ ...item, category: item.category || "desktop" }));
}
export async function listAllCarouselImages() {
  const items = await CarouselImage.find({}).sort(sort).lean();
  return items.map((item) => withWarning({ ...item, category: item.category || "desktop" }));
}

export async function createCarouselImage(file, requestedCategory) {
  if (!file) throw new ApiError("Select a carousel image to upload.", 400);
  const category = normalizeCategory(requestedCategory);
  const uploaded = await uploadImage(file, "carousel", { category });
  try {
    const last = await CarouselImage.findOne({ category }).sort({ order: -1 }).select("order").lean();
    const item = await CarouselImage.create({ imageUrl: uploaded.url, publicId: uploaded.publicId, category, width: uploaded.width, height: uploaded.height, order: (last?.order || 0) + 1, isActive: true });
    return { item: withWarning(item, uploaded.aspectWarning) };
  } catch (error) {
    await deleteImage(uploaded.publicId);
    throw error;
  }
}

export async function replaceCarouselImage(id, file) {
  if (!file) throw new ApiError("Select a replacement carousel image.", 400);
  const existing = await CarouselImage.findById(id);
  if (!existing) throw new ApiError("Carousel image not found.", 404);
  const category = existing.category || "desktop";
  const uploaded = await uploadImage(file, "carousel", { category });
  const previousPublicId = existing.publicId;
  try {
    existing.imageUrl = uploaded.url;
    existing.publicId = uploaded.publicId;
    existing.width = uploaded.width;
    existing.height = uploaded.height;
    await existing.save();
  } catch (error) {
    await deleteImage(uploaded.publicId);
    throw error;
  }
  await deleteImage(previousPublicId);
  return { item: withWarning(existing, uploaded.aspectWarning) };
}

export async function setCarouselStatus(id, isActive) {
  const item = await CarouselImage.findByIdAndUpdate(id, { isActive: Boolean(isActive) }, { new: true, runValidators: true });
  if (!item) throw new ApiError("Carousel image not found.", 404);
  return item;
}

export async function reorderCarouselImages(requestedCategory, ids) {
  const category = normalizeCategory(requestedCategory);
  const categoryFilter = category === "desktop" ? { $in: ["desktop", null] } : "mobile";
  if (new Set(ids).size !== ids.length) throw new ApiError("Carousel order contains duplicate images.", 400);
  const count = await CarouselImage.countDocuments({ _id: { $in: ids }, category: categoryFilter });
  const total = await CarouselImage.countDocuments({ category: categoryFilter });
  if (count !== ids.length || count !== total) throw new ApiError("Carousel order must include every image in this category exactly once.", 400);
  await CarouselImage.bulkWrite(ids.map((id, index) => ({ updateOne: { filter: { _id: id, category: categoryFilter }, update: { $set: { category, order: index + 1 } } } })));
  return listAllCarouselImages();
}

export async function removeCarouselImage(id) {
  const item = await CarouselImage.findById(id);
  if (!item) throw new ApiError("Carousel image not found.", 404);
  const removal = await deleteImage(item.publicId);
  if (!removal.deleted && removal.result?.result !== "not found") throw new ApiError("Cloudinary could not delete this carousel image. Nothing was removed.", 502);
  await item.deleteOne();
  const remaining = await CarouselImage.find({ category: item.category || "desktop" }).sort({ order: 1, createdAt: 1 }).lean();
  if (remaining.length) await CarouselImage.bulkWrite(remaining.map((entry, index) => ({ updateOne: { filter: { _id: entry._id }, update: { $set: { order: index + 1 } } } })));
  return item;
}

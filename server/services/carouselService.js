import CarouselImage from "../models/CarouselImage.js";
import { ApiError } from "../utils/ApiError.js";
import { deleteImage, uploadImage } from "./uploadService.js";

const sort = { order: 1, createdAt: 1 };

export const listActiveCarouselImages = () => CarouselImage.find({ isActive: true }).select("imageUrl order isActive").sort(sort).lean();
export const listAllCarouselImages = () => CarouselImage.find({}).sort(sort).lean();

export async function createCarouselImage(file) {
  if (!file) throw new ApiError("Select a carousel image to upload.", 400);
  const uploaded = await uploadImage(file, "carousel");
  try {
    const last = await CarouselImage.findOne({}).sort({ order: -1 }).select("order").lean();
    return await CarouselImage.create({ imageUrl: uploaded.url, publicId: uploaded.publicId, order: (last?.order || 0) + 1, isActive: true });
  } catch (error) {
    await deleteImage(uploaded.publicId);
    throw error;
  }
}

export async function setCarouselStatus(id, isActive) {
  const item = await CarouselImage.findByIdAndUpdate(id, { isActive: Boolean(isActive) }, { new: true, runValidators: true });
  if (!item) throw new ApiError("Carousel image not found.", 404);
  return item;
}

export async function reorderCarouselImages(ids) {
  if (new Set(ids).size !== ids.length) throw new ApiError("Carousel order contains duplicate images.", 400);
  const count = await CarouselImage.countDocuments({ _id: { $in: ids } });
  const total = await CarouselImage.countDocuments({});
  if (count !== ids.length || count !== total) throw new ApiError("Carousel order must include every image exactly once.", 400);
  await CarouselImage.bulkWrite(ids.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: index + 1 } } } })));
  return listAllCarouselImages();
}

export async function removeCarouselImage(id) {
  const item = await CarouselImage.findById(id);
  if (!item) throw new ApiError("Carousel image not found.", 404);
  const removal = await deleteImage(item.publicId);
  if (!removal.deleted && removal.result?.result !== "not found") throw new ApiError("Cloudinary could not delete this carousel image. Nothing was removed.", 502);
  await item.deleteOne();
  const remaining = await listAllCarouselImages();
  if (remaining.length) await CarouselImage.bulkWrite(remaining.map((entry, index) => ({ updateOne: { filter: { _id: entry._id }, update: { $set: { order: index + 1 } } } })));
  return item;
}

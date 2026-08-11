import CarouselImage from "../models/CarouselImage.js";
import { ApiError } from "../utils/ApiError.js";
import { deleteImage } from "./uploadService.js";

const sort = { order: 1, createdAt: 1 };

export const listActiveCarouselImages = () => CarouselImage.find({ isActive: true }).sort(sort).lean();
export const listAllCarouselImages = () => CarouselImage.find({}).sort(sort).lean();

export async function saveCarouselImage(payload, id) {
  const values = {
    title: payload.title || "",
    altText: payload.altText || payload.title || "Homepage promotion",
    imageUrl: payload.imageUrl,
    storagePath: payload.storagePath || "",
    provider: payload.provider || "cloudinary",
    order: Number(payload.order) || 0,
    isActive: payload.isActive !== false,
  };
  if (!values.imageUrl) throw new ApiError("Carousel image is required.", 400);
  if (!id) return CarouselImage.create(values);
  const previous = await CarouselImage.findById(id).lean();
  if (!previous) throw new ApiError("Carousel image not found.", 404);
  const item = await CarouselImage.findByIdAndUpdate(id, values, { new: true, runValidators: true });
  if (previous.provider === "cloudinary" && previous.storagePath && previous.storagePath !== values.storagePath) await deleteImage(previous.storagePath);
  return item;
}

export async function setCarouselStatus(id, isActive) {
  const item = await CarouselImage.findByIdAndUpdate(id, { isActive: Boolean(isActive) }, { new: true, runValidators: true });
  if (!item) throw new ApiError("Carousel image not found.", 404);
  return item;
}

export async function reorderCarouselImages(ids) {
  await Promise.all(ids.map((id, index) => CarouselImage.findByIdAndUpdate(id, { order: index + 1 })));
  return listAllCarouselImages();
}

export async function removeCarouselImage(id) {
  const item = await CarouselImage.findByIdAndDelete(id);
  if (!item) throw new ApiError("Carousel image not found.", 404);
  if (item.provider === "cloudinary" && item.storagePath) await deleteImage(item.storagePath);
  return item;
}

export async function ensureDefaultCarousel() {
  if (await CarouselImage.exists({})) return;
  await CarouselImage.insertMany([
    { title: "Image 1", altText: "Swavalambi Siddaganga Oil Mill featured collection", imageUrl: "/carousel/image1.png", provider: "local", order: 1, isActive: true },
    { title: "Image 2", altText: "Swavalambi Siddaganga Oil Mill traditional oil collection", imageUrl: "/carousel/image2.png", provider: "local", order: 2, isActive: true },
  ]);
}

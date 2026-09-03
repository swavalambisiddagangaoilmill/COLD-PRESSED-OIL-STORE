import CarouselImage from "../models/CarouselImage.js";
import { ApiError } from "../utils/ApiError.js";
import { deleteImage, uploadCarouselImage } from "./uploadService.js";

const sort = { order: 1, createdAt: 1 };
const normalized = (item) => ({ ...item, desktopImage: item.desktopImage || (item.imageUrl ? { url: item.imageUrl, publicId: item.publicId } : undefined), mobileImage: item.mobileImage || undefined });

export const listActiveCarouselImages = async () => (await CarouselImage.find({ isActive: true }).sort(sort).lean()).map(normalized).filter((item) => item.desktopImage?.url);
export const listAllCarouselImages = async () => (await CarouselImage.find({}).sort(sort).lean()).map(normalized);

async function referencedElsewhere(publicId, excludingId) {
  if (!publicId) return false;
  return Boolean(await CarouselImage.exists({ _id: { $ne: excludingId }, $or: [{ publicId }, { "desktopImage.publicId": publicId }, { "mobileImage.publicId": publicId }] }));
}

async function cleanup(asset, excludingId) {
  if (asset?.publicId && !await referencedElsewhere(asset.publicId, excludingId)) await deleteImage(asset.publicId);
}

export async function saveCarouselImage({ desktopFile, mobileFile, removeDesktop = false, removeMobile = false, isActive, requestKey }, id) {
  if (!id && requestKey) {
    const existing = await CarouselImage.findOne({ requestKey });
    if (existing) return normalized(existing.toObject());
  }
  const current = id ? await CarouselImage.findById(id) : null;
  if (id && !current) throw new ApiError("Carousel slide not found.", 404);
  if (!current && !desktopFile) throw new ApiError("Desktop banner is required.", 400);
  const uploaded = {};
  let saved = false;
  try {
    if (desktopFile) uploaded.desktopImage = await uploadCarouselImage(desktopFile, "desktop");
    if (mobileFile) uploaded.mobileImage = await uploadCarouselImage(mobileFile, "mobile");
    const oldDesktop = current?.desktopImage || (current?.imageUrl ? { url: current.imageUrl, publicId: current.publicId } : null);
    const oldMobile = current?.mobileImage;
    const desktopImage = uploaded.desktopImage || (removeDesktop ? undefined : oldDesktop);
    const mobileImage = uploaded.mobileImage || (removeMobile ? undefined : oldMobile);
    if (!desktopImage?.url && !mobileImage?.url) throw new ApiError("Keep at least one image, or delete the slide.", 400);
    let item;
    if (current) {
      current.desktopImage = desktopImage;
      current.mobileImage = mobileImage;
      current.imageUrl = undefined;
      current.publicId = undefined;
      if (isActive !== undefined) current.isActive = isActive === true || isActive === "true";
      if (!desktopImage?.url) current.isActive = false;
      item = await current.save();
    } else {
      const last = await CarouselImage.findOne({}).sort({ order: -1 }).select("order").lean();
      item = await CarouselImage.create({ desktopImage, mobileImage, requestKey, order: (last?.order || 0) + 1, isActive: isActive !== "false" });
    }
    saved = true;
    await Promise.allSettled([
      uploaded.desktopImage ? cleanup(oldDesktop, item._id) : Promise.resolve(),
      uploaded.mobileImage || removeMobile ? cleanup(oldMobile, item._id) : Promise.resolve(),
    ]);
    return normalized(item.toObject());
  } catch (error) {
    if (!saved) await Promise.allSettled(Object.values(uploaded).map((asset) => deleteImage(asset.publicId)));
    if (!id && requestKey && error?.code === 11000 && error?.keyPattern?.requestKey) {
      const existing = await CarouselImage.findOne({ requestKey });
      if (existing) return normalized(existing.toObject());
    }
    throw error;
  }
}

export async function setCarouselStatus(id, isActive) {
  if (isActive) {
    const current = await CarouselImage.findById(id).lean();
    if (!current) throw new ApiError("Carousel slide not found.", 404);
    if (!normalized(current).desktopImage?.url) throw new ApiError("Add a desktop banner before activating this slide.", 400);
  }
  const item = await CarouselImage.findByIdAndUpdate(id, { isActive: Boolean(isActive) }, { new: true, runValidators: true });
  if (!item) throw new ApiError("Carousel slide not found.", 404);
  return normalized(item.toObject());
}

export async function reorderCarouselImages(ids) {
  if (new Set(ids).size !== ids.length) throw new ApiError("Carousel order contains duplicate slides.", 400);
  const [count, total] = await Promise.all([CarouselImage.countDocuments({ _id: { $in: ids } }), CarouselImage.countDocuments({})]);
  if (count !== ids.length || count !== total) throw new ApiError("Carousel order must include every slide exactly once.", 400);
  await CarouselImage.bulkWrite(ids.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: index + 1 } } } })));
  return listAllCarouselImages();
}

export async function removeCarouselImage(id) {
  const item = await CarouselImage.findById(id);
  if (!item) throw new ApiError("Carousel slide not found.", 404);
  const assets = [item.desktopImage || (item.imageUrl ? { publicId: item.publicId } : null), item.mobileImage];
  await item.deleteOne();
  await Promise.allSettled(assets.map((asset) => cleanup(asset, id)));
  const remaining = await CarouselImage.find({}).sort(sort);
  if (remaining.length) await CarouselImage.bulkWrite(remaining.map((entry, index) => ({ updateOne: { filter: { _id: entry._id }, update: { $set: { order: index + 1 } } } })));
  return normalized(item.toObject());
}

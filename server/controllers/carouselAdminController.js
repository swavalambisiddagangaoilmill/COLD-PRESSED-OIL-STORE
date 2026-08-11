import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { listAllCarouselImages, removeCarouselImage, reorderCarouselImages, saveCarouselImage, setCarouselStatus } from "../services/carouselService.js";

export const listCarousel = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Carousel images fetched", { items: await listAllCarouselImages() }));
export const createCarousel = asyncHandler(async (req, res) => sendSuccess(res, 201, "Carousel image uploaded successfully.", { item: await saveCarouselImage(req.body) }));
export const updateCarousel = asyncHandler(async (req, res) => sendSuccess(res, 200, "Carousel image updated.", { item: await saveCarouselImage(req.body, req.params.id) }));
export const updateCarouselStatus = asyncHandler(async (req, res) => sendSuccess(res, 200, "Carousel status updated.", { item: await setCarouselStatus(req.params.id, req.body.isActive) }));
export const reorderCarousel = asyncHandler(async (req, res) => sendSuccess(res, 200, "Carousel order updated.", { items: await reorderCarouselImages(req.body.ids) }));
export const deleteCarousel = asyncHandler(async (req, res) => sendSuccess(res, 200, "Carousel image deleted.", { item: await removeCarouselImage(req.params.id) }));

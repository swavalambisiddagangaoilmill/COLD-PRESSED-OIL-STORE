import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { listActiveCarouselImages } from "../services/carouselService.js";

export const getActiveCarousel = asyncHandler(async (_req, res) => {
  const items = await listActiveCarouselImages();
  sendSuccess(res, 200, "Carousel fetched", { items });
});

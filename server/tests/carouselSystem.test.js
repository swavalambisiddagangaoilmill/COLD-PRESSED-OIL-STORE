import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import CarouselImage from "../models/CarouselImage.js";
import { validateCarouselDimensions } from "../services/uploadService.js";

test("carousel model accepts responsive and legacy records but rejects empty records", async () => {
  await new CarouselImage({ desktopImage: { url: "/desktop.webp" }, mobileImage: { url: "/mobile.webp" }, order: 1 }).validate();
  await new CarouselImage({ imageUrl: "/legacy.jpg", order: 1 }).validate();
  await assert.rejects(new CarouselImage({ order: 1 }).validate(), /At least one carousel image is required/);
});

test("carousel orientation and minimum dimensions are enforced", () => {
  assert.equal(validateCarouselDimensions(1920, 1080, "desktop"), "");
  assert.equal(validateCarouselDimensions(1080, 1440, "mobile"), "");
  assert.match(validateCarouselDimensions(800, 1200, "desktop"), /horizontal/);
  assert.match(validateCarouselDimensions(1200, 800, "mobile"), /vertical/);
  assert.match(validateCarouselDimensions(700, 400, "desktop"), /too small/);
});

test("homepage carousel is database-backed and uses responsive picture sources", async () => {
  const source = await readFile(new URL("../../src/components/features/home/Hero.jsx", import.meta.url), "utf8");
  assert.match(source, /getActiveCarousel/);
  assert.match(source, /<picture>/);
  assert.match(source, /<source media="\(max-width: 1023px\)"/);
  assert.doesNotMatch(source, /CAROUSEL_SLIDES/);
});

test("admin carousel mutations are mounted behind authentication and role checks", async () => {
  const [app, routes] = await Promise.all([
    readFile(new URL("../app.js", import.meta.url), "utf8"),
    readFile(new URL("../routes/adminCarouselRoutes.js", import.meta.url), "utf8"),
  ]);
  assert.match(app, /app\.use\("\/api\/admin\/carousel", adminCarouselRoutes\)/);
  assert.match(routes, /router\.use\(protect, adminOnly/);
  assert.match(routes, /carouselUpload\.fields/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import cloudinary from "../config/cloudinary.js";
import CarouselImage from "../models/CarouselImage.js";
import { uploadCarouselImage, validateCarouselDimensions } from "../services/uploadService.js";

test("carousel model accepts responsive and legacy records but rejects empty records", async () => {
  await new CarouselImage({ desktopImage: { url: "/desktop.webp" }, mobileImage: { url: "/mobile.webp" }, order: 1 }).validate();
  await new CarouselImage({ imageUrl: "/legacy.jpg", order: 1 }).validate();
  await assert.rejects(new CarouselImage({ order: 1 }).validate(), /At least one carousel image is required/);
});

test("carousel uploads must finish at the exact responsive dimensions", () => {
  assert.equal(validateCarouselDimensions(1920, 1080, "desktop"), "");
  assert.equal(validateCarouselDimensions(1080, 1440, "mobile"), "");
  assert.match(validateCarouselDimensions(800, 1200, "desktop"), /could not be prepared/);
  assert.match(validateCarouselDimensions(1200, 800, "mobile"), /could not be prepared/);
});

test("homepage carousel is database-backed and uses responsive picture sources", async () => {
  const source = await readFile(new URL("../../src/components/features/home/Hero.jsx", import.meta.url), "utf8");
  assert.match(source, /getActiveCarousel/);
  assert.match(source, /<picture>/);
  assert.match(source, /<source media="\(max-width: 1023px\)"/);
  assert.doesNotMatch(source, /CAROUSEL_SLIDES/);
});

test("admin carousel mutations are mounted behind authentication and role checks", async () => {
  const [app, routes, uploads] = await Promise.all([
    readFile(new URL("../app.js", import.meta.url), "utf8"),
    readFile(new URL("../routes/adminCarouselRoutes.js", import.meta.url), "utf8"),
    readFile(new URL("../services/uploadService.js", import.meta.url), "utf8"),
  ]);
  assert.match(app, /app\.use\("\/api\/admin\/carousel", adminCarouselRoutes\)/);
  assert.match(routes, /router\.use\(protect, adminOnly/);
  assert.match(routes, /carouselUpload\.fields/);
  assert.match(uploads, /crop: "fill", gravity: "auto"/);
});

test("production CSP permits local carousel blob previews", async () => {
  const [vercel, app] = await Promise.all([
    readFile(new URL("../../vercel.json", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8"),
  ]);
  assert.match(vercel, /img-src 'self' data: blob: https:/);
  assert.match(app, /imgSrc: \["'self'", "data:", "blob:", "https:"\]/);
});

test("carousel upload accepts image\/jpg as JPEG without weakening signature validation", async () => {
  const originalUpload = cloudinary.uploader.upload;
  let receivedDataUri = "";
  cloudinary.uploader.upload = async (dataUri, options) => {
    receivedDataUri = dataUri;
    assert.deepEqual(options.transformation[0], { width: 1920, height: 1080, crop: "fill", gravity: "auto", quality: "auto:good" });
    return { secure_url: "https://res.cloudinary.com/example/carousel.webp", public_id: "carousel/test", width: 1920, height: 1080 };
  };
  try {
    const jpeg = Buffer.alloc(1536 * 1024);
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(jpeg);
    const result = await uploadCarouselImage({ mimetype: "image/jpg", buffer: jpeg }, "desktop");
    assert.match(receivedDataUri, /^data:image\/jpeg;base64,/);
    assert.equal(result.width, 1920);
    await assert.rejects(uploadCarouselImage({ mimetype: "application/octet-stream", buffer: jpeg }, "desktop"), /must be JPEG, PNG, or WebP/);
  } finally {
    cloudinary.uploader.upload = originalUpload;
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import cloudinary from "../config/cloudinary.js";
import CarouselImage from "../models/CarouselImage.js";
import { uploadCarouselImage, validateCarouselDimensions } from "../services/uploadService.js";

test("carousel model accepts canonical and legacy records but rejects empty records", async () => {
  await new CarouselImage({ image: { url: "/carousel.webp" }, order: 1 }).validate();
  await new CarouselImage({ desktopImage: { url: "/desktop.webp" }, mobileImage: { url: "/mobile.webp" }, order: 1 }).validate();
  await new CarouselImage({ imageUrl: "/legacy.jpg", order: 1 }).validate();
  await assert.rejects(new CarouselImage({ order: 1 }).validate(), /At least one carousel image is required/);
});

test("carousel uploads finish at the one canonical landscape size", () => {
  assert.equal(validateCarouselDimensions(1920, 1080), "");
  assert.equal(validateCarouselDimensions(1280, 720), "");
  assert.match(validateCarouselDimensions(1080, 1440), /could not be prepared/);
  assert.match(validateCarouselDimensions(800, 1200), /could not be prepared/);
  assert.match(validateCarouselDimensions(640, 360), /could not be prepared/);
});

test("homepage carousel is database-backed and uses one image source on every viewport", async () => {
  const source = await readFile(new URL("../../src/components/features/home/Hero.jsx", import.meta.url), "utf8");
  assert.match(source, /getActiveCarousel/);
  assert.match(source, /src=\{slide\.image\}/);
  assert.doesNotMatch(source, /<picture>|<source|slide\.mobile/);
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
  assert.match(uploads, /width: 1920, height: 1080, crop: "limit"/);
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
    assert.deepEqual(options.transformation[0], { width: 1920, height: 1080, crop: "limit", quality: "auto:good" });
    return { secure_url: "https://res.cloudinary.com/example/carousel.webp", public_id: "carousel/test", width: 1920, height: 1080 };
  };
  try {
    const jpeg = Buffer.alloc(1536 * 1024);
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(jpeg);
    const result = await uploadCarouselImage({ mimetype: "image/jpg", buffer: jpeg });
    assert.match(receivedDataUri, /^data:image\/jpeg;base64,/);
    assert.equal(result.width, 1920);
    await assert.rejects(uploadCarouselImage({ mimetype: "application/octet-stream", buffer: jpeg }), /must be JPEG, PNG, or WebP/);
  } finally {
    cloudinary.uploader.upload = originalUpload;
  }
});

test("carousel upload accepts genuine PNG and WebP signatures", async () => {
  const originalUpload = cloudinary.uploader.upload;
  cloudinary.uploader.upload = async () => ({ secure_url: "https://res.cloudinary.com/example/carousel.webp", public_id: "carousel/test", width: 1280, height: 720 });
  try {
    const png = Buffer.alloc(32); Buffer.from("89504e470d0a1a0a", "hex").copy(png);
    const webp = Buffer.alloc(32); Buffer.from("RIFF", "ascii").copy(webp); Buffer.from("WEBP", "ascii").copy(webp, 8);
    assert.equal((await uploadCarouselImage({ mimetype: "image/png", buffer: png })).width, 1280);
    assert.equal((await uploadCarouselImage({ mimetype: "image/webp", buffer: webp })).height, 720);
    await assert.rejects(uploadCarouselImage({ mimetype: "image/png", buffer: Buffer.alloc(32) }), /not a valid image/);
  } finally { cloudinary.uploader.upload = originalUpload; }
});

test("carousel crop editor preserves the one canonical landscape aspect ratio", async () => {
  const { CAROUSEL_CROP, cropSourceRect } = await import("../../src/admin/utils/carouselCrop.js");
  const crop = cropSourceRect(2400, 1600, "image", 1, { x: 0, y: 0 });
  assert.equal(CAROUSEL_CROP.image.width / CAROUSEL_CROP.image.height, 16 / 9);
  assert.ok(Math.abs(crop.width / crop.height - 16 / 9) < 0.000001);
});

test("carousel crop zoom and drag stay within the source image", async () => {
  const { cropSourceRect } = await import("../../src/admin/utils/carouselCrop.js");
  const centered = cropSourceRect(2400, 1600, "image", 1, { x: 0, y: 0 });
  const moved = cropSourceRect(2400, 1600, "image", 2, { x: 1, y: -1 });
  assert.ok(moved.width < centered.width);
  assert.ok(moved.height < centered.height);
  assert.ok(moved.x >= 0 && moved.y >= 0);
  assert.ok(moved.x + moved.width <= 2400);
  assert.ok(moved.y + moved.height <= 1600);
});

test("simple crop UI supports wheel, pinch, drag, and exports on slide save", async () => {
  const source = await readFile(new URL("../../src/admin/pages/CarouselPage.jsx", import.meta.url), "utf8");
  assert.match(source, /addEventListener\("wheel", handleWheel, \{ passive: false \}\)/);
  assert.match(source, /removeEventListener\("wheel", handleWheel\)/);
  assert.doesNotMatch(source, /onWheel=/);
  assert.match(source, /pointers\.current\.size === 2/);
  assert.match(source, /onPointerMove=/);
  assert.match(source, /exporter\.current \? await exporter\.current\(\)/);
  assert.equal((source.match(/new Image\(\)/g) || []).length, 1);
  assert.doesNotMatch(source, /Mobile banner|Desktop banner|mobileFile|desktopFile/);
  assert.doesNotMatch(source, /Apply crop/);
});

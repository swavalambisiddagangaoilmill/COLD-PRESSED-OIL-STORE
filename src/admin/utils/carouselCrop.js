import { CAROUSEL_IMAGE } from "../../../shared/carouselConfig.js";

export const CAROUSEL_CROP = Object.freeze({ image: CAROUSEL_IMAGE });

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function cropSourceRect(imageWidth, imageHeight, kind, zoom = 1, position = { x: 0, y: 0 }) {
  const target = CAROUSEL_CROP[kind];
  if (!target || imageWidth <= 0 || imageHeight <= 0) throw new Error("The selected image could not be prepared.");
  const safeZoom = clamp(Number(zoom) || 1, 1, 3);
  let width = imageWidth;
  let height = width / target.aspect;
  if (height > imageHeight) {
    height = imageHeight;
    width = height * target.aspect;
  }
  width /= safeZoom;
  height /= safeZoom;
  const maxX = (imageWidth - width) / 2;
  const maxY = (imageHeight - height) / 2;
  const centerX = imageWidth / 2 - clamp(position.x || 0, -1, 1) * maxX;
  const centerY = imageHeight / 2 - clamp(position.y || 0, -1, 1) * maxY;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

export function drawCarouselCrop(context, image, kind, zoom, position, outputWidth, outputHeight) {
  const source = cropSourceRect(image.naturalWidth, image.naturalHeight, kind, zoom, position);
  context.clearRect(0, 0, outputWidth, outputHeight);
  context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, outputWidth, outputHeight);
}

export function exportCarouselCrop(image, originalFile, kind, zoom, position) {
  const target = CAROUSEL_CROP[kind];
  const source = cropSourceRect(image.naturalWidth, image.naturalHeight, kind, zoom, position);
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(target.width, Math.max(1, Math.floor(source.width)));
  canvas.height = Math.max(1, Math.round(canvas.width / target.aspect));
  drawCarouselCrop(canvas.getContext("2d"), image, kind, zoom, position, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) return reject(new Error("The cropped image could not be prepared."));
    const stem = (originalFile.name || "carousel").replace(/\.[^.]+$/, "");
    resolve(new File([blob], `${stem}-carousel.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
  }, "image/jpeg", 0.92));
}

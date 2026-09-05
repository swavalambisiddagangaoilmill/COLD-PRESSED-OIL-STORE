import mongoose from "mongoose";

const assetSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true },
  publicId: { type: String, trim: true },
  width: { type: Number, min: 1 },
  height: { type: Number, min: 1 },
}, { _id: false });

const carouselImageSchema = new mongoose.Schema({
  // Legacy fields remain readable while records migrate to responsive assets.
  imageUrl: { type: String, trim: true },
  publicId: { type: String, trim: true },
  image: { type: assetSchema },
  desktopImage: { type: assetSchema },
  mobileImage: { type: assetSchema },
  requestKey: { type: String, trim: true, unique: true, sparse: true },
  order: { type: Number, min: 1, required: true, index: true },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

carouselImageSchema.pre("validate", function requireImage(next) {
  if (!this.image?.url && !this.desktopImage?.url && !this.mobileImage?.url && !this.imageUrl) this.invalidate("image", "At least one carousel image is required.");
  next();
});

carouselImageSchema.index({ isActive: 1, order: 1, createdAt: 1 });

export default mongoose.model("CarouselImage", carouselImageSchema);

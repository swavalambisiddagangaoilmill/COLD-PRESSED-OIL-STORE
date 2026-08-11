import mongoose from "mongoose";

const carouselImageSchema = new mongoose.Schema({
  title: { type: String, trim: true, maxlength: 120, default: "" },
  altText: { type: String, trim: true, maxlength: 180, default: "" },
  imageUrl: { type: String, required: true, trim: true },
  storagePath: { type: String, trim: true, default: "" },
  provider: { type: String, trim: true, default: "cloudinary" },
  order: { type: Number, min: 0, default: 0, index: true },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

carouselImageSchema.index({ isActive: 1, order: 1, createdAt: 1 });

export default mongoose.model("CarouselImage", carouselImageSchema);

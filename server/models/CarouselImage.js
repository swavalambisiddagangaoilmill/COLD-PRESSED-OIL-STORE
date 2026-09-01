import mongoose from "mongoose";

const carouselImageSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true, trim: true },
  publicId: { type: String, required: true, trim: true },
  category: { type: String, enum: ["desktop", "mobile"], default: "desktop", required: true, index: true },
  width: { type: Number, min: 1 },
  height: { type: Number, min: 1 },
  order: { type: Number, min: 1, required: true, index: true },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

carouselImageSchema.index({ category: 1, isActive: 1, order: 1, createdAt: 1 });

export default mongoose.model("CarouselImage", carouselImageSchema);

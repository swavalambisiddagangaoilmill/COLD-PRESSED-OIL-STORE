import mongoose from "mongoose";

const carouselImageSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true, trim: true },
  publicId: { type: String, required: true, trim: true },
  order: { type: Number, min: 1, required: true, index: true },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

carouselImageSchema.index({ isActive: 1, order: 1, createdAt: 1 });

export default mongoose.model("CarouselImage", carouselImageSchema);

import mongoose from "mongoose";

// Stores admin-managed homepage gallery images.
const galleryImageSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 120, default: "" },
    description: { type: String, trim: true, maxlength: 300, default: "" },
    image: {
      url: { type: String, required: true, trim: true },
      publicId: { type: String, trim: true, default: "" },
      provider: { type: String, trim: true, default: "cloudinary" },
    },
    sortOrder: { type: Number, default: 0, index: true },
    isVisible: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

galleryImageSchema.index({ isVisible: 1, sortOrder: 1 });

export default mongoose.model("GalleryImage", galleryImageSchema);


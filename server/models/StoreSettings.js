// Store settings singleton model for admin-managed business settings.
import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "store" },
    storeName: { type: String, default: "Swavalambi Siddaganga Oil Mill" },
    currency: { type: String, default: "INR" },
    supportEmail: { type: String, trim: true },
    supportPhone: { type: String, trim: true },
    whatsappNumber: { type: String, trim: true },
    minimumOrderAmount: { type: Number, default: 0, min: 0 },
    orderPrefix: { type: String, default: "SSOM" },
    lowStockThreshold: { type: Number, default: 10, min: 0 },
    allowOutOfStockVisibility: { type: Boolean, default: true },
    preventOutOfStockCheckout: { type: Boolean, default: true },
    freeDeliveryThreshold: { type: Number, default: 999, min: 0 },
    defaultPackagingWeight: { type: Number, default: 0.5, min: 0 },
    defaultPackageLength: { type: Number, default: 10, min: 0 },
    defaultPackageWidth: { type: Number, default: 10, min: 0 },
    defaultPackageHeight: { type: Number, default: 10, min: 0 },
    shiprocketEnabled: { type: Boolean, default: true },
    codEnabled: { type: Boolean, default: true },
    onlinePaymentEnabled: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
    announcementBarEnabled: { type: Boolean, default: true },
    customerRegistrationEnabled: { type: Boolean, default: true },
    newsletterEnabled: { type: Boolean, default: true },
    factoryAddress: { type: String, trim: true },
    businessHours: { type: String, trim: true },
    googleMapsLink: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("StoreSettings", settingsSchema);


// User account model with authentication helpers.
import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: "Home" },
    fullName: { type: String, trim: true },
    phone: { type: String, trim: true },
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, trim: true, default: "India" },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const authSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true },
    refreshTokenHash: { type: String, required: true, select: false },
    fingerprint: { type: String, trim: true },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    browser: { type: String, trim: true },
    os: { type: String, trim: true },
    device: { type: String, trim: true },
    location: { type: String, trim: true },
    loginAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  { _id: true }
);

const trustedDeviceSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, trim: true },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    browser: { type: String, trim: true },
    os: { type: String, trim: true },
    device: { type: String, trim: true },
    location: { type: String, trim: true },
    trustedAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
  },
  { _id: true }
);

const loginHistorySchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    fingerprint: { type: String, trim: true },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    browser: { type: String, trim: true },
    os: { type: String, trim: true },
    device: { type: String, trim: true },
    location: { type: String, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, alias: "fullName" },
    phone: { type: String, unique: true, sparse: true, trim: true, alias: "phoneNumber" },
    phoneVerified: { type: Boolean, default: false },
    whatsappOptIn: { type: Boolean, default: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    adminRole: { type: String, enum: ["OWNER", "ORDER_MANAGER", "PRODUCT_MANAGER", "CONTENT_MANAGER"] },
    isDisabled: { type: Boolean, default: false },
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    cart: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        variant: { type: mongoose.Schema.Types.ObjectId, required: true },
        quantity: { type: Number, required: true, min: 1, default: 1 },
      },
    ],
    addresses: [addressSchema],
    refreshToken: { type: String, select: false },
    sessions: [authSessionSchema],
    trustedDevices: [trustedDeviceSchema],
    loginHistory: [loginHistorySchema],
  },
  { timestamps: true }
);

userSchema.methods.toJSON = function toJSON() {
  const user = this.toObject();
  delete user.refreshToken;
  if (user.sessions) user.sessions = user.sessions.map(({ refreshTokenHash, ...session }) => session);
  return user;
};

export default mongoose.model("User", userSchema);

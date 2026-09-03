// User account model with authentication helpers.
import bcrypt from "bcrypt";
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

const oauthProviderSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["google", "apple", "facebook"], required: true },
    providerId: { type: String, required: true, select: false },
    email: { type: String, lowercase: true, trim: true },
    linkedAt: { type: Date, default: Date.now },
  },
  { _id: false }
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

const otpRecordSchema = new mongoose.Schema(
  {
    purpose: { type: String, enum: ["new_device", "change_password", "change_email", "delete_account"], required: true },
    codeHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    verified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
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
    name: { type: String, required: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    password: { type: String, required() { return this.role === "admin" && !(this.oauthProviders || []).length; }, minlength: 6, select: false },
    phone: { type: String, unique: true, sparse: true, trim: true },
    phoneVerified: { type: Boolean, default: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    adminRole: { type: String, enum: ["OWNER", "ORDER_MANAGER", "PRODUCT_MANAGER", "CONTENT_MANAGER"] },
    isDisabled: { type: Boolean, default: false },
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    cart: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        variant: { type: mongoose.Schema.Types.ObjectId },
        quantity: { type: Number, required: true, min: 1, default: 1 },
      },
    ],
    addresses: [addressSchema],
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    refreshToken: { type: String, select: false },
    oauthProviders: [oauthProviderSchema],
    sessions: [authSessionSchema],
    trustedDevices: [trustedDeviceSchema],
    otpRecords: [otpRecordSchema],
    loginHistory: [loginHistorySchema],
    failedLoginAttempts: { type: Number, default: 0, select: false },
    loginLockUntil: { type: Date, select: false },
    turnstileRequiredUntil: { type: Date, select: false },
    passwordChangedAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordChangedAt = new Date();
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function toJSON() {
  const user = this.toObject();
  delete user.password;
  delete user.refreshToken;
  delete user.emailVerificationToken;
  delete user.emailVerificationExpires;
  delete user.passwordResetToken;
  delete user.passwordResetExpires;
  delete user.failedLoginAttempts;
  delete user.loginLockUntil;
  delete user.turnstileRequiredUntil;
  if (user.sessions) user.sessions = user.sessions.map(({ refreshTokenHash, ...session }) => session);
  if (user.otpRecords) delete user.otpRecords;
  return user;
};

export default mongoose.model("User", userSchema);

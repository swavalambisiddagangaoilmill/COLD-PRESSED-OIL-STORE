import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import { normalizeIndianPhone } from "../utils/phone.js";

await connectDB();
const users = await User.collection.find({}).toArray();
let ready = 0, needsPhone = 0, conflicts = 0;
const seen = new Map();
for (const user of users) {
  try {
    const phone = normalizeIndianPhone(user.phone || user.phoneNumber);
    if (seen.has(phone)) { conflicts += 1; console.warn(`Phone conflict: ${user._id} and ${seen.get(phone)} -> ${phone}`); continue; }
    seen.set(phone, user._id);
    await User.collection.updateOne({ _id: user._id }, { $set: { phone, phoneVerified: Boolean(user.phoneVerified), whatsappOptIn: Boolean(user.whatsappOptIn) }, $unset: { password: "", emailVerificationToken: "", emailVerificationExpires: "", passwordResetToken: "", passwordResetExpires: "", oauthProviders: "", otpRecords: "" } });
    ready += 1;
  } catch { needsPhone += 1; console.warn(`Manual mobile-number migration required for user ${user._id}`); }
}
console.log({ users: users.length, ready, needsPhone, conflicts });
await mongoose.disconnect();
if (needsPhone || conflicts) process.exitCode = 2;

// Ensures the env-configured default admin exists during backend startup.
import User from "../models/User.js";

export async function ensureDefaultAdmin() {
  const phone = process.env.DEFAULT_ADMIN_PHONE;
  if (!phone) { console.warn("DEFAULT_ADMIN_PHONE is missing. Default admin was not created."); return null; }
  const existing = await User.findOne({ phone });
  if (existing) {
    console.log("Default admin already exists.");
    return existing;
  }

  const admin = await User.create({
    name: "SS Oil Mill Admin",
    phone,
    phoneVerified: true,
    role: "admin",
    adminRole: "OWNER",
    isDisabled: false,
    whatsappOptIn: false,
  });

  console.log("Default admin created successfully.");
  return admin;
}

// Ensures the env-configured default admin exists during backend startup.
import User from "../models/User.js";

export async function ensureDefaultAdmin() {
  const email = String(process.env.DEFAULT_ADMIN_EMAIL || "swavalambisiddagangaoilmill@gmail.com").trim().toLowerCase();
  const password = process.env.DEFAULT_ADMIN_PASSWORD;
  if (!password) { console.warn("DEFAULT_ADMIN_PASSWORD is missing. Default admin was not created."); return null; }
  const existing = await User.findOne({ email });
  if (existing) {
    console.log("Default admin already exists.");
    return existing;
  }

  const admin = await User.create({
    name: "SS Oil Mill Admin",
    email,
    password,
    role: "admin",
    adminRole: "OWNER",
    isDisabled: false,
  });

  console.log("Default admin created successfully.");
  return admin;
}

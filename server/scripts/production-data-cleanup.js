// Guarded cleanup of explicitly identified development/test transactional data.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import AdminAuditLog from "../models/AdminAuditLog.js";
import AdminNotification from "../models/AdminNotification.js";
import CarouselImage from "../models/CarouselImage.js";
import Category from "../models/Category.js";
import ContactMessage from "../models/ContactMessage.js";
import Coupon from "../models/Coupon.js";
import GalleryImage from "../models/GalleryImage.js";
import NewsletterSubscriber from "../models/NewsletterSubscriber.js";
import Offer from "../models/Offer.js";
import Order from "../models/Order.js";
import OtpVerification from "../models/OtpVerification.js";
import PaymentCheckout from "../models/PaymentCheckout.js";
import Product from "../models/Product.js";
import Restriction from "../models/Restriction.js";
import SecurityEvent from "../models/SecurityEvent.js";
import SiteContent from "../models/SiteContent.js";
import StoreSettings from "../models/StoreSettings.js";
import User from "../models/User.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const execute = process.argv.includes("--execute");
const fingerprintOnly = process.argv.includes("--print-uri-fingerprint");
const mongoUri = String(process.env.MONGO_URI || "").trim();
const expectedDbName = String(process.env.PRODUCTION_CLEANUP_DB_NAME || "").trim();
const expectedFingerprint = String(process.env.PRODUCTION_CLEANUP_URI_FINGERPRINT || "").trim().toLowerCase();
const manifestPath = process.env.PRODUCTION_CLEANUP_MANIFEST
  ? path.resolve(process.env.PRODUCTION_CLEANUP_MANIFEST)
  : fileURLToPath(new URL("./production-cleanup-manifest.json", import.meta.url));
const uriFingerprint = crypto.createHash("sha256").update(mongoUri).digest("hex");
const confirmationPhrase = `DELETE_TEST_DATA_FROM_${expectedDbName}`;
const manifestKeys = ["users", "orders", "paymentCheckouts", "notifications", "contactMessages", "otpVerifications", "securityEvents", "restrictions", "auditLogs", "coupons", "offers", "newsletterSubscribers"];

const fail = (message) => { throw new Error(message); };
const ids = (values = []) => values.map(String).filter((value) => mongoose.isValidObjectId(value));
const unionIds = (...groups) => [...new Set(groups.flat().map(String))].map((value) => new mongoose.Types.ObjectId(value));
const stableHash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function loadManifest() {
  if (!fs.existsSync(manifestPath)) return Object.fromEntries(manifestKeys.map((key) => [key, []]));
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const unknown = Object.keys(parsed).filter((key) => !manifestKeys.includes(key));
  if (unknown.length) fail(`Cleanup manifest contains unsupported keys: ${unknown.join(", ")}`);
  return Object.fromEntries(manifestKeys.map((key) => [key, ids(parsed[key])]));
}

function requireBackup() {
  const backupPath = String(process.env.PRODUCTION_CLEANUP_BACKUP_PATH || "").trim();
  const confirmedAt = new Date(process.env.PRODUCTION_CLEANUP_BACKUP_CONFIRMED_AT || "");
  if (!backupPath || !fs.existsSync(backupPath)) fail("A valid PRODUCTION_CLEANUP_BACKUP_PATH is required before execution.");
  const stat = fs.statSync(backupPath);
  if (stat.isFile() && stat.size === 0) fail("The configured backup file is empty.");
  if (stat.isDirectory() && fs.readdirSync(backupPath).length === 0) fail("The configured backup directory is empty.");
  if (Number.isNaN(confirmedAt.getTime()) || Date.now() - confirmedAt.getTime() > 24 * 60 * 60 * 1000 || confirmedAt.getTime() > Date.now() + 5 * 60 * 1000) {
    fail("PRODUCTION_CLEANUP_BACKUP_CONFIRMED_AT must confirm a backup completed within the last 24 hours.");
  }
  return { backupPath, confirmedAt: confirmedAt.toISOString() };
}

async function protectedSnapshot() {
  const [products, gallery, carousel, categories, content, settings, admins] = await Promise.all([
    Product.find().sort({ _id: 1 }).select("_id slug variants title updatedAt").lean(),
    GalleryImage.find().sort({ _id: 1 }).lean(),
    CarouselImage.find().sort({ _id: 1 }).lean(),
    Category.find().sort({ _id: 1 }).lean(),
    SiteContent.find().sort({ _id: 1 }).lean(),
    StoreSettings.find().sort({ _id: 1 }).lean(),
    User.find({ role: "admin" }).sort({ _id: 1 }).select("_id name email role adminRole updatedAt").lean(),
  ]);
  return {
    products: { count: products.length, variants: products.reduce((sum, item) => sum + (item.variants?.length || 0), 0), hash: stableHash(products) },
    gallery: { count: gallery.length, hash: stableHash(gallery) },
    carousel: { count: carousel.length, hash: stableHash(carousel) },
    categories: { count: categories.length, hash: stableHash(categories) },
    siteContent: { count: content.length, hash: stableHash(content) },
    storeSettings: { count: settings.length, hash: stableHash(settings) },
    adminUsers: { count: admins.length, hash: stableHash(admins) },
  };
}

async function databaseCounts() {
  const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
  const entries = await Promise.all(collections.map(async ({ name }) => [name, await mongoose.connection.db.collection(name).countDocuments({})]));
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}

async function buildPlan(manifest) {
  const seededUsers = await User.find({ role: "user", phone: { $in: ["+919876543210", "+919876543211"] }, name: { $in: ["Demo User One", "Demo User Two"] } }).select("_id name phone").lean();
  const userIds = unionIds(seededUsers.map((item) => item._id), manifest.users);
  const seededOrders = await Order.find({ $or: [{ couponCode: { $in: ["DEMOORDER1", "DEMOORDER2"] } }, { razorpayOrderId: "order_demo_seed_002" }, { razorpayPaymentId: "pay_demo_seed_002" }, ...(userIds.length ? [{ user: { $in: userIds } }] : [])] }).select("_id user couponCode razorpayOrderId razorpayPaymentId").lean();
  const orderIds = unionIds(seededOrders.map((item) => item._id), manifest.orders);
  const relatedIds = unionIds(userIds, orderIds);
  const specs = {
    paymentCheckouts: { model: PaymentCheckout, filter: { $or: [{ _id: { $in: manifest.paymentCheckouts } }, ...(userIds.length ? [{ user: { $in: userIds } }] : []), ...(orderIds.length ? [{ order: { $in: orderIds } }] : [])] } },
    notifications: { model: AdminNotification, filter: { $or: [{ _id: { $in: manifest.notifications } }, ...(relatedIds.length ? [{ "related.id": { $in: relatedIds } }] : [])] } },
    contactMessages: { model: ContactMessage, filter: { $or: [{ _id: { $in: manifest.contactMessages } }, { email: { $in: ["priya.demo@example.com", "ramesh.demo@example.com"] }, phone: { $in: ["9000000001", "9000000002"] } }] } },
    otpVerifications: { model: OtpVerification, filter: { $or: [{ _id: { $in: manifest.otpVerifications } }, ...(seededUsers.length ? [{ phoneNumber: { $in: seededUsers.map((item) => item.phone) } }] : [])] } },
    securityEvents: { model: SecurityEvent, filter: { $or: [{ _id: { $in: manifest.securityEvents } }, ...(userIds.length ? [{ user: { $in: userIds } }] : [])] } },
    restrictions: { model: Restriction, filter: { $or: [{ _id: { $in: manifest.restrictions } }, ...(userIds.length ? [{ account: { $in: userIds } }] : [])] } },
    auditLogs: { model: AdminAuditLog, filter: { $or: [{ _id: { $in: manifest.auditLogs } }, ...(relatedIds.length ? [{ resourceId: { $in: relatedIds.map(String) } }] : [])] } },
    newsletterSubscribers: { model: NewsletterSubscriber, filter: { _id: { $in: manifest.newsletterSubscribers } } },
    coupons: { model: Coupon, filter: { _id: { $in: manifest.coupons } } },
    offers: { model: Offer, filter: { _id: { $in: manifest.offers } } },
    orders: { model: Order, filter: { _id: { $in: orderIds } } },
    users: { model: User, filter: { _id: { $in: userIds }, role: "user" } },
  };
  const plan = {};
  for (const [name, spec] of Object.entries(specs)) {
    const records = await spec.model.find(spec.filter).select("_id name email phone code title status couponCode").lean();
    plan[name] = { ...spec, ids: records.map((item) => item._id), records };
  }
  plan.couponOrderReferences = {
    model: Coupon,
    records: orderIds.length ? await Coupon.find({ consumedOrderIds: { $in: orderIds } }).select("+consumedOrderIds code usedCount").lean() : [],
    orderIds,
  };
  return plan;
}

function printableCounts(plan) {
  return Object.fromEntries(Object.entries(plan).map(([name, item]) => [name, item.records?.length || 0]));
}

async function applyPlan(plan, session) {
  const deleted = {};
  for (const [name, item] of Object.entries(plan)) {
    if (name === "couponOrderReferences") continue;
    const result = item.ids.length ? await item.model.deleteMany({ _id: { $in: item.ids } }, { session }) : { deletedCount: 0 };
    deleted[name] = result.deletedCount || 0;
  }
  let referencesRemoved = 0;
  for (const coupon of plan.couponOrderReferences.records) {
    const matched = (coupon.consumedOrderIds || []).filter((id) => plan.couponOrderReferences.orderIds.some((orderId) => String(orderId) === String(id))).length;
    if (!matched) continue;
    await Coupon.updateOne({ _id: coupon._id }, { $pull: { consumedOrderIds: { $in: plan.couponOrderReferences.orderIds } }, $set: { usedCount: Math.max(0, Number(coupon.usedCount || 0) - matched) } }, { session });
    referencesRemoved += matched;
  }
  deleted.couponOrderReferences = referencesRemoved;
  return deleted;
}

async function main() {
  if (!mongoUri) fail("MONGO_URI must be explicitly configured; the cleanup never uses a default database.");
  if (fingerprintOnly) {
    console.log(`MONGO_URI SHA-256 fingerprint: ${uriFingerprint}`);
    console.log("No database connection was made.");
    return;
  }
  if (process.env.NODE_ENV !== "production") fail("NODE_ENV=production is required for production cleanup.");
  if (!expectedDbName) fail("PRODUCTION_CLEANUP_DB_NAME is required.");
  if (!expectedFingerprint || expectedFingerprint !== uriFingerprint) fail(`PRODUCTION_CLEANUP_URI_FINGERPRINT does not match MONGO_URI. Expected fingerprint for the current URI: ${uriFingerprint}`);
  const manifest = loadManifest();
  const backup = execute ? requireBackup() : null;
  if (execute && process.env.PRODUCTION_CLEANUP_CONFIRM !== confirmationPhrase) fail(`Set PRODUCTION_CLEANUP_CONFIRM=${confirmationPhrase} to execute deletion.`);

  await mongoose.connect(mongoUri, { dbName: expectedDbName });
  if (mongoose.connection.name !== expectedDbName) fail(`Connected database ${mongoose.connection.name} does not match ${expectedDbName}.`);
  console.log(`Mode: ${execute ? "EXECUTE" : "DRY RUN"}`);
  console.log(`Target: ${mongoose.connection.host}/${mongoose.connection.name}`);
  console.log(`URI fingerprint: ${uriFingerprint}`);
  if (backup) console.log(`Backup verified: ${backup.backupPath} (${backup.confirmedAt})`);

  const beforeCounts = await databaseCounts();
  const beforeProtected = await protectedSnapshot();
  const plan = await buildPlan(manifest);
  console.log("Planned deletion counts:");
  console.table(printableCounts(plan));
  console.log("All database collection counts before:");
  console.table(beforeCounts);
  for (const [name, item] of Object.entries(plan)) {
    if (!item.records?.length) continue;
    console.log(`${name}:`, item.records.map((record) => ({ id: String(record._id), name: record.name, email: record.email, phone: record.phone, code: record.code, title: record.title, status: record.status, couponCode: record.couponCode })));
  }
  console.log("Protected data before:");
  console.table(beforeProtected);
  if (!execute) {
    console.log("DRY RUN COMPLETE: no records were modified. Review the plan, take a backup, then use --execute with all confirmation variables.");
    return;
  }

  const session = await mongoose.startSession();
  let deleted;
  try {
    await session.withTransaction(async () => { deleted = await applyPlan(plan, session); });
  } finally {
    await session.endSession();
  }
  const afterPlan = await buildPlan(manifest);
  const afterCounts = await databaseCounts();
  const afterProtected = await protectedSnapshot();
  if (JSON.stringify(beforeProtected) !== JSON.stringify(afterProtected)) fail("Protected product/media/config/admin fingerprint changed. Investigate immediately using the verified backup.");
  const remaining = printableCounts(afterPlan);
  const nonZero = Object.entries(remaining).filter(([, count]) => count !== 0);
  if (nonZero.length) fail(`Cleanup verification failed; candidates remain: ${JSON.stringify(Object.fromEntries(nonZero))}`);
  console.log("Deleted counts:");
  console.table(deleted);
  console.log("Candidate counts after deletion:");
  console.table(remaining);
  console.log("All database collection counts after:");
  console.table(afterCounts);
  console.log("Protected data after (unchanged):");
  console.table(afterProtected);
  console.log("PRODUCTION TRANSACTIONAL CLEANUP COMPLETED AND VERIFIED.");
}

main().catch((error) => {
  console.error(`Cleanup stopped: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});

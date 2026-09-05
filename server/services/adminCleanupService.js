import crypto from "node:crypto";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import AdminCleanupLock from "../models/AdminCleanupLock.js";
import AdminCleanupOperation from "../models/AdminCleanupOperation.js";
import AdminNotification from "../models/AdminNotification.js";
import Category from "../models/Category.js";
import ContactMessage from "../models/ContactMessage.js";
import Coupon from "../models/Coupon.js";
import Offer from "../models/Offer.js";
import Order from "../models/Order.js";
import PaymentCheckout from "../models/PaymentCheckout.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";

const TYPES = {
  orders: { label: "Orders", model: Order },
  customers: { label: "Customers", model: User, base: { role: "user" } },
  payments: { label: "Payments", model: PaymentCheckout },
  products: { label: "Products", model: Product },
  categories: { label: "Categories", model: Category },
  messages: { label: "Messages", model: ContactMessage },
  carts: { label: "Carts", model: User, base: { role: "user", "cart.0": { $exists: true } }, cart: true },
  coupons: { label: "Coupons", model: Coupon },
  offers: { label: "Offers", model: Offer },
  notifications: { label: "Notifications", model: AdminNotification },
};
const PREVIEW_TTL_MS = 15 * 60_000;

const objectIds = (values = []) => [...new Set(values.map(String))].map((id) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError("Every selected record id must be valid.", 400);
  return new mongoose.Types.ObjectId(id);
});

export function normalizeCleanupInput(body = {}) {
  const type = TYPES[body.dataType];
  if (!type) throw new ApiError("Unsupported cleanup data type.", 400);
  if (!["selected", "dateRange", "all"].includes(body.mode)) throw new ApiError("Unsupported cleanup mode.", 400);
  const filter = {};
  if (body.mode === "selected") {
    const ids = objectIds(body.ids);
    if (!ids.length || ids.length > 5000) throw new ApiError("Select between 1 and 5000 records.", 400);
    filter.ids = ids;
  }
  if (body.mode === "dateRange") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(body.to || "")) throw new ApiError("Cleanup dates must use YYYY-MM-DD.", 400);
    const from = new Date(`${body.from}T00:00:00.000Z`); const to = new Date(`${body.to}T23:59:59.999Z`);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) throw new ApiError("A valid cleanup date range is required.", 400);
    if (type.cart) throw new ApiError("Date-range cleanup is not supported for carts.", 400);
    filter.from = from; filter.to = to;
  }
  return { dataType: body.dataType, mode: body.mode, filter, type };
}

function queryFor({ type, mode, filter }) {
  const query = { ...(type.base || {}) };
  if (mode === "selected") query._id = { $in: filter.ids };
  if (mode === "dateRange") query.createdAt = { $gte: filter.from, $lte: filter.to };
  return query;
}

async function dependencyReport(dataType, ids) {
  const blockers = []; const warnings = [];
  if (!ids.length) return { blockers, warnings };
  if (dataType === "orders") {
    const payments = await PaymentCheckout.countDocuments({ order: { $in: ids } });
    if (payments) blockers.push(`${payments} payment record(s) depend on these orders.`);
    const external = await Order.countDocuments({ _id: { $in: ids }, $or: [{ shiprocketOrderId: { $exists: true, $ne: "" } }, { cashfreeOrderId: { $exists: true, $ne: "" } }] });
    if (external) blockers.push(`${external} order(s) have Cashfree or Shiprocket provider references and are protected from local cleanup.`);
  }
  if (dataType === "customers") {
    const [orders, payments] = await Promise.all([Order.countDocuments({ user: { $in: ids } }), PaymentCheckout.countDocuments({ user: { $in: ids } })]);
    if (orders || payments) blockers.push(`${orders} order(s) and ${payments} payment record(s) depend on these customers.`);
  }
  if (dataType === "payments") {
    const active = await PaymentCheckout.countDocuments({ _id: { $in: ids }, status: { $in: ["created", "processing"] } });
    if (active) blockers.push(`${active} payment checkout(s) are still active.`);
    warnings.push("Local cleanup does not alter Cashfree or other payment-provider records.");
  }
  if (dataType === "products") {
    const [orders, offers, coupons, carts] = await Promise.all([Order.countDocuments({ "products.product": { $in: ids } }), Offer.countDocuments({ $or: [{ products: { $in: ids } }, { "variants.product": { $in: ids } }] }), Coupon.countDocuments({ products: { $in: ids } }), User.countDocuments({ $or: [{ "cart.product": { $in: ids } }, { "wishlist.product": { $in: ids } }] })]);
    if (orders || offers || coupons || carts) blockers.push(`${orders} order(s), ${offers} offer(s), ${coupons} coupon(s), and ${carts} customer list(s) reference these products.`);
  }
  if (dataType === "categories") {
    const [products, offers] = await Promise.all([Product.countDocuments({ category: { $in: ids } }), Offer.countDocuments({ categories: { $in: ids } })]);
    if (products || offers) blockers.push(`${products} product(s) and ${offers} offer(s) reference these categories.`);
  }
  return { blockers, warnings };
}

const safeOperation = (doc) => ({ id: doc._id, administrator: doc.admin?.name || doc.admin?.email || undefined, dataType: doc.dataType, mode: doc.mode, filter: doc.filter, targetCount: doc.targetCount, deletedCount: doc.deletedCount, warnings: doc.warnings, blockers: doc.blockers, backupIdentifier: doc.backupIdentifier, backupStatus: doc.backupStatus, status: doc.status, errorMessage: doc.errorMessage, createdAt: doc.createdAt, completedAt: doc.completedAt });

const previewLabel = (doc) => doc.title || doc.name || doc.email || doc.code || doc.orderNumber || doc._id;

export const cleanupTypes = () => Object.entries(TYPES).map(([value, item]) => ({ value, label: item.label, supportsDateRange: !item.cart }));

export async function previewCleanup(adminId, body) {
  const normalized = normalizeCleanupInput(body);
  const docs = await normalized.type.model.find(queryFor(normalized)).select("_id title name email code orderNumber createdAt").limit(5001).lean();
  if (docs.length > 5000) throw new ApiError("This cleanup targets more than 5000 records. Use a smaller date range.", 400);
  if (normalized.mode === "selected" && docs.length !== normalized.filter.ids.length) throw new ApiError("One or more selected IDs do not belong to the requested data type or no longer exist.", 400);
  const ids = docs.map((doc) => doc._id);
  const dependencies = await dependencyReport(normalized.dataType, ids);
  const noun = normalized.type.label.toUpperCase();
  const confirmationPhrase = normalized.mode === "all" ? `DELETE ALL ${noun}` : `DELETE ${ids.length} ${noun}`;
  const operation = await AdminCleanupOperation.create({ admin: adminId, dataType: normalized.dataType, mode: normalized.mode, filter: normalized.filter, targetIds: ids, targetCount: ids.length, confirmationPhrase, ...dependencies, requestKey: body.requestKey || undefined, expiresAt: new Date(Date.now() + PREVIEW_TTL_MS), status: dependencies.blockers.length ? "blocked" : "previewed" });
  return { operation: safeOperation(operation), confirmationPhrase, records: docs.map((doc) => ({ id: doc._id, label: String(previewLabel(doc)), createdAt: doc.createdAt })) };
}

function backupKey() { return crypto.createHash("sha256").update(`admin-cleanup:v1:${env.jwtSecret}`).digest(); }
export function encryptAndVerifyBackup(payload) {
  const plain = JSON.stringify(payload); const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", backupKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]); const tag = cipher.getAuthTag();
  const decipher = crypto.createDecipheriv("aes-256-gcm", backupKey(), iv); decipher.setAuthTag(tag);
  const restored = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString();
  const checksum = crypto.createHash("sha256").update(plain).digest("hex");
  if (restored !== plain || crypto.createHash("sha256").update(restored).digest("hex") !== checksum) throw new ApiError("Backup verification failed. No records were deleted.", 500);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: tag.toString("base64"), checksum };
}

export function verifyPersistedBackup(backup) {
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", backupKey(), Buffer.from(backup.backupIv, "base64"));
    decipher.setAuthTag(Buffer.from(backup.backupAuthTag, "base64"));
    const plain = Buffer.concat([decipher.update(Buffer.from(backup.backupCiphertext, "base64")), decipher.final()]);
    return crypto.createHash("sha256").update(plain).digest("hex") === backup.backupChecksum;
  } catch { return false; }
}

const forbiddenBackupKeys = new Set(["password", "refreshTokenHash", "codeHash", "token", "apiKey", "apiSecret", "secret", "paymentSessionId", "idempotencyKey", "razorpayQrId"]);
export function stripBackupSecrets(value) {
  if (Array.isArray(value)) return value.map(stripBackupSecrets);
  if (!value || typeof value !== "object" || value instanceof Date || value?._bsontype) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !forbiddenBackupKeys.has(key)).map(([key, item]) => [key, stripBackupSecrets(item)]));
}

function backupRecordChecksum(records) {
  const ordered = [...records].sort((left, right) => String(left._id).localeCompare(String(right._id)));
  return crypto.createHash("sha256").update(JSON.stringify(stripBackupSecrets(ordered))).digest("hex");
}

async function acquireLock(operationId) {
  await AdminCleanupLock.updateOne({ _id: "global" }, { $setOnInsert: { lockedUntil: new Date(0) } }, { upsert: true });
  const lock = await AdminCleanupLock.findOneAndUpdate({ _id: "global", lockedUntil: { $lte: new Date() } }, { $set: { operation: operationId, lockedUntil: new Date(Date.now() + 10 * 60_000) } }, { new: true });
  if (!lock) throw new ApiError("Another data cleanup is currently running.", 409);
}

export async function executeCleanup(adminId, operationId, phrase) {
  if (!mongoose.isValidObjectId(operationId)) throw new ApiError("Valid cleanup operation id is required.", 400);
  const operation = await AdminCleanupOperation.findOne({ _id: operationId, admin: adminId }).select("+confirmationPhrase +backupChecksum +backupCiphertext +backupIv +backupAuthTag");
  if (!operation) throw new ApiError("Cleanup preview not found.", 404);
  if (operation.status === "completed") return safeOperation(operation);
  if (operation.expiresAt <= new Date()) throw new ApiError("Cleanup preview expired. Create a new preview.", 409);
  if (operation.blockers.length) throw new ApiError("Cleanup is blocked by dependent records.", 409, operation.blockers);
  if (phrase !== operation.confirmationPhrase) throw new ApiError("Confirmation phrase does not match.", 400);
  await acquireLock(operation._id);
  try {
    const claimed = await AdminCleanupOperation.findOneAndUpdate({ _id: operation._id, status: "previewed" }, { $set: { status: "running" } }, { new: true });
    if (!claimed) throw new ApiError("This cleanup has already started.", 409);
    const type = TYPES[operation.dataType]; const ids = operation.targetIds;
    const currentQuery = { ...(type.base || {}), _id: { $in: ids } };
    const current = await type.model.find(currentQuery).select(type.cart ? "_id cart" : "").lean();
    if (current.length !== operation.targetCount) throw new ApiError("Records changed after preview. Create a new preview.", 409);
    const dependencies = await dependencyReport(operation.dataType, ids);
    if (dependencies.blockers.length) throw new ApiError("Cleanup became unsafe because dependent records now exist.", 409, dependencies.blockers);
    const backupIdentifier = `cleanup-${operation._id}`;
    const recordChecksum = backupRecordChecksum(current);
    const encrypted = encryptAndVerifyBackup({ version: 1, backupIdentifier, dataType: operation.dataType, createdAt: new Date().toISOString(), recordChecksum, records: stripBackupSecrets(current) });
    await AdminCleanupOperation.updateOne({ _id: operation._id }, { $set: { backupIdentifier, backupStatus: "verified", backupChecksum: encrypted.checksum, backupCiphertext: encrypted.ciphertext, backupIv: encrypted.iv, backupAuthTag: encrypted.authTag } });
    const verified = await AdminCleanupOperation.findById(operation._id).select("+backupCiphertext +backupChecksum +backupIv +backupAuthTag").lean();
    if (!verified?.backupCiphertext || !verifyPersistedBackup(verified)) throw new ApiError("Backup persistence verification failed. No records were deleted.", 500);
    const renewedLock = await AdminCleanupLock.findOneAndUpdate({ _id: "global", operation: operation._id, lockedUntil: { $gt: new Date() } }, { $set: { lockedUntil: new Date(Date.now() + 10 * 60_000) } }, { new: true });
    if (!renewedLock) throw new ApiError("Cleanup lock was lost before deletion. No records were deleted.", 409);
    const session = await mongoose.startSession(); let deletedCount = 0;
    try {
      await session.withTransaction(async () => {
        const transactionRecords = await type.model.find(currentQuery).select(type.cart ? "_id cart" : "").session(session).lean();
        if (transactionRecords.length !== operation.targetCount || backupRecordChecksum(transactionRecords) !== recordChecksum) throw new ApiError("Records changed after backup. Transaction rolled back without deleting data.", 409);
        if (type.cart) {
          const result = await User.updateMany(currentQuery, { $set: { cart: [] } }, { session }); deletedCount = result.modifiedCount;
          if (await User.countDocuments({ _id: { $in: ids }, "cart.0": { $exists: true } }).session(session)) throw new ApiError("Post-cleanup cart verification failed.", 500);
        } else {
          const result = await type.model.deleteMany(currentQuery, { session }); deletedCount = result.deletedCount;
          if (await type.model.countDocuments({ _id: { $in: ids } }).session(session)) throw new ApiError("Post-cleanup verification failed.", 500);
        }
        if (deletedCount !== operation.targetCount) throw new ApiError("Cleanup count verification failed.", 409);
        await AdminCleanupOperation.updateOne({ _id: operation._id, status: "running" }, { $set: { deletedCount, status: "completed", completedAt: new Date() } }, { session });
      });
    } finally { await session.endSession(); }
    return safeOperation(await AdminCleanupOperation.findById(operation._id).lean());
  } catch (error) {
    await AdminCleanupOperation.updateOne({ _id: operation._id, status: { $ne: "completed" } }, { $set: { status: "failed", errorMessage: String(error.message || "Cleanup failed").slice(0, 500) } });
    await AdminCleanupOperation.updateOne({ _id: operation._id, backupStatus: { $ne: "verified" } }, { $set: { backupStatus: "failed" } });
    throw error;
  } finally { await AdminCleanupLock.updateOne({ _id: "global", operation: operation._id }, { $set: { lockedUntil: new Date(0) }, $unset: { operation: 1 } }); }
}

export async function cleanupHistory() { return (await AdminCleanupOperation.find().populate("admin", "name email").sort({ createdAt: -1 }).limit(100).lean()).map(safeOperation); }

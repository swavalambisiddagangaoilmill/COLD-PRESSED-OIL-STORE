import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";
import mongoose from "mongoose";
import AdminCleanupLock from "../models/AdminCleanupLock.js";
import AdminCleanupOperation from "../models/AdminCleanupOperation.js";
import Coupon from "../models/Coupon.js";
import Offer from "../models/Offer.js";
import Order from "../models/Order.js";
import PaymentCheckout from "../models/PaymentCheckout.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { cleanupTypes, encryptAndVerifyBackup, executeCleanup, normalizeCleanupInput, stripBackupSecrets, verifyPersistedBackup } from "../services/adminCleanupService.js";
import { requireOwner } from "../admin/middleware/adminAuth.js";

test("cleanup exposes only the explicit business-data allowlist", () => {
  assert.deepEqual(cleanupTypes().map((item) => item.value), ["orders", "customers", "payments", "products", "categories", "messages", "carts", "coupons", "offers", "notifications"]);
  assert.throws(() => normalizeCleanupInput({ dataType: "users", mode: "all" }), /Unsupported cleanup data type/);
  assert.throws(() => normalizeCleanupInput({ dataType: "storesettings", mode: "all" }), /Unsupported cleanup data type/);
});

test("cleanup validates ids, ranges, boundaries, and cart modes", () => {
  assert.throws(() => normalizeCleanupInput({ dataType: "orders", mode: "selected", ids: ["invalid"] }), /record id/);
  assert.throws(() => normalizeCleanupInput({ dataType: "orders", mode: "dateRange", from: "2026-09-06", to: "2026-09-05" }), /date range/);
  assert.throws(() => normalizeCleanupInput({ dataType: "carts", mode: "dateRange", from: "2026-09-05", to: "2026-09-05" }), /not supported/);
  const boundary = normalizeCleanupInput({ dataType: "orders", mode: "dateRange", from: "2026-09-05", to: "2026-09-05" });
  assert.equal(boundary.filter.from.toISOString(), "2026-09-05T00:00:00.000Z");
  assert.equal(boundary.filter.to.toISOString(), "2026-09-05T23:59:59.999Z");
});

test("backup encryption verifies and plaintext secrets are removed", () => {
  const clean = stripBackupSecrets({ email: "customer@example.com", password: "hash", authSessions: [{ refreshTokenHash: "hash", device: "phone" }], nested: { token: "secret", value: 3 } });
  assert.deepEqual(clean, { email: "customer@example.com", authSessions: [{ device: "phone" }], nested: { value: 3 } });
  const backup = encryptAndVerifyBackup({ records: [clean] });
  assert.match(backup.checksum, /^[a-f0-9]{64}$/);
  assert.ok(backup.ciphertext && backup.iv && backup.authTag);
  assert.doesNotMatch(backup.ciphertext, /customer@example\.com/);
  assert.equal(verifyPersistedBackup({ backupCiphertext: backup.ciphertext, backupIv: backup.iv, backupAuthTag: backup.authTag, backupChecksum: backup.checksum }), true);
  assert.equal(verifyPersistedBackup({ backupCiphertext: backup.ciphertext, backupIv: backup.iv, backupAuthTag: backup.authTag, backupChecksum: "0".repeat(64) }), false);
});

test("only OWNER role passes cleanup authorization", () => {
  let ownerPassed = false;
  requireOwner({ user: { role: "admin", adminRole: "OWNER" } }, {}, () => { ownerPassed = true; });
  assert.equal(ownerPassed, true);
  let error;
  requireOwner({ user: { role: "admin", adminRole: "ORDER_MANAGER" } }, {}, (value) => { error = value; });
  assert.equal(error.statusCode, 403);
});

test("service preserves the backup-before-delete and transactional verification invariant", async () => {
  const source = await readFile(new URL("../services/adminCleanupService.js", import.meta.url), "utf8");
  const backupWrite = source.indexOf('backupStatus: "verified"');
  const deleteWrite = source.indexOf("deleteMany(currentQuery");
  assert.ok(backupWrite > 0 && deleteWrite > backupWrite, "backup must persist before delete");
  assert.match(source, /if \(!verified\?\.backupCiphertext[^]*verifyPersistedBackup[^]*No records were deleted/);
  assert.match(source, /withTransaction/);
  assert.match(source, /Records changed after backup\. Transaction rolled back without deleting data/);
  assert.match(source, /status: "completed"[^]*\{ session \}/);
  assert.match(source, /Another data cleanup is currently running/);
  assert.match(source, /Cleanup preview expired/);
  assert.match(source, /have Cashfree or Shiprocket provider references and are protected/);
});

const queryResult = (value) => ({ select() { return this; }, session() { return this; }, lean() { return Promise.resolve(value); }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });

test("stale preview is rejected before lock or deletion", async () => {
  const id = new mongoose.Types.ObjectId(); const admin = new mongoose.Types.ObjectId(); let locked = false;
  mock.method(AdminCleanupOperation, "findOne", () => queryResult({ _id: id, admin, status: "previewed", blockers: [], expiresAt: new Date(0) }));
  mock.method(AdminCleanupLock, "updateOne", () => { locked = true; });
  try { await assert.rejects(executeCleanup(admin, id, "DELETE ALL ORDERS"), /preview expired/); assert.equal(locked, false); } finally { mock.restoreAll(); }
});

test("completed cleanup execution is idempotent", async () => {
  const id = new mongoose.Types.ObjectId(); const admin = new mongoose.Types.ObjectId();
  mock.method(AdminCleanupOperation, "findOne", () => queryResult({ _id: id, admin, dataType: "messages", mode: "all", targetCount: 2, deletedCount: 2, warnings: [], blockers: [], backupStatus: "verified", status: "completed", expiresAt: new Date(0) }));
  try { const result = await executeCleanup(admin, id, "ignored"); assert.equal(result.status, "completed"); assert.equal(result.deletedCount, 2); } finally { mock.restoreAll(); }
});

test("concurrent cleanup is rejected by the global lock", async () => {
  const id = new mongoose.Types.ObjectId(); const admin = new mongoose.Types.ObjectId();
  mock.method(AdminCleanupOperation, "findOne", () => queryResult({ _id: id, admin, dataType: "messages", confirmationPhrase: "DELETE ALL MESSAGES", blockers: [], status: "previewed", expiresAt: new Date(Date.now() + 60_000) }));
  mock.method(AdminCleanupLock, "updateOne", () => Promise.resolve({ acknowledged: true }));
  mock.method(AdminCleanupLock, "findOneAndUpdate", () => Promise.resolve(null));
  try { await assert.rejects(executeCleanup(admin, id, "DELETE ALL MESSAGES"), /Another data cleanup/); } finally { mock.restoreAll(); }
});

test("backup persistence failure performs zero deletions", async () => {
  const targetId = new mongoose.Types.ObjectId(); const adminId = new mongoose.Types.ObjectId();
  const operation = { _id: new mongoose.Types.ObjectId(), admin: adminId, dataType: "products", mode: "selected", filter: { ids: [targetId] }, targetIds: [targetId], targetCount: 1, confirmationPhrase: "DELETE 1 PRODUCTS", blockers: [], status: "previewed", backupStatus: "pending", expiresAt: new Date(Date.now() + 60_000) };
  let operationUpdates = 0; let deletionCalls = 0;
  mock.method(AdminCleanupOperation, "findOne", () => queryResult(operation));
  mock.method(AdminCleanupOperation, "findOneAndUpdate", () => Promise.resolve(operation));
  mock.method(AdminCleanupOperation, "updateOne", () => { operationUpdates += 1; if (operationUpdates === 1) return Promise.reject(new Error("backup store unavailable")); return Promise.resolve({ acknowledged: true }); });
  mock.method(AdminCleanupLock, "updateOne", () => Promise.resolve({ acknowledged: true }));
  mock.method(AdminCleanupLock, "findOneAndUpdate", () => Promise.resolve({ _id: "global" }));
  mock.method(Product, "find", () => queryResult([{ _id: targetId, title: "Test product" }]));
  mock.method(Product, "deleteMany", () => { deletionCalls += 1; return Promise.resolve({ deletedCount: 1 }); });
  for (const model of [Order, Offer, Coupon, User]) mock.method(model, "countDocuments", () => Promise.resolve(0));
  mock.method(PaymentCheckout, "countDocuments", () => Promise.resolve(0));
  try {
    await assert.rejects(executeCleanup(adminId, operation._id, operation.confirmationPhrase), /backup store unavailable/);
    assert.equal(deletionCalls, 0);
  } finally { mock.restoreAll(); }
});

test("persisted backup checksum failure performs zero deletions", async () => {
  const targetId = new mongoose.Types.ObjectId(); const adminId = new mongoose.Types.ObjectId(); let deletionCalls = 0;
  const operation = { _id: new mongoose.Types.ObjectId(), admin: adminId, dataType: "products", targetIds: [targetId], targetCount: 1, confirmationPhrase: "DELETE 1 PRODUCTS", blockers: [], status: "previewed", expiresAt: new Date(Date.now() + 60_000) };
  mock.method(AdminCleanupOperation, "findOne", () => queryResult(operation)); mock.method(AdminCleanupOperation, "findOneAndUpdate", () => Promise.resolve(operation)); mock.method(AdminCleanupOperation, "updateOne", () => Promise.resolve({ acknowledged: true }));
  mock.method(AdminCleanupOperation, "findById", () => queryResult({ backupCiphertext: "invalid", backupIv: "invalid", backupAuthTag: "invalid", backupChecksum: "0".repeat(64) }));
  mock.method(AdminCleanupLock, "updateOne", () => Promise.resolve({ acknowledged: true })); mock.method(AdminCleanupLock, "findOneAndUpdate", () => Promise.resolve({ _id: "global" }));
  mock.method(Product, "find", () => queryResult([{ _id: targetId, title: "Test" }])); mock.method(Product, "deleteMany", () => { deletionCalls += 1; });
  for (const model of [Order, Offer, Coupon, User, PaymentCheckout]) mock.method(model, "countDocuments", () => Promise.resolve(0));
  try { await assert.rejects(executeCleanup(adminId, operation._id, operation.confirmationPhrase), /Backup persistence verification failed/); assert.equal(deletionCalls, 0); } finally { mock.restoreAll(); }
});

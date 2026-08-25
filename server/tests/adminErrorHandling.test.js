import assert from "node:assert/strict";
import test from "node:test";
import { errorHandler } from "../middleware/errorHandler.js";
import { getAdminErrorContext, sanitizeAdminLogMessage } from "../utils/adminErrorContext.js";
import { decorateAdminError } from "../../src/admin/utils/adminError.js";
import { getPackageDetails } from "../services/shiprocketService.js";

function responseCapture() {
  return { statusCode: 0, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

test("admin route context identifies major services and actions", () => {
  assert.equal(getAdminErrorContext({ originalUrl: "/api/admin-panel/orders/abc/ready-to-ship", method: "POST" }).service, "Shipping Service");
  assert.equal(getAdminErrorContext({ originalUrl: "/api/admin-panel/inventory/abc", method: "PUT" }).service, "Inventory Service");
  assert.equal(getAdminErrorContext({ originalUrl: "/api/admin-panel/products", method: "POST" }).action, "create the product");
  assert.equal(getAdminErrorContext({ originalUrl: "/api/admin-panel/sessions/revoke", method: "POST" }).service, "Session Service");
});

test("unexpected admin failures return safe structured service metadata", () => {
  const res = responseCapture();
  errorHandler(new Error("ECONNREFUSED mongodb://secret-host"), { originalUrl: "/api/admin-panel/orders/abc/status", method: "PUT", id: "request-1" }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.error.service, "Order Service");
  assert.equal(res.payload.error.code, "ORDER_STATUS_UPDATE_FAILED");
  assert.equal(res.payload.error.requestId, "request-1");
  assert.equal(res.payload.message, "Unable to update order status.");
  assert.doesNotMatch(JSON.stringify(res.payload), /secret-host/);
});

test("database failures are distinguished for admin requests", () => {
  const res = responseCapture();
  const failure = Object.assign(new Error("connection failed"), { name: "MongoServerSelectionError" });
  errorHandler(failure, { originalUrl: "/api/admin-panel/inventory/abc", method: "PUT", id: "request-2" }, res);
  assert.equal(res.payload.error.service, "Database");
  assert.equal(res.payload.error.code, "DATABASE_OPERATION_FAILED");
  assert.match(res.payload.message, /variant stock/);
});

test("explicit inventory metadata identifies cancellation rollback failures", () => {
  const res = responseCapture();
  const failure = Object.assign(new Error("Unable to restore variant stock, so the order cancellation was rolled back."), { statusCode: 500, isOperational: true, adminService: "Inventory Service", adminAction: "restore variant stock while cancelling the order", serviceCode: "INVENTORY_RESTORE_FAILED" });
  errorHandler(failure, { originalUrl: "/api/admin-panel/orders/abc/status", method: "PUT", id: "request-4" }, res);
  assert.equal(res.payload.error.service, "Inventory Service");
  assert.equal(res.payload.error.code, "INVENTORY_RESTORE_FAILED");
  assert.match(res.payload.message, /rolled back/);
});

test("storefront unexpected-error behavior remains unchanged", () => {
  const res = responseCapture();
  errorHandler(new Error("private internal failure"), { originalUrl: "/api/cart", method: "POST", id: "request-3" }, res);
  assert.equal(res.payload.message, "Service is temporarily unavailable. Please try again shortly.");
  assert.equal(res.payload.error, undefined);
});

test("admin network errors retain action context even without a backend response", () => {
  const error = Object.assign(new Error("Service is temporarily unavailable. Please try again shortly."), { status: 0 });
  decorateAdminError(error, "/admin-panel/orders/abc/ready-to-ship", { method: "POST" });
  assert.equal(error.service, "Shipping Service");
  assert.match(error.message, /prepare the order for shipping because the server could not be reached/i);
});

test("admin diagnostic logging redacts credentials and tokens", () => {
  const safe = sanitizeAdminLogMessage("failed mongodb+srv://user:password@cluster/db Bearer abc123 token=secret-value");
  assert.doesNotMatch(safe, /user:password|abc123|secret-value/);
  assert.match(safe, /redacted/);
});

test("Ready shipment package metrics use the selected product variant", () => {
  const selected = { _id: "v2", weight: 5, dimensions: { length: 30, width: 22, height: 38 } };
  const product = { variants: { id: (id) => id === "v2" ? selected : null } };
  assert.deepEqual(getPackageDetails({ products: [{ product, variant: "v2", quantity: 2 }] }), { weight: 10, length: 30, breadth: 22, height: 38 });
});

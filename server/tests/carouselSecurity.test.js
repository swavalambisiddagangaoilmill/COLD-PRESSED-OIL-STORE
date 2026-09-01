import assert from "node:assert/strict";
import test from "node:test";
import cookieParser from "cookie-parser";
import express from "express";
import { adminOnly } from "../middleware/admin.js";
import { errorHandler } from "../middleware/errorHandler.js";
import adminCarouselRoutes from "../routes/adminCarouselRoutes.js";

test("carousel management API rejects unauthenticated direct access", async (t) => {
  const testApp = express();
  testApp.use(cookieParser());
  testApp.use(express.json());
  testApp.use("/api/admin/carousel", adminCarouselRoutes);
  testApp.use(errorHandler);
  const server = testApp.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  const listResponse = await fetch(`http://127.0.0.1:${port}/api/admin/carousel`);
  assert.equal(listResponse.status, 401);

  const uploadResponse = await fetch(`http://127.0.0.1:${port}/api/admin/carousel`, { method: "POST" });
  assert.equal(uploadResponse.status, 401);
});

test("carousel admin middleware rejects a signed-in customer", () => {
  let error;
  adminOnly({ user: { role: "user" } }, {}, (value) => { error = value; });
  assert.equal(error?.statusCode, 403);
  assert.match(error?.message || "", /Admin access required/i);
});

test("carousel admin middleware allows an admin", () => {
  let called = false;
  adminOnly({ user: { role: "admin" } }, {}, (error) => {
    assert.equal(error, undefined);
    called = true;
  });
  assert.equal(called, true);
});

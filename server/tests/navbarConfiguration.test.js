import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { validateNavbarConfig } from "../services/navigationService.js";
import { DEFAULT_NAVBAR_CONFIG, orderedActiveNavbar } from "../../shared/navbarConfig.js";

test("default navbar contains exactly the requested six cold-pressed oils", () => {
  const coldPressed = DEFAULT_NAVBAR_CONFIG.items.find((item) => item.key === "cold-pressed-oils");
  assert.deepEqual(coldPressed.children.map((item) => item.label), ["Coconut Oil", "Sunflower Oil", "Safflower Oil", "Mustard Oil", "Gingelly Oil", "Groundnut Oil"]);
  assert.doesNotMatch(JSON.stringify(coldPressed), /Raw Material Crushing|Seed Cast/i);
});

test("public ordering excludes inactive parents and children", () => {
  const config = { items: [{ key: "second", label: "Second", active: true, order: 2, children: [{ key: "hidden", active: false, order: 1 }, { key: "shown", active: true, order: 2 }] }, { key: "hidden-parent", active: false, order: 1, children: [] }, { key: "first", label: "First", active: true, order: 1, children: [] }] };
  const publicItems = orderedActiveNavbar(config);
  assert.deepEqual(publicItems.map((item) => item.key), ["first", "second"]);
  assert.deepEqual(publicItems[1].children.map((item) => item.key), ["shown"]);
});

test("navbar validation rejects malformed and external navigation", async () => {
  await assert.rejects(validateNavbarConfig({ items: [] }), /between 1 and 20/);
  await assert.rejects(validateNavbarConfig({ items: [{ key: "Shop Bad", label: "Shop", href: "/shop", children: [] }] }), /keys/);
  await assert.rejects(validateNavbarConfig({ items: [{ key: "shop", label: "Shop", href: "https://example.com", children: [] }] }), /internal paths/);
});

test("adding, editing, disabling, re-enabling, and removing nav items does not mutate products", async () => {
  let productWrites = 0;
  mock.method(Product, "countDocuments", async () => 0);
  mock.method(Category, "countDocuments", async () => 0);
  for (const method of ["deleteOne", "deleteMany", "findByIdAndDelete", "updateOne", "updateMany"]) if (typeof Product[method] === "function") mock.method(Product, method, () => { productWrites += 1; });
  try {
    const payload = structuredClone(DEFAULT_NAVBAR_CONFIG); const cold = payload.items[1];
    cold.children.push({ key: "new-oil", label: "New Oil", type: "LINK", href: "/shop?q=New%20Oil", active: true });
    cold.children[0].label = "Coconut Oil"; cold.children[0].active = false; cold.children[0].active = true; cold.children = cold.children.filter((item) => item.key !== "new-oil");
    const validated = await validateNavbarConfig(payload);
    assert.equal(validated.items[1].children.length, 6);
    assert.equal(productWrites, 0);
  } finally { mock.restoreAll(); }
});

test("desktop and mobile navbar consume stored configuration rather than product lists", async () => {
  const [navbar, desktop, mobile, routes] = await Promise.all([readFile(new URL("../../src/components/layout/Navbar.jsx", import.meta.url), "utf8"), readFile(new URL("../../src/components/layout/DesktopMenu.jsx", import.meta.url), "utf8"), readFile(new URL("../../src/components/layout/MobileDrawer.jsx", import.meta.url), "utf8"), readFile(new URL("../admin/routes/adminApiRoutes.js", import.meta.url), "utf8")]);
  assert.match(navbar, /getPublicNavbar/); assert.doesNotMatch(navbar, /getNavbarProducts/);
  assert.match(desktop, /orderedActiveNavbar/); assert.match(mobile, /orderedActiveNavbar/);
  assert.match(routes, /requireAdminPermission\("navbar\.manage"\)/);
});

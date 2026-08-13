import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import Product from "../models/Product.js";
import { listProducts } from "../services/productService.js";

const originalAggregate = Product.aggregate;

afterEach(() => { Product.aggregate = originalAggregate; });

test("all-products mode returns the complete filtered dataset in one page", async () => {
  let receivedPipeline;
  const products = Array.from({ length: 17 }, (_, index) => ({ _id: String(index + 1), title: `Product ${index + 1}` }));
  Product.aggregate = async (pipeline) => {
    receivedPipeline = pipeline;
    return [{ items: products, total: [{ count: products.length }] }];
  };

  const result = await listProducts({ all: "true", search: "oil", category: "64b000000000000000000001", sort: "priceAsc" });
  const facet = receivedPipeline.find((stage) => stage.$facet).$facet;
  assert.equal(facet.items.some((stage) => stage.$skip || stage.$limit), false);
  assert.equal(result.items.length, 17);
  assert.deepEqual(result.pagination, { page: 1, limit: 17, total: 17, pages: 1 });
});

test("ordinary product requests retain their existing pagination", async () => {
  let receivedPipeline;
  Product.aggregate = async (pipeline) => {
    receivedPipeline = pipeline;
    return [{ items: Array.from({ length: 6 }), total: [{ count: 17 }] }];
  };

  const result = await listProducts({ page: "2", limit: "6" });
  const items = receivedPipeline.find((stage) => stage.$facet).$facet.items;
  assert.deepEqual(items[0], { $skip: 6 });
  assert.deepEqual(items[1], { $limit: 6 });
  assert.deepEqual(result.pagination, { page: 2, limit: 6, total: 17, pages: 3 });
});

// Product controller maps catalog requests to product services.
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import {
  createProduct,
  deleteProduct,
  getFeaturedProducts,
  getProductBySlug,
  getRelatedProducts,
  listProducts,
  updateProduct,
} from "../services/productService.js";

export const getProducts = asyncHandler(async (req, res) => {
  const data = await listProducts(req.query);
  sendSuccess(res, 200, "Products fetched successfully", data);
});

export const getFeatured = asyncHandler(async (_req, res) => {
  const products = await getFeaturedProducts();
  sendSuccess(res, 200, "Featured products fetched successfully", { products });
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await getProductBySlug(req.params.slug);
  sendSuccess(res, 200, "Product fetched successfully", { product });
});

export const getRelated = asyncHandler(async (req, res) => {
  const products = await getRelatedProducts(req.params.id, req.query.limit);
  sendSuccess(res, 200, "Related products fetched successfully", { products });
});

export const createProductHandler = asyncHandler(async (req, res) => {
  const product = await createProduct(req.body);
  sendSuccess(res, 201, "Product created successfully", { product });
});

export const updateProductHandler = asyncHandler(async (req, res) => {
  const product = await updateProduct(req.params.id, req.body);
  sendSuccess(res, 200, "Product updated successfully", { product });
});

export const deleteProductHandler = asyncHandler(async (req, res) => {
  const product = await deleteProduct(req.params.id);
  sendSuccess(res, 200, "Product removed successfully", { product });
});




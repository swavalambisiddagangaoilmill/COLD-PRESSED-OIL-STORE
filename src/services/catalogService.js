// Serves catalog data from backend APIs and normalizes it for existing UI components.
import { API_ENDPOINTS } from "../constants/apiConfig.js";
import { apiRequest } from "../api/apiClient.js";

function normalizeProduct(product) {
  if (!product) return null;
  const variants = (product.variants || []).filter((variant) => variant.isActive !== false && !variant.isArchived).map((variant) => ({ ...variant, id: variant._id || variant.id, images: variant.images || [] }));
  const available = variants.find((variant) => variant.stock > 0) || variants[0];
  const price = available?.price ?? 0;
  const mrp = available?.mrp ?? available?.price ?? 0;
  return {
    id: product._id || product.id,
    _id: product._id || product.id,
    slug: product.slug,
    name: product.name || product.title,
    title: product.title || product.name,
    description: product.description || "",
    price,
    mrp,
    variants,
    selectedVariant: available,
    image: available?.images?.[0]?.url || "",
    images: available?.images || [],
    stock: available?.stock ?? 0,
    featured: Boolean(product.featured),
    bestSeller: Boolean(product.bestSeller),
    newArrival: Boolean(product.newArrival),
    codEnabled: product.codEnabled !== false,
    onlinePaymentEnabled: product.onlinePaymentEnabled !== false,
    returnEligible: product.returnEligible !== false,
    exchangeEligible: Boolean(product.exchangeEligible),
    isActive: product.isActive !== false,
    rating: product.rating || 4.8,
    reviews: product.reviews || 84,
    volume: available?.name || product.volume || "",
    tags: product.tags || [],
    benefits: product.benefits || ["Cold pressed", "Chemical-free", "Small batch", "Fresh aroma"],
    specifications: product.specifications || { Size: available?.name || "-", Weight: available?.weight ? `${available.weight} kg` : "-", Method: "Cold pressed", Storage: "Cool, dry place" },
  };
}

function productListFrom(data) {
  const list = data.products || data.items || [];
  return list.map(normalizeProduct).filter(Boolean);
}

export async function getProducts(params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== "" && value !== "All"));
  const data = await apiRequest(`${API_ENDPOINTS.products}${query.toString() ? `?${query}` : ""}`);
  return { products: productListFrom(data), pagination: data.pagination };
}

export async function getCategories() {
  const data = await apiRequest(API_ENDPOINTS.categories);
  return (data.categories || []).map((category) => ({ id: category._id, name: category.name, slug: category.slug }));
}

export async function getProductBySlug(slug) {
  const data = await apiRequest(API_ENDPOINTS.product(slug));
  return normalizeProduct(data.product);
}

export async function getRelatedProducts(current, limit = 6) {
  const id = current?._id || current?.id;
  if (!id) return [];
  const data = await apiRequest(API_ENDPOINTS.relatedProducts(id, limit));
  return productListFrom(data);
}

export async function getEverydayEssentials() {
  const data = await apiRequest(`${API_ENDPOINTS.products}?limit=5&sort=featured`);
  return productListFrom(data).slice(0, 5);
}

export async function getEssentialOilProducts() {
  const data = await getProducts({ limit: 5, search: "Essential Oils", sort: "featured" });
  if (data.products.length >= 5) return data.products.slice(0, 5);
  const fallback = await getProducts({ limit: 5, sort: "featured" }).catch(() => ({ products: [] }));
  return [...data.products, ...fallback.products.filter((item) => !data.products.some((existing) => existing.id === item.id))].slice(0, 5);
}



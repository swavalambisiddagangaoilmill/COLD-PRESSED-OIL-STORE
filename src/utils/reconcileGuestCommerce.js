import { getProducts } from "../services/catalogService.js";

let catalogRequest;

async function activeCatalog() {
  if (!catalogRequest) {
    catalogRequest = getProducts({ all: true }).then(({ products }) => products).finally(() => {
      window.setTimeout(() => { catalogRequest = null; }, 3000);
    });
  }
  return catalogRequest;
}

export async function reconcileGuestCart(items = []) {
  const products = await activeCatalog();
  return reconcileCartWithCatalog(items, products);
}

export function removePurchasedItems(items = [], productIds = []) {
  const purchased = new Set(productIds.map(String));
  return items.filter((item) => !purchased.has(String(item?._id || item?.id)));
}

export function reconcileCartWithCatalog(items = [], products = []) {
  const productMap = new Map(products.filter((product) => product.isActive && product.stock > 0).map((product) => [String(product.id), product]));
  return items.flatMap((item) => {
    const current = productMap.get(String(item._id || item.id));
    if (!current) return [];
    return [{ ...current, quantity: Math.min(Math.max(1, Number(item.quantity) || 1), current.stock) }];
  });
}

export async function reconcileGuestWishlist(items = []) {
  const products = await activeCatalog();
  return reconcileWishlistWithCatalog(items, products);
}

export function reconcileWishlistWithCatalog(items = [], products = []) {
  const productMap = new Map(products.filter((product) => product.isActive).map((product) => [String(product.id), product]));
  return items.flatMap((item) => productMap.get(String(item?._id || item?.id)) || []);
}

// Provides cart state synchronized with backend cart APIs.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getAuthToken } from "../api/apiClient.js";
import { useAuth } from "./AuthContext.jsx";
import { addCartItem, clearCartApi, fetchCart, removeCartItem, syncCart, updateCartItem } from "../services/cartService.js";
import { validateCoupon as validateCouponApi } from "../services/promotionService.js";
import { readGuestSession, writeGuestSession } from "../utils/guestSession.js";
import { useToast } from "../components/features/feedback/ToastProvider.jsx";
import { reconcileGuestCart, removePurchasedItems } from "../utils/reconcileGuestCommerce.js";

const CartContext = createContext(null);
const COUPON_SESSION_KEY = "ss_oil_mill_applied_coupon";
const CART_SYNC_KEY = "ss_oil_mill_cart_sync";

const cartKey = (itemOrId, variantId) => typeof itemOrId === "object" ? `${itemOrId._id || itemOrId.id}:${itemOrId.variantId || ""}` : `${itemOrId}:${variantId || ""}`;

function cartSignature(cart) {
  return cart.map((item) => `${cartKey(item)}:${item.quantity}:${item.price}:${item.stock}`).sort().join("|");
}

function readAppliedCoupon() {
  try { return JSON.parse(window.sessionStorage.getItem(COUPON_SESSION_KEY)) || null; } catch { return null; }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => readGuestSession().data.cart.filter(Boolean));
  const [appliedCoupon, setAppliedCoupon] = useState(readAppliedCoupon);
  const [shippingQuote, setShippingQuote] = useState(null);
  const { authenticated } = useAuth();
  const { showToast } = useToast();
  const cartLoadRef = useRef(null);
  const itemsRef = useRef(items);

  useEffect(() => { itemsRef.current = items; }, [items]);

  const signalCartChange = useCallback(() => {
    window.localStorage.setItem(CART_SYNC_KEY, String(Date.now()));
  }, []);

  const revalidateCart = useCallback(async ({ notify = false } = {}) => {
    const before = itemsRef.current;
    const fresh = getAuthToken() ? await fetchCart() : await reconcileGuestCart(before);
    const changed = cartSignature(before) !== cartSignature(fresh);
    setItems(fresh);
    if (changed && notify) showToast("Your cart was updated to match current availability, stock, and prices.", "warning", null, { id: "cart-revalidated", duration: 4800 });
    return { items: fresh, changed };
  }, [showToast]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      cartLoadRef.current = null;
      setItems(readGuestSession().data.cart);
      return undefined;
    }
    if (cartLoadRef.current === token) return undefined;
    cartLoadRef.current = token;
    const guestCart = readGuestSession().data.cart;
    const loadCart = guestCart.length ? syncCart(guestCart, { merge: true }) : fetchCart();
    loadCart.then((cart) => {
      if (getAuthToken() !== token) return;
      if (guestCart.length) writeGuestSession({ cart: [] });
      setItems(cart);
    }).catch(() => {
      if (getAuthToken() === token) cartLoadRef.current = null;
    });
    return undefined;
  }, [authenticated]);

  useEffect(() => {
    const refresh = () => revalidateCart({ notify: true }).catch(() => {});
    refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    const onStorage = (event) => { if (event.key === CART_SYNC_KEY || event.key === "ss_oil_mill_guest_session_v1") refresh(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("storage", onStorage); document.removeEventListener("visibilitychange", onVisibility); };
  }, [authenticated, revalidateCart]);

  useEffect(() => {
    if (!authenticated) writeGuestSession({ cart: items });
  }, [authenticated, items]);

  useEffect(() => {
    if (!items.length) clearCoupon();
  }, [items.length]);

  const couponProducts = useMemo(() => items.map((item) => ({ product: item._id || item.id, variant: item.variantId, quantity: item.quantity })), [items]);

  const validateCoupon = async (code) => {
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (appliedCoupon?.code === normalizedCode) return appliedCoupon;
    const coupon = await validateCouponApi(normalizedCode, couponProducts);
    setAppliedCoupon(coupon);
    window.sessionStorage.setItem(COUPON_SESSION_KEY, JSON.stringify(coupon));
    return coupon;
  };

  const clearCoupon = () => { setAppliedCoupon(null); window.sessionStorage.removeItem(COUPON_SESSION_KEY); };

  useEffect(() => {
    if (!appliedCoupon?.code || !couponProducts.length) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      validateCouponApi(appliedCoupon.code, couponProducts)
        .then((coupon) => { if (active) { setAppliedCoupon(coupon); window.sessionStorage.setItem(COUPON_SESSION_KEY, JSON.stringify(coupon)); } })
        .catch(() => { if (active) clearCoupon(); });
    }, 500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [appliedCoupon?.code, couponProducts]);

  useEffect(() => {
    if (!appliedCoupon?.code || !couponProducts.length) return undefined;
    let active = true;
    const revalidate = () => {
      validateCouponApi(appliedCoupon.code, couponProducts)
        .then((coupon) => { if (active) { setAppliedCoupon(coupon); window.sessionStorage.setItem(COUPON_SESSION_KEY, JSON.stringify(coupon)); } })
        .catch(() => { if (active) clearCoupon(); });
    };
    const timer = window.setInterval(revalidate, 15000);
    window.addEventListener("ss-oil-mill-promotions-changed", revalidate);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("ss-oil-mill-promotions-changed", revalidate); };
  }, [appliedCoupon?.code, couponProducts]);

  const addItem = async (product, quantity = 1) => {
    const safeQuantity = Math.max(1, Number(quantity) || 1);
    const previousItems = items;
    const nextItems = (() => {
      const key = cartKey(product);
      const existing = items.find((item) => cartKey(item) === key);
      return existing ? items.map((item) => (cartKey(item) === key ? { ...item, quantity: item.quantity + safeQuantity } : item)) : [...items, { ...product, quantity: safeQuantity }];
    })();
    setItems(nextItems);
    if (!getAuthToken()) return nextItems;
    try {
      const synced = await addCartItem(product._id || product.id, safeQuantity, product.variantId);
      setItems(synced);
      signalCartChange();
      return synced;
    } catch (error) {
      setItems(previousItems);
      throw error;
    }
  };

  const updateQuantity = async (id, quantity, variantId) => {
    const safeQuantity = Math.max(1, Number(quantity) || 1);
    const previousItems = items;
    const nextItems = items.map((item) => (cartKey(item) === cartKey(id, variantId) ? { ...item, quantity: safeQuantity } : item));
    setItems(nextItems);
    if (!getAuthToken()) return nextItems;
    try {
      const synced = await updateCartItem(id, safeQuantity, variantId);
      setItems(synced);
      signalCartChange();
      return synced;
    } catch (error) {
      setItems(previousItems);
      throw error;
    }
  };

  const removeItem = async (id, variantId) => {
    let previousItems = [];
    setItems((current) => {
      previousItems = current;
      return current.filter((item) => cartKey(item) !== cartKey(id, variantId));
    });
    if (!getAuthToken()) return;
    try {
      const cart = await removeCartItem(id, variantId);
      setItems(cart);
      signalCartChange();
    } catch (error) {
      setItems(previousItems);
      throw error;
    }
  };

  const clearCart = () => {
    const previousItems = items;
    setItems([]);
    setAppliedCoupon(null);
    if (getAuthToken()) clearCartApi().then((cart) => { setItems(cart); signalCartChange(); }).catch(() => setItems(previousItems));
  };

  const completePurchase = useCallback(async (productIds = []) => {
    const remaining = removePurchasedItems(itemsRef.current, productIds);
    setAppliedCoupon(null);
    setShippingQuote(null);
    window.sessionStorage.removeItem(COUPON_SESSION_KEY);
    setItems(remaining);
    if (!getAuthToken()) {
      writeGuestSession({ cart: remaining });
      return remaining;
    }
    signalCartChange();
    try {
      const fresh = await fetchCart();
      setItems(fresh);
      return fresh;
    } catch {
      return remaining;
    }
  }, [signalCartChange]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const mrpTotal = items.reduce((sum, item) => sum + (item.mrp || item.price) * item.quantity, 0);
    const discount = mrpTotal - subtotal;
    const shipping = Number(shippingQuote?.shippingAmount || 0);
    const tax = 0;
    const couponDiscount = Math.min(appliedCoupon?.discountAmount || 0, subtotal);
    return { subtotal, mrpTotal, discount, couponDiscount, shipping, shippingPending: !shippingQuote, tax, total: Math.max(0, subtotal + shipping - couponDiscount) };
  }, [appliedCoupon?.discountAmount, items, shippingQuote]);

  const isInCart = (id, variantId) => items.some((item) => cartKey(item) === cartKey(id, variantId));
  const getItemQuantity = (id, variantId) => items.find((item) => cartKey(item) === cartKey(id, variantId))?.quantity || 0;

  return <CartContext.Provider value={{ items, addItem, updateQuantity, removeItem, clearCart, completePurchase, revalidateCart, totals, shippingQuote, setShippingQuote, isInCart, getItemQuantity, appliedCoupon, validateCoupon, clearCoupon }}>{children}</CartContext.Provider>;
}

export function useCartContext() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}



// Provides cart state synchronized with backend cart APIs.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getAuthToken } from "../api/apiClient.js";
import { useAuth } from "./AuthContext.jsx";
import { addCartItem, clearCartApi, fetchCart, removeCartItem, syncCart, updateCartItem } from "../services/cartService.js";
import { validateCoupon as validateCouponApi } from "../services/promotionService.js";
import { readGuestSession, writeGuestSession } from "../utils/guestSession.js";

const CartContext = createContext(null);
const COUPON_SESSION_KEY = "ss_oil_mill_applied_coupon";

function readAppliedCoupon() {
  try { return JSON.parse(window.sessionStorage.getItem(COUPON_SESSION_KEY)) || null; } catch { return null; }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => readGuestSession().data.cart);
  const [appliedCoupon, setAppliedCoupon] = useState(readAppliedCoupon);
  const { authenticated } = useAuth();
  const cartLoadRef = useRef(null);

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
    if (!authenticated) writeGuestSession({ cart: items });
  }, [authenticated, items]);

  useEffect(() => {
    if (!items.length) clearCoupon();
  }, [items.length]);

  const couponProducts = useMemo(() => items.map((item) => ({ product: item._id || item.id, quantity: item.quantity })), [items]);

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
      const existing = items.find((item) => item.id === product.id);
      return existing ? items.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + safeQuantity } : item)) : [...items, { ...product, quantity: safeQuantity }];
    })();
    setItems(nextItems);
    if (!getAuthToken()) return nextItems;
    try {
      const synced = await addCartItem(product._id || product.id, safeQuantity);
      setItems(synced);
      return synced;
    } catch (error) {
      setItems(previousItems);
      throw error;
    }
  };

  const updateQuantity = async (id, quantity) => {
    const safeQuantity = Math.max(1, Number(quantity) || 1);
    const previousItems = items;
    const nextItems = items.map((item) => (item.id === id ? { ...item, quantity: safeQuantity } : item));
    setItems(nextItems);
    if (!getAuthToken()) return nextItems;
    try {
      const synced = await updateCartItem(id, safeQuantity);
      setItems(synced);
      return synced;
    } catch (error) {
      setItems(previousItems);
      throw error;
    }
  };

  const removeItem = (id) => {
    let previousItems = [];
    setItems((current) => {
      previousItems = current;
      return current.filter((item) => item.id !== id);
    });
    if (getAuthToken()) removeCartItem(id).then(setItems).catch(() => setItems(previousItems));
  };

  const clearCart = () => {
    const previousItems = items;
    setItems([]);
    setAppliedCoupon(null);
    if (getAuthToken()) clearCartApi().then(setItems).catch(() => setItems(previousItems));
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const mrpTotal = items.reduce((sum, item) => sum + (item.mrp || item.price) * item.quantity, 0);
    const discount = mrpTotal - subtotal;
    const shipping = subtotal > 999 || subtotal === 0 ? 0 : 80;
    const tax = Math.round(subtotal * 0.05);
    const couponDiscount = Math.min(appliedCoupon?.discountAmount || 0, subtotal);
    return { subtotal, mrpTotal, discount, couponDiscount, shipping, tax, total: Math.max(0, subtotal + shipping + tax - couponDiscount) };
  }, [appliedCoupon?.discountAmount, items]);

  const isInCart = (id) => items.some((item) => item.id === id);
  const getItemQuantity = (id) => items.find((item) => item.id === id)?.quantity || 0;

  return <CartContext.Provider value={{ items, addItem, updateQuantity, removeItem, clearCart, totals, isInCart, getItemQuantity, appliedCoupon, validateCoupon, clearCoupon }}>{children}</CartContext.Provider>;
}

export function useCartContext() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}



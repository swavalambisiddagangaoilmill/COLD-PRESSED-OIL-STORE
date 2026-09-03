// Stores wishlist state synchronized with backend APIs.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getAuthToken } from "../api/apiClient.js";
import { useAuth } from "./AuthContext.jsx";
import { addWishlist, fetchWishlist, removeWishlist } from "../services/wishlistService.js";
import { readGuestSession, writeGuestSession } from "../utils/guestSession.js";
import { useToast } from "../components/features/feedback/ToastProvider.jsx";
import { reconcileGuestWishlist } from "../utils/reconcileGuestCommerce.js";

const WishlistContext = createContext(null);
const WISHLIST_SYNC_KEY = "ss_oil_mill_wishlist_sync";

export function WishlistProvider({ children }) {
  const [items, setItems] = useState(() => readGuestSession().data.wishlist.filter(Boolean));
  const { authenticated } = useAuth();
  const { showToast } = useToast();
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const refreshWishlist = useCallback(async ({ notify = false } = {}) => {
    const wishlist = getAuthToken() ? await fetchWishlist() : await reconcileGuestWishlist(itemsRef.current);
    if (notify && wishlist.length < itemsRef.current.length) showToast("Unavailable products were removed from your Wishlist.", "info", null, { id: "wishlist-cleaned" });
    setItems(wishlist);
    return wishlist;
  }, [showToast]);

  useEffect(() => {
    let active = true;
    if (!getAuthToken()) {
      setItems(readGuestSession().data.wishlist.filter(Boolean));
      return undefined;
    }
    fetchWishlist().then((wishlist) => active && setItems(wishlist)).catch(() => {});
    return () => { active = false; };
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) writeGuestSession({ wishlist: items.filter(Boolean) });
  }, [authenticated, items]);

  useEffect(() => {
    const refresh = () => refreshWishlist({ notify: true }).catch(() => {});
    refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    const onStorage = (event) => { if (event.key === WISHLIST_SYNC_KEY || event.key === "ss_oil_mill_guest_session_v1") refresh(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("storage", onStorage); document.removeEventListener("visibilitychange", onVisibility); };
  }, [authenticated, refreshWishlist]);

  const isWishlisted = (id) => items.some((item) => item?.id === id);

  const addWishlistItem = async (product) => {
    let saved = false;
    let previousItems = [];
    setItems((current) => {
      previousItems = current;
      if (current.some((item) => item?.id === product.id)) return current;
      saved = true;
      return [...current, product];
    });
    if (getAuthToken()) {
      try { const wishlist = await addWishlist(product._id || product.id); setItems(wishlist); window.localStorage.setItem(WISHLIST_SYNC_KEY, String(Date.now())); }
      catch (error) { setItems(previousItems); throw error; }
    }
    return saved;
  };

  const removeWishlistItem = async (id) => {
    let previousItems = [];
    setItems((current) => {
      previousItems = current;
      return current.filter((item) => item.id !== id);
    });
    if (getAuthToken()) {
      try { const wishlist = await removeWishlist(id); setItems(wishlist); window.localStorage.setItem(WISHLIST_SYNC_KEY, String(Date.now())); }
      catch (error) { setItems(previousItems); throw error; }
    }
  };

  const toggleWishlistItem = async (product) => {
    const exists = isWishlisted(product.id);
    if (exists) await removeWishlistItem(product.id);
    else await addWishlistItem(product);
    return !exists;
  };

  const value = useMemo(() => ({ items: items.filter(Boolean), isWishlisted, addWishlistItem, removeWishlistItem, toggleWishlistItem, refreshWishlist }), [items, refreshWishlist]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used within WishlistProvider");
  return context;
}


// Navbar-triggered wishlist mini panel with product links.
import { AnimatePresence, motion } from "framer-motion";
import { Heart, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import SafeImage from "../../common/SafeImage.jsx";
import Button from "../../ui/Button.jsx";
import WishlistToggle from "../product/WishlistToggle.jsx";
import { usePopup } from "../../../context/PopupContext.jsx";
import { useWishlist } from "../../../context/WishlistContext.jsx";
import { formatCurrency } from "../../../utils/formatCurrency.js";

export default function WishlistWidget() {
  const { items } = useWishlist();
  const { activePopup, closePopups } = usePopup();
  const panelRef = useRef(null);
  const open = activePopup === "wishlist";
  const safeItems = Array.isArray(items) ? items.filter((product) => product && typeof product === "object" && product.slug && (product.id || product._id)) : [];

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (event.target.closest("[data-popup-trigger]")) return;
      if (panelRef.current && !panelRef.current.contains(event.target)) closePopups();
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [closePopups, open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.aside ref={panelRef} data-popup-panel="wishlist" initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.98 }} transition={{ duration: 0.22, ease: "easeOut" }} className="fixed right-4 top-20 z-[125] flex max-h-[min(76dvh,620px)] w-[calc(100vw-2rem)] max-w-[420px] flex-col overflow-hidden rounded-[1.5rem] border border-ink/10 bg-white shadow-soft sm:right-6 sm:top-28">
          <div className="flex items-start justify-between gap-4 border-b border-ink/10 p-5">
            <div>
              <span className="grid h-11 w-11 place-items-center rounded-full bg-linen text-leaf"><Heart size={19} fill="currentColor" /></span>
              <h2 className="mt-3 font-serif text-3xl font-semibold">Wishlist</h2>
              <p className="text-sm font-semibold text-ink/45">{safeItems.length} saved products</p>
            </div>
            <button type="button" aria-label="Close wishlist" onClick={closePopups} className="grid h-10 w-10 place-items-center rounded-full bg-linen text-ink transition hover:text-danger"><X size={18} /></button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {safeItems.length === 0 && <div className="rounded-2xl bg-linen p-5 text-center"><p className="font-serif text-2xl font-semibold">No favourites yet</p><p className="mt-2 text-sm leading-6 text-ink/55">Tap any heart to build your pantry shortlist here.</p></div>}
            {safeItems.map((product) => (
              <Link key={product.id || product._id} to={`/product/${product.slug}`} onClick={closePopups} className="group grid grid-cols-[76px_1fr_auto] items-center gap-4 rounded-2xl border border-ink/10 bg-cream p-3 transition hover:border-leaf/30 hover:bg-linen">
                <SafeImage src={product.image} alt={product.name} className="h-20 w-20 rounded-xl object-cover" loading="lazy" />
                <div className="min-w-0"><p className="line-clamp-2 font-serif text-xl font-semibold leading-tight group-hover:text-leaf">{product.name}</p><p className="mt-2 text-sm font-bold text-ink/55">{formatCurrency(product.price)}</p></div>
                <WishlistToggle product={product} className="h-10 w-10" labelPrefix="Remove from wishlist" />
              </Link>
            ))}
          </div>

          <div className="border-t border-ink/10 p-4"><Button to="/shop" className="w-full" onClick={closePopups}>View Wishlist</Button></div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}




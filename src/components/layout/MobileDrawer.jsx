// Renders the MobileDrawer layout element.
import { AnimatePresence, motion } from "framer-motion";
import { Heart, LogOut, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { aboutMenuLinks, categoryMenuLinks, essentialOilLinks, oilMenuLinks } from "../../data/siteData.js";
import { useCart } from "../../hooks/useCart.jsx";
import Button from "../ui/Button.jsx";
import AccordionMenu from "./AccordionMenu.jsx";

export default function MobileDrawer({ open, onClose, onWishlist, onLogout, accountPath = "/login", authenticated = false, isAdmin = false }) {
  const { items } = useCart();
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] bg-ink/45 backdrop-blur-sm xl:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.aside className="flex h-dvh w-screen flex-col overflow-y-auto bg-cream px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))] shadow-soft sm:px-6" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ duration: 0.28, ease: "easeOut" }} onClick={(event) => event.stopPropagation()} aria-label="Mobile menu">
            <div className="flex min-h-12 items-center justify-between">
              <Link to="/" onClick={onClose} className="font-serif text-2xl font-semibold tracking-tight">Swavalambi Siddaganga Oil Mill</Link>
              <button type="button" aria-label="Close menu" className="rounded-full bg-white p-3 transition hover:bg-linen focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf" onClick={onClose}><X size={20} /></button>
            </div>
            <Link to="/shop?focus=search" onClick={onClose} className="mt-6 flex h-12 items-center gap-3 rounded-2xl bg-white px-4 text-sm font-semibold text-ink/65 shadow-sm"><Search size={18} />Search oils</Link>
            <nav className="mt-4" aria-label="Drawer navigation">
              <Link to="/" onClick={onClose} className="block border-b border-ink/10 py-4 text-lg font-semibold">Home</Link>
              <AccordionMenu title="Shop" href="/shop" state={{ resetShop: true }} links={categoryMenuLinks.slice(0, 4)} onClose={onClose} />
              <AccordionMenu title="Cold Pressed Oils" href="/shop?q=Cold%20Pressed%20Oils&focus=search" state={{ resetShop: true }} links={oilMenuLinks} onClose={onClose} />
              <AccordionMenu title="Essential Oils" href="/shop?q=Essential%20Oils&focus=search" state={{ resetShop: true }} links={essentialOilLinks} onClose={onClose} />
              <AccordionMenu title="About" href="/about/story" links={aboutMenuLinks} onClose={onClose} />
              <Link to="/contact" onClick={onClose} className="block border-b border-ink/10 py-4 text-lg font-semibold">Contact</Link>
            </nav>
            <div className="mt-6 grid gap-3 pb-2">
              <Link to={accountPath} onClick={onClose} className="flex items-center gap-3 rounded-2xl bg-white p-4 font-semibold shadow-sm"><UserRound size={19} fill={authenticated ? "currentColor" : "none"} className="text-leaf" />Account{isAdmin && <span className="ml-auto rounded-full bg-leaf/10 px-2 py-1 text-xs font-bold text-leaf">Admin</span>}</Link>
              <button type="button" data-popup-trigger="wishlist" onClick={() => { onWishlist?.(); onClose(); }} className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left font-semibold shadow-sm"><Heart size={19} className="text-leaf" />Wishlist</button>
              <Link to="/cart" onClick={onClose} className="flex items-center justify-between rounded-2xl bg-white p-4 font-semibold shadow-sm"><span className="flex items-center gap-3"><ShoppingBag size={19} className="text-leaf" />Cart</span>{count > 0 && <span className="rounded-full bg-leaf px-2 py-1 text-xs font-bold text-white">{count}</span>}</Link>
              {authenticated && <button type="button" onClick={() => { onClose(); onLogout?.(); }} className="flex items-center gap-3 rounded-2xl bg-danger/10 p-4 text-left font-semibold text-danger shadow-sm transition hover:bg-danger hover:text-white"><LogOut size={19} />Logout</button>}
            </div>
            <div className="mt-auto pt-4"><Button to="/shop" className="w-full" onClick={onClose}>Shop Oils</Button></div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
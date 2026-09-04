// Shared cart-aware Add to Cart button with duplicate confirmation.
import { AnimatePresence, motion } from "framer-motion";
import { Check, ShoppingBag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "../feedback/ToastProvider.jsx";
import { useCart } from "../../../hooks/useCart.jsx";
import Button from "../../ui/Button.jsx";
import { customerMessage } from "../../../utils/customerMessage.js";

export default function AddToCartButton({ product, quantity = 1, className = "", iconSize = 18, onAdded }) {
  const { addItem, updateQuantity, getItemQuantity } = useCart();
  const { showToast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addedRecently, setAddedRecently] = useState(false);
  const [pulse, setPulse] = useState(false);
  const inFlight = useRef(false);
  const resetTimer = useRef(null);
  const cancelRef = useRef(null);
  const selectedQuantity = Math.max(1, Number(quantity) || 1);
  const cartQuantity = getItemQuantity(product.id, product.variantId);
  const inCart = cartQuantity > 0;
  const totalQuantity = cartQuantity + selectedQuantity;

  const runCartUpdate = async ({ addMore = false } = {}) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setLoading(true);
    try {
      if (addMore && inCart) await updateQuantity(product.id, totalQuantity, product.variantId);
      else await addItem(product, selectedQuantity);
      setPulse(true);
      setAddedRecently(true);
      window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setAddedRecently(false), 1400);
      showToast(addMore ? "Cart updated" : "Added to Cart", "cart", { label: "View Cart", to: "/cart" }, { id: `cart-${product.id}` });
      window.setTimeout(() => setPulse(false), 420);
      onAdded?.({ quantity: addMore && inCart ? totalQuantity : selectedQuantity, addedQuantity: selectedQuantity, updated: addMore && inCart });
      return true;
    } catch (error) {
      showToast(customerMessage(error, "Unable to update your cart."), "error", null, { id: `cart-error-${product.id}` });
      return false;
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (inFlight.current || addedRecently) return;
    if (inCart) {
      setConfirmOpen(true);
      return;
    }
    runCartUpdate();
  };

  useEffect(() => {
    if (!confirmOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setConfirmOpen(false);
    };
    window.setTimeout(() => cancelRef.current?.focus(), 40);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmOpen]);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  return (
    <div className="relative">
      <motion.div animate={{ scale: pulse ? [1, 1.035, 1] : 1 }} transition={{ duration: 0.35 }}>
        <Button disabled={loading || product.stock === 0} loading={loading} className={className} onClick={handleClick}>
          {addedRecently ? <Check size={iconSize} /> : <ShoppingBag size={iconSize} />}
          {addedRecently ? "Added to Cart" : "Add to Cart"}
        </Button>
      </motion.div>
      <AnimatePresence>
        {confirmOpen && (
          <motion.div className="fixed inset-0 z-[160] grid place-items-center bg-ink/25 px-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => !loading && setConfirmOpen(false)}>
            <motion.div role="dialog" aria-modal="true" aria-labelledby={`cart-confirm-${product.id}`} className="w-full max-w-sm rounded-[1.75rem] bg-white p-5 shadow-soft" initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }} transition={{ duration: 0.2 }} onMouseDown={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-linen text-leaf"><ShoppingBag size={19} /></span>
                <button type="button" aria-label="Close cart update confirmation" disabled={loading} onClick={() => setConfirmOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-linen text-ink transition hover:text-danger disabled:opacity-50"><X size={16} /></button>
              </div>
              <h2 id={`cart-confirm-${product.id}`} className="mt-4 font-serif text-3xl font-semibold">Already in your cart</h2>
              <p className="mt-3 leading-7 text-ink/65">This product is already in your cart with quantity {cartQuantity}. Are you sure you want to add it again?</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button ref={cancelRef} type="button" disabled={loading} onClick={() => setConfirmOpen(false)} className="inline-flex min-h-12 items-center justify-center rounded-full bg-linen px-5 text-sm font-bold text-ink transition hover:text-leaf disabled:opacity-50">Cancel</button>
                <button type="button" disabled={loading} onClick={async () => { if (await runCartUpdate({ addMore: true })) setConfirmOpen(false); }} className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-5 text-sm font-bold text-white transition hover:bg-leaf disabled:opacity-60">{loading ? "Adding..." : "Add Again"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}



// Renders OrderSummary for cart and checkout flows.
import { useCart } from "../../../hooks/useCart.jsx";
import { formatCurrency } from "../../../utils/formatCurrency.js";
import CartSummary from "./CartSummary.jsx";

export default function OrderSummary() {
  const { items, totals } = useCart();
  const safeItems = Array.isArray(items) ? items.filter((item) => item && typeof item === "object" && (item.id || item._id)) : [];
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-ink/10 bg-white p-6">
        <h2 className="font-serif text-3xl font-semibold">Your Oils</h2>
        <div className="mt-5 space-y-4">
          {safeItems.map((item) => (
            <div key={item.cartKey || `${item.id || item._id}:${item.variantId || ""}`} className="flex gap-4">
              <img src={item.image} alt={item.name} className="h-20 w-20 rounded-2xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-ink/55">Qty {item.quantity} Â· {item.volume}</p>
                <p className="mt-1 font-semibold">{formatCurrency(item.price * item.quantity)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <CartSummary totals={totals} showCheckout={false} />
    </div>
  );
}




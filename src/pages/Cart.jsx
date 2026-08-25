// Renders the Cart page experience.
import { Trash2 } from "lucide-react";
import Breadcrumb from "../components/common/Breadcrumb.jsx";
import QuantitySelector from "../components/common/QuantitySelector.jsx";
import CartSummary from "../components/features/cart/CartSummary.jsx";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";
import { useCart } from "../hooks/useCart.jsx";
import { formatCurrency } from "../utils/formatCurrency.js";

export default function Cart() {
  const { items, updateQuantity, removeItem, totals } = useCart();
  return (
    <>
      <Breadcrumb items={[{ label: "Cart" }]} />
      <section className="section-padding">
        <Container>
          <h1 className="font-serif text-5xl font-semibold lg:text-6xl">Your Cart</h1>
          {items.length === 0 ? (
            <div className="mt-8 rounded-3xl bg-white p-10 text-center">
              <p className="text-lg text-ink/60">Your cart is ready for something beautiful.</p>
              <Button to="/shop" className="mt-6">Shop Oils</Button>
            </div>
          ) : (
            <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
              <div className="space-y-4">
                {items.map((item) => (
                  <article key={item.id} className="grid gap-4 rounded-3xl border border-ink/10 bg-white p-4 shadow-sm sm:grid-cols-[128px_1fr_auto]">
                    <img src={item.image} alt={item.name} className="h-32 w-full rounded-2xl object-cover sm:w-32" />
                    <div className="min-w-0">
                      <h2 className="font-serif text-2xl font-semibold">{item.name}</h2>
                      <p className="mt-2 text-sm text-ink/55">{item.variantName || item.volume}{item.sku ? ` · ${item.sku}` : ""}</p>
                      <p className="mt-3 font-bold">{formatCurrency(item.price)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                      <QuantitySelector value={item.quantity} onChange={(value) => updateQuantity(item.id, value)} />
                      <button type="button" aria-label={`Remove ${item.name}`} onClick={() => removeItem(item.id)} className="rounded-full bg-linen p-3 text-ink/60 transition hover:text-danger"><Trash2 size={18} /></button>
                    </div>
                  </article>
                ))}
              </div>
              <CartSummary totals={totals} />
            </div>
          )}
        </Container>
      </section>
    </>
  );
}



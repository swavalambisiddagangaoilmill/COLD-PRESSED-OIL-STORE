// Renders the Checkout page experience.
import Breadcrumb from "../components/common/Breadcrumb.jsx";
import CheckoutForm from "../components/features/cart/CheckoutForm.jsx";
import OrderSummary from "../components/features/cart/OrderSummary.jsx";
import Container from "../components/ui/Container.jsx";
import { useCart } from "../hooks/useCart.jsx";
import Button from "../components/ui/Button.jsx";
import { useLocation } from "react-router-dom";
import { resumablePendingPayment } from "../utils/checkoutSession.js";

export default function Checkout() {
  const { items } = useCart();
  const location = useLocation();
  const resumingPayment = Boolean(resumablePendingPayment(location.search));
  return (
    <>
      <Breadcrumb items={[{ label: "Checkout" }]} />
      <section className="section-padding">
        <Container>
          {items.length === 0 && !resumingPayment ? (
            <div className="rounded-3xl bg-white p-10 text-center">
              <h1 className="font-serif text-4xl font-semibold">Your cart is empty</h1>
              <Button to="/shop" className="mt-6">Return to Shop</Button>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
              <CheckoutForm />
              <OrderSummary />
            </div>
          )}
        </Container>
      </section>
    </>
  );
}



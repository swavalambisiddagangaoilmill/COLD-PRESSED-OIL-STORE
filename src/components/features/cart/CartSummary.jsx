// Renders CartSummary for cart and checkout flows.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../../../hooks/useCart.jsx";
import { formatCurrency } from "../../../utils/formatCurrency.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

export default function CartSummary({ totals, showCheckout = true }) {
  const { appliedCoupon, validateCoupon, clearCoupon } = useCart();
  const [coupon, setCoupon] = useState(appliedCoupon?.code || "");
  const [couponMessage, setCouponMessage] = useState("");
  const [couponMessageType, setCouponMessageType] = useState("");
  const [checking, setChecking] = useState(false);
  const minimumOrder = 500;
  const belowMinimum = totals.subtotal > 0 && totals.subtotal < minimumOrder;

  const applyCoupon = async () => {
    const code = coupon.trim();
    if (!code) {
      clearCoupon();
      setCouponMessage("Enter a coupon code first.");
      setCouponMessageType("error");
      return;
    }
    if (appliedCoupon?.code === code.toUpperCase()) {
      setCouponMessage("This coupon is already applied.");
      setCouponMessageType("success");
      return;
    }
    setChecking(true);
    setCouponMessage("");
    try {
      const result = await validateCoupon(code);
      setCoupon(result.code);
      setCouponMessage(result.message || "Coupon applied successfully.");
      setCouponMessageType("success");
    } catch (err) {
      clearCoupon();
      setCouponMessage(err.message || "This coupon cannot be applied right now.");
      setCouponMessageType("error");
    } finally {
      setChecking(false);
    }
  };

  return (
    <aside className="rounded-3xl border border-ink/10 bg-white p-6 shadow-sm">
      <h2 className="font-serif text-3xl font-semibold">Order Summary</h2>
      <div className="mt-6 space-y-4 text-sm">
        <div className="flex justify-between"><span className="text-ink/60">Subtotal</span><span className="font-semibold">{formatCurrency(totals.mrpTotal)}</span></div>
        {totals.discount > 0 && <div className="flex justify-between"><span className="text-ink/60">Offer discount</span><span className="font-semibold text-leaf">-{formatCurrency(totals.discount)}</span></div>}
        {totals.couponDiscount > 0 && <div className="flex justify-between"><span className="text-ink/60">Coupon ({appliedCoupon?.code})</span><span className="font-semibold text-leaf">-{formatCurrency(totals.couponDiscount)}</span></div>}
        <div className="flex justify-between"><span className="text-ink/60">Shipping</span><span className="font-semibold">{totals.shipping ? formatCurrency(totals.shipping) : "Free"}</span></div>
        <div className="flex justify-between"><span className="text-ink/60">Estimated tax</span><span className="font-semibold">{formatCurrency(totals.tax)}</span></div>
      </div>
      <div className="mt-6 grid gap-2">
        <div className="flex gap-2"><Input className="flex-1" placeholder="Coupon code" aria-label="Coupon code" value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} /><Button type="button" variant="outline" className="h-[52px] px-4" onClick={applyCoupon} disabled={checking || appliedCoupon?.code === coupon.trim().toUpperCase()}>{checking ? "Checking" : appliedCoupon?.code === coupon.trim().toUpperCase() ? "Applied" : "Apply"}</Button></div>
        {appliedCoupon && <button type="button" className="justify-self-start text-sm font-bold text-clay hover:text-danger" onClick={() => { clearCoupon(); setCoupon(""); setCouponMessage("Coupon removed."); setCouponMessageType("info"); }}>Remove coupon</button>}
        {couponMessage && couponMessageType === "success" && (
          <p role="status" className="flex items-center gap-2 rounded-xl border border-leaf/20 bg-leaf/10 px-3 py-2.5 text-sm font-bold text-leaf">
            <span aria-hidden="true" className="text-base">🎉</span>
            <span>{couponMessage}</span>
          </p>
        )}
        {couponMessage && couponMessageType !== "success" && <p className={`text-sm font-semibold ${couponMessageType === "error" ? "text-danger" : "text-ink/60"}`}>{couponMessage}</p>}
        {belowMinimum && <p className="text-sm font-semibold text-clay">Minimum order is {formatCurrency(minimumOrder)}.</p>}
        <p className="text-sm text-ink/55">Delivery estimate: 2-5 business days after confirmation.</p>
      </div>
      <div className="mt-6 flex justify-between border-t border-ink/10 pt-5 text-lg font-bold"><span>Total</span><span>{formatCurrency(totals.total)}</span></div>
      {showCheckout && <Button to="/checkout" className="mt-6 w-full">Checkout</Button>}
      {showCheckout && <Link to="/shop" className="mt-4 block text-center text-sm font-semibold text-leaf">Continue shopping</Link>}
    </aside>
  );
}

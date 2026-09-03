// Renders CheckoutForm for cart and checkout flows.
import { load as loadCashfree } from "@cashfreepayments/cashfree-js";
import { CreditCard, Home, Truck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAuthToken } from "../../../api/apiClient.js";
import { createOrder, createPaymentIntent, getShippingQuote, verifyPayment } from "../../../services/checkoutService.js";
import { fetchAccountProfile } from "../../../services/accountService.js";
import { useCart } from "../../../hooks/useCart.jsx";
import { formatCurrency } from "../../../utils/formatCurrency.js";
import { writeGuestSession } from "../../../utils/guestSession.js";
import { checkoutMessage } from "../../../utils/customerMessage.js";
import { useToast } from "../feedback/ToastProvider.jsx";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

const cashfreeLoaders = new Map();

function loadCashfreeCheckout(mode) {
  if (!cashfreeLoaders.has(mode)) {
    const loader = loadCashfree({ mode }).catch((error) => {
      cashfreeLoaders.delete(mode);
      throw error;
    });
    cashfreeLoaders.set(mode, loader);
  }
  return cashfreeLoaders.get(mode);
}

function formatOrderForSuccess(order, shippingAddress, items, total, profile) {
  return {
    _id: order?._id || `VEL-${Date.now().toString().slice(-6)}`,
    id: order?._id || `VEL-${Date.now().toString().slice(-6)}`,
    createdAt: order?.createdAt || new Date().toISOString(),
    date: new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order?.createdAt || Date.now())),
    paymentStatus: order?.paymentStatus || "pending",
    paymentMethod: order?.paymentMethod || "cod",
    customerName: profile?.name || shippingAddress.fullName,
    customerEmail: profile?.email || "",
    customerPhone: profile?.phone || shippingAddress.phone,
    user: profile ? { name: profile.name, email: profile.email, phone: profile.phone } : undefined,
    shippingAddress,
    billingAddress: shippingAddress,
    items,
    products: order?.products || items,
    productSubtotal: Number(order?.productSubtotal ?? items.reduce((sum, item) => sum + Number(item.basePrice ?? item.price ?? 0) * Number(item.quantity || 1), 0)),
    offerDiscount: Number(order?.offerDiscount ?? 0),
    subtotal: Number(order?.subtotal ?? items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0)),
    shippingAmount: Number(order?.shippingAmount || 0),
    couponDiscount: Number(order?.couponDiscount || 0),
    total: order?.totalAmount ?? total,
    totalAmount: order?.totalAmount ?? total,
    estimatedDelivery: "2-5 business days",
  };
}

export default function CheckoutForm() {
  const navigate = useNavigate();
  const { items, totals, completePurchase, revalidateCart, appliedCoupon, setShippingQuote } = useCart();
  const { showToast, showCritical } = useToast();
  const formRef = useRef(null);
  const submissionInFlightRef = useRef(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [profile, setProfile] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("online");
  const [processingStep, setProcessingStep] = useState("");
  const [error, setError] = useState("");
  const [pin, setPin] = useState("");
  const [shippingLoading, setShippingLoading] = useState(false);

  const processing = Boolean(processingStep);
  const codAvailable = items.every((item) => item.codEnabled !== false);
  const onlineAvailable = items.every((item) => item.onlinePaymentEnabled !== false);

  useEffect(() => {
    let active = true;
    if (!getAuthToken()) return undefined;
    fetchAccountProfile().then((data) => {
      if (!active) return;
      setProfile(data.user);
      setSavedAddresses(data.user?.addresses || []);
      if (formRef.current?.elements?.email) formRef.current.elements.email.value = data.user?.email || "";
    }).catch(() => {});
    return () => { active = false; };
  }, []);


  useEffect(() => {
    if (!onlineAvailable && paymentMethod !== "cod") setPaymentMethod(codAvailable ? "cod" : "online");
  }, [codAvailable, onlineAvailable, paymentMethod]);
  useEffect(() => {
    if (!/^\d{6}$/.test(pin) || !items.length || !getAuthToken()) { setShippingQuote(null); return undefined; }
    let active = true;
    setShippingLoading(true);
    const timer = window.setTimeout(() => getShippingQuote({ products: items.map((item) => ({ product: item._id || item.id, variant: item.variantId || undefined, quantity: item.quantity })), deliveryPincode: pin, paymentMethod: paymentMethod === "cod" ? "cod" : "cashfree", couponCode: appliedCoupon?.code }).then((data) => active && setShippingQuote(data.quote)).catch((err) => { if (active) { setShippingQuote(null); setError(err.message || "Shipping is unavailable for this PIN code."); } }).finally(() => active && setShippingLoading(false)), 400);
    return () => { active = false; window.clearTimeout(timer); };
  }, [appliedCoupon?.code, items, paymentMethod, pin, setShippingQuote]);
  const applyAddress = (address) => {
    const form = formRef.current;
    if (!form) return;
    const [firstName = "", ...lastParts] = (address.fullName || "").split(" ");
    form.elements.firstName.value = firstName;
    form.elements.lastName.value = lastParts.join(" ");
    form.elements.phone.value = address.phone || "";
    form.elements.street.value = address.street || "";
    form.elements.city.value = address.city || "";
    form.elements.state.value = address.state || "";
    form.elements.pin.value = address.postalCode || "";
    setPin(address.postalCode || "");
  };

  const getOrderPayload = (formElement, checkoutItems = items) => {
    const form = new FormData(formElement);
    const shippingAddress = {
      fullName: `${form.get("firstName")} ${form.get("lastName")}`.trim(),
      phone: form.get("phone"),
      street: form.get("street"),
      city: form.get("city"),
      state: form.get("state"),
      postalCode: form.get("pin"),
      country: "India",
    };
    return {
      order: {
        products: checkoutItems.map((item) => ({ product: item._id || item.id, variant: item.variantId || undefined, quantity: item.quantity })),
        shippingAddress,
        paymentMethod: paymentMethod === "cod" ? "cod" : "cashfree",
        couponCode: appliedCoupon?.code,
      },
      customer: {
        name: shippingAddress.fullName || profile?.name || "",
        email: form.get("email") || profile?.email || "",
        phone: shippingAddress.phone || profile?.phone || "",
      },
    };
  };

  const finishOrder = async (order, shippingAddress, purchasedItems, setCheckoutStage) => {
    writeGuestSession({ checkoutDraft: {} });
    setCheckoutStage("cart_cleanup");
    await completePurchase(purchasedItems.map((item) => item._id || item.id));
    showToast("Order placed successfully.", "success", null, { id: `order-${order?._id || "complete"}` });
    navigate("/order/success", { state: { order: formatOrderForSuccess(order, shippingAddress, purchasedItems, totals.total, profile) } });
  };

  const submitCodOrder = async (orderPayload, purchasedItems, setCheckoutStage) => {
    setProcessingStep("cod");
    setCheckoutStage("order_creation");
    const response = await createOrder({ ...orderPayload.order, paymentMethod: "cod" });
    await finishOrder(response.order, orderPayload.order.shippingAddress, purchasedItems, setCheckoutStage);
  };


  const submitCashfreeOrder = async (orderPayload, purchasedItems, setCheckoutStage) => {
    setProcessingStep("preparing");
    setCheckoutStage("payment_intent");
    const { payment } = await createPaymentIntent({ order: orderPayload.order });
    if (!payment?.paymentSessionId || !payment?.orderId) throw new Error("Cashfree is not configured. Please choose Cash on delivery or try again later.");
    const mode = payment.environment === "production" ? "production" : "sandbox";
    setCheckoutStage("cashfree_initialization");
    const cashfree = await loadCashfreeCheckout(mode);
    if (!cashfree) throw new Error("Unable to load Cashfree Checkout. Please try again.");
    setCheckoutStage("cashfree_checkout");
    const result = await cashfree.checkout({ paymentSessionId: payment.paymentSessionId, redirectTarget: "_modal" });
    if (result?.error) {
      setCheckoutStage("payment_cancelled");
      throw new Error("Payment was not completed. Your cart is unchanged.");
    }
    setProcessingStep("verifying");
    setCheckoutStage("payment_verification");
    const verified = await verifyPayment({ cashfreeOrderId: payment.orderId });
    await finishOrder(verified.order, orderPayload.order.shippingAddress, purchasedItems, setCheckoutStage);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (processing || submissionInFlightRef.current) return;
    if (!getAuthToken()) {
      navigate("/login", { state: { from: "/checkout" } });
      return;
    }
    submissionInFlightRef.current = true;
    setError("");
    let checkoutStage = "checkout_processing";
    const setCheckoutStage = (stage) => { checkoutStage = stage; };
    try {
      setCheckoutStage("cart_preflight");
      const validated = await revalidateCart({ notify: true });
      if (!validated.items.length) { showToast("Your cart has no available products.", "warning", null, { id: "checkout-empty" }); return; }
      if (validated.changed) return;
      const codAllowed = validated.items.every((item) => item.codEnabled !== false);
      const onlineAllowed = validated.items.every((item) => item.onlinePaymentEnabled !== false);
      if (paymentMethod === "cod" && !codAllowed) { setError("Cash on delivery is not available for one or more products in your cart."); return; }
      if (paymentMethod !== "cod" && !onlineAllowed) { setError("Online payment is not available for one or more products in your cart."); return; }
      setCheckoutStage("checkout_processing");
      const orderPayload = getOrderPayload(formElement, validated.items);
      if (paymentMethod === "cod") await submitCodOrder(orderPayload, validated.items, setCheckoutStage);
      else await submitCashfreeOrder(orderPayload, validated.items, setCheckoutStage);
    } catch (err) {
      const sourceError = err instanceof Error ? err : new Error("Checkout processing failed.");
      const contextualError = Object.assign(new Error(sourceError.message, { cause: sourceError }), {
        status: sourceError.status,
        statusCode: sourceError.statusCode,
        code: sourceError.code,
        isNetworkError: sourceError.isNetworkError,
        checkoutStage,
      });
      showCritical("Checkout could not be completed", checkoutMessage(contextualError), { action: { label: "Review Cart", to: "/cart" } });
    } finally {
      submissionInFlightRef.current = false;
      setProcessingStep("");
    }
  };

  const buttonText = processingStep === "preparing" ? "Preparing Payment..." : processingStep === "verifying" ? "Verifying Payment..." : paymentMethod === "cod" ? "Place Order" : "Pay Now & Place Order";
  const paymentCardClass = (value, disabled = false) => `flex ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} items-center justify-between rounded-2xl border p-4 font-semibold transition ${paymentMethod === value ? "border-leaf bg-leaf/5" : "border-ink/10 bg-white hover:border-leaf/30"}`;

  return (
    <form ref={formRef} className="rounded-3xl border border-ink/10 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
      <h1 className="font-serif text-4xl font-semibold">Checkout</h1>
      <p className="mt-3 text-sm font-semibold text-ink/55">Order total: {formatCurrency(totals.total)}</p>
      {error && <p className="mt-5 rounded-2xl bg-linen p-4 text-sm font-semibold text-danger">{error}</p>}
      {savedAddresses.length > 0 && (
        <div className="mt-6 rounded-2xl bg-linen p-4">
          <p className="text-sm font-bold text-ink/65">Use a saved address</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {savedAddresses.map((address) => (
              <button key={address._id} type="button" onClick={() => applyAddress(address)} className="rounded-xl bg-white p-3 text-left text-sm font-semibold text-ink/65 transition hover:text-leaf">
                {address.label || "Address"}{address.isDefault ? " - Default" : ""}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <Input label="First name" name="firstName" required />
        <Input label="Last name" name="lastName" required />
        <Input label="Email" name="email" type="email" defaultValue={profile?.email || ""} required />
        <Input label="Phone" name="phone" type="tel" required />
      </div>
      <div className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Home size={20} /> Shipping Address</h2>
        <div className="grid gap-5">
          <Input label="Street address" name="street" required />
          <div className="grid gap-5 sm:grid-cols-3">
            <Input label="City" name="city" required />
            <Input label="State" name="state" required />
            <Input label="PIN code" name="pin" inputMode="numeric" maxLength="6" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} required />
          </div>
        </div>
      </div>
      <div className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Truck size={20} /> Shipping</h2>
        <div className="flex items-center justify-between rounded-2xl border border-leaf/30 bg-leaf/5 p-4"><span className="font-semibold">Shipping</span><span className="font-bold">{shippingLoading ? "Calculating…" : totals.shippingPending ? "Enter PIN code" : formatCurrency(totals.shipping)}</span></div>
      </div>
      <div className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><CreditCard size={20} /> Payment</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={paymentCardClass("online", !onlineAvailable)}>
            <span>UPI / Cards</span>
            <input type="radio" name="payment" value="online" checked={paymentMethod === "online"} disabled={!onlineAvailable} onChange={() => onlineAvailable && setPaymentMethod("online")} className="ml-3" />
          </label>
          <label className={paymentCardClass("cod", !codAvailable)}>
            <span>Cash on delivery</span>
            <input type="radio" name="payment" value="cod" checked={paymentMethod === "cod"} disabled={!codAvailable} onChange={() => codAvailable && setPaymentMethod("cod")} className="ml-3" />
          </label>
        </div>
      </div>
      <label className="mt-6 flex items-start gap-3 text-sm leading-6 text-ink/65"><input type="checkbox" required className="mt-1" /><span>I agree to the <Link to="/legal/terms" onClick={(event) => event.stopPropagation()} className="font-bold text-leaf underline-offset-2 hover:underline">Terms & Conditions</Link>, <Link to="/legal/privacy" onClick={(event) => event.stopPropagation()} className="font-bold text-leaf underline-offset-2 hover:underline">Privacy Policy</Link>, <Link to="/legal/refund" onClick={(event) => event.stopPropagation()} className="font-bold text-leaf underline-offset-2 hover:underline">Refund Policy</Link>, and <Link to="/legal/cancellation" onClick={(event) => event.stopPropagation()} className="font-bold text-leaf underline-offset-2 hover:underline">Cancellation Policy</Link>.</span></label>
      <Button type="submit" className="mt-8 w-full" disabled={processing}>{buttonText}</Button>
    </form>
  );
}










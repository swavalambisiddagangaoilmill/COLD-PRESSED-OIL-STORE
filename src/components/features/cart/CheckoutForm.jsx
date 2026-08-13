// Renders CheckoutForm for cart and checkout flows.
import { CreditCard, Home, Truck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAuthToken } from "../../../api/apiClient.js";
import { checkUpiQrPayment, createOrder, createPaymentIntent, createUpiQrPayment, verifyPayment } from "../../../services/checkoutService.js";
import { fetchAccountProfile } from "../../../services/accountService.js";
import { useCart } from "../../../hooks/useCart.jsx";
import { useServiceStatus } from "../../../hooks/useServiceStatus.js";
import { formatCurrency } from "../../../utils/formatCurrency.js";
import { writeGuestSession } from "../../../utils/guestSession.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
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
    subtotal: items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0),
    shippingAmount: Number(order?.shippingAmount || 0),
    couponDiscount: Number(order?.couponDiscount || 0),
    total: order?.totalAmount || total,
    totalAmount: order?.totalAmount || total,
    estimatedDelivery: "2-5 business days",
  };
}

export default function CheckoutForm() {
  const navigate = useNavigate();
  const { items, totals, clearCart, appliedCoupon } = useCart();
  const serviceStatus = useServiceStatus();
  const formRef = useRef(null);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [profile, setProfile] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("online");
  const [processingStep, setProcessingStep] = useState("");
  const [qrCheckout, setQrCheckout] = useState(null);
  const [qrCountdown, setQrCountdown] = useState(0);
  const [error, setError] = useState("");

  const processing = Boolean(processingStep);
  const codAvailable = items.every((item) => item.codEnabled !== false);
  const paymentService = serviceStatus.services?.razorpay;
  const onlineServiceAvailable = paymentService?.available !== false;
  const onlineUnavailableMessage = paymentService?.message || "Online payments are temporarily unavailable.";
  const onlineAvailable = onlineServiceAvailable && items.every((item) => item.onlinePaymentEnabled !== false);

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
    if (!qrCheckout?.expiresAt || qrCheckout.status === "paid") return undefined;
    const update = () => {
      const remaining = Math.max(0, Math.floor((new Date(qrCheckout.expiresAt).getTime() - Date.now()) / 1000));
      setQrCountdown(remaining);
      if (remaining === 0) setQrCheckout((current) => current ? { ...current, status: "expired" } : current);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [qrCheckout?.expiresAt, qrCheckout?.status]);

  useEffect(() => {
    if (!qrCheckout?.id || qrCheckout.status !== "created") return undefined;
    let active = true;
    const timer = window.setInterval(async () => {
      try {
        const result = await checkUpiQrPayment(qrCheckout.id);
        if (!active) return;
        if (result.status === "paid" && result.order) {
          setQrCheckout((current) => current ? { ...current, status: "paid" } : current);
          finishOrder(result.order, qrCheckout.shippingAddress);
        } else if (result.status === "expired") {
          setQrCheckout((current) => current ? { ...current, status: "expired" } : current);
        }
      } catch {
        // Backend verification remains the source of truth while the QR is open.
      }
    }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [qrCheckout?.id, qrCheckout?.status]);
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
  };

  const getOrderPayload = (formElement) => {
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
        products: items.map((item) => ({ product: item._id || item.id, quantity: item.quantity })),
        shippingAddress,
        paymentMethod: paymentMethod === "cod" ? "cod" : "upi",
        couponCode: appliedCoupon?.code,
      },
      customer: {
        name: shippingAddress.fullName || profile?.name || "",
        email: form.get("email") || profile?.email || "",
        phone: shippingAddress.phone || profile?.phone || "",
      },
    };
  };

  const finishOrder = (order, shippingAddress) => {
    writeGuestSession({ checkoutDraft: {} });
    clearCart();
    navigate("/order/success", { state: { order: formatOrderForSuccess(order, shippingAddress, items, totals.total, profile) } });
  };

  const submitCodOrder = async (orderPayload) => {
    setProcessingStep("cod");
    const response = await createOrder({ ...orderPayload.order, paymentMethod: "cod" });
    finishOrder(response.order, orderPayload.order.shippingAddress);
  };


  const submitQrOrder = async (orderPayload) => {
    setProcessingStep("qr");
    const response = await createUpiQrPayment({ order: orderPayload.order });
    setQrCheckout({ ...response.qr, status: "created", shippingAddress: orderPayload.order.shippingAddress });
  };
  const submitRazorpayOrder = async (orderPayload) => {
    setProcessingStep("preparing");
    const loaded = await loadRazorpayCheckout();
    if (!loaded) throw new Error("Unable to load Razorpay Checkout. Please try again.");

    const { payment } = await createPaymentIntent({ order: orderPayload.order });
    if (!payment?.key || !window.Razorpay) throw new Error("Razorpay is not configured. Please choose Cash on delivery or try again later.");

    await new Promise((resolve, reject) => {
      let settled = false;
      const checkout = new window.Razorpay({
        key: payment.key,
        amount: payment.amount,
        currency: payment.currency || "INR",
        name: "Swavalambi Siddaganga Oil Mill",
        description: "Cold pressed oil order",
        order_id: payment.id,
        prefill: orderPayload.customer,
        theme: { color: "#FF9933" },
        handler: async (response) => {
          if (settled) return;
          settled = true;
          try {
            setProcessingStep("verifying");
            const verified = await verifyPayment({
              order: orderPayload.order,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            finishOrder(verified.order, orderPayload.order.shippingAddress);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        modal: {
          ondismiss: () => {
            if (settled) return;
            settled = true;
            reject(new Error("Payment was cancelled. Your cart has not been changed."));
          },
        },
      });
      checkout.on("payment.failed", (response) => {
        if (settled) return;
        settled = true;
        reject(new Error(response.error?.description || "Payment failed. Your cart has not been changed."));
      });
      checkout.open();
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (processing) return;
    if (!getAuthToken()) {
      navigate("/login", { state: { from: "/checkout" } });
      return;
    }
    if (paymentMethod === 'cod' && !codAvailable) { setError('Cash on delivery is not available for one or more products in your cart.'); return; }
    if (paymentMethod !== 'cod' && !onlineAvailable) { setError(onlineServiceAvailable ? 'Online payment is not available for one or more products in your cart.' : onlineUnavailableMessage); return; }
    const orderPayload = getOrderPayload(event.currentTarget);
    setError("");
    try {
      if (paymentMethod === "cod") await submitCodOrder(orderPayload);
      else if (paymentMethod === "upi_qr") await submitQrOrder(orderPayload);
      else await submitRazorpayOrder(orderPayload);
    } catch (err) {
      setError(err.message || "Unable to complete payment. Please try again.");
    } finally {
      setProcessingStep("");
    }
  };

  const buttonText = processingStep === "preparing" ? "Preparing Payment..." : processingStep === "verifying" ? "Verifying Payment..." : processingStep === "qr" ? "Generating QR..." : paymentMethod === "cod" ? "Place Order" : paymentMethod === "upi_qr" ? "Generate UPI QR" : "Pay Now & Place Order";
  const paymentCardClass = (value, disabled = false) => `flex ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} items-center justify-between rounded-2xl border p-4 font-semibold transition ${paymentMethod === value ? "border-leaf bg-leaf/5" : "border-ink/10 bg-white hover:border-leaf/30"}`;
  const qrMinutes = String(Math.floor(qrCountdown / 60)).padStart(2, "0");
  const qrSeconds = String(qrCountdown % 60).padStart(2, "0");

  return (
    <form ref={formRef} className="rounded-3xl border border-ink/10 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
      <h1 className="font-serif text-4xl font-semibold">Checkout</h1>
      <p className="mt-3 text-sm font-semibold text-ink/55">Order total: {formatCurrency(totals.total)}</p>
      {error && <p className="mt-5 rounded-2xl bg-linen p-4 text-sm font-semibold text-danger">{error}</p>}
      {!onlineServiceAvailable && <p className="mt-5 rounded-2xl bg-linen p-4 text-sm font-semibold text-ink/65">{onlineUnavailableMessage} Cash on delivery continues to work normally.</p>}
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
            <Input label="PIN code" name="pin" required />
          </div>
        </div>
      </div>
      <div className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Truck size={20} /> Shipping</h2>
        <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-leaf bg-leaf/5 p-4"><span><span className="block font-semibold">Fresh batch delivery</span><span className="text-sm text-ink/55">2-5 business days</span></span><input type="radio" name="shipping" value="fresh" defaultChecked /></label>
      </div>
      <div className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><CreditCard size={20} /> Payment</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={paymentCardClass("online", !onlineAvailable)}>
            <span>UPI / Cards</span>
            <input type="radio" name="payment" value="online" checked={paymentMethod === "online"} disabled={!onlineAvailable} onChange={() => onlineAvailable && setPaymentMethod("online")} className="ml-3" />
          </label>
          <label className={paymentCardClass("upi_qr", !onlineAvailable)}>
            <span>UPI QR</span>
            <input type="radio" name="payment" value="upi_qr" checked={paymentMethod === "upi_qr"} disabled={!onlineAvailable} onChange={() => { if (!onlineAvailable) return; setPaymentMethod("upi_qr"); setQrCheckout(null); }} className="ml-3" />
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










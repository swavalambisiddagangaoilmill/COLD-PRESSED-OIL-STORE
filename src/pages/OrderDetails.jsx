// Renders a user-owned order detail view from the backend.
import { ArrowLeft, Check, ExternalLink, Package } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Breadcrumb from "../components/common/Breadcrumb.jsx";
import SafeImage from "../components/common/SafeImage.jsx";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";
import { fetchOrderDetails } from "../services/orderService.js";
import { formatCurrency } from "../utils/formatCurrency.js";

const statusLabels = {
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Processing",
  processing: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  requires_details: "Preparing Shipment",
  shiprocket_order_created: "Shipment Created",
  awb_assigned: "AWB Assigned",
  pickup_generated: "Pickup Requested",
  label_generated: "Label Generated",
  manifest_generated: "Ready for Pickup",
  ready_for_pickup: "Ready for Pickup",
  picked_up: "Picked Up",
  in_transit: "In Transit",
  rto: "Returning",
};

function formatDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const timelineDefinitions = [
  { key: "placed", title: "Order Placed", description: "Your order was received." },
  { key: "confirmed", title: "Order Confirmed", description: "Your order has been confirmed and is being prepared." },
  { key: "packed", title: "Order Packed", description: "Your order has been packed and is ready for pickup." },
  { key: "waiting_for_pickup", title: "Waiting for Pickup", description: "Your package is ready and waiting for the Shiprocket delivery partner to pick it up." },
  { key: "picked_up", title: "Picked Up", description: "Your package has been picked up and is on its way." },
  { key: "in_transit", title: "In Transit", description: "Your package is moving through the delivery network." },
  { key: "out_for_delivery", title: "Out for Delivery", description: "Your package is out for delivery." },
  { key: "delivered", title: "Delivered", description: "Your order has been delivered." },
];

function historyDate(order, statuses) {
  const entries = Array.isArray(order?.statusHistory) ? order.statusHistory : [];
  return entries.find((entry) => entry && statuses.includes(entry.status))?.createdAt || "";
}

function buildTimeline(order) {
  const orderStatus = order?.orderStatus;
  const shippingStatus = order?.shippingStatus;
  let currentStage = 1;
  if (order?.readyToShipAt || ["packed", "shipped", "delivered"].includes(orderStatus)) currentStage = 2;
  if (["shiprocket_order_created", "awb_assigned", "pickup_generated", "label_generated", "manifest_generated", "ready_for_pickup"].includes(shippingStatus)) currentStage = 3;
  if (["picked_up", "shipped"].includes(shippingStatus)) currentStage = 4;
  if (shippingStatus === "in_transit") currentStage = 5;
  if (shippingStatus === "out_for_delivery") currentStage = 6;
  if (shippingStatus === "delivered" || orderStatus === "delivered") currentStage = 7;
  const dates = {
    placed: historyDate(order, ["placed"]) || order?.createdAt,
    confirmed: order?.confirmedAt || historyDate(order, ["confirmed"]),
    packed: historyDate(order, ["packed"]) || order?.readyToShipAt,
    waiting_for_pickup: historyDate(order, ["ready_for_pickup", "awb_assigned", "shiprocket_order_created"]) || order?.readyToShipAt,
    picked_up: historyDate(order, ["picked_up", "shipped"]) || order?.handedOverAt,
    in_transit: historyDate(order, ["in_transit"]),
    out_for_delivery: historyDate(order, ["out_for_delivery"]),
    delivered: historyDate(order, ["delivered"]),
  };
  return timelineDefinitions.map((step, index) => ({ ...step, complete: index <= currentStage, current: index === currentStage, date: dates[step.key] }));
}

function safeTrackingUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "shiprocket.co" || host.endsWith(".shiprocket.co") || host === "shiprocket.in" || host.endsWith(".shiprocket.in")) ? url.toString() : "";
  } catch { return ""; }
}

export default function OrderDetails() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadOrder() {
      setLoading(true);
      setError("");
      try {
        const data = await fetchOrderDetails(id);
        if (active) setOrder(data.order);
      } catch (err) {
        if (active) setError(err.message || "Unable to load order details.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadOrder();
    return () => { active = false; };
  }, [id]);

  const effectiveSubtotal = Number(order?.subtotal ?? (order?.products || []).reduce((sum, item) => sum + item.price * item.quantity, 0));
  const productSubtotal = Number(order?.productSubtotal ?? (order?.products || []).reduce((sum, item) => sum + Number(item.basePrice ?? item.price ?? 0) * Number(item.quantity || 1), 0));
  const offerDiscount = Number(order?.offerDiscount ?? Math.max(0, productSubtotal - effectiveSubtotal));
  const couponDiscount = Number(order?.couponDiscount ?? order?.discountAmount ?? 0);
  const shipping = Number(order?.shippingAmount ?? 0);
  const address = order?.shippingAddress;
  const products = Array.isArray(order?.products) ? order.products.filter(Boolean) : [];
  const timeline = order && order.orderStatus !== "placed" ? buildTimeline(order) : [];
  const trackingUrl = safeTrackingUrl(order?.trackingUrl);

  return (
    <>
      <Breadcrumb items={[{ label: "My Account", href: "/account" }, { label: "Order Details" }]} />
      <section className="section-padding">
        <Container>
          <Link to="/account" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-leaf"><ArrowLeft size={17} /> Back to account</Link>
          {loading && <div className="grid gap-4 rounded-[2rem] bg-white p-6 shadow-sm"><div className="h-8 w-56 animate-pulse rounded-full bg-linen" /><div className="h-40 animate-pulse rounded-2xl bg-linen" /></div>}
          {!loading && error && <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm"><Package className="mx-auto text-leaf" /><h1 className="mt-4 font-serif text-4xl font-semibold">Order unavailable</h1><p className="mt-3 text-ink/60">{error}</p><Button to="/account" className="mt-6">Back to Account</Button></div>}
          {!loading && order && (
            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <main className="rounded-[2rem] border border-ink/10 bg-white p-5 shadow-sm sm:p-6 lg:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">Order {order._id}</p>
                <h1 className="mt-3 font-serif text-4xl font-semibold sm:text-5xl">Order Details</h1>
                <p className="mt-3 text-sm font-semibold text-ink/50">Placed on {formatDate(order.createdAt)}</p>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-cream p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">Order status</p><p className="mt-2 font-semibold text-leaf">{statusLabels[order.orderStatus] || order.orderStatus}</p></div>
                  <div className="rounded-2xl bg-cream p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">Payment</p><p className="mt-2 font-semibold">{statusLabels[order.paymentStatus] || order.paymentStatus}</p></div>
                  <div className="rounded-2xl bg-cream p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">Method</p><p className="mt-2 font-semibold uppercase">{order.paymentMethod}</p></div>
                </div>

                {order.orderStatus === "placed" ? (
                  <section className="mt-8 rounded-2xl border border-clay/20 bg-cream p-5 sm:p-6" aria-label="Order confirmation status">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-clay">Waiting for Order Confirmation</p>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">Your order has been placed and is waiting for store confirmation. We'll notify you when your order is confirmed.</p>
                    <div className="mt-5 grid gap-3 text-sm font-semibold"><p className="flex items-center gap-3 text-leaf"><span className="grid h-7 w-7 place-items-center rounded-full bg-leaf text-white"><Check size={15} /></span>Order Placed</p><p className="flex items-center gap-3 text-clay"><span className="h-3 w-3 rounded-full bg-clay ring-4 ring-clay/15" />Waiting for Confirmation</p></div>
                  </section>
                ) : order.orderStatus !== "cancelled" ? (
                  <section className="mt-8" aria-label="Order tracking timeline">
                    <h2 className="font-serif text-3xl font-semibold">Order journey</h2>
                    <div className="mt-6 grid gap-0">
                      {timeline.map((step, index) => <div key={step.key} className="relative grid grid-cols-[32px_1fr] gap-3 pb-6 last:pb-0 sm:grid-cols-[38px_1fr] sm:gap-4">{index < timeline.length - 1 && <span className={`absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px sm:left-[18px] ${step.complete ? "bg-leaf/45" : "bg-ink/10"}`} />}<span className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 sm:h-9 sm:w-9 ${step.current ? "border-clay bg-clay text-white ring-4 ring-clay/15" : step.complete ? "border-leaf bg-leaf text-white" : "border-ink/15 bg-white text-transparent"}`}>{step.complete && !step.current && <Check size={16} />}{step.current && <span className="h-2.5 w-2.5 rounded-full bg-white" />}</span><div className="min-w-0 pt-0.5"><div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><h3 className={`font-bold ${step.complete || step.current ? "text-ink" : "text-ink/40"}`}>{step.title}</h3>{step.date && <time className="text-xs font-semibold text-ink/45">{formatDate(step.date)}</time>}</div><p className={`mt-1 text-sm leading-6 ${step.complete || step.current ? "text-ink/60" : "text-ink/35"}`}>{step.description}</p></div></div>)}
                    </div>
                  </section>
                ) : null}

                <div className="mt-8 grid gap-4">
                  {products.map((item, index) => <article key={`${order._id}-${item.product || item.title || index}`} className="grid gap-4 rounded-2xl border border-ink/10 p-4 sm:grid-cols-[86px_1fr_auto] sm:items-center">
                    <SafeImage src={item.image} alt={item.title} className="h-24 w-24 rounded-xl object-cover sm:h-20 sm:w-20" />
                    <div><h2 className="font-serif text-2xl font-semibold">{item.title}</h2><p className="mt-1 text-sm font-semibold text-ink/50">Quantity: {item.quantity}{item.variantLabel ? ` · ${item.variantLabel}` : ""}{item.variantSku ? ` · ${item.variantSku}` : ""}</p></div>
                    <div className="text-left sm:text-right"><p className="font-bold">{formatCurrency(item.price)}</p><p className="mt-1 text-sm text-ink/45">Subtotal {formatCurrency(item.price * item.quantity)}</p></div>
                  </article>)}
                </div>
              </main>

              <aside className="h-max rounded-[2rem] border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="font-serif text-3xl font-semibold">Summary</h2>
                <div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-ink/55">Subtotal</span><span className="font-semibold">{formatCurrency(productSubtotal)}</span></div><div className="flex justify-between"><span className="text-ink/55">Offer Discount</span><span className="font-semibold">{formatCurrency(-offerDiscount)}</span></div>{couponDiscount > 0 && <div className="flex justify-between"><span className="text-ink/55">Coupon</span><span className="font-semibold">{formatCurrency(-couponDiscount)}</span></div>}<div className="flex justify-between"><span className="text-ink/55">Shipping</span><span className="font-semibold">{formatCurrency(shipping)}</span></div><div className="flex justify-between border-t border-ink/10 pt-3 text-lg font-bold"><span>Final Total</span><span>{formatCurrency(order.totalAmount ?? Math.max(0, effectiveSubtotal + shipping - couponDiscount))}</span></div></div>
                <div className="mt-6 rounded-2xl bg-cream p-4">
                  <p className="font-semibold">Delivery</p>
                  <p className="mt-2 text-sm leading-6 text-ink/60">{statusLabels[order.shippingStatus] || "Preparing Shipment"}</p>
                  {order.awbCode && <p className="mt-1 text-sm font-semibold text-ink/60">AWB: {order.awbCode}</p>}
                  {order.estimatedDelivery && <p className="mt-1 text-sm text-ink/55">Estimated delivery: {formatDate(order.estimatedDelivery)}</p>}
                  {trackingUrl ? <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-bold text-white transition hover:bg-leaf">Track Shipment <ExternalLink size={14} /></a> : <p className="mt-3 text-xs font-semibold text-ink/45">Tracking appears here after courier assignment.</p>}
                </div>
                {address && <div className="mt-6 rounded-2xl bg-cream p-4"><p className="font-semibold">Delivery Address</p><p className="mt-2 text-sm leading-6 text-ink/60">{address.fullName}, {address.phone}<br />{address.street}, {address.city}, {address.state} {address.postalCode}<br />{address.country || "India"}</p></div>}
                <p className="mt-5 text-sm leading-6 text-ink/55">Order cancellation is available only when supported by the backend order workflow. This order is currently managed by the store team.</p>
              </aside>
            </div>
          )}
        </Container>
      </section>
    </>
  );
}


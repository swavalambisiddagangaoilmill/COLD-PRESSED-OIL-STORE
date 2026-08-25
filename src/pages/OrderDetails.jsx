// Renders a user-owned order detail view from the backend.
import { ArrowLeft, ExternalLink, Package } from "lucide-react";
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
  return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
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

  const subtotal = (order?.products || []).reduce((sum, item) => sum + item.price * item.quantity, 0);
  const address = order?.shippingAddress;

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

                <div className="mt-8 grid gap-4">
                  {(order.products || []).map((item) => <article key={`${order._id}-${item.title}`} className="grid gap-4 rounded-2xl border border-ink/10 p-4 sm:grid-cols-[86px_1fr_auto] sm:items-center">
                    <SafeImage src={item.image} alt={item.title} className="h-24 w-24 rounded-xl object-cover sm:h-20 sm:w-20" />
                    <div><h2 className="font-serif text-2xl font-semibold">{item.title}</h2><p className="mt-1 text-sm font-semibold text-ink/50">{item.variantName}{item.sku ? ` · SKU ${item.sku}` : ""} · Quantity: {item.quantity}</p></div>
                    <div className="text-left sm:text-right"><p className="font-bold">{formatCurrency(item.price)}</p><p className="mt-1 text-sm text-ink/45">Subtotal {formatCurrency(item.price * item.quantity)}</p></div>
                  </article>)}
                </div>
              </main>

              <aside className="h-max rounded-[2rem] border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="font-serif text-3xl font-semibold">Summary</h2>
                <div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-ink/55">Subtotal</span><span className="font-semibold">{formatCurrency(subtotal)}</span></div><div className="flex justify-between border-t border-ink/10 pt-3 text-lg font-bold"><span>Total</span><span>{formatCurrency(order.totalAmount || subtotal)}</span></div></div>
                <div className="mt-6 rounded-2xl bg-cream p-4">
                  <p className="font-semibold">Delivery</p>
                  <p className="mt-2 text-sm leading-6 text-ink/60">{statusLabels[order.shippingStatus] || "Preparing Shipment"}</p>
                  {order.courierName && <p className="mt-2 text-sm font-semibold text-ink/60">Courier: {order.courierName}</p>}
                  {order.awbCode && <p className="mt-1 text-sm font-semibold text-ink/60">AWB: {order.awbCode}</p>}
                  {order.estimatedDelivery && <p className="mt-1 text-sm text-ink/55">Estimated delivery: {formatDate(order.estimatedDelivery)}</p>}
                  {order.trackingUrl ? <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-bold text-white transition hover:bg-leaf">Track Order <ExternalLink size={14} /></a> : <p className="mt-3 text-xs font-semibold text-ink/45">Tracking appears here after courier assignment.</p>}
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


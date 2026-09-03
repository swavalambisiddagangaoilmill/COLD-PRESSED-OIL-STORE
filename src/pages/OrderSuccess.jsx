// Renders the dedicated order success confirmation page.
import { CheckCircle, Download, ExternalLink, ShoppingBag } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import Container from "../components/ui/Container.jsx";
import { formatCurrency } from "../utils/formatCurrency.js";
import { downloadInvoicePdf } from "../utils/invoicePdf.js";

export default function OrderSuccess() {
  const { state } = useLocation();
  const order = state?.order;
  if (!order) return <Navigate to="/shop" replace />;

  const orderId = order._id || order.id;
  const items = order.items || order.products || [];
  const total = order.totalAmount ?? order.total ?? items.reduce((sum, item) => sum + Number(item.total ?? (Number(item.price || 0) * Number(item.quantity || 1))), 0);
  const effectiveSubtotal = Number(order.subtotal ?? items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0));
  const productSubtotal = Number(order.productSubtotal ?? items.reduce((sum, item) => sum + Number(item.basePrice ?? item.originalPrice ?? item.price ?? 0) * Number(item.quantity || 1), 0));
  const offerDiscount = Number(order.offerDiscount ?? Math.max(0, productSubtotal - effectiveSubtotal));
  const shipping = order.shippingAmount || order.shippingFee || order.deliveryCharge || 0;
  const couponDiscount = Number(order.couponDiscount ?? order.discountAmount ?? 0);
  const invoiceNumber = order.invoiceNumber || `INV-${String(orderId).slice(-8).toUpperCase()}`;
  const invoiceDate = order.date || new Date(order.createdAt || Date.now()).toLocaleString("en-IN");
  const estimatedDelivery = order.estimatedDelivery || "After courier assignment";

  return (
    <section className="section-padding print:bg-white print:p-0">
      <Container className="max-w-5xl print:max-w-none print:px-0">
        <div className="rounded-[2rem] bg-white p-6 shadow-soft sm:p-8 print:rounded-none print:p-8 print:shadow-none">
          <div className="print:hidden">
            <div className="text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-linen text-leaf"><CheckCircle size={30} /></span>
              <h1 className="mt-5 font-serif text-5xl font-semibold">Order Placed Successfully</h1>
              <p className="mt-3 text-ink/60">{order.trackingUrl ? "Your tracking link is ready." : "Tracking will appear once the courier is assigned."}</p>
              {order.trackingUrl && <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-bold text-white transition hover:bg-leaf">Track Order <ExternalLink size={16} className="ml-2" /></a>}
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Order ID" value={orderId} />
              <Info label="Date & Time" value={invoiceDate} />
              <Info label="Payment Status" value={order.paymentStatus} />
              <Info label="Estimated Delivery" value={estimatedDelivery} />
            </div>
            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
              <div className="rounded-3xl bg-cream p-5">
                <h2 className="font-serif text-3xl font-semibold">Ordered Products</h2>
                <div className="mt-5 space-y-4">
                  {items.map((item) => {
                    const name = item.name || item.title;
                    const image = item.image;
                    const id = item.id || item.product || name;
                    return <div key={id} className="flex gap-4 rounded-2xl bg-white p-3">
                      <img src={image} alt={name} className="h-20 w-20 rounded-xl object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{name}</p>
                        <p className="text-sm text-ink/55">Qty {item.quantity}{item.variantLabel || item.volume ? ` - ${item.variantLabel || item.volume}` : ""}</p>
                        <p className="mt-1 font-bold">{formatCurrency(Number(item.price || 0) * Number(item.quantity || 1))}</p>
                      </div>
                    </div>;
                  })}
                </div>
              </div>
              <div className="rounded-3xl bg-ink p-5 text-white">
                <h2 className="font-serif text-3xl font-semibold">Delivery Address</h2>
                <p className="mt-4 whitespace-pre-line leading-7 text-white/70">{order.address || formatAddress(order.shippingAddress)}</p>
                {(order.courierName || order.awbCode) && <div className="mt-6 border-t border-white/10 pt-5 text-sm text-white/65">
                  {order.awbCode && <p className="mt-1">AWB: {order.awbCode}</p>}
                </div>}
                <div className="mt-6 border-t border-white/10 pt-5">
                  <p className="text-sm text-white/50">Total Amount</p>
                  <p className="mt-1 text-3xl font-bold">{formatCurrency(total)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="hidden print:block print:border print:border-leaf print:p-8">
            <div className="flex items-start justify-between border-b border-ink/15 pb-6">
              <div className="flex items-start gap-4">
                <img src="/logo.webp" alt="Swavalambi Siddaganga Oil Mill" className="h-16 w-16 object-contain" />
                <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">Tax Invoice</p>
                <h1 className="mt-2 font-serif text-4xl font-semibold">Swavalambi Siddaganga Oil Mill</h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-ink/65">SIDDAGANGA OIL MILL, Near Small City Club Road, Sira Gate, TUDA Layout, Tumakuru, Karnataka 572106</p>
                <p className="mt-1 text-sm text-ink/65">09972565174 - support@swavalambisiddagangaoilmill.com</p>
                </div>
              </div>
              <div className="text-right text-sm leading-6 text-ink/65">
                <p><strong className="text-ink">Invoice:</strong> {invoiceNumber}</p>
                <p><strong className="text-ink">Order:</strong> {orderId}</p>
                <p><strong className="text-ink">Date:</strong> {invoiceDate}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-8 border-b border-ink/15 py-6 text-sm leading-6">
              <div>
                <h2 className="font-bold uppercase tracking-[0.12em] text-ink/50">Customer and Billing</h2>
                <p className="mt-3 font-semibold text-ink">{order.customerName || order.user?.name || order.shippingAddress?.fullName}</p>
                <p className="text-ink/75">{order.customerEmail || order.user?.email || "-"}</p>
                <p className="text-ink/75">{order.customerPhone || order.user?.phone || order.shippingAddress?.phone}</p>
                <p className="mt-2 whitespace-pre-line text-ink/75">{formatAddress(order.billingAddress || order.shippingAddress)}</p>
              </div>
              <div>
                <h2 className="font-bold uppercase tracking-[0.12em] text-ink/50">Shipping and Payment</h2>
                <p className="mt-3 whitespace-pre-line text-ink/75">{formatAddress(order.shippingAddress)}</p>
                <p className="mt-2 text-ink/75">Status: {order.paymentStatus || "Confirmed"}</p>
                <p className="text-ink/75">Method: {order.paymentMethod || "Online/COD"}</p>
                {order.awbCode && <p className="text-ink/75">AWB: {order.awbCode}</p>}
              </div>
            </div>
            <table className="mt-6 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ink/15 text-xs uppercase tracking-[0.12em] text-ink/50">
                  <th className="py-3">Product</th>
                  <th className="py-3 text-center">Qty</th>
                  <th className="py-3 text-right">List</th>
                  <th className="py-3 text-right">Discount</th>
                  <th className="py-3 text-right">Unit Price</th>
                  <th className="py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const name = item.name || item.title;
                  const id = item.id || item.product || name;
                  const quantity = Number(item.quantity || 1);
                  const price = Number(item.price || 0);
                  const listPrice = Number(item.basePrice || item.originalPrice || item.listPrice || price);
                  const itemDiscount = Math.max(0, listPrice - price);
                  return (
                    <tr key={id} className="border-b border-ink/10">
                      <td className="py-3 font-semibold">{name}{item.volume ? ` (${item.volume})` : ""}</td>
                      <td className="py-3 text-center">{quantity}</td>
                      <td className="py-3 text-right">{formatCurrency(listPrice)}</td>
                      <td className="py-3 text-right">{itemDiscount > 0 ? formatCurrency(itemDiscount) : "-"}</td>
                      <td className="py-3 text-right">{formatCurrency(price)}</td>
                      <td className="py-3 text-right font-semibold">{formatCurrency(price * quantity)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="ml-auto mt-6 max-w-sm space-y-2 text-sm">
              <InvoiceRow label="Subtotal" value={productSubtotal} />
              <InvoiceRow label="Offer Discount" value={-offerDiscount} />
              {couponDiscount > 0 && <InvoiceRow label="Coupon" value={-couponDiscount} />}
              <InvoiceRow label="Shipping" value={shipping} />
              <div className="flex justify-between border-t border-ink/15 pt-3 text-lg font-bold">
                <span>Final Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
            <p className="mt-10 border-t border-ink/15 pt-5 text-center text-xs text-ink/50">This is a computer-generated invoice and does not require a signature.</p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center print:hidden">
            <Link to="/shop" className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-sm font-bold text-white transition hover:bg-leaf"><ShoppingBag size={17} className="mr-2" /> Continue Shopping</Link>
            <Link to={`/account/orders/${orderId}`} className="inline-flex h-12 items-center justify-center rounded-full bg-linen px-6 text-sm font-bold text-ink transition hover:text-leaf">View Order</Link>
            <button type="button" onClick={() => downloadInvoicePdf(order)} className="inline-flex h-12 items-center justify-center rounded-full border border-ink/10 px-6 text-sm font-bold text-ink transition hover:border-leaf hover:text-leaf"><Download size={17} className="mr-2" /> Download Invoice</button>
          </div>
        </div>
      </Container>
    </section>
  );
}

function formatAddress(address) {
  if (!address) return "";
  return `${address.fullName}, ${address.phone}\n${address.street}, ${address.city}, ${address.state} ${address.postalCode}\n${address.country || "India"}`;
}

function Info({ label, value }) {
  return <div className="rounded-2xl bg-cream p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-ink/45">{label}</p><p className="mt-2 font-semibold">{value}</p></div>;
}

function InvoiceRow({ label, value }) {
  return <div className="flex justify-between text-ink/70"><span>{label}</span><span>{formatCurrency(value)}</span></div>;
}





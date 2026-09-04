// Responsive confirmed-order fulfillment queue with partial-success bulk processing.
import { CheckSquare, Download, PackageCheck, Search, Square, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../components/features/feedback/ToastProvider.jsx";
import { AdminBadge, AdminButton, AdminPageHeader, AdminSelect } from "../components/AdminUi.jsx";
import { adminApi } from "../services/adminApi.js";

const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
const label = (value) => String(value || "-").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
const dateTime = (value) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString("en-IN") : "-";
const canManifest = (order) => Boolean(order.awbCode && order.shiprocketShipmentId && (order.pickupRequestedAt || ["pickup_generated", "ready_for_pickup", "picked_up", "shipped", "in_transit", "out_for_delivery", "delivered"].includes(order.shippingStatus)) && !["cancelled", "failed"].includes(order.shippingStatus));

function ProductList({ products }) {
  const items = Array.isArray(products) ? products.filter(Boolean) : [];
  return <div className="space-y-1">{items.map((item, index) => <p key={`${item.product || item.title || index}`} className="text-sm"><span className="font-semibold">{item.title || "Product"}</span> × {item.quantity || 1}</p>)}</div>;
}

function SelectionBox({ checked, disabled = false, onChange, label: ariaLabel }) {
  return <button type="button" role="checkbox" aria-checked={checked} aria-label={ariaLabel} disabled={disabled} onClick={onChange} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-ink/10 bg-white text-[var(--admin-primary)] transition hover:border-[var(--admin-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)] disabled:cursor-not-allowed disabled:opacity-35">{checked ? <CheckSquare size={19} /> : <Square size={19} />}</button>;
}

function FulfillmentActions({ order, busy, run }) {
  const booked = Boolean(order.shiprocketShipmentId && order.awbCode);
  const pickupEligible = booked && !order.pickupRequestedAt && !["cancelled", "picked_up", "shipped", "in_transit", "out_for_delivery", "delivered", "rto", "ndr"].includes(order.shippingStatus);
  return <div className="flex flex-wrap gap-2">
    {!booked && order.orderStatus === "confirmed" && <AdminButton disabled={busy} onClick={() => run(order, () => adminApi.readyToShip(order._id), "Book this shipment and assign its AWB?")}>Book Shipment</AdminButton>}
    {pickupEligible && <AdminButton variant="secondary" disabled={busy} onClick={() => run(order, () => adminApi.requestPickup(order._id), "Request courier pickup for this shipment?")}>Request Pickup</AdminButton>}
    {booked && !order.labelUrl && <AdminButton variant="secondary" disabled={busy} onClick={() => run(order, () => adminApi.generateLabel(order._id))}>Generate Label</AdminButton>}
    {order.labelUrl && <AdminButton variant="secondary" disabled={busy} onClick={() => run(order, () => adminApi.openShipmentDocument(order._id, "label"))}>View Label</AdminButton>}
    {booked && !order.shiprocketInvoiceUrl && <AdminButton variant="secondary" disabled={busy} onClick={() => run(order, () => adminApi.generateShipmentInvoice(order._id))}>Shipment Invoice</AdminButton>}
    {order.shiprocketInvoiceUrl && <AdminButton variant="secondary" disabled={busy} onClick={() => run(order, () => adminApi.openShipmentDocument(order._id, "invoice"))}>View Shipment Invoice</AdminButton>}
    {order.manifestPrintUrl && <AdminButton variant="secondary" disabled={busy} onClick={() => run(order, () => adminApi.openShipmentDocument(order._id, "manifest"))}>View Manifest</AdminButton>}
    {booked && <AdminButton variant="secondary" disabled={busy} onClick={() => run(order, () => adminApi.refreshTracking(order._id))}>Track Shipment</AdminButton>}
  </div>;
}

export default function FulfillmentPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [batch, setBatch] = useState(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ sort });
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("search", search.trim());
      const data = await adminApi.fulfillment(`?${params}`);
      if (requestId === requestRef.current) setOrders(Array.isArray(data?.items) ? data.items.filter(Boolean) : []);
    } catch (loadError) {
      if (requestId === requestRef.current) setError(loadError.message || "Unable to load confirmed orders.");
    } finally { if (requestId === requestRef.current) setLoading(false); }
  }, [search, sort, status]);

  useEffect(() => { const timer = window.setTimeout(load, search ? 300 : 0); return () => window.clearTimeout(timer); }, [load, search]);
  useEffect(() => { setSelected((current) => current.filter((id) => orders.some((order) => order._id === id))); }, [orders]);

  const bookable = useMemo(() => orders.filter((order) => order.orderStatus === "confirmed" && !order.awbCode && !order.shipmentCreationStartedAt), [orders]);
  const manifestable = useMemo(() => orders.filter(canManifest), [orders]);
  const selectable = useMemo(() => orders.filter((order) => bookable.includes(order) || manifestable.includes(order)), [bookable, manifestable, orders]);
  const allSelected = selectable.length > 0 && selectable.every((order) => selected.includes(order._id));
  const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleAll = () => setSelected(allSelected ? [] : selectable.map((order) => order._id));

  const submit = async (ids = selected) => {
    if (!ids.length || processing) return;
    setProcessing(true); setBatch(null);
    try {
      const result = await adminApi.bulkReadyToShip(ids);
      setBatch(result);
      const retryIds = (result.results || []).filter((item) => !item.success && item.retryEligible).map((item) => item.orderId);
      setSelected(retryIds);
      showToast(result.failed ? `${result.succeeded} orders submitted successfully. ${result.failed} orders need attention.` : `${result.succeeded} orders submitted successfully.`, result.failed ? "warning" : "success");
      await load();
    } catch (submitError) {
      showToast(submitError.message || "Shipment submission failed. Please retry eligible orders.", "error");
    } finally { setProcessing(false); }
  };

  const runOrderAction = async (order, action, confirmation) => {
    if (processing || (confirmation && !window.confirm(confirmation))) return;
    setProcessing(true);
    try { await action(); showToast("Fulfillment action completed.", "success"); await load(); }
    catch (actionError) { showToast(actionError.message || "Fulfillment action failed.", "error"); }
    finally { setProcessing(false); }
  };

  const runManifest = async (print = false) => {
    const ids = selected.filter((id) => manifestable.some((order) => order._id === id));
    if (!ids.length || processing) return;
    if (!window.confirm(`${print ? "Prepare a printable" : "Generate a"} manifest for ${ids.length} shipment(s)?`)) return;
    setProcessing(true);
    try {
      await (print ? adminApi.printManifest(ids) : adminApi.generateManifest(ids));
      showToast(print ? "Printable manifest is ready." : "Manifest generated.", "success");
      await load();
    } catch (manifestError) { showToast(manifestError.message || "Manifest operation failed.", "error"); }
    finally { setProcessing(false); }
  };

  const download = async () => {
    if (exporting) return;
    setExporting(true);
    try { await adminApi.downloadFulfillmentExport(); showToast("Order list downloaded.", "success"); }
    catch (downloadError) { showToast(downloadError.message || "Unable to download the order list.", "error"); }
    finally { setExporting(false); }
  };

  return <>
    <AdminPageHeader title="Confirmed Orders" description="Book eligible confirmed orders with Shiprocket and assign their AWBs." action={<AdminButton variant="secondary" loading={exporting} onClick={download}><Download size={16} />Download Order List</AdminButton>} />
    <div className="mb-4 grid gap-3 rounded-xl border border-ink/10 bg-white p-3 shadow-sm sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_220px_220px]">
      <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" size={16} /><span className="sr-only">Search orders</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order ID or customer" className="h-10 w-full rounded-lg border border-ink/10 bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--admin-primary)]" /></label>
      <AdminSelect label="Fulfillment status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Confirmed</option><option value="failed">Shipment failed</option><option value="requires_details">Needs details</option><option value="awb_assigned">AWB assigned</option><option value="pickup_generated">Pickup requested</option><option value="ready_for_pickup">Waiting for pickup</option><option value="picked_up">Picked up</option><option value="in_transit">In transit</option><option value="out_for_delivery">Out for delivery</option><option value="delivered">Delivered</option></AdminSelect>
      <AdminSelect label="Order" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></AdminSelect>
    </div>

    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-ink/10 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3"><SelectionBox checked={allSelected} onChange={toggleAll} label="Select all eligible orders" /><span className="text-sm font-bold">{selected.length} selected</span>{selected.length > 0 && <button type="button" onClick={() => setSelected([])} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-bold text-ink/55 hover:bg-linen"><X size={15} />Clear selection</button>}</div>
      <div className="flex flex-wrap gap-2"><AdminButton className="h-11" disabled={!selected.some((id) => bookable.some((order) => order._id === id))} loading={processing} onClick={() => submit(selected.filter((id) => bookable.some((order) => order._id === id)))}><PackageCheck size={17} />Book Shipments</AdminButton><AdminButton variant="secondary" disabled={!selected.some((id) => manifestable.some((order) => order._id === id))} onClick={() => runManifest(false)}>Generate Manifest</AdminButton><AdminButton variant="secondary" disabled={!selected.some((id) => manifestable.some((order) => order._id === id && order.manifestUrl))} onClick={() => runManifest(true)}>Print Manifest</AdminButton></div>
    </div>

    {batch?.failed > 0 && <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="Shipment failures"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-amber-900">{batch.succeeded} submitted · {batch.failed} need attention</p><p className="mt-1 text-sm text-amber-800">Only eligible failed orders remain selected for retry.</p></div>{selected.length > 0 && <AdminButton variant="secondary" loading={processing} onClick={() => submit(selected)}>Retry Shipment</AdminButton>}</div><div className="mt-3 grid gap-2">{batch.results.filter((item) => !item.success).map((item) => <div key={item.orderId} className="rounded-lg bg-white p-3 text-sm"><p className="font-bold break-all">{item.orderId}</p><p className="mt-1 text-ink/60">{item.reason}</p></div>)}</div></section>}
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">{error}</div>}
    {loading && <div className="rounded-xl border border-ink/10 bg-white p-6 text-sm font-semibold text-ink/50">Loading confirmed orders...</div>}
    {!loading && !error && orders.length === 0 && <div className="rounded-xl border border-ink/10 bg-white p-8 text-center"><p className="font-bold">No confirmed orders found.</p><p className="mt-2 text-sm text-ink/50">Confirmed customer orders will appear here for fulfillment.</p></div>}

    {!loading && !error && orders.length > 0 && <>
      <div className="grid gap-3 lg:hidden">{orders.map((order) => { const eligible = selectable.some((item) => item._id === order._id); return <article key={order._id} className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><SelectionBox checked={selected.includes(order._id)} onChange={() => eligible && toggle(order._id)} label={`Select order ${order._id}`} /><div className="min-w-0 flex-1"><p className="break-all text-sm font-bold">{order._id}</p><p className="mt-1 text-sm text-ink/55">{order.user?.name || order.shippingAddress?.fullName || "Customer"}</p></div><AdminBadge>{label(order.shippingStatus)}</AdminBadge></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-bold uppercase text-ink/40">Confirmed</p><p className="mt-1">{dateTime(order.confirmedAt)}</p></div><div><p className="text-xs font-bold uppercase text-ink/40">Total</p><p className="mt-1 font-bold">{money(order.totalAmount)}</p></div><div className="col-span-2"><p className="text-xs font-bold uppercase text-ink/40">Products</p><div className="mt-1"><ProductList products={order.products} /></div></div><div><p className="text-xs font-bold uppercase text-ink/40">Payment</p><p className="mt-1">{label(order.paymentStatus)}</p></div><div><p className="text-xs font-bold uppercase text-ink/40">AWB</p><p className="mt-1 break-all">{order.awbCode || "Not assigned"}</p></div><div><p className="text-xs font-bold uppercase text-ink/40">Label</p><p className="mt-1">{order.labelGeneratedAt ? dateTime(order.labelGeneratedAt) : "Not generated"}</p></div><div><p className="text-xs font-bold uppercase text-ink/40">Manifest</p><p className="mt-1">{order.manifestGeneratedAt ? dateTime(order.manifestGeneratedAt) : "Not generated"}</p></div></div>{order.shippingFailureReason && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{order.shippingFailureReason}</p>}<div className="mt-4"><FulfillmentActions order={order} busy={processing} run={runOrderAction} /></div></article>; })}</div>
      <div className="hidden overflow-x-auto rounded-xl border border-ink/10 bg-white shadow-sm lg:block"><table className="min-w-[1600px] divide-y divide-ink/10 text-sm"><thead className="bg-linen/70"><tr>{["", "Order", "Customer", "Order date", "Products", "Total", "Payment", "Shipment", "Shiprocket IDs", "AWB / Courier", "Pickup", "Label", "Manifest", "Actions"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.08em] text-ink/50">{heading}</th>)}</tr></thead><tbody className="divide-y divide-ink/10">{orders.map((order) => { const eligible = selectable.some((item) => item._id === order._id); return <tr key={order._id}><td className="px-3 py-3"><SelectionBox checked={selected.includes(order._id)} onChange={() => eligible && toggle(order._id)} label={`Select order ${order._id}`} /></td><td className="max-w-44 break-all px-3 py-3 font-bold">{order._id}</td><td className="px-3 py-3">{order.user?.name || order.shippingAddress?.fullName || "Customer"}</td><td className="whitespace-nowrap px-3 py-3">{dateTime(order.createdAt)}</td><td className="min-w-52 px-3 py-3"><ProductList products={order.products} /></td><td className="whitespace-nowrap px-3 py-3 font-bold">{money(order.totalAmount)}</td><td className="px-3 py-3"><AdminBadge>{label(order.paymentStatus)}</AdminBadge></td><td className="px-3 py-3"><AdminBadge>{label(order.shippingStatus)}</AdminBadge></td><td className="max-w-44 break-all px-3 py-3 text-xs">Order: {order.shiprocketOrderId || "-"}<br />Shipment: {order.shiprocketShipmentId || "-"}</td><td className="max-w-44 break-all px-3 py-3">{order.awbCode || "-"}<br />{order.courierName || "-"}</td><td className="px-3 py-3">{order.pickupStatus || "-"}<br /><span className="text-xs text-ink/45">{dateTime(order.pickupRequestedAt)}</span></td><td className="px-3 py-3">{order.labelUrl ? "Ready" : "Not generated"}<br /><span className="text-xs text-ink/45">{dateTime(order.labelGeneratedAt)}</span></td><td className="px-3 py-3">{order.manifestUrl ? "Generated" : "Not generated"}<br /><span className="text-xs text-ink/45">{dateTime(order.manifestGeneratedAt)}</span></td><td className="min-w-72 px-3 py-3"><FulfillmentActions order={order} busy={processing} run={runOrderAction} /></td></tr>; })}</tbody></table></div>
    </>}
  </>;
}

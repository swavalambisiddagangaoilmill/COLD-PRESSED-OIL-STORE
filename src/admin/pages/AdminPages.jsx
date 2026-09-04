// API-backed page components for the Swavalambi Siddaganga Oil Mill admin panel.
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Download, Eye, EyeOff, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "../../components/features/feedback/ToastProvider.jsx";
import { AdminBadge, AdminButton, AdminCard, AdminFilters, AdminInput, AdminModal, AdminPageHeader, AdminSelect, AdminTable, AdminTextarea } from "../components/AdminUi.jsx";
import { adminApi } from "../services/adminApi.js";
import { addVariant, removeVariant } from "../utils/variantForm.js";
import AdminSettingsExtras from "./AdminSettingsExtras.jsx";

const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
const statusText = (value) => String(value || "-").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
const today = new Date().toISOString().slice(0, 10);

function useAdminData(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await loader();
      setData(next);
      return next;
    } catch (err) {
      setError(err.message || "Could not load admin data.");
      return null;
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, deps);
  return { data, loading, error, reload: load, setData };
}

function useAdminAction() {
  const { showToast } = useToast();
  const pendingRef = useRef({});
  const [pending, setPending] = useState({});
  const run = async (key, action, success = "Updated successfully.") => {
    if (pendingRef.current[key]) return null;
    pendingRef.current[key] = true;
    setPending((current) => ({ ...current, [key]: true }));
    try {
      const result = await action();
      showToast(success, "success");
      return result;
    } catch (err) {
      showToast(err.message || "Action failed. Please try again.", "error");
      return null;
    } finally {
      pendingRef.current[key] = false;
      setPending((current) => ({ ...current, [key]: false }));
    }
  };
  return { pending, run };
}

function useAdminRefresh(reload, scopes) {
  useEffect(() => {
    const refresh = (event) => {
      const changed = event.detail?.scopes || [];
      if (scopes.some((scope) => changed.includes(scope))) reload();
    };
    window.addEventListener("ss-admin-data-changed", refresh);
    return () => window.removeEventListener("ss-admin-data-changed", refresh);
  }, [reload, scopes.join("|")]);
}

function updateItemList(setData, id, nextItem, remove = false) {
  setData((current) => current ? { ...current, items: (current.items || []).map((item) => item._id === id ? { ...item, ...nextItem } : item).filter((item) => !(remove && item._id === id)) } : current);
}

function State({ loading, error, empty, title = "No records found.", description = "", action }) {
  if (loading) return <div className="rounded-xl border border-[var(--admin-border)] bg-white p-6 text-sm font-semibold text-[var(--admin-muted)]">Loading...</div>;
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">{error}</div>;
  if (empty) return <div className="rounded-xl border border-[var(--admin-border)] bg-white p-8 text-center shadow-sm"><p className="font-bold">{title}</p>{description && <p className="mt-2 text-sm text-[var(--admin-muted)]">{description}</p>}{action && <div className="mt-5">{action}</div>}</div>;
  return null;
}

function Cell({ children, className = "" }) { return <td className={`whitespace-nowrap px-4 py-3 align-middle ${className}`}>{children}</td>; }
function SearchBox({ value, onChange, placeholder = "Search" }) { return <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" size={16} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--admin-primary)]" /></label>; }
function Toggle({ label, checked, onChange }) { return <label className="flex items-center gap-2 text-sm font-semibold text-ink/70"><input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />{label}</label>; }

const blockInvalidNumberKey = (event) => {
  if (["-", "+", "e", "E"].includes(event.key)) event.preventDefault();
};

function numericError(value, label, { required = false, integer = false } = {}) {
  if (value === "" || value === undefined || value === null) return required ? `${label} is required.` : "";
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (label !== "Stock" && number <= 0)) return `${label} must be ${label === "Stock" ? "zero or more" : "greater than zero"}.`;
  if (integer && !Number.isInteger(number)) return `${label} must be a whole number.`;
  return "";
}

function offerStatus(offer) {
  if (!offer.isActive) return "Disabled";
  const now = new Date();
  if (new Date(offer.startDate) > now) return "Scheduled";
  if (new Date(offer.endDate) < now) return "Expired";
  return "Active";
}

function mapScope(value) { return value === "CATEGORY" ? "Category" : value === "PRODUCTS" ? "Selected Products" : "Entire Store"; }
function scopeFromLabel(value) { return value === "Category" ? "CATEGORY" : value === "Selected Products" ? "PRODUCTS" : "STORE"; }
function couponScopeFromLabel(value) { return value === "Category" ? "CATEGORY" : value === "Selected Products" ? "PRODUCTS" : "ALL"; }
function couponStatus(coupon) {
  if (!coupon.isActive) return "Inactive";
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) return "Exhausted";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const todayInIndia = `${parts.year}-${parts.month}-${parts.day}`;
  const start = String(coupon.startDate || "").slice(0, 10);
  const expiry = String(coupon.expiryDate || "").slice(0, 10);
  if (start && todayInIndia < start) return "Scheduled";
  if (expiry && todayInIndia > expiry) return "Expired";
  return "Active";
}
function normalizeDiscountType(value) { return value === "Fixed Amount" || value === "FIXED" ? "FIXED" : "PERCENTAGE"; }

function ServiceStatusSection() {
  const { data } = useAdminData(adminApi.serviceStatus);
  const services = data?.services || {};
  const style = { online: "bg-leaf/10 text-leaf", degraded: "bg-amber-100 text-amber-700", not_configured: "bg-slate-100 text-slate-600", offline: "bg-danger/10 text-danger" };
  const icon = { online: "Online", degraded: "Degraded", not_configured: "Not Configured", offline: "Offline" };
  return <div className="mt-5 rounded-xl border border-[var(--admin-border)] bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Service Status</h2><span className="text-xs font-semibold text-ink/40">External integrations</span></div><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{Object.entries(services).map(([key, service]) => <div key={key} className="rounded-lg bg-linen/60 p-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-ink/40">{service.name || statusText(key)}</p><p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${style[service.status] || style.offline}`}>{icon[service.status] || "Offline"}</p><p className="mt-2 line-clamp-2 text-xs font-semibold text-ink/50">{service.message}</p></div>)}</div></div>;
}
export function DashboardPage() {
  const { data, loading, error, reload } = useAdminData(adminApi.dashboard);
  useAdminRefresh(reload, ["dashboard", "orders", "inventory"]);
  const s = data?.summary || {};
  return <><AdminPageHeader title="Dashboard" description="Store operations overview." /><State loading={loading} error={error} />{data && <><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><AdminCard title="Today's Orders" value={String(s.todayOrders || 0)} /><AdminCard title="Today's Revenue" value={money(s.todayRevenue)} /><AdminCard title="Pending Orders" value={String(s.pendingOrders || 0)} /><AdminCard title="Ready to Ship" value={String(s.readyToShip || 0)} /><AdminCard title="Low Stock" value={String(s.lowStock || 0)} /><AdminCard title="Total Customers" value={String(s.totalCustomers || 0)} /></div><ServiceStatusSection /><div className="mt-5"><h2 className="mb-3 text-lg font-bold">Needs Attention</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{Object.entries(data.needsAttention || {}).map(([key, value]) => <div key={key} className="rounded-xl border border-[var(--admin-border)] bg-white p-4 text-sm font-semibold">{statusText(key)}: {value}</div>)}</div></div></>}</>;
}

function OrdersTable({ orders = [], onAction, pending = {}, shiprocketAvailable = true }) {
  const canConfirm = (order) => order.orderStatus === "placed";
  const canBook = (order) => shiprocketAvailable && !order.awbCode && order.orderStatus === "confirmed";
  const canRequestPickup = (order) => shiprocketAvailable && Boolean(order.awbCode) && !order.pickupRequestedAt && !["pickup_generated", "ready_for_pickup", "picked_up", "shipped", "in_transit", "out_for_delivery", "delivered"].includes(order.shippingStatus);
  const canRefreshTracking = (order) => shiprocketAvailable && Boolean(order.awbCode);
  const canCancelShipment = (order) => shiprocketAvailable && Boolean(order.shiprocketOrderId) && !["picked_up", "shipped", "in_transit", "out_for_delivery", "delivered", "rto", "cancelled"].includes(order.shippingStatus);
  const canCancel = (order) => ["placed", "confirmed", "packed"].includes(order.orderStatus);
  return <AdminTable columns={["Order", "Customer", "Date", "Items", "Payment", "Amount", "Order Status", "Shipping", "Actions"]} rows={orders.map((order) => { const orderPending = Object.entries(pending).some(([key, value]) => value && key.endsWith(`:${order._id}`)); const latest = order.trackingTimeline?.at?.(-1); return <tr key={order._id}><Cell className="font-bold">{order._id}</Cell><Cell>{order.user?.name || order.shippingAddress?.fullName || "Customer"}</Cell><Cell>{new Date(order.createdAt).toLocaleDateString("en-IN")}</Cell><Cell>{order.products?.length || 0}</Cell><Cell><AdminBadge>{statusText(order.paymentStatus)}</AdminBadge></Cell><Cell>{money(order.totalAmount)}</Cell><Cell><AdminBadge>{statusText(order.orderStatus)}</AdminBadge></Cell><Cell><div className="space-y-1"><AdminBadge>{statusText(order.shippingStatus)}</AdminBadge>{order.shiprocketOrderId && <p className="text-xs text-ink/55">SR Order: {order.shiprocketOrderId}</p>}{order.shiprocketShipmentId && <p className="text-xs text-ink/55">Shipment: {order.shiprocketShipmentId}</p>}{order.awbCode && <p className="text-xs text-ink/55">AWB: {order.awbCode}</p>}{order.courierName && <p className="text-xs text-ink/55">{order.courierName}</p>}{order.pickupStatus && <p className="text-xs text-ink/55">Pickup: {order.pickupStatus}</p>}{latest && <p className="max-w-56 text-xs text-ink/55">{latest.description}</p>}{order.lastTrackingSyncAt && <p className="text-xs text-ink/40">Synced {new Date(order.lastTrackingSyncAt).toLocaleString("en-IN")}</p>}{order.shippingFailureReason && <p className="max-w-56 text-xs text-red-700">{order.shippingFailureReason}</p>}</div></Cell><Cell><div className="flex flex-wrap gap-2">{canConfirm(order) && <AdminButton variant="secondary" disabled={orderPending} loading={pending[`confirm:${order._id}`]} onClick={() => onAction?.("confirm", order)}>Confirm</AdminButton>}{canBook(order) && <AdminButton variant="secondary" disabled={orderPending} loading={pending[`book:${order._id}`]} onClick={() => onAction?.("book", order)}>Book Shipment</AdminButton>}{canRequestPickup(order) && <AdminButton variant="secondary" disabled={orderPending} loading={pending[`pickup:${order._id}`]} onClick={() => onAction?.("pickup", order)}>Request Pickup</AdminButton>}{canRefreshTracking(order) && <AdminButton variant="secondary" disabled={orderPending} loading={pending[`tracking:${order._id}`]} onClick={() => onAction?.("tracking", order)}>Refresh Tracking</AdminButton>}{canCancelShipment(order) && <AdminButton variant="danger" disabled={orderPending} loading={pending[`cancel-shipment:${order._id}`]} onClick={() => onAction?.("cancel-shipment", order)}>Cancel Shipment</AdminButton>}{canCancel(order) && <AdminButton variant="danger" disabled={orderPending} loading={pending[`cancel:${order._id}`]} onClick={() => onAction?.("cancel", order)}>Cancel Order</AdminButton>}</div></Cell></tr>; })} />;
}

export function OrdersPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { data, loading, error, setData } = useAdminData(() => adminApi.orders(q ? `?search=${encodeURIComponent(q)}` : ""), [q]);
  const { pending, run } = useAdminAction();
  const { data: serviceData } = useAdminData(adminApi.serviceStatus);
  const shiprocketAvailable = serviceData?.services?.shiprocket?.available !== false;
  const setOrder = (order) => updateItemList(setData, order._id, order);
  const action = async (type, order) => {
    const key = `${type}:${order._id}`;
    const status = type === "confirm" ? "confirmed" : type === "ship" ? "shipped" : type === "deliver" ? "delivered" : "cancelled";
    const labels = { confirm: "Order confirmed.", book: "Shipment booked and AWB assigned.", pickup: "Pickup requested.", tracking: "Tracking refreshed.", "cancel-shipment": "Shipment cancelled.", ship: "Order marked shipped.", deliver: "Order delivered.", cancel: "Order cancelled." };
    const result = await run(key, type === "book" ? () => adminApi.readyToShip(order._id) : type === "pickup" ? () => adminApi.requestPickup(order._id) : type === "tracking" ? () => adminApi.refreshTracking(order._id) : type === "cancel-shipment" ? () => adminApi.cancelShipment(order._id) : () => adminApi.orderStatus(order._id, status), labels[type]);
    if (result?.order) {
      setOrder(result.order);
      window.dispatchEvent(new CustomEvent("ss-admin-data-changed", { detail: { scopes: ["dashboard", "orders", "inventory", "products"] } }));
      if (type === "pickup") navigate(`/admin/shipping?ready=${order._id}`);
    }
  };
  return <><AdminPageHeader title="Orders" description="Review and process customer orders." /><AdminFilters><SearchBox value={q} onChange={setQ} placeholder="Search orders" /></AdminFilters><State loading={loading} error={error} empty={!data?.items?.length} title="No orders found." />{data?.items?.length ? <OrdersTable orders={data.items} onAction={action} pending={pending} shiprocketAvailable={shiprocketAvailable} /> : null}</>;
}

function ProductEditor({ open, onClose, product, categories, onSaved }) {
  const { pending, run } = useAdminAction();
  const { data: serviceData } = useAdminData(adminApi.serviceStatus);
  const uploadAvailable = serviceData?.services?.cloudinary?.available !== false;
  const uploadMessage = serviceData?.services?.cloudinary?.message || "Image uploads are temporarily unavailable.";
  const emptyVariant = () => ({ size: "", price: "", mrp: "", shippingWeight: "", dimensions: { length: "", width: "", height: "" }, images: [], isActive: true });
  const empty = { title: "", description: "", category: "", stock: "", variants: [emptyVariant()], featured: false, bestSeller: false, newArrival: false, codEnabled: true, onlinePaymentEnabled: true, returnEligible: true, exchangeEligible: false, isActive: true };
  const [form, setForm] = useState(product || empty);
  const [errors, setErrors] = useState({});
  const [uploadState, setUploadState] = useState({ status: "idle", message: "" });
  useEffect(() => {
    const variants = product?.variants?.length ? product.variants.map((variant) => ({ ...emptyVariant(), ...variant, dimensions: { ...emptyVariant().dimensions, ...variant.dimensions } })) : [emptyVariant()];
    setForm(product ? { ...empty, ...product, category: product.category?._id || product.category, variants } : { ...empty, variants });
    setErrors({});
    setUploadState({ status: "idle", message: "" });
  }, [product, open]);

  const validate = () => {
    const next = {
      title: form.title?.trim() ? "" : "Product title is required.",
      description: form.description?.trim() ? "" : "Description is required.",
      category: form.category ? "" : "Select a category.",
      stock: Number.isFinite(Number(form.stock)) && Number(form.stock) >= 0 ? "" : "Enter total product stock in litres.",
      variants: form.variants?.some((variant) => variant.isActive !== false) && form.variants.every((variant) => /^(\d+(?:\.\d+)?)\s*(ml|l|litres?|liters?)$/i.test(variant.size?.trim()) && Number(variant.price) > 0 && Number(variant.mrp) >= Number(variant.price) && Number(variant.shippingWeight) > 0 && Number(variant.dimensions?.length) > 0 && Number(variant.dimensions?.width) > 0 && Number(variant.dimensions?.height) > 0 && variant.images?.length) && new Set(form.variants.map((variant) => variant.size.trim().toLowerCase())).size === form.variants.length ? "" : "Every variant needs a unique volume, valid price/MRP, image, weight in kg, and exact positive dimensions in cm.",
    };
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  const upload = async (file, input, variantIndex) => {
    if (!uploadAvailable || pending["product:image"]) return;
    setUploadState({ status: "uploading", message: `Uploading ${file.name}...` });
    const data = await run("product:image", () => adminApi.uploadImage(file), "Image uploaded.");
    if (input) input.value = "";
    if (data) {
      setForm((current) => ({ ...current, variants: current.variants.map((variant, index) => index === variantIndex ? { ...variant, images: [...variant.images, data.image || data] } : variant) }));
      setErrors((current) => ({ ...current, variants: "" }));
      setUploadState({ status: "success", message: "Image uploaded successfully." });
    } else {
      setUploadState({ status: "error", message: "Image upload failed. Select the file and try again." });
    }
  };

  const save = async () => {
    if (pending["product:image"] || !validate()) return;
    const variants = form.variants.map(({ sku: _sku, stock: _stock, stockUnit: _stockUnit, ...variant }) => ({ ...variant, size: variant.size.trim(), price: Number(variant.price), mrp: Number(variant.mrp), shippingWeight: Number(variant.shippingWeight), dimensions: { length: Number(variant.dimensions.length), width: Number(variant.dimensions.width), height: Number(variant.dimensions.height) } }));
    const primary = variants.find((variant) => variant.isActive !== false) || variants[0];
    const payload = {
      ...form,
      price: primary.price,
      discountPrice: undefined,
      stock: Number(form.stock),
      size: primary.size,
      images: primary.images,
      category: form.category?._id || form.category,
      variants,
    };
    const result = await run("product:save", () => adminApi.saveProduct(payload, product?._id), "Product saved.");
    if (result?.product) { onSaved(result.product); window.dispatchEvent(new CustomEvent("ss-admin-data-changed", { detail: { scopes: ["products", "inventory", "dashboard"] } })); onClose(); }
  };

  const numberProps = { min: "0", inputMode: "decimal", onKeyDown: blockInvalidNumberKey };
  return <AdminModal title={product ? "Edit Product" : "Add Product"} open={open} onClose={pending["product:image"] || pending["product:save"] ? undefined : onClose} footer={<AdminButton disabled={pending["product:image"] || categories.length === 0} loading={pending["product:save"]} onClick={save}>{pending["product:image"] ? "Uploading image..." : "Save Product"}</AdminButton>}>
    <div className="grid gap-4">
      <AdminInput label="Product Name / Title" value={form.title || ""} error={errors.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <label className="grid gap-1.5 text-sm font-semibold text-ink/65"><span>Description</span><textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`min-h-24 rounded-lg border bg-white px-3 py-2 text-sm text-ink outline-none ${errors.description ? "border-red-400" : "border-ink/10 focus:border-leaf"}`} />{errors.description && <span className="text-xs text-red-700">{errors.description}</span>}</label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold text-ink/65"><span>Category</span><select value={form.category?._id || form.category || ""} onChange={(e) => { setForm({ ...form, category: e.target.value }); setErrors((current) => ({ ...current, category: "" })); }} className={`h-10 rounded-lg border bg-white px-3 text-sm ${errors.category ? "border-red-400" : "border-ink/10"}`}><option value="">Select a category</option>{categories.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>{errors.category && <span className="text-xs text-red-700">{errors.category}</span>}</label>
        <AdminInput label="Total Product Stock (Liters)" type="number" step="0.1" value={form.stock ?? ""} error={errors.stock} {...numberProps} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
      </div>
      <p className="rounded-xl bg-linen p-3 text-sm font-semibold text-ink/60">Stock is one shared product-level pool measured in liters. Variant weight is entered in kilograms; dimensions are entered manually in centimeters and are used exactly for shipping.</p>
      <section aria-labelledby="product-variants-heading">
        <div className="flex items-end justify-between gap-4 border-b border-[var(--admin-border)] pb-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--admin-primary)]">Product options</p><h3 id="product-variants-heading" className="mt-1 text-lg font-bold">Variants</h3></div><span className="rounded-full bg-linen px-3 py-1 text-xs font-bold text-ink/55">{form.variants.length} {form.variants.length === 1 ? "variant" : "variants"}</span></div>
        {errors.variants && <p className="mt-2 text-xs font-semibold text-red-700">{errors.variants}</p>}
        <div className="mt-4 grid gap-5">{form.variants.map((variant, variantIndex) => {
          const updateVariant = (updates) => setForm({ ...form, variants: form.variants.map((item, index) => index === variantIndex ? { ...item, ...updates } : item) });
          return <article key={variant._id || variantIndex} aria-labelledby={`variant-heading-${variantIndex}`} className="overflow-hidden rounded-xl border border-[var(--admin-border)] bg-white shadow-sm">
            <header className="flex items-center justify-between gap-3 border-b border-[var(--admin-border)] bg-linen/55 px-4 py-3"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--admin-primary)] text-sm font-extrabold text-white">{variantIndex + 1}</span><div><p id={`variant-heading-${variantIndex}`} className="text-base font-extrabold uppercase tracking-[0.08em] text-ink">Variant: {variant.size || variantIndex + 1}</p><p className="text-xs font-semibold text-ink/45">Pricing, images, and manually measured shipping data</p></div></div><Toggle label="Active" checked={variant.isActive} onChange={(value) => updateVariant({ isActive: value })} /></header>
            <div className="p-4"><div className="grid gap-3 md:grid-cols-2"><AdminInput label="Variant Name / Volume" value={variant.size || ""} onChange={(e) => updateVariant({ size: e.target.value })} /><AdminInput label="Selling Price (₹)" type="number" value={variant.price ?? ""} {...numberProps} onChange={(e) => updateVariant({ price: e.target.value })} /><AdminInput label="MRP (₹)" type="number" value={variant.mrp ?? ""} {...numberProps} onChange={(e) => updateVariant({ mrp: e.target.value })} /><AdminInput label="Weight (kg)" type="number" step="0.001" value={variant.shippingWeight ?? ""} {...numberProps} onChange={(e) => updateVariant({ shippingWeight: e.target.value })} /><AdminInput label="Length (cm)" type="number" step="0.01" value={variant.dimensions?.length ?? ""} {...numberProps} onChange={(e) => updateVariant({ dimensions: { ...variant.dimensions, length: e.target.value } })} /><AdminInput label="Width (cm)" type="number" step="0.01" value={variant.dimensions?.width ?? ""} {...numberProps} onChange={(e) => updateVariant({ dimensions: { ...variant.dimensions, width: e.target.value } })} /><AdminInput label="Height (cm)" type="number" step="0.01" value={variant.dimensions?.height ?? ""} {...numberProps} onChange={(e) => updateVariant({ dimensions: { ...variant.dimensions, height: e.target.value } })} /><AdminInput label="SKU (Auto-generated)" value={variant.sku || "Generated when saved"} disabled /></div>
            <p className="mt-4 text-sm font-bold text-ink/70">Variant Images</p><div className="mt-2 flex flex-wrap gap-3">{variant.images.map((image, imageIndex) => <div key={`${image.url}-${imageIndex}`} className="relative"><img src={image.url} alt="" className="h-20 w-20 rounded-lg object-cover" /><button type="button" onClick={() => updateVariant({ images: variant.images.filter((_, index) => index !== imageIndex) })} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-white">×</button></div>)}<label title={uploadAvailable ? "" : uploadMessage} className={`grid h-20 w-20 place-items-center rounded-lg border border-dashed text-xs font-bold ${uploadAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>Add Images<input type="file" accept="image/*" multiple disabled={!uploadAvailable || pending["product:image"]} className="hidden" onChange={async (event) => { for (const file of Array.from(event.target.files || [])) await upload(file, null, variantIndex); event.target.value = ""; }} /></label></div>
            {uploadState.message && <p role="status" className={`mt-3 inline-flex items-center gap-2 text-sm font-semibold ${uploadState.status === "error" ? "text-red-700" : uploadState.status === "success" ? "text-leaf" : "text-ink/60"}`}>{uploadState.status === "uploading" ? <Loader2 size={15} className="animate-spin" /> : uploadState.status === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}{uploadState.message}</p>}
            {form.variants.length > 1 && <div className="mt-4 flex justify-end border-t border-[var(--admin-border)] pt-4"><AdminButton variant="danger" onClick={() => setForm({ ...form, variants: removeVariant(form.variants, variantIndex) })}>Remove Variant {variantIndex + 1}</AdminButton></div>}</div>
          </article>;
        })}</div>
        <button type="button" onClick={() => setForm({ ...form, variants: addVariant(form.variants, emptyVariant) })} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--admin-primary)]/40 bg-[var(--admin-primary)]/5 text-sm font-extrabold text-[var(--admin-primary)] transition hover:border-[var(--admin-primary)] hover:bg-[var(--admin-primary)]/10 focus:outline-none focus:ring-4 focus:ring-[var(--admin-primary)]/15"><Plus size={17} /> Add Variant</button>
      </section>
      <div className="grid gap-3 md:grid-cols-2"><Toggle label="Featured" checked={form.featured} onChange={(value) => setForm({ ...form, featured: value })} /><Toggle label="Best Seller" checked={form.bestSeller} onChange={(value) => setForm({ ...form, bestSeller: value })} /><Toggle label="New Arrival" checked={form.newArrival} onChange={(value) => setForm({ ...form, newArrival: value })} /><Toggle label="COD Enabled" checked={form.codEnabled !== false} onChange={(value) => setForm({ ...form, codEnabled: value })} /><Toggle label="Online Payment Enabled" checked={form.onlinePaymentEnabled !== false} onChange={(value) => setForm({ ...form, onlinePaymentEnabled: value })} /><Toggle label="Return Eligible" checked={form.returnEligible !== false} onChange={(value) => setForm({ ...form, returnEligible: value })} /><Toggle label="Exchange Eligible" checked={form.exchangeEligible} onChange={(value) => setForm({ ...form, exchangeEligible: value })} /><Toggle label="Active" checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} /></div>
    </div>
  </AdminModal>;
}

export function ProductsPage() {
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selected, setSelected] = useState([]);
  const [preview, setPreview] = useState(null);
  const [editor, setEditor] = useState(null);
  const [bulk, setBulk] = useState({ operation: "increase_percentage", value: 10 });
  const productQuery = new URLSearchParams(Object.entries({ search: q || undefined, category: categoryFilter || undefined }).filter(([, value]) => value));
  const { data, loading, error, reload, setData } = useAdminData(() => adminApi.products(productQuery.toString() ? `?${productQuery}` : ""), [q, categoryFilter]);
  useAdminRefresh(reload, ["products"]);
  const { data: catData } = useAdminData(adminApi.categories);
  const { pending, run } = useAdminAction();
  const products = data?.items || [];
  const categories = catData?.items || [];
  const saveRow = (product) => setData((current) => current ? { ...current, items: current.items?.some((item) => item._id === product._id) ? current.items.map((item) => item._id === product._id ? { ...item, ...product } : item) : [product, ...(current.items || [])] } : current);
  const doPreview = async () => { const result = await run("bulk:preview", () => adminApi.bulkPreview({ target: { productIds: selected }, ...bulk }), "Preview generated."); if (result) setPreview(result); };
  const apply = async () => { const result = await run("bulk:apply", () => adminApi.bulkApply({ target: { productIds: selected }, ...bulk }), "Bulk update applied."); if (result) { setSelected([]); setPreview(null); reload(); } };
  const archive = async (product) => { const result = await run(`product:archive:${product._id}`, () => adminApi.archiveProduct(product._id), "Product archived."); if (result?.product) updateItemList(setData, product._id, result.product, true); };
  return <><AdminPageHeader title="Products" description="Manage products, pricing and availability." action={<AdminButton onClick={() => setEditor({})}><Plus size={16} />Add Product</AdminButton>} /><AdminFilters><SearchBox value={q} onChange={setQ} placeholder="Search products" /><AdminSelect label="Category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</AdminSelect></AdminFilters>{selected.length > 0 && <div className="mb-4 rounded-xl border border-[var(--admin-border)] bg-white p-4"><p className="font-bold">Selected: {selected.length} products</p><div className="mt-3 grid gap-3 md:grid-cols-5"><AdminSelect label="Bulk Action" value={bulk.operation} onChange={(e) => setBulk({ ...bulk, operation: e.target.value })}>{[["increase_percentage","Increase Price %"],["decrease_percentage","Decrease Price %"],["increase_fixed","Increase Price Rs."],["decrease_fixed","Decrease Price Rs."],["set_exact_price","Set Exact Price"],["set_discount_percentage","Set Discount %"],["set_exact_discount","Set Discount Price"],["remove_discount","Remove Discount"],["add_stock","Add Stock"],["reduce_stock","Reduce Stock"],["set_stock","Set Stock"],["activate","Activate"],["deactivate","Deactivate"],["archive","Archive"],["mark_featured","Mark Featured"],["remove_featured","Remove Featured"],["move_category","Move to Category"],["set_weight","Set Weight"],["set_dimensions","Set Dimensions"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</AdminSelect><AdminInput label="Value" type="number" value={bulk.value || ""} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} /><AdminSelect label="Category" value={bulk.category || ""} onChange={(e) => setBulk({ ...bulk, category: e.target.value })}><option value="">Select</option>{categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</AdminSelect><AdminButton variant="secondary" loading={pending["bulk:preview"]} onClick={doPreview}>Preview</AdminButton><AdminButton loading={pending["bulk:apply"]} onClick={apply}>Apply Changes</AdminButton></div>{preview?.examples?.map((item) => <span key={item.id} className="mr-2 mt-3 inline-flex rounded-full bg-linen px-3 py-1 text-sm">{item.title}: {money(item.before)} to {money(item.after)}</span>)}{preview && preview.count > 5 && <span className="text-sm text-ink/50">+ {preview.count - 5} more products</span>}</div>}<State loading={loading} error={error} empty={!products.length} title="No products found." description="Add your first product." action={<AdminButton onClick={() => setEditor({})}>Add Product</AdminButton>} />{products.length ? <AdminTable columns={["", "Product", "Category", "SKU", "Price", "Discount", "Stock", "Status", "Featured", "Actions"]} rows={products.map((product) => <tr key={product._id}><Cell><input type="checkbox" checked={selected.includes(product._id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, product._id] : current.filter((id) => id !== product._id))} /></Cell><Cell className="font-bold">{product.title}</Cell><Cell>{product.category?.name || "-"}</Cell><Cell>{product.sku || "-"}</Cell><Cell>{money(product.price)}</Cell><Cell>{product.discountPrice ? money(product.discountPrice) : "-"}</Cell><Cell>{product.stock}</Cell><Cell><AdminBadge>{product.isActive ? "Active" : "Inactive"}</AdminBadge></Cell><Cell>{product.featured ? "Yes" : "No"}</Cell><Cell><div className="flex gap-2"><AdminButton variant="secondary" onClick={() => setEditor(product)}>Edit</AdminButton><AdminButton variant="secondary" onClick={() => setEditor({ ...product, _id: undefined, title: `${product.title} Copy` })}>Duplicate</AdminButton><AdminButton variant="danger" loading={pending[`product:archive:${product._id}`]} onClick={() => archive(product)}><Trash2 size={14} /></AdminButton></div></Cell></tr>)} /> : null}<ProductEditor open={Boolean(editor)} product={editor?._id ? editor : null} categories={categories} onClose={() => setEditor(null)} onSaved={saveRow} /></>;
}

export function ProductFormPage() { return <ProductsPage />; }

export function InventoryPage() {
  const { data, loading, error, reload, setData } = useAdminData(() => adminApi.products("?limit=100"));
  useAdminRefresh(reload, ["inventory"]);
  const { data: settingsData } = useAdminData(adminApi.settings);
  const [filter, setFilter] = useState("All");
  const [editing, setEditing] = useState(null);
  const threshold = settingsData?.settings?.lowStockThreshold ?? 10;
  const status = (stock) => stock === 0 ? "Out of Stock" : stock <= threshold ? "Low Stock" : "In Stock";
  const items = (data?.items || []).map((product) => ({ product, stock: Number(product.stock || 0) })).filter((item) => filter === "All" || status(item.stock) === filter);
  const saveRow = (product) => updateItemList(setData, product._id, product);
  return <><AdminPageHeader title="Inventory" description="Update the single product-level stock pool in litres." /><AdminFilters><AdminSelect label="Stock Status" value={filter} onChange={(e) => setFilter(e.target.value)}>{["All", "In Stock", "Low Stock", "Out of Stock"].map((item) => <option key={item}>{item}</option>)}</AdminSelect></AdminFilters><State loading={loading} error={error} empty={!items.length} />{items.length ? <AdminTable columns={["Product", "Available Litres", "Stock Status", "Actions"]} rows={items.map(({ product, stock }) => <tr key={product._id}><Cell>{product.title}</Cell><Cell>{stock}L available</Cell><Cell><AdminBadge>{status(stock)}</AdminBadge></Cell><Cell><div className="flex gap-2"><AdminButton variant="secondary" onClick={() => setEditing({ product, mode: "add", quantity: 1 })}>Add Litres</AdminButton><AdminButton variant="secondary" onClick={() => setEditing({ product, mode: "reduce", quantity: 1 })}>Reduce Litres</AdminButton><AdminButton variant="secondary" onClick={() => setEditing({ product, mode: "set", quantity: stock })}>Set Exact</AdminButton></div></Cell></tr>)} /> : null}<StockModal state={editing} onClose={() => setEditing(null)} onSaved={saveRow} /></>;
}

function StockModal({ state, onClose, onSaved }) {
  const { pending, run } = useAdminAction();
  const [quantity, setQuantity] = useState(1);
  useEffect(() => setQuantity(state?.quantity ?? ""), [state]);
  if (!state) return null;
  const current = Number(state.product.stock ?? 0);
  const qty = quantity === "" ? 0 : Number(quantity);
  const next = state.mode === "set" ? qty : state.mode === "reduce" ? Math.max(0, current - qty) : current + qty;
  const invalid = quantity === "" || qty < 0 || !Number.isFinite(qty) || (state.mode !== "set" && qty === 0) || (state.mode === "reduce" && qty > current);
  const save = async () => { if (invalid) return; const result = await run(`inventory:${state.product._id}`, () => adminApi.inventory(state.product._id, { mode: state.mode, quantity: qty }), "Inventory updated."); if (result?.product) { onSaved(result.product); window.dispatchEvent(new CustomEvent("ss-admin-data-changed", { detail: { scopes: ["dashboard", "products", "inventory"] } })); onClose(); } };
  return <AdminModal title="Update Product Stock" open onClose={onClose} footer={<AdminButton disabled={invalid} loading={pending[`inventory:${state.product._id}`]} onClick={save}>Update Stock</AdminButton>}><div className="grid gap-4"><AdminCard title="Product" value={state.product.title} note="One shared stock pool measured in liters" /><AdminInput label={state.mode === "set" ? "Set Available Litres To" : state.mode === "reduce" ? "Reduce Litres" : "Add Litres"} type="number" min="0" step="0.1" inputMode="decimal" value={quantity} onKeyDown={blockInvalidNumberKey} onChange={(e) => setQuantity(e.target.value)} /><div className="rounded-xl bg-linen p-4 text-sm font-bold">Preview: {current}L {state.mode === "add" ? "+" : state.mode === "reduce" ? "-" : "="} {qty}L = {next}L</div>{invalid && <p className="text-sm font-semibold text-red-700">Enter valid litres. Add/reduce must be greater than zero, and stock cannot go below zero.</p>}</div></AdminModal>;
}

function CategoryForm({ open, category, onClose, onSaved }) {
  const { pending, run } = useAdminAction();
  const { data: serviceData } = useAdminData(adminApi.serviceStatus);
  const uploadAvailable = serviceData?.services?.cloudinary?.available !== false;
  const uploadMessage = serviceData?.services?.cloudinary?.message || "Image uploads are temporarily unavailable.";
  const [form, setForm] = useState(category || { name: "", description: "", image: "", isActive: true });
  useEffect(() => setForm(category || { name: "", description: "", image: "", isActive: true }), [category, open]);
  const upload = async (file) => { if (!uploadAvailable) return; const data = await run("category:image", () => adminApi.uploadImage(file), "Image uploaded."); if (data) setForm((cur) => ({ ...cur, image: data.image?.url || data.url || data.image })); };
  return <AdminModal title={category?._id ? "Edit Category" : "Add Category"} open={open} onClose={onClose} footer={<AdminButton loading={pending["category:save"]} onClick={async () => { const result = await run("category:save", () => adminApi.saveCategory(form, category?._id), "Category saved."); if (result?.category) { onSaved(result.category); onClose(); } }}>Save Category</AdminButton>}><div className="grid gap-4"><AdminInput label="Category Name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /><AdminTextarea label="Description" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /><div>{form.image && <img src={form.image} alt="" className="mb-3 h-24 w-24 rounded-lg object-cover" />}<label title={uploadAvailable ? "" : uploadMessage} className={`inline-flex rounded-lg border border-[var(--admin-border)] px-3 py-2 text-sm font-bold ${uploadAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>Upload Image<input type="file" accept="image/*" disabled={!uploadAvailable} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label></div><Toggle label="Active" checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} />{category?.productCount > 0 && <p className="rounded-lg bg-linen p-3 text-sm font-semibold text-ink/60">This category is currently used by {category.productCount} products and cannot be deleted. Deactivate it instead.</p>}</div></AdminModal>;
}

export function CategoriesPage() {
  const { data, loading, error, setData } = useAdminData(adminApi.categories);
  const [editing, setEditing] = useState(null);
  const items = data?.items || [];
  const saveRow = (category) => setData((current) => current ? { ...current, items: current.items?.some((item) => item._id === category._id) ? current.items.map((item) => item._id === category._id ? { ...item, ...category } : item) : [category, ...(current.items || [])] } : current);
  return <><AdminPageHeader title="Categories" description="Organize products into clear groups." action={<AdminButton onClick={() => setEditing({})}><Plus size={16} />Add Category</AdminButton>} /><State loading={loading} error={error} empty={!items.length} title="No categories yet." description="Create a category to organize your products." action={<AdminButton onClick={() => setEditing({})}>Add Category</AdminButton>} />{items.length ? <AdminTable columns={["Image", "Category Name", "Description", "Products", "Status", "Actions"]} rows={items.map((c) => <tr key={c._id}><Cell>{c.image ? <img src={c.image} alt="" className="h-10 w-10 rounded-lg object-cover" /> : "-"}</Cell><Cell className="font-bold">{c.name}</Cell><Cell>{c.description || "-"}</Cell><Cell>{c.productCount || 0}</Cell><Cell><AdminBadge>{c.isActive ? "Active" : "Disabled"}</AdminBadge></Cell><Cell><AdminButton variant="secondary" onClick={() => setEditing(c)}>Edit</AdminButton></Cell></tr>)} /> : null}<CategoryForm open={Boolean(editing)} category={editing?._id ? editing : null} onClose={() => setEditing(null)} onSaved={saveRow} /></>;
}

function OfferForm({ open, offer, categories, products, onClose, onSaved }) {
  const { pending, run } = useAdminAction();
  const { showToast } = useToast();
  const empty = { name: "", description: "", discountValue: 5, startDate: new Date().toISOString().slice(0, 16), endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16), targetType: "CATEGORY", categories: [], products: [], variants: [], isActive: true };
  const [form, setForm] = useState(empty);
  useEffect(() => setForm(offer ? { ...empty, ...offer, startDate: String(offer.startDate).slice(0, 16), endDate: String(offer.endDate).slice(0, 16), categories: (offer.categories || []).map((item) => item._id || item), products: (offer.products || []).map((item) => item._id || item), variants: offer.variants || [] } : empty), [offer, open]);
  const toggle = (field, value) => setForm((current) => ({ ...current, [field]: current[field].map(String).includes(String(value)) ? current[field].filter((item) => String(item) !== String(value)) : [...current[field], value] }));
  const toggleVariant = (product, variant) => setForm((current) => ({ ...current, variants: current.variants.some((item) => String(item.product?._id || item.product) === String(product._id) && String(item.variant) === String(variant._id)) ? current.variants.filter((item) => !(String(item.product?._id || item.product) === String(product._id) && String(item.variant) === String(variant._id))) : [...current.variants, { product: product._id, variant: variant._id }] }));
  const targets = form.categories.length + form.products.length + form.variants.length;
  const allCategoryIds = categories.map((category) => String(category._id));
  const allVariants = products.flatMap((product) => (product.variants || []).map((variant) => ({ product: String(product._id), variant: String(variant._id) })));
  const allCategoriesSelected = allCategoryIds.length > 0 && allCategoryIds.every((id) => form.categories.map(String).includes(id));
  const allVariantsSelected = allVariants.length > 0 && allVariants.every((target) => form.variants.some((item) => String(item.product?._id || item.product) === target.product && String(item.variant?._id || item.variant) === target.variant));
  const affectedVariants = new Set([
    ...form.variants.map((item) => `${item.product?._id || item.product}:${item.variant?._id || item.variant}`),
    ...products.filter((product) => form.products.map(String).includes(String(product._id)) || form.categories.map(String).includes(String(product.category?._id || product.category))).flatMap((product) => (product.variants || []).map((variant) => `${product._id}:${variant._id}`)),
  ]).size;
  const sample = products.flatMap((product) => product.variants?.length ? product.variants : [{ price: product.baseSellingPrice || product.price }])[0];
  const preview = sample ? Number(sample.price) * (1 - Number(form.discountValue || 0) / 100) : 0;
  const save = async () => {
    const allowed = form.targetType === "CATEGORY" ? form.categories.length : form.targetType === "VARIANT" ? form.variants.length : targets;
    if (!form.name.trim()) return showToast("Offer name is required.", "error");
    if (Number(form.discountValue) <= 0 || Number(form.discountValue) > 100) return showToast("Discount percentage must be between 0 and 100.", "error");
    if (!allowed) return showToast("Please select at least one target.", "error");
    if (new Date(form.endDate) <= new Date(form.startDate)) return showToast("Offer end date must be after its start date.", "error");
    const payload = { ...form, discountType: "PERCENTAGE", discountValue: Number(form.discountValue), categories: form.targetType === "VARIANT" ? [] : form.categories, products: form.targetType === "CATEGORY" || form.targetType === "VARIANT" ? [] : form.products, variants: form.targetType === "CATEGORY" ? [] : form.variants };
    const result = await run("offer:save", () => offer?._id ? adminApi.updateOffer(offer._id, payload) : adminApi.createOffer(payload), offer?._id ? "Offer updated successfully." : "Offer created successfully.");
    if (result?.offer) { onSaved(result.offer); window.dispatchEvent(new CustomEvent("ss-oil-mill-promotions-changed")); onClose(); }
  };
  return <AdminModal title={offer?._id ? "Edit Offer" : "Create Offer"} open={open} onClose={onClose} footer={<AdminButton disabled={pending["offer:save"]} loading={pending["offer:save"]} onClick={save}>{offer?._id ? "Save Offer" : "Create Offer"}</AdminButton>}><div className="grid gap-4"><div className="grid gap-4 md:grid-cols-2"><AdminInput label="Offer name/title" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><AdminInput label="Discount percentage" type="number" min="0.01" max="100" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} /><AdminInput label="Start date/time" type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /><AdminInput label="End date/time" type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div><AdminTextarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><div><p className="mb-2 text-sm font-bold">Offer applies to:</p><div className="flex flex-wrap gap-3">{[["CATEGORY","Categories"],["VARIANT","Specific variants"],["CUSTOM","Custom selection"]].map(([value,label]) => <label key={value} className="flex items-center gap-2 rounded-lg bg-linen px-3 py-2 text-sm font-semibold"><input type="radio" checked={form.targetType === value} onChange={() => setForm({ ...form, targetType: value })} />{label}</label>)}</div></div>{form.targetType !== "VARIANT" && <div><div className="mb-2 flex items-center justify-between gap-3"><p className="text-sm font-bold">Categories</p><div className="flex gap-2"><button type="button" onClick={() => setForm((current) => ({ ...current, categories: allCategoryIds }))} className="text-xs font-bold text-leaf">Select All</button><button type="button" onClick={() => setForm((current) => ({ ...current, categories: [] }))} className="text-xs font-bold text-ink/55">Clear All</button></div></div><label className="mb-3 flex gap-2 text-sm font-bold"><input type="checkbox" checked={allCategoriesSelected} onChange={(event) => setForm((current) => ({ ...current, categories: event.target.checked ? allCategoryIds : [] }))} />All categories</label><div className="grid gap-2 md:grid-cols-2">{categories.map((category) => <label key={category._id} className="flex gap-2 text-sm"><input type="checkbox" checked={form.categories.map(String).includes(String(category._id))} onChange={() => toggle("categories", category._id)} />{category.name}</label>)}</div></div>}{form.targetType === "CUSTOM" && <div><p className="mb-2 text-sm font-bold">Products</p><div className="grid max-h-40 gap-2 overflow-auto md:grid-cols-2">{products.map((product) => <label key={product._id} className="flex gap-2 text-sm"><input type="checkbox" checked={form.products.map(String).includes(String(product._id))} onChange={() => toggle("products", product._id)} />{product.title}</label>)}</div></div>}{form.targetType !== "CATEGORY" && <div><div className="mb-2 flex items-center justify-between gap-3"><p className="text-sm font-bold">Variants</p><div className="flex gap-2"><button type="button" onClick={() => setForm((current) => ({ ...current, variants: allVariants }))} className="text-xs font-bold text-leaf">Select All Variants</button><button type="button" onClick={() => setForm((current) => ({ ...current, variants: [] }))} className="text-xs font-bold text-ink/55">Clear All</button></div></div><label className="mb-3 flex gap-2 text-sm font-bold"><input type="checkbox" checked={allVariantsSelected} onChange={(event) => setForm((current) => ({ ...current, variants: event.target.checked ? allVariants : [] }))} />All variants</label><div className="grid max-h-52 gap-3 overflow-auto">{products.filter((product) => product.variants?.length).map((product) => <div key={product._id}><p className="text-sm font-bold">{product.title}</p><div className="mt-1 flex flex-wrap gap-3">{product.variants.map((variant) => <label key={`${product._id}:${variant._id}`} className="flex gap-2 text-sm"><input type="checkbox" checked={form.variants.some((item) => String(item.product?._id || item.product) === String(product._id) && String(item.variant?._id || item.variant) === String(variant._id))} onChange={() => toggleVariant(product, variant)} />{variant.size}</label>)}</div></div>)}</div></div>}<Toggle label="Active" checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} /><div className="rounded-xl border border-leaf/15 p-4 text-sm"><p className="font-bold text-leaf">{form.discountValue || 0}% OFF</p><p className="mt-1">Applies to: {form.categories.length === categories.length && categories.length ? `All ${categories.length} categories` : `${form.categories.length} categories`}{form.products.length ? `, ${form.products.length} products` : ""}</p><p>Affected variants: {affectedVariants}</p>{sample && <><p className="mt-2">Example: {money(sample.price)} → <span className="font-bold text-leaf">{money(preview)}</span></p><p className="text-leaf">Save {money(Number(sample.price) - preview)}</p></>}</div></div></AdminModal>;
}

function LegacyOfferForm({ open, offer, categories, products, onClose, onSaved }) {
  const { pending, run } = useAdminAction();
  const [form, setForm] = useState({});
  useEffect(() => setForm(offer || { name: "", description: "", discountType: "PERCENTAGE", discountValue: 10, scope: "STORE", startDate: today, endDate: today, bannerText: "", isActive: true }), [offer, open]);
  return <AdminModal title={offer?._id ? "Edit Offer" : "Create Offer"} open={open} onClose={onClose} footer={<AdminButton loading={pending["offer:save"]} onClick={async () => { const payload = { ...form, discountValue: Number(form.discountValue), discountType: normalizeDiscountType(form.discountType) }; const result = await run("offer:save", () => offer?._id ? adminApi.updateOffer(offer._id, payload) : adminApi.createOffer(payload), "Offer saved."); if (result?.offer) { onSaved(result.offer); onClose(); } }}>{offer?._id ? "Save Offer" : "Create Offer"}</AdminButton>}><div className="grid gap-4 md:grid-cols-2"><AdminInput label="Offer Name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /><AdminInput label="Description" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /><AdminSelect label="Discount Type" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed Amount</option></AdminSelect><AdminInput label="Discount Value" type="number" value={form.discountValue || ""} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} /><AdminSelect label="Apply To" value={mapScope(form.scope)} onChange={(e) => setForm({ ...form, scope: scopeFromLabel(e.target.value) })}><option>Entire Store</option><option>Category</option><option>Selected Products</option></AdminSelect>{form.scope === "CATEGORY" && <AdminSelect label="Category" value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</AdminSelect>}{form.scope === "PRODUCTS" && <AdminSelect label="Products" multiple value={form.products || []} onChange={(e) => setForm({ ...form, products: Array.from(e.target.selectedOptions).map((o) => o.value) })}>{products.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}</AdminSelect>}<AdminInput label="Start Date" type="date" value={String(form.startDate || "").slice(0,10)} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /><AdminInput label="End Date" type="date" value={String(form.endDate || "").slice(0,10)} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /><AdminInput label="Offer Banner Text" value={form.bannerText || ""} onChange={(e) => setForm({ ...form, bannerText: e.target.value })} /><Toggle label="Active" checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} /></div></AdminModal>;
}

export function OffersPage() {
  const { data, loading, error, setData } = useAdminData(adminApi.offers);
  const { data: catData } = useAdminData(adminApi.categories);
  const { data: productData } = useAdminData(() => adminApi.products("?limit=100"));
  const { pending, run } = useAdminAction();
  const [editing, setEditing] = useState(null);
  const items = data?.items || [];
  const saveRow = (offer) => setData((current) => current ? { ...current, items: current.items?.some((item) => item._id === offer._id) ? current.items.map((item) => item._id === offer._id ? { ...item, ...offer } : item) : [offer, ...(current.items || [])] } : current);
  const remove = async (offer) => { const result = await run(`offer:delete:${offer._id}`, () => adminApi.deleteOffer(offer._id), "Offer deleted."); if (result) updateItemList(setData, offer._id, offer, true); };
  return <><AdminPageHeader title="Offers" description="Manage scheduled store and product offers." action={<AdminButton onClick={() => setEditing({})}><Plus size={16} />Create Offer</AdminButton>} /><State loading={loading} error={error} empty={!items.length} title="No offers yet." description="Create an offer for your store, categories or selected products." action={<AdminButton onClick={() => setEditing({})}>Create Offer</AdminButton>} />{items.length ? <AdminTable columns={["Offer Name", "Discount", "Applies To", "Start Date", "End Date", "Status", "Actions"]} rows={items.map((o) => <tr key={o._id}><Cell className="font-bold">{o.name}</Cell><Cell>{o.discountType === "PERCENTAGE" ? `${o.discountValue}%` : money(o.discountValue)}</Cell><Cell>{mapScope(o.scope)}</Cell><Cell>{String(o.startDate).slice(0,10)}</Cell><Cell>{String(o.endDate).slice(0,10)}</Cell><Cell><AdminBadge>{offerStatus(o)}</AdminBadge></Cell><Cell><div className="flex gap-2"><AdminButton variant="secondary" onClick={() => setEditing(o)}>Edit</AdminButton><AdminButton variant="secondary" onClick={() => setEditing({ ...o, _id: undefined, name: `${o.name} Copy` })}>Duplicate</AdminButton><AdminButton variant="danger" loading={pending[`offer:delete:${o._id}`]} onClick={() => remove(o)}><Trash2 size={14} /></AdminButton></div></Cell></tr>)} /> : null}<OfferForm open={Boolean(editing)} offer={editing?._id ? editing : null} categories={catData?.items || []} products={productData?.items || []} onClose={() => setEditing(null)} onSaved={saveRow} /></>;
}

function CouponForm({ open, coupon, categories, products, onClose, onSaved }) {
  const { pending, run } = useAdminAction();
  const [form, setForm] = useState({});
  useEffect(() => setForm(coupon || { code: "", description: "", discountType: "PERCENTAGE", discountValue: 10, minimumOrderAmount: 0, maximumDiscountAmount: 0, startDate: today, expiryDate: today, usageLimit: 100, perCustomerUsageLimit: 1, scope: "ALL", firstOrderOnly: false, isActive: true }), [coupon, open]);
  const save = async () => { const payload = { ...form, code: String(form.code || "").toUpperCase(), discountValue: Number(form.discountValue), minimumOrderAmount: Number(form.minimumOrderAmount), maximumDiscountAmount: Number(form.maximumDiscountAmount), usageLimit: Number(form.usageLimit), perCustomerUsageLimit: Number(form.perCustomerUsageLimit) }; const result = await run("coupon:save", () => coupon?._id ? adminApi.updateCoupon(coupon._id, payload) : adminApi.createCoupon(payload), "Coupon saved."); if (result?.coupon) { onSaved(result.coupon); onClose(); } };
  return <AdminModal title={coupon?._id ? "Edit Coupon" : "Create Coupon"} open={open} onClose={onClose} footer={<AdminButton loading={pending["coupon:save"]} onClick={save}>{coupon?._id ? "Save Coupon" : "Create Coupon"}</AdminButton>}><div className="grid gap-4 md:grid-cols-2"><AdminInput label="Coupon Code" value={form.code || ""} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /><AdminInput label="Description" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /><AdminSelect label="Discount Type" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed Amount</option></AdminSelect><AdminInput label="Discount Value" type="number" value={form.discountValue || ""} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} /><AdminInput label="Minimum Order Amount" type="number" value={form.minimumOrderAmount || ""} onChange={(e) => setForm({ ...form, minimumOrderAmount: e.target.value })} /><AdminInput label="Maximum Discount Amount" type="number" value={form.maximumDiscountAmount || ""} onChange={(e) => setForm({ ...form, maximumDiscountAmount: e.target.value })} /><AdminInput label="Start Date" type="date" value={String(form.startDate || "").slice(0,10)} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /><AdminInput label="Expiry Date" type="date" value={String(form.expiryDate || "").slice(0,10)} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /><AdminInput label="Usage Limit" type="number" value={form.usageLimit || ""} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} /><AdminInput label="Per Customer Usage Limit" type="number" value={form.perCustomerUsageLimit || ""} onChange={(e) => setForm({ ...form, perCustomerUsageLimit: e.target.value })} /><AdminSelect label="Apply To" value={form.scope === "CATEGORY" ? "Category" : form.scope === "PRODUCTS" ? "Selected Products" : "All Products"} onChange={(e) => setForm({ ...form, scope: couponScopeFromLabel(e.target.value) })}><option>All Products</option><option>Category</option><option>Selected Products</option></AdminSelect>{form.scope === "CATEGORY" && <AdminSelect label="Category" multiple value={form.categories || []} onChange={(e) => setForm({ ...form, categories: Array.from(e.target.selectedOptions).map((o) => o.value) })}>{categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</AdminSelect>}{form.scope === "PRODUCTS" && <AdminSelect label="Products" multiple value={form.products || []} onChange={(e) => setForm({ ...form, products: Array.from(e.target.selectedOptions).map((o) => o.value) })}>{products.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}</AdminSelect>}<Toggle label="First Order Only" checked={form.firstOrderOnly} onChange={(value) => setForm({ ...form, firstOrderOnly: value })} /><Toggle label="Active" checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} /></div></AdminModal>;
}

export function CouponsPage() {
  const { data, loading, error, reload, setData } = useAdminData(adminApi.coupons);
  const { data: catData } = useAdminData(adminApi.categories);
  const { data: productData } = useAdminData(() => adminApi.products("?limit=100"));
  const { pending, run } = useAdminAction();
  const [editing, setEditing] = useState(null);
  useAdminRefresh(reload, ["coupons", "orders", "payments"]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") reload(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const items = data?.items || [];
  const saveRow = (coupon) => setData((current) => current ? { ...current, items: current.items?.some((item) => item._id === coupon._id) ? current.items.map((item) => item._id === coupon._id ? { ...item, ...coupon } : item) : [coupon, ...(current.items || [])] } : current);
  const remove = async (coupon) => { const result = await run(`coupon:delete:${coupon._id}`, () => adminApi.deleteCoupon(coupon._id), "Coupon deleted."); if (result) updateItemList(setData, coupon._id, coupon, true); };
  return <><AdminPageHeader title="Coupons" description="Create and manage customer coupon codes." action={<AdminButton onClick={() => setEditing({})}><Plus size={16} />Create Coupon</AdminButton>} /><State loading={loading} error={error} empty={!items.length} title="No coupons yet." description="Create a coupon code for customer discounts." action={<AdminButton onClick={() => setEditing({})}>Create Coupon</AdminButton>} />{items.length ? <AdminTable columns={["Coupon Code", "Discount", "Usage", "Minimum Order", "Start Date", "Expiry", "Status", "Actions"]} rows={items.map((c) => <tr key={c._id}><Cell className="font-bold">{c.code}</Cell><Cell>{c.discountType === "PERCENTAGE" ? `${c.discountValue}%` : money(c.discountValue)}</Cell><Cell>{c.usedCount}/{c.usageLimit || "Unlimited"}</Cell><Cell>{money(c.minimumOrderAmount)}</Cell><Cell>{String(c.startDate).slice(0,10)}</Cell><Cell>{String(c.expiryDate).slice(0,10)}</Cell><Cell><AdminBadge>{couponStatus(c)}</AdminBadge></Cell><Cell><div className="flex gap-2"><AdminButton variant="secondary" onClick={() => setEditing(c)}>Edit</AdminButton><AdminButton variant="secondary" onClick={() => setEditing({ ...c, _id: undefined, code: `${c.code}COPY` })}>Duplicate</AdminButton><AdminButton variant="danger" loading={pending[`coupon:delete:${c._id}`]} onClick={() => remove(c)}><Trash2 size={14} /></AdminButton></div></Cell></tr>)} /> : null}<CouponForm open={Boolean(editing)} coupon={editing?._id ? editing : null} categories={catData?.items || []} products={productData?.items || []} onClose={() => setEditing(null)} onSaved={saveRow} /></>;
}

function GalleryUploadModal({ open, onClose, onSaved }) {
  const { pending, run } = useAdminAction();
  const { data: serviceData } = useAdminData(adminApi.serviceStatus);
  const uploadAvailable = serviceData?.services?.cloudinary?.available !== false;
  const uploadMessage = serviceData?.services?.cloudinary?.message || "Image uploads are temporarily unavailable.";
  const [files, setFiles] = useState([]);
  useEffect(() => { if (open) setFiles([]); }, [open]);
  const save = async () => {
    const selected = Array.from(files || []);
    const result = await run("gallery:upload", async () => {
      const saved = [];
      for (const file of selected) {
        const uploaded = await adminApi.uploadImage(file);
        const created = await adminApi.saveGalleryImage({ image: uploaded.image || uploaded, isVisible: true });
        if (created?.image) saved.push(created.image);
      }
      return { items: saved };
    }, `${selected.length} image${selected.length === 1 ? "" : "s"} uploaded.`);
    if (result?.items?.length) { onSaved(result.items); onClose(); }
  };
  return <AdminModal title="Upload Gallery Images" open={open} onClose={onClose} footer={<AdminButton disabled={!files.length || !uploadAvailable} loading={pending["gallery:upload"]} onClick={save}>Upload Images</AdminButton>}><div className="grid gap-4"><label title={uploadAvailable ? "" : uploadMessage} className={`grid min-h-36 place-items-center rounded-xl border border-dashed border-[var(--admin-border)] bg-linen/40 px-4 py-8 text-center text-sm font-bold ${uploadAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}><span>{files.length ? `${files.length} image${files.length === 1 ? "" : "s"} selected` : "Select multiple gallery images"}</span><input type="file" accept="image/*" multiple disabled={!uploadAvailable} className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} /></label>{files.length > 0 && <div className="rounded-lg bg-linen/50 p-3 text-sm font-semibold text-ink/55">{files.map((file) => file.name).join(", ")}</div>}</div></AdminModal>;
}

export function GalleryPage() {
  const { data, loading, error, setData } = useAdminData(adminApi.gallery);
  const { pending, run } = useAdminAction();
  const [uploadOpen, setUploadOpen] = useState(false);
  const items = data?.items || [];
  const addRows = (images) => setData((current) => current ? { ...current, items: [...(current.items || []), ...images].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)) } : { items: images });
  const remove = async (image) => { if (!window.confirm("Delete this gallery image?")) return; const result = await run(`gallery:delete:${image._id}`, () => adminApi.deleteGalleryImage(image._id), "Gallery image deleted."); if (result) updateItemList(setData, image._id, image, true); };
  const toggle = async (image) => { const result = await run(`gallery:toggle:${image._id}`, () => adminApi.saveGalleryImage({ image: image.image, sortOrder: image.sortOrder, isVisible: !image.isVisible }, image._id), image.isVisible ? "Image hidden." : "Image visible."); if (result?.image) updateItemList(setData, image._id, result.image); };
  const move = async (index, direction) => { const next = [...items]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; const result = await run("gallery:reorder", () => adminApi.reorderGallery(next.map((item) => item._id)), "Gallery order updated."); if (result?.items) setData({ items: result.items }); };
  return <><AdminPageHeader title="Gallery" description="Manage homepage gallery images." action={<AdminButton onClick={() => setUploadOpen(true)}><Plus size={16} />Upload Images</AdminButton>} /><State loading={loading} error={error} empty={!items.length} title="No gallery images yet." description="Upload images to show in the homepage gallery." action={<AdminButton onClick={() => setUploadOpen(true)}>Upload Images</AdminButton>} />{items.length ? <AdminTable columns={["Preview", "Status", "Order", "Actions"]} rows={items.map((item, index) => <tr key={item._id}><Cell>{item.image?.url ? <img src={item.image.url} alt="" className="h-14 w-20 rounded-lg object-cover" /> : "-"}</Cell><Cell><AdminBadge>{item.isVisible ? "Active" : "Disabled"}</AdminBadge></Cell><Cell>{index + 1}</Cell><Cell><div className="flex flex-wrap gap-2"><AdminButton variant="secondary" disabled={index === 0} loading={pending["gallery:reorder"]} onClick={() => move(index, -1)}><ArrowUp size={14} /></AdminButton><AdminButton variant="secondary" disabled={index === items.length - 1} loading={pending["gallery:reorder"]} onClick={() => move(index, 1)}><ArrowDown size={14} /></AdminButton><AdminButton variant="secondary" loading={pending[`gallery:toggle:${item._id}`]} onClick={() => toggle(item)}>{item.isVisible ? <EyeOff size={14} /> : <Eye size={14} />}</AdminButton><AdminButton variant="danger" loading={pending[`gallery:delete:${item._id}`]} onClick={() => remove(item)}><Trash2 size={14} /></AdminButton></div></Cell></tr>)} /> : null}<GalleryUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onSaved={addRows} /></>;
}
export function ShippingPage() {
  const location = useLocation();
  const { data, loading, error, setData } = useAdminData(adminApi.shipping);
  const { pending, run } = useAdminAction();
  const items = data?.items || [];
  const selectedReadyId = new URLSearchParams(location.search).get("ready");
  const ready = items.filter((order) => ["pickup_generated", "ready_for_pickup"].includes(order.shippingStatus) && !order.handedOverAt && order.orderStatus !== "cancelled");
  const processed = items.filter((order) => !ready.some((item) => item._id === order._id) && order.shippingStatus !== "pending");
  const handover = async (order) => {
    const result = await run(`handover:${order._id}`, () => adminApi.handoverShipment(order._id), "Order handed over to Shiprocket.");
    if (result?.order) {
      updateItemList(setData, order._id, result.order);
      window.dispatchEvent(new CustomEvent("ss-admin-data-changed", { detail: { scopes: ["dashboard", "orders", "inventory", "products", "shipping"] } }));
    }
  };
  return <><AdminPageHeader title="Shipping" description="Verify ready packages and manage Shiprocket handover." /><State loading={loading} error={error} /><section className="mt-5"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-bold">Ready for Shiprocket Handover</h2><p className="mt-1 text-sm text-[var(--admin-muted)]">These packages are prepared and waiting for the Shiprocket agent. Verify each package before handover.</p></div><AdminBadge>{ready.length} Waiting</AdminBadge></div>{!loading && !error && !ready.length ? <div className="rounded-xl border border-[var(--admin-border)] bg-white p-6 text-sm font-semibold text-[var(--admin-muted)]">No orders are currently waiting for handover.</div> : null}{ready.length ? <AdminTable columns={["Order", "Customer & Shipping", "Products", "Order Details", "Shipment", "Handover"]} rows={ready.map((order) => <tr key={order._id} className={order._id === selectedReadyId ? "bg-leaf/5" : ""}><Cell className="font-bold">{order._id}</Cell><Cell><div className="max-w-64 whitespace-normal"><p className="font-bold">{order.user?.name || order.shippingAddress?.fullName || "Customer"}</p><p className="mt-1 text-xs leading-5 text-ink/55">{order.shippingAddress?.phone}<br />{[order.shippingAddress?.street, order.shippingAddress?.city, order.shippingAddress?.state, order.shippingAddress?.postalCode].filter(Boolean).join(", ")}</p></div></Cell><Cell><div className="max-w-72 whitespace-normal space-y-1">{order.products?.map((product, index) => <p key={`${product.product || product.title}-${index}`} className="text-sm"><span className="font-semibold">{product.title}</span> × {product.quantity}</p>)}</div></Cell><Cell><div className="space-y-1"><p className="font-bold">{money(order.totalAmount)}</p><p className="text-xs text-ink/55">{new Date(order.createdAt).toLocaleString("en-IN")}</p><p className="text-xs font-semibold">{statusText(order.paymentMethod)} · {statusText(order.paymentStatus)}</p></div></Cell><Cell><div className="space-y-1"><AdminBadge>Ready for Pickup</AdminBadge><p className="text-xs font-semibold">{order.courierName || "Shiprocket"}</p><p className="text-xs text-ink/55">AWB: {order.awbCode || "Pending"}</p></div></Cell><Cell><AdminButton disabled={Boolean(pending[`handover:${order._id}`])} loading={pending[`handover:${order._id}`]} onClick={() => handover(order)}>Mark Handed Over</AdminButton></Cell></tr>)} /> : null}</section>{processed.length ? <section className="mt-7"><h2 className="mb-3 text-lg font-bold">Processed Shipments</h2><AdminTable columns={["Order", "Customer", "Status", "Courier", "AWB", "Updated"]} rows={processed.map((order) => <tr key={order._id}><Cell className="font-bold">{order._id}</Cell><Cell>{order.user?.name || order.shippingAddress?.fullName || "Customer"}</Cell><Cell><AdminBadge>{statusText(order.shippingStatus)}</AdminBadge></Cell><Cell>{order.courierName || "-"}</Cell><Cell>{order.awbCode || "-"}</Cell><Cell>{new Date(order.updatedAt).toLocaleString("en-IN")}</Cell></tr>)} /></section> : null}</>;
}
export function CustomersPage() { return <SimpleList title="Customers" description="Review customer profiles and order totals." loader={adminApi.customers} columns={["Name", "Email", "Phone", "Orders", "Total Spent", "Status"]} row={(u) => [u.name, u.email, u.phone || "-", u.orderCount || 0, money(u.totalSpent), u.isDisabled ? "Disabled" : "Active"]} />; }
export function PaymentsPage() { return <SimpleList title="Payments" description="Review payment methods and statuses." loader={adminApi.payments} columns={["Payment ID", "Order", "Customer", "Method", "Amount", "Status"]} row={(o) => [o.cashfreePaymentId || o.razorpayPaymentId || `COD-${o._id}`, o._id, o.user?.name || "-", o.paymentMethod, money(o.totalAmount), o.paymentStatus]} />; }
export function MessagesPage() { return <SimpleList title="Messages" description="Review and resolve customer messages." loader={adminApi.messages} columns={["Name", "Email", "Subject", "Status"]} row={(m) => [m.name, m.email, m.subject, m.status]} />; }
export function ReportsPage() { return <SimpleList title="Reports" description="Simple business summaries." loader={() => adminApi.reports("sales")} columns={["Status", "Orders", "Total"]} row={(r) => [r._id, r.orders, money(r.total)]} />; }
export function UsersPage() { return <SimpleList title="Admin Users" description="Manage admin access and roles." loader={adminApi.users} columns={["Name", "Email", "Role", "Status"]} row={(u) => [u.name, u.email, u.adminRole || "OWNER", u.isDisabled ? "Disabled" : "Active"]} />; }
export function AuditLogsPage() { return <SimpleList title="Audit Logs" description="Review admin activity." loader={adminApi.auditLogs} columns={["Admin", "Action", "Resource", "Summary", "Date"]} row={(l) => [l.admin?.name || "System", l.action, l.resourceType, l.summary || "-", new Date(l.createdAt).toLocaleString("en-IN")]} />; }

function SettingSection({ title, children }) { return <section className="grid gap-4 rounded-xl border border-[var(--admin-border)] bg-white p-5 shadow-sm"><h2 className="font-bold">{title}</h2>{children}</section>; }
export function SettingsPage() {
  const { data, loading, error, setData } = useAdminData(adminApi.settings);
  const [form, setForm] = useState(null);
  const { pending, run } = useAdminAction();
  useEffect(() => { if (data?.settings) setForm(data.settings); }, [data]);
  const update = (key, value) => setForm((cur) => ({ ...cur, [key]: value }));
  const save = async () => { const result = await run("settings:save", () => adminApi.saveSettings(form), "Settings saved."); if (result?.settings) { setForm(result.settings); setData({ settings: result.settings }); } };
  return <><AdminPageHeader title="Settings" description="Manage store and operational preferences." /><State loading={loading} error={error} />{form && <div className="grid gap-5 xl:grid-cols-2"><SettingSection title="Store"><AdminInput label="Store Name" value={form.storeName || ""} onChange={(e) => update("storeName", e.target.value)} /><AdminInput label="Currency" value={form.currency || "INR"} onChange={(e) => update("currency", e.target.value)} /><AdminInput label="Support Email" value={form.supportEmail || ""} onChange={(e) => update("supportEmail", e.target.value)} /><AdminInput label="Support Phone" value={form.supportPhone || ""} onChange={(e) => update("supportPhone", e.target.value)} /><AdminInput label="WhatsApp Number" value={form.whatsappNumber || ""} onChange={(e) => update("whatsappNumber", e.target.value)} /></SettingSection><SettingSection title="Orders"><AdminInput label="Minimum Order Amount" type="number" value={form.minimumOrderAmount || 0} onChange={(e) => update("minimumOrderAmount", Number(e.target.value))} /><AdminInput label="Order Prefix" value={form.orderPrefix || "VEL"} onChange={(e) => update("orderPrefix", e.target.value)} /><Toggle label="Allow COD" checked={form.codEnabled} onChange={(v) => update("codEnabled", v)} /><Toggle label="Allow Online Payment" checked={form.onlinePaymentEnabled} onChange={(v) => update("onlinePaymentEnabled", v)} /></SettingSection><SettingSection title="Inventory"><AdminInput label="Low Stock Threshold" type="number" value={form.lowStockThreshold || 0} onChange={(e) => update("lowStockThreshold", Number(e.target.value))} /><Toggle label="Allow Out of Stock Product Visibility" checked={form.allowOutOfStockVisibility} onChange={(v) => update("allowOutOfStockVisibility", v)} /><Toggle label="Prevent Out of Stock Checkout" checked={form.preventOutOfStockCheckout} onChange={(v) => update("preventOutOfStockCheckout", v)} /></SettingSection><SettingSection title="Shipping"><AdminInput label="Free Delivery Threshold" type="number" value={form.freeDeliveryThreshold || 0} onChange={(e) => update("freeDeliveryThreshold", Number(e.target.value))} /><AdminInput label="Default Packaging Weight" type="number" value={form.defaultPackagingWeight || 0} onChange={(e) => update("defaultPackagingWeight", Number(e.target.value))} /><AdminInput label="Default Package Length" type="number" value={form.defaultPackageLength || 0} onChange={(e) => update("defaultPackageLength", Number(e.target.value))} /><AdminInput label="Default Package Width" type="number" value={form.defaultPackageWidth || 0} onChange={(e) => update("defaultPackageWidth", Number(e.target.value))} /><AdminInput label="Default Package Height" type="number" value={form.defaultPackageHeight || 0} onChange={(e) => update("defaultPackageHeight", Number(e.target.value))} /></SettingSection><SettingSection title="Website"><Toggle label="Maintenance Mode" checked={form.maintenanceMode} onChange={(v) => update("maintenanceMode", v)} /><Toggle label="Announcement Bar Enabled" checked={form.announcementBarEnabled} onChange={(v) => update("announcementBarEnabled", v)} /><Toggle label="Customer Registration Enabled" checked={form.customerRegistrationEnabled} onChange={(v) => update("customerRegistrationEnabled", v)} /><Toggle label="Newsletter Enabled" checked={form.newsletterEnabled} onChange={(v) => update("newsletterEnabled", v)} /></SettingSection><SettingSection title="Contact"><AdminTextarea label="Factory Address" value={form.factoryAddress || ""} onChange={(e) => update("factoryAddress", e.target.value)} /><AdminInput label="Business Hours" value={form.businessHours || ""} onChange={(e) => update("businessHours", e.target.value)} /><AdminInput label="Google Maps Link" value={form.googleMapsLink || ""} onChange={(e) => update("googleMapsLink", e.target.value)} /></SettingSection><AdminSettingsExtras /><div className="xl:col-span-2"><AdminButton onClick={save} loading={pending["settings:save"]}>Save Changes</AdminButton></div></div>}</>;
}

function SimpleList({ title, description, loader, columns, row, action }) {
  const { data, loading, error } = useAdminData(loader);
  const items = Array.isArray(data?.items) ? data.items.filter(Boolean) : [];
  const renderRow = (item, index) => {
    const values = row(item);
    if (!Array.isArray(values)) return null;
    return <tr key={item._id || item.id || index}>{values.map((value, i) => <Cell key={i}>{i === values.length - 1 && ["Active", "Paid", "Failed", "Disabled", "NEW", "READ", "RESOLVED"].includes(String(value)) ? <AdminBadge>{statusText(value)}</AdminBadge> : value}</Cell>)}</tr>;
  };
  return <><AdminPageHeader title={title} description={description} action={action} /><State loading={loading} error={error} empty={!items.length} title={`No ${title.toLowerCase()} found.`} />{items.length ? <AdminTable columns={columns} rows={items.map(renderRow)} /> : null}</>;
}








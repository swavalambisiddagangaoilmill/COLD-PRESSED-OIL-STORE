// API-backed page components for the Swavalambi Siddaganga Oil Mill admin panel.
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Download, Eye, EyeOff, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "../../components/features/feedback/ToastProvider.jsx";
import { AdminBadge, AdminButton, AdminCard, AdminFilters, AdminInput, AdminModal, AdminPageHeader, AdminSelect, AdminTable, AdminTextarea } from "../components/AdminUi.jsx";
import { adminApi } from "../services/adminApi.js";
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

function skuPreview(form, categories) {
  const clean = (value, fallback) => String(value || "").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase() || fallback;
  const category = categories.find((item) => item._id === (form.category?._id || form.category));
  return [clean(category?.slug || category?.name, "CATEGORY").slice(0, 8), clean(form.title, "PRODUCT").slice(0, 12), form.weight ? clean(form.weight, "UNIT") : "UNIT"].join("-");
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
function normalizeDiscountType(value) { return value === "Fixed Amount" || value === "FIXED" ? "FIXED" : "PERCENTAGE"; }

function ServiceStatusSection() {
  const { data } = useAdminData(adminApi.serviceStatus);
  const services = data?.services || {};
  const style = { online: "bg-leaf/10 text-leaf", limited: "bg-amber-100 text-amber-700", offline: "bg-danger/10 text-danger" };
  const icon = { online: "Online", limited: "Limited", offline: "Offline" };
  return <div className="mt-5 rounded-xl border border-[var(--admin-border)] bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Service Status</h2><span className="text-xs font-semibold text-ink/40">External integrations</span></div><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{Object.entries(services).map(([key, service]) => <div key={key} className="rounded-lg bg-linen/60 p-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-ink/40">{statusText(key)}</p><p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${style[service.status] || style.offline}`}>{icon[service.status] || "Offline"}</p><p className="mt-2 line-clamp-2 text-xs font-semibold text-ink/50">{service.message}</p></div>)}</div></div>;
}
export function DashboardPage() {
  const { data, loading, error, reload } = useAdminData(adminApi.dashboard);
  const { data: serviceData } = useAdminData(adminApi.serviceStatus);
  const { pending, run } = useAdminAction();
  useAdminRefresh(reload, ["dashboard", "orders", "inventory"]);
  const s = data?.summary || {};
  const action = async (type, order) => {
    const key = `${type}:${order._id}`;
    const status = type === "confirm" ? "confirmed" : type === "ship" ? "shipped" : type === "deliver" ? "delivered" : "cancelled";
    const labels = { confirm: "Order confirmed.", ready: "Order marked ready to ship.", ship: "Order marked shipped.", deliver: "Order delivered.", cancel: "Order cancelled." };
    const result = await run(key, type === "ready" ? () => adminApi.readyToShip(order._id) : () => adminApi.orderStatus(order._id, status), labels[type]);
    if (result?.order) {
      await reload();
      window.dispatchEvent(new CustomEvent("ss-admin-data-changed", { detail: { scopes: ["orders", "inventory", "products"] } }));
    }
  };
  return <><AdminPageHeader title="Dashboard" description="Store operations overview." /><State loading={loading} error={error} />{data && <><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><AdminCard title="Today's Orders" value={String(s.todayOrders || 0)} /><AdminCard title="Today's Revenue" value={money(s.todayRevenue)} /><AdminCard title="Pending Orders" value={String(s.pendingOrders || 0)} /><AdminCard title="Ready to Ship" value={String(s.readyToShip || 0)} /><AdminCard title="Low Stock" value={String(s.lowStock || 0)} /><AdminCard title="Total Customers" value={String(s.totalCustomers || 0)} /></div><ServiceStatusSection /><div className="mt-5 grid gap-5 xl:grid-cols-[1.3fr_0.7fr]"><OrdersTable orders={data.recentOrders || []} onAction={action} pending={pending} shiprocketAvailable={serviceData?.services?.shiprocket?.available !== false} /><div><h2 className="mb-3 text-lg font-bold">Needs Attention</h2>{Object.entries(data.needsAttention || {}).map(([key, value]) => <div key={key} className="mb-3 rounded-xl border border-[var(--admin-border)] bg-white p-4 text-sm font-semibold">{statusText(key)}: {value}</div>)}</div></div></>}</>;
}

function OrdersTable({ orders = [], onAction, pending = {}, shiprocketAvailable = true }) {
  const canConfirm = (order) => order.orderStatus === "placed";
  const canReady = (order) => shiprocketAvailable && !order.awbCode && !["cancelled", "delivered"].includes(order.orderStatus);
  const canShip = (order) => order.orderStatus === "packed";
  const canDeliver = (order) => order.orderStatus === "shipped";
  const canCancel = (order) => ["placed", "confirmed", "packed"].includes(order.orderStatus);
  return <AdminTable columns={["Order", "Customer", "Date", "Items", "Payment", "Amount", "Order Status", "Shipping", "Actions"]} rows={orders.map((order) => { const orderPending = Object.entries(pending).some(([key, value]) => value && key.endsWith(`:${order._id}`)); return <tr key={order._id}><Cell className="font-bold">{order._id}</Cell><Cell>{order.user?.name || order.shippingAddress?.fullName || "Customer"}</Cell><Cell>{new Date(order.createdAt).toLocaleDateString("en-IN")}</Cell><Cell>{order.products?.length || 0}</Cell><Cell><AdminBadge>{statusText(order.paymentStatus)}</AdminBadge></Cell><Cell>{money(order.totalAmount)}</Cell><Cell><AdminBadge>{statusText(order.orderStatus)}</AdminBadge></Cell><Cell>{statusText(order.shippingStatus)}</Cell><Cell><div className="flex flex-wrap gap-2">{canConfirm(order) && <AdminButton variant="secondary" disabled={orderPending} loading={pending[`confirm:${order._id}`]} onClick={() => onAction?.("confirm", order)}>Confirm</AdminButton>}{canReady(order) && <AdminButton variant="secondary" disabled={orderPending} loading={pending[`ready:${order._id}`]} onClick={() => onAction?.("ready", order)}>Ready</AdminButton>}{canShip(order) && <AdminButton variant="secondary" disabled={orderPending} loading={pending[`ship:${order._id}`]} onClick={() => onAction?.("ship", order)}>Mark Shipped</AdminButton>}{canDeliver(order) && <AdminButton variant="secondary" disabled={orderPending} loading={pending[`deliver:${order._id}`]} onClick={() => onAction?.("deliver", order)}>Deliver</AdminButton>}{canCancel(order) && <AdminButton variant="danger" disabled={orderPending} loading={pending[`cancel:${order._id}`]} onClick={() => onAction?.("cancel", order)}>Cancel</AdminButton>}</div></Cell></tr>; })} />;
}

export function OrdersPage() {
  const [q, setQ] = useState("");
  const { data, loading, error, setData } = useAdminData(() => adminApi.orders(q ? `?search=${encodeURIComponent(q)}` : ""), [q]);
  const { pending, run } = useAdminAction();
  const { data: serviceData } = useAdminData(adminApi.serviceStatus);
  const shiprocketAvailable = serviceData?.services?.shiprocket?.available !== false;
  const setOrder = (order) => updateItemList(setData, order._id, order);
  const action = async (type, order) => {
    const key = `${type}:${order._id}`;
    const status = type === "confirm" ? "confirmed" : type === "ship" ? "shipped" : type === "deliver" ? "delivered" : "cancelled";
    const labels = { confirm: "Order confirmed.", ready: "Order marked ready to ship.", ship: "Order marked shipped.", deliver: "Order delivered.", cancel: "Order cancelled." };
    const result = await run(key, type === "ready" ? () => adminApi.readyToShip(order._id) : () => adminApi.orderStatus(order._id, status), labels[type]);
    if (result?.order) {
      setOrder(result.order);
      window.dispatchEvent(new CustomEvent("ss-admin-data-changed", { detail: { scopes: ["dashboard", "orders", "inventory", "products"] } }));
    }
  };
  return <><AdminPageHeader title="Orders" description="Review and process customer orders." /><AdminFilters><SearchBox value={q} onChange={setQ} placeholder="Search orders" /></AdminFilters><State loading={loading} error={error} empty={!data?.items?.length} title="No orders found." />{data?.items?.length ? <OrdersTable orders={data.items} onAction={action} pending={pending} shiprocketAvailable={shiprocketAvailable} /> : null}</>;
}

function ProductEditor({ open, onClose, product, categories, onSaved }) {
  const { pending, run } = useAdminAction();
  const { data: serviceData } = useAdminData(adminApi.serviceStatus);
  const uploadAvailable = serviceData?.services?.cloudinary?.available !== false;
  const uploadMessage = serviceData?.services?.cloudinary?.message || "Image uploads are temporarily unavailable.";
  const empty = { title: "", description: "", price: "", discountPrice: "", stock: "", weight: "", images: [], featured: false, bestSeller: false, newArrival: false, codEnabled: true, onlinePaymentEnabled: true, returnEligible: true, exchangeEligible: false, isActive: true, dimensions: { length: "", width: "", height: "" } };
  const [form, setForm] = useState(product || empty);
  const [errors, setErrors] = useState({});
  const [uploadState, setUploadState] = useState({ status: "idle", message: "" });
  useEffect(() => {
    setForm(product ? { ...empty, ...product, category: product.category?._id || product.category, dimensions: { ...empty.dimensions, ...(product.dimensions || {}) } } : empty);
    setErrors({});
    setUploadState({ status: "idle", message: "" });
  }, [product, open]);

  const validate = () => {
    const next = {
      title: form.title?.trim() ? "" : "Product title is required.",
      description: form.description?.trim() ? "" : "Description is required.",
      category: form.category ? "" : "Select a category.",
      price: numericError(form.price, "Price", { required: true }),
      discountPrice: numericError(form.discountPrice, "Discount price"),
      stock: numericError(form.stock, "Stock", { required: true, integer: true }),
      weight: numericError(form.weight, "Weight"),
      length: numericError(form.dimensions?.length, "Package length"),
      width: numericError(form.dimensions?.width, "Package width"),
      height: numericError(form.dimensions?.height, "Package height"),
      images: form.images?.length ? "" : "Upload at least one product image.",
    };
    if (!next.discountPrice && form.discountPrice !== "" && Number(form.discountPrice) >= Number(form.price)) next.discountPrice = "Discount price must be lower than the regular price.";
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  const upload = async (file, input) => {
    if (!uploadAvailable || pending["product:image"]) return;
    setUploadState({ status: "uploading", message: `Uploading ${file.name}...` });
    const data = await run("product:image", () => adminApi.uploadImage(file), "Image uploaded.");
    if (input) input.value = "";
    if (data) {
      setForm((current) => ({ ...current, images: [...(current.images || []), data.image || data] }));
      setErrors((current) => ({ ...current, images: "" }));
      setUploadState({ status: "success", message: "Image uploaded successfully." });
    } else {
      setUploadState({ status: "error", message: "Image upload failed. Select the file and try again." });
    }
  };

  const save = async () => {
    if (pending["product:image"] || !validate()) return;
    const optionalNumber = (value) => value === "" || value === undefined || value === null ? undefined : Number(value);
    const payload = {
      ...form,
      price: Number(form.price),
      discountPrice: optionalNumber(form.discountPrice),
      stock: Number(form.stock),
      weight: optionalNumber(form.weight),
      dimensions: { length: optionalNumber(form.dimensions?.length), width: optionalNumber(form.dimensions?.width), height: optionalNumber(form.dimensions?.height) },
      category: form.category?._id || form.category,
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
        <AdminInput label="SKU (generated automatically)" value={skuPreview(form, categories)} readOnly hint="Generated from category, product name, and weight." />
        <AdminInput label="Price (₹)" type="number" step="0.01" value={form.price ?? ""} error={errors.price} {...numberProps} min="0.01" onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <AdminInput label="Discount Price (₹)" type="number" step="0.01" value={form.discountPrice ?? ""} error={errors.discountPrice} {...numberProps} min="0.01" onChange={(e) => setForm({ ...form, discountPrice: e.target.value })} />
        <AdminInput label="Stock / Quantity (units)" type="number" step="1" value={form.stock ?? ""} error={errors.stock} {...numberProps} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
        <AdminInput label="Weight (kg)" type="number" step="0.01" value={form.weight ?? ""} error={errors.weight} {...numberProps} min="0.01" onChange={(e) => setForm({ ...form, weight: e.target.value })} />
        <AdminInput label="Package Length (cm)" type="number" step="0.01" value={form.dimensions?.length ?? ""} error={errors.length} {...numberProps} min="0.01" onChange={(e) => setForm({ ...form, dimensions: { ...(form.dimensions || {}), length: e.target.value } })} />
        <AdminInput label="Package Width (cm)" type="number" step="0.01" value={form.dimensions?.width ?? ""} error={errors.width} {...numberProps} min="0.01" onChange={(e) => setForm({ ...form, dimensions: { ...(form.dimensions || {}), width: e.target.value } })} />
        <AdminInput label="Package Height (cm)" type="number" step="0.01" value={form.dimensions?.height ?? ""} error={errors.height} {...numberProps} min="0.01" onChange={(e) => setForm({ ...form, dimensions: { ...(form.dimensions || {}), height: e.target.value } })} />
      </div>
      <div><p className="text-sm font-bold text-ink/70">Product Images</p><div className="mt-2 flex flex-wrap gap-3">{(form.images || []).map((image, index) => <div key={`${image.url}-${index}`} className="relative"><img src={image.url} alt="" className="h-20 w-20 rounded-lg object-cover" /><button type="button" disabled={pending["product:image"]} onClick={() => setForm({ ...form, images: form.images.filter((_, i) => i !== index) })} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-xs text-white">x</button></div>)}<label title={uploadAvailable ? "" : uploadMessage} className={`grid h-20 w-20 place-items-center rounded-lg border border-dashed border-[var(--admin-border)] text-xs font-bold text-ink/45 ${uploadAvailable && !pending["product:image"] ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>{pending["product:image"] ? <span className="grid place-items-center gap-1"><Loader2 size={18} className="animate-spin" />Uploading</span> : "Upload"}<input type="file" accept="image/*" disabled={!uploadAvailable || pending["product:image"]} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], e.target)} /></label></div>{errors.images && <p className="mt-2 text-xs font-semibold text-red-700">{errors.images}</p>}{uploadState.message && <p role="status" className={`mt-3 inline-flex items-center gap-2 text-sm font-semibold ${uploadState.status === "error" ? "text-red-700" : uploadState.status === "success" ? "text-leaf" : "text-ink/60"}`}>{uploadState.status === "uploading" ? <Loader2 size={15} className="animate-spin" /> : uploadState.status === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}{uploadState.message}</p>}</div>
      <div className="grid gap-3 md:grid-cols-2"><Toggle label="Featured" checked={form.featured} onChange={(value) => setForm({ ...form, featured: value })} /><Toggle label="Best Seller" checked={form.bestSeller} onChange={(value) => setForm({ ...form, bestSeller: value })} /><Toggle label="New Arrival" checked={form.newArrival} onChange={(value) => setForm({ ...form, newArrival: value })} /><Toggle label="COD Enabled" checked={form.codEnabled !== false} onChange={(value) => setForm({ ...form, codEnabled: value })} /><Toggle label="Online Payment Enabled" checked={form.onlinePaymentEnabled !== false} onChange={(value) => setForm({ ...form, onlinePaymentEnabled: value })} /><Toggle label="Return Eligible" checked={form.returnEligible !== false} onChange={(value) => setForm({ ...form, returnEligible: value })} /><Toggle label="Exchange Eligible" checked={form.exchangeEligible} onChange={(value) => setForm({ ...form, exchangeEligible: value })} /><Toggle label="Active" checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} /></div>
    </div>
  </AdminModal>;
}

export function ProductsPage() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState([]);
  const [preview, setPreview] = useState(null);
  const [editor, setEditor] = useState(null);
  const [bulk, setBulk] = useState({ operation: "increase_percentage", value: 10 });
  const { data, loading, error, reload, setData } = useAdminData(() => adminApi.products(q ? `?search=${encodeURIComponent(q)}` : ""), [q]);
  useAdminRefresh(reload, ["products"]);
  const { data: catData } = useAdminData(adminApi.categories);
  const { pending, run } = useAdminAction();
  const products = data?.items || [];
  const categories = catData?.items || [];
  const saveRow = (product) => setData((current) => current ? { ...current, items: current.items?.some((item) => item._id === product._id) ? current.items.map((item) => item._id === product._id ? { ...item, ...product } : item) : [product, ...(current.items || [])] } : current);
  const doPreview = async () => { const result = await run("bulk:preview", () => adminApi.bulkPreview({ target: { productIds: selected }, ...bulk }), "Preview generated."); if (result) setPreview(result); };
  const apply = async () => { const result = await run("bulk:apply", () => adminApi.bulkApply({ target: { productIds: selected }, ...bulk }), "Bulk update applied."); if (result) { setSelected([]); setPreview(null); reload(); } };
  const archive = async (product) => { const result = await run(`product:archive:${product._id}`, () => adminApi.archiveProduct(product._id), "Product archived."); if (result?.product) updateItemList(setData, product._id, result.product, true); };
  return <><AdminPageHeader title="Products" description="Manage products, pricing and availability." action={<AdminButton onClick={() => setEditor({})}><Plus size={16} />Add Product</AdminButton>} /><AdminFilters><SearchBox value={q} onChange={setQ} placeholder="Search products" /></AdminFilters>{selected.length > 0 && <div className="mb-4 rounded-xl border border-[var(--admin-border)] bg-white p-4"><p className="font-bold">Selected: {selected.length} products</p><div className="mt-3 grid gap-3 md:grid-cols-5"><AdminSelect label="Bulk Action" value={bulk.operation} onChange={(e) => setBulk({ ...bulk, operation: e.target.value })}>{[["increase_percentage","Increase Price %"],["decrease_percentage","Decrease Price %"],["increase_fixed","Increase Price Rs."],["decrease_fixed","Decrease Price Rs."],["set_exact_price","Set Exact Price"],["set_discount_percentage","Set Discount %"],["set_exact_discount","Set Discount Price"],["remove_discount","Remove Discount"],["add_stock","Add Stock"],["reduce_stock","Reduce Stock"],["set_stock","Set Stock"],["activate","Activate"],["deactivate","Deactivate"],["archive","Archive"],["mark_featured","Mark Featured"],["remove_featured","Remove Featured"],["move_category","Move to Category"],["set_weight","Set Weight"],["set_dimensions","Set Dimensions"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</AdminSelect><AdminInput label="Value" type="number" value={bulk.value || ""} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} /><AdminSelect label="Category" value={bulk.category || ""} onChange={(e) => setBulk({ ...bulk, category: e.target.value })}><option value="">Select</option>{categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</AdminSelect><AdminButton variant="secondary" loading={pending["bulk:preview"]} onClick={doPreview}>Preview</AdminButton><AdminButton loading={pending["bulk:apply"]} onClick={apply}>Apply Changes</AdminButton></div>{preview?.examples?.map((item) => <span key={item.id} className="mr-2 mt-3 inline-flex rounded-full bg-linen px-3 py-1 text-sm">{item.title}: {money(item.before)} to {money(item.after)}</span>)}{preview && preview.count > 5 && <span className="text-sm text-ink/50">+ {preview.count - 5} more products</span>}</div>}<State loading={loading} error={error} empty={!products.length} title="No products found." description="Add your first product." action={<AdminButton onClick={() => setEditor({})}>Add Product</AdminButton>} />{products.length ? <AdminTable columns={["", "Product", "Category", "SKU", "Price", "Discount", "Stock", "Status", "Featured", "Actions"]} rows={products.map((product) => <tr key={product._id}><Cell><input type="checkbox" checked={selected.includes(product._id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, product._id] : current.filter((id) => id !== product._id))} /></Cell><Cell className="font-bold">{product.title}</Cell><Cell>{product.category?.name || "-"}</Cell><Cell>{product.sku || "-"}</Cell><Cell>{money(product.price)}</Cell><Cell>{product.discountPrice ? money(product.discountPrice) : "-"}</Cell><Cell>{product.stock}</Cell><Cell><AdminBadge>{product.isActive ? "Active" : "Inactive"}</AdminBadge></Cell><Cell>{product.featured ? "Yes" : "No"}</Cell><Cell><div className="flex gap-2"><AdminButton variant="secondary" onClick={() => setEditor(product)}>Edit</AdminButton><AdminButton variant="secondary" onClick={() => setEditor({ ...product, _id: undefined, title: `${product.title} Copy` })}>Duplicate</AdminButton><AdminButton variant="danger" loading={pending[`product:archive:${product._id}`]} onClick={() => archive(product)}><Trash2 size={14} /></AdminButton></div></Cell></tr>)} /> : null}<ProductEditor open={Boolean(editor)} product={editor?._id ? editor : null} categories={categories} onClose={() => setEditor(null)} onSaved={saveRow} /></>;
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
  const items = (data?.items || []).filter((p) => filter === "All" || status(p.stock) === filter);
  const saveRow = (product) => updateItemList(setData, product._id, product);
  return <><AdminPageHeader title="Inventory" description="Update stock quantities and low-stock status." /><AdminFilters><AdminSelect label="Stock Status" value={filter} onChange={(e) => setFilter(e.target.value)}>{["All", "In Stock", "Low Stock", "Out of Stock"].map((item) => <option key={item}>{item}</option>)}</AdminSelect></AdminFilters><State loading={loading} error={error} empty={!items.length} />{items.length ? <AdminTable columns={["Product", "SKU", "Current Stock", "Stock Status", "Actions"]} rows={items.map((p) => <tr key={p._id}><Cell>{p.title}</Cell><Cell>{p.sku || "-"}</Cell><Cell>{p.stock}</Cell><Cell><AdminBadge>{status(p.stock)}</AdminBadge></Cell><Cell><div className="flex gap-2"><AdminButton variant="secondary" onClick={() => setEditing({ product: p, mode: "add", quantity: 1 })}>Add Stock</AdminButton><AdminButton variant="secondary" onClick={() => setEditing({ product: p, mode: "reduce", quantity: 1 })}>Reduce Stock</AdminButton><AdminButton variant="secondary" onClick={() => setEditing({ product: p, mode: "set", quantity: p.stock })}>Set Exact</AdminButton></div></Cell></tr>)} /> : null}<StockModal state={editing} onClose={() => setEditing(null)} onSaved={saveRow} /></>;
}

function StockModal({ state, onClose, onSaved }) {
  const { pending, run } = useAdminAction();
  const [quantity, setQuantity] = useState(1);
  useEffect(() => setQuantity(state?.quantity ?? ""), [state]);
  if (!state) return null;
  const current = Number(state.product.stock || 0);
  const qty = quantity === "" ? 0 : Number(quantity);
  const next = state.mode === "set" ? qty : state.mode === "reduce" ? Math.max(0, current - qty) : current + qty;
  const invalid = quantity === "" || qty < 0 || !Number.isInteger(qty) || (state.mode !== "set" && qty === 0) || (state.mode === "reduce" && qty > current);
  const save = async () => { if (invalid) return; const result = await run(`inventory:${state.product._id}`, () => adminApi.inventory(state.product._id, { mode: state.mode, quantity: qty }), "Inventory updated."); if (result?.product) { onSaved(result.product); window.dispatchEvent(new CustomEvent("ss-admin-data-changed", { detail: { scopes: ["dashboard", "products", "inventory"] } })); onClose(); } };
  return <AdminModal title="Update Stock" open onClose={onClose} footer={<AdminButton disabled={invalid} loading={pending[`inventory:${state.product._id}`]} onClick={save}>Update Stock</AdminButton>}><div className="grid gap-4"><AdminCard title="Product" value={state.product.title} note={`SKU: ${state.product.sku || "-"}`} /><AdminInput label={state.mode === "set" ? "Set Stock To" : state.mode === "reduce" ? "Reduce" : "Add"} type="number" min="0" step="1" inputMode="numeric" value={quantity} onKeyDown={blockInvalidNumberKey} onChange={(e) => setQuantity(e.target.value)} /><div className="rounded-xl bg-linen p-4 text-sm font-bold">Preview: {current} {state.mode === "add" ? "+" : state.mode === "reduce" ? "-" : "="} {qty} = {next}</div>{invalid && <p className="text-sm font-semibold text-red-700">Enter a valid whole number. Add/reduce quantities must be greater than zero, and stock cannot go below zero.</p>}</div></AdminModal>;
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
  const { data, loading, error, setData } = useAdminData(adminApi.coupons);
  const { data: catData } = useAdminData(adminApi.categories);
  const { data: productData } = useAdminData(() => adminApi.products("?limit=100"));
  const { pending, run } = useAdminAction();
  const [editing, setEditing] = useState(null);
  const items = data?.items || [];
  const saveRow = (coupon) => setData((current) => current ? { ...current, items: current.items?.some((item) => item._id === coupon._id) ? current.items.map((item) => item._id === coupon._id ? { ...item, ...coupon } : item) : [coupon, ...(current.items || [])] } : current);
  const remove = async (coupon) => { const result = await run(`coupon:delete:${coupon._id}`, () => adminApi.deleteCoupon(coupon._id), "Coupon deleted."); if (result) updateItemList(setData, coupon._id, coupon, true); };
  return <><AdminPageHeader title="Coupons" description="Create and manage customer coupon codes." action={<AdminButton onClick={() => setEditing({})}><Plus size={16} />Create Coupon</AdminButton>} /><State loading={loading} error={error} empty={!items.length} title="No coupons yet." description="Create a coupon code for customer discounts." action={<AdminButton onClick={() => setEditing({})}>Create Coupon</AdminButton>} />{items.length ? <AdminTable columns={["Coupon Code", "Discount", "Usage", "Minimum Order", "Start Date", "Expiry", "Status", "Actions"]} rows={items.map((c) => <tr key={c._id}><Cell className="font-bold">{c.code}</Cell><Cell>{c.discountType === "PERCENTAGE" ? `${c.discountValue}%` : money(c.discountValue)}</Cell><Cell>{c.usedCount}/{c.usageLimit || "8"}</Cell><Cell>{money(c.minimumOrderAmount)}</Cell><Cell>{String(c.startDate).slice(0,10)}</Cell><Cell>{String(c.expiryDate).slice(0,10)}</Cell><Cell><AdminBadge>{c.isActive ? "Active" : "Disabled"}</AdminBadge></Cell><Cell><div className="flex gap-2"><AdminButton variant="secondary" onClick={() => setEditing(c)}>Edit</AdminButton><AdminButton variant="secondary" onClick={() => setEditing({ ...c, _id: undefined, code: `${c.code}COPY` })}>Duplicate</AdminButton><AdminButton variant="danger" loading={pending[`coupon:delete:${c._id}`]} onClick={() => remove(c)}><Trash2 size={14} /></AdminButton></div></Cell></tr>)} /> : null}<CouponForm open={Boolean(editing)} coupon={editing?._id ? editing : null} categories={catData?.items || []} products={productData?.items || []} onClose={() => setEditing(null)} onSaved={saveRow} /></>;
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
export function ShippingPage() { const { data, loading, error, setData } = useAdminData(adminApi.shipping); const { pending, run } = useAdminAction(); const items = data?.items || []; const next = async (order) => { const result = await run(`shipping:${order._id}`, () => adminApi.mockNext(order._id), "Shipping status updated."); if (result?.order) updateItemList(setData, order._id, result.order); }; return <><AdminPageHeader title="Shipping" description="Manage shipment progress and courier details." /><State loading={loading} error={error} empty={!items.length} title="No shipments found." />{items.length ? <AdminTable columns={["Order", "Customer", "Status", "Courier", "AWB", "Action"]} rows={items.map((o) => <tr key={o._id}><Cell>{o._id}</Cell><Cell>{o.user?.name || o.shippingAddress?.fullName}</Cell><Cell>{statusText(o.shippingStatus)}</Cell><Cell>{o.courierName || "-"}</Cell><Cell>{o.awbCode || "-"}</Cell><Cell><AdminButton variant="secondary" loading={pending[`shipping:${o._id}`]} onClick={() => next(o)}>Next Mock Status</AdminButton></Cell></tr>)} /> : null}</>; }
export function CustomersPage() { return <SimpleList title="Customers" description="Review customer profiles and order totals." loader={adminApi.customers} columns={["Name", "Email", "Phone", "Orders", "Total Spent", "Status"]} row={(u) => [u.name, u.email, u.phone || "-", u.orderCount || 0, money(u.totalSpent), u.isDisabled ? "Disabled" : "Active"]} />; }
export function PaymentsPage() { return <SimpleList title="Payments" description="Review payment methods and statuses." loader={adminApi.payments} columns={["Payment ID", "Order", "Customer", "Method", "Amount", "Status"]} row={(o) => [o.razorpayPaymentId || `COD-${o._id}`, o._id, o.user?.name || "-", o.paymentMethod, money(o.totalAmount), o.paymentStatus]} />; }
export function ContentPage() { return <SimpleList title="Content" description="Manage editable website content." loader={adminApi.content} columns={["Key", "Updated"]} row={(c) => [c.key, new Date(c.updatedAt).toLocaleString("en-IN")]} />; }
export function MediaPage() { return <><AdminPageHeader title="Media" description="Upload and manage store images." /><div className="rounded-xl border border-[var(--admin-border)] bg-white p-6 text-sm text-[var(--admin-muted)]">Use image upload fields in Products and Categories. They use the protected Cloudinary upload endpoint.</div></>; }
export function MessagesPage() { return <SimpleList title="Messages" description="Review and resolve customer messages." loader={adminApi.messages} columns={["Name", "Email", "Subject", "Status"]} row={(m) => [m.name, m.email, m.subject, m.status]} />; }
export function NewsletterPage() { return <SimpleList title="Newsletter" description="Manage email subscribers." loader={adminApi.newsletter} columns={["Email", "Subscribed", "Status"]} row={(s) => [s.email, new Date(s.subscribedAt).toLocaleDateString("en-IN"), s.status]} action={<AdminButton variant="secondary"><Download size={16} />Export CSV</AdminButton>} />; }
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
  const items = data?.items || [];
  return <><AdminPageHeader title={title} description={description} action={action} /><State loading={loading} error={error} empty={!items.length} title={`No ${title.toLowerCase()} found.`} />{items.length ? <AdminTable columns={columns} rows={items.map((item, index) => <tr key={item._id || item.id || index}>{row(item).map((value, i) => <Cell key={i}>{i === row(item).length - 1 && ["Active", "Paid", "Failed", "Disabled", "NEW", "READ", "RESOLVED"].includes(String(value)) ? <AdminBadge>{statusText(value)}</AdminBadge> : value}</Cell>)}</tr>)} /> : null}</>;
}








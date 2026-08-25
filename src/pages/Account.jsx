// Renders the authenticated My Account customer dashboard.
import { BarChart3, Boxes, Heart, Home, Lock, LogOut, MapPin, Package, ShieldCheck, ShoppingBag, Tags, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Breadcrumb from "../components/common/Breadcrumb.jsx";
import SafeImage from "../components/common/SafeImage.jsx";
import AccountSecurityPanel from "../components/features/account/AccountSecurityOtpPanel.jsx";
import AddToCartButton from "../components/features/product/AddToCartButton.jsx";
import WishlistToggle from "../components/features/product/WishlistToggle.jsx";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";
import Input from "../components/ui/Input.jsx";
import { useWishlist } from "../context/WishlistContext.jsx";
import { addAccountAddress, deleteAccountAddress, fetchAccountProfile, updateAccountAddress, updateAccountProfile } from "../services/accountService.js";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchMyOrders } from "../services/orderService.js";
import { formatCurrency } from "../utils/formatCurrency.js";
import { adminApi } from "../admin/services/adminApi.js";

const tabs = [
  { id: "profile", label: "My Profile", icon: UserRound },
  { id: "orders", label: "My Orders", icon: Package },
  { id: "addresses", label: "Saved Addresses", icon: MapPin },
  { id: "wishlist", label: "Wishlist", icon: Heart },
  { id: "security", label: "Account & Security", icon: ShieldCheck },
  { id: "logout", label: "Logout", icon: LogOut },
];

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

const emptyAddress = { label: "Home", fullName: "", phone: "", street: "", city: "", state: "", postalCode: "", country: "India", isDefault: false };

function initials(name = "User") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}

function normalizeOrderProduct(item) {
  return { id: `${item.product?._id || item.product || item.title}:${item.variant || item.variantName || "variant"}`, name: item.title, variantName: item.variantName, sku: item.sku, image: item.image || "", price: item.price, quantity: item.quantity };
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value)) : "-";
}

export default function Account() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { items: wishlistItems } = useWishlist();
  const [activeTab, setActiveTab] = useState("profile");
  const contentPanelRef = useRef(null);
  const mobileNavRef = useRef(null);
  const pendingScrollRef = useRef(false);
  const initialScrollCheckedRef = useRef(false);
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [adminStats, setAdminStats] = useState(null);

  useEffect(() => {
    let active = true;
    async function loadAccount() {
      setLoading(true);
      setError("");
      try {
        const [profileData, orderData] = await Promise.all([fetchAccountProfile(), fetchMyOrders()]);
        if (!active) return;
        setUser(profileData.user);
        setOrders(orderData.orders || []);
      } catch (err) {
        if (!active) return;
        setError(err.message || "Unable to load account details.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadAccount();
    return () => { active = false; };
  }, []);

  const isAdmin = user?.role === "admin";
  const addresses = user?.addresses || [];
  const profileStats = useMemo(() => [
    { label: "Orders", value: orders.length },
    { label: "Saved", value: wishlistItems.length },
    { label: "Addresses", value: addresses.length },
  ], [orders.length, wishlistItems.length, addresses.length]);

  const updateScrollOffset = useCallback(() => {
    const headerHeight = document.querySelector("header")?.getBoundingClientRect().height || 0;
    const mobileNavVisible = mobileNavRef.current && getComputedStyle(mobileNavRef.current).display !== "none";
    const mobileNavHeight = mobileNavVisible ? mobileNavRef.current.getBoundingClientRect().height : 0;
    contentPanelRef.current?.style.setProperty("--account-scroll-offset", `${headerHeight + mobileNavHeight + 16}px`);
  }, []);

  const scrollToActivePanel = useCallback((behavior = "smooth") => {
    updateScrollOffset();
    contentPanelRef.current?.scrollIntoView({ behavior, block: "start", inline: "nearest" });
  }, [updateScrollOffset]);


  useEffect(() => {
    updateScrollOffset();
    window.addEventListener("resize", updateScrollOffset);
    return () => window.removeEventListener("resize", updateScrollOffset);
  }, [updateScrollOffset]);

  useEffect(() => {
    if (!pendingScrollRef.current || loading) return undefined;
    const frame = window.requestAnimationFrame(() => {
      scrollToActivePanel("smooth");
      pendingScrollRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, loading, scrollToActivePanel]);
  useEffect(() => {
    if (loading || initialScrollCheckedRef.current) return undefined;
    initialScrollCheckedRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      updateScrollOffset();
      const panelTop = contentPanelRef.current ? contentPanelRef.current.getBoundingClientRect().top + window.scrollY : 0;
      if (window.scrollY > panelTop + 24) scrollToActivePanel("auto");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, scrollToActivePanel, updateScrollOffset]);

  const showMessage = (text) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2800);
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const data = await updateAccountProfile({ name: form.get("name"), phone: form.get("phone") });
      setUser(data.user);
      showMessage("Profile updated successfully.");
    } catch (err) {
      setError(err.message || "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddressSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const action = editingAddressId ? updateAccountAddress(editingAddressId, addressForm) : addAccountAddress(addressForm);
      const data = await action;
      setUser((current) => ({ ...current, addresses: data.addresses || [] }));
      setAddressForm(emptyAddress);
      setEditingAddressId(null);
      showMessage(editingAddressId ? "Address updated successfully." : "Address added successfully.");
    } catch (err) {
      setError(err.message || "Unable to save address.");
    } finally {
      setSaving(false);
    }
  };

  const editAddress = (address) => {
    setEditingAddressId(address._id);
    setAddressForm({ ...emptyAddress, ...address });
  };

  const removeAddress = async (id) => {
    setSaving(true);
    setError("");
    try {
      const data = await deleteAccountAddress(id);
      setUser((current) => ({ ...current, addresses: data.addresses || [] }));
      showMessage("Address deleted successfully.");
    } catch (err) {
      setError(err.message || "Unable to delete address.");
    } finally {
      setSaving(false);
    }
  };

  const makeDefaultAddress = async (address) => {
    setSaving(true);
    setError("");
    try {
      const data = await updateAccountAddress(address._id, { ...address, isDefault: true });
      setUser((current) => ({ ...current, addresses: data.addresses || [] }));
      showMessage("Default address updated.");
    } catch (err) {
      setError(err.message || "Unable to set default address.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = useCallback(async ({ skipConfirm = false } = {}) => {
    if (!skipConfirm && !window.confirm("Are you sure you want to log out?")) return;
    await logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  const selectTab = useCallback((tabId) => {
    if (tabId === "logout") {
      handleLogout();
      return;
    }
    pendingScrollRef.current = true;
    setActiveTab(tabId);
  }, [handleLogout]);

  const updateAddressField = (field, value) => setAddressForm((current) => ({ ...current, [field]: value }));

  return (
    <>
      <Breadcrumb items={[{ label: "My Account" }]} />
      <section className="section-padding">
        <Container>
          <div className="mb-8 grid gap-5 rounded-[2rem] border border-ink/10 bg-white p-6 shadow-sm md:grid-cols-[auto_1fr] md:items-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-linen font-serif text-3xl font-semibold text-leaf">{initials(user?.name)}</div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">Customer account</p>
              <h1 className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">My Account</h1>
              <p className="mt-3 text-sm font-semibold text-ink/55">Manage your profile, orders, addresses, wishlist, and account security.</p>
              <div className="mt-5 grid max-w-md grid-cols-3 gap-3">
                {profileStats.map((item) => <div key={item.label} className="rounded-2xl bg-cream p-3 text-center"><p className="text-lg font-bold">{item.value}</p><p className="text-xs font-semibold text-ink/45">{item.label}</p></div>)}
              </div>
            </div>
          </div>

          <nav ref={mobileNavRef} className="sticky top-[52px] z-30 -mx-4 mb-6 overflow-x-auto border-y border-ink/10 bg-cream/95 px-4 py-3 backdrop-blur md:top-20 sm:-mx-6 sm:px-6 lg:hidden" aria-label="Mobile account navigation">
            <div className="flex min-w-max gap-2">
              {tabs.filter((tab) => tab.id !== "logout").map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => selectTab(tab.id)}
                    className={`relative grid min-w-[86px] place-items-center gap-1 rounded-2xl px-3 py-2 text-center text-[11px] font-bold transition ${active ? "bg-white text-leaf shadow-sm" : "text-ink/58 hover:bg-white hover:text-ink"}`}
                  >
                    <Icon size={18} />
                    <span className="leading-tight">{tab.label}</span>
                    <span className={`absolute bottom-0 h-0.5 w-8 rounded-full bg-leaf transition ${active ? "opacity-100" : "opacity-0"}`} />
                  </button>
                );
              })}
            </div>
          </nav>
          {isAdmin && <section className="mb-8 rounded-[2rem] border border-leaf/20 bg-white p-6 shadow-sm">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">Administrator</p>
                <h2 className="mt-2 font-serif text-4xl font-semibold">Administrator</h2>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl bg-cream p-4"><p className="text-ink/45">Role</p><p className="mt-1 font-bold">{user.adminRole || "OWNER"}</p></div>
                  <div className="rounded-2xl bg-cream p-4"><p className="text-ink/45">Verified mobile</p><p className="mt-1 break-all font-bold">{user.phone}</p></div>
                  <div className="rounded-2xl bg-cream p-4"><p className="text-ink/45">Last Login</p><p className="mt-1 font-bold">{user.lastLogin ? formatDate(user.lastLogin) : "Not available"}</p></div>
                  <div className="rounded-2xl bg-cream p-4"><p className="text-ink/45">Account Status</p><p className="mt-1 font-bold text-leaf">Active</p></div>
                </div>
              </div>
              <Button to="/admin" className="h-12 px-8">Open Admin Panel</Button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <AdminMetric label="Total Orders" value={adminStats?.summary?.totalOrders ?? adminStats?.summary?.todayOrders} />
              <AdminMetric label="Pending Orders" value={adminStats?.summary?.pendingOrders} />
              <AdminMetric label="Products" value={adminStats?.summary?.products} />
              <AdminMetric label="Customers" value={adminStats?.summary?.totalCustomers} />
              <AdminMetric label="Revenue" value={adminStats?.summary?.totalRevenue != null ? formatCurrency(adminStats.summary.totalRevenue) : undefined} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {[{ label: "Orders", to: "/admin/orders", icon: Package }, { label: "Products", to: "/admin/products", icon: ShoppingBag }, { label: "Inventory", to: "/admin/inventory", icon: Boxes }, { label: "Categories", to: "/admin/categories", icon: Tags }, { label: "Offers", to: "/admin/offers", icon: Tags }, { label: "Coupons", to: "/admin/coupons", icon: Tags }, { label: "Customers", to: "/admin/customers", icon: UserRound }, { label: "Reports", to: "/admin/reports", icon: BarChart3 }, { label: "Settings", to: "/admin/settings", icon: ShieldCheck }].map((item) => { const Icon = item.icon; return <Link key={item.to} to={item.to} className="inline-flex items-center gap-2 rounded-full bg-linen px-4 py-2 text-sm font-bold text-ink transition hover:text-leaf"><Icon size={15} />{item.label}</Link>; })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/10 pt-4">
              <Link to="/" className="rounded-full border border-ink/10 px-4 py-2 text-sm font-bold transition hover:border-leaf hover:text-leaf">View Store Homepage</Link>
              <Link to="/shop" className="rounded-full border border-ink/10 px-4 py-2 text-sm font-bold transition hover:border-leaf hover:text-leaf">Go to Shop</Link>
              <button type="button" onClick={() => selectTab("orders")} className="rounded-full border border-ink/10 px-4 py-2 text-sm font-bold transition hover:border-leaf hover:text-leaf">View Recent Orders</button>
            </div>
          </section>}
          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <aside className="h-max rounded-[1.5rem] border border-ink/10 bg-white p-3 shadow-sm lg:sticky lg:top-28">
              <nav className="hidden gap-2 lg:grid" aria-label="Account navigation">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isLogout = tab.id === "logout";
                  return <button key={tab.id} type="button" onClick={() => isLogout ? handleLogout() : selectTab(tab.id)} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition ${isLogout ? "bg-danger/10 text-danger hover:bg-danger hover:text-white" : activeTab === tab.id ? "bg-ink text-white" : "text-ink/65 hover:bg-linen hover:text-ink"}`}><Icon size={18} />{tab.label}</button>;
                })}
              </nav>
            </aside>

            <div ref={contentPanelRef} className="min-h-[420px] scroll-mt-[var(--account-scroll-offset)] rounded-[1.5rem] border border-ink/10 bg-white p-5 shadow-sm sm:p-6 lg:p-8">
              {loading && <div className="grid gap-4"><div className="h-8 w-52 animate-pulse rounded-full bg-linen" /><div className="h-28 animate-pulse rounded-2xl bg-linen" /><div className="h-28 animate-pulse rounded-2xl bg-linen" /></div>}
              {!loading && error && <p className="rounded-2xl bg-linen p-4 text-sm font-semibold text-danger">{error}</p>}
              {!loading && message && <p className="mb-5 rounded-2xl bg-leaf/10 p-4 text-sm font-semibold text-leaf">{message}</p>}

              {!loading && activeTab === "profile" && user && (
                <section>
                  <h2 className="font-serif text-3xl font-semibold">My Profile</h2>
                  <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
                    <form onSubmit={handleProfileSave} className="grid gap-5">
                      <Input label="Name" name="name" defaultValue={user.name || ""} required />
                      <Input label="Verified mobile number" name="phone" value={user.phone || ""} disabled />
                      <Button type="submit" loading={saving} className="w-full sm:w-max">Save Profile</Button>
                    </form>
                    <div className="rounded-2xl bg-cream p-5">
                      <div className="grid h-16 w-16 place-items-center rounded-full bg-white font-serif text-2xl font-semibold text-leaf shadow-sm">{initials(user.name)}</div>
                      <p className="mt-4 font-semibold">{user.name}</p>
                      <p className="mt-1 text-sm text-ink/55">{user.phone}</p>
                      <p className="mt-4 text-sm leading-6 text-ink/60">Only supported profile fields are editable here. Role and internal security fields are never exposed.</p>
                      <button type="button" onClick={() => handleLogout()} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-danger/10 px-5 text-sm font-bold text-danger transition hover:bg-danger hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30"><LogOut size={16} />Logout</button>
                    </div>
                  </div>
                </section>
              )}

              {!loading && activeTab === "orders" && (
                <section>
                  <h2 className="font-serif text-3xl font-semibold">My Orders</h2>
                  <div className="mt-6 grid gap-4">
                    {orders.length === 0 && <div className="rounded-2xl bg-cream p-6 text-center"><Package className="mx-auto text-leaf" /><p className="mt-3 font-semibold">No orders yet</p><Button to="/shop" className="mt-5">Shop Oils</Button></div>}
                    {orders.map((order) => <article key={order._id} className="grid gap-4 rounded-2xl border border-ink/10 p-4 transition hover:border-leaf/40 hover:bg-cream sm:grid-cols-[1fr_auto]">
                      <Link to={`/account/orders/${order._id}`} className="block">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-clay">Order {order._id}</p>
                        <p className="mt-2 text-sm font-semibold text-ink/50">{formatDate(order.createdAt)}</p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          {(order.products || []).slice(0, 3).map((item) => <div key={`${order._id}-${item.product}-${item.variant}`} className="flex items-center gap-3"><SafeImage src={item.image} alt={item.title} className="h-14 w-14 rounded-xl object-cover" /><span className="max-w-[180px] text-sm font-semibold line-clamp-2">{item.title} · {item.variantName} × {item.quantity}</span></div>)}
                        </div>
                      </Link>
                      <div className="text-left sm:text-right"><p className="text-lg font-bold">{formatCurrency(order.totalAmount || 0)}</p><p className="mt-2 text-sm font-semibold text-leaf">{statusLabels[order.orderStatus] || order.orderStatus}</p><p className="mt-1 text-sm font-semibold text-ink/45">Payment: {statusLabels[order.paymentStatus] || order.paymentStatus}</p><p className="mt-1 text-sm font-semibold text-ink/45">Delivery: {statusLabels[order.shippingStatus] || "Preparing Shipment"}</p>{order.trackingUrl && <Link to={`/track/${order._id}`} className="mt-3 inline-flex rounded-full bg-ink px-4 py-2 text-xs font-bold text-white transition hover:bg-leaf">Track Order</Link>}</div>
                    </article>)}
                  </div>
                </section>
              )}

              {!loading && activeTab === "addresses" && (
                <section>
                  <h2 className="font-serif text-3xl font-semibold">Saved Addresses</h2>
                  <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                    <form onSubmit={handleAddressSubmit} className="grid gap-4 rounded-2xl bg-cream p-4">
                      <Input label="Label" value={addressForm.label} onChange={(event) => updateAddressField("label", event.target.value)} />
                      <Input label="Full name" value={addressForm.fullName} onChange={(event) => updateAddressField("fullName", event.target.value)} required />
                      <Input label="Phone" value={addressForm.phone} onChange={(event) => updateAddressField("phone", event.target.value)} required />
                      <Input label="Street" value={addressForm.street} onChange={(event) => updateAddressField("street", event.target.value)} required />
                      <div className="grid gap-4 sm:grid-cols-2"><Input label="City" value={addressForm.city} onChange={(event) => updateAddressField("city", event.target.value)} required /><Input label="State" value={addressForm.state} onChange={(event) => updateAddressField("state", event.target.value)} required /></div>
                      <Input label="Postal code" value={addressForm.postalCode} onChange={(event) => updateAddressField("postalCode", event.target.value)} required />
                      <label className="flex items-center gap-2 text-sm font-semibold text-ink/60"><input type="checkbox" checked={Boolean(addressForm.isDefault)} onChange={(event) => updateAddressField("isDefault", event.target.checked)} /> Set as default address</label>
                      <div className="flex flex-col gap-3 sm:flex-row"><Button type="submit" loading={saving}>{editingAddressId ? "Update Address" : "Add Address"}</Button>{editingAddressId && <Button type="button" variant="secondary" onClick={() => { setEditingAddressId(null); setAddressForm(emptyAddress); }}>Cancel</Button>}</div>
                    </form>
                    <div className="grid gap-3">
                      {addresses.length === 0 && <div className="rounded-2xl border border-ink/10 p-5 text-center"><Home className="mx-auto text-leaf" /><p className="mt-3 font-semibold">No saved addresses yet.</p></div>}
                      {addresses.map((address) => <article key={address._id} className="rounded-2xl border border-ink/10 p-4">
                        <div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{address.label || "Address"} {address.isDefault && <span className="ml-2 rounded-full bg-leaf/10 px-2 py-1 text-xs text-leaf">Default</span>}</p><p className="mt-2 text-sm leading-6 text-ink/60">{address.fullName}, {address.phone}<br />{address.street}, {address.city}, {address.state} {address.postalCode}<br />{address.country || "India"}</p></div></div>
                        <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => editAddress(address)} className="rounded-full bg-linen px-4 py-2 text-xs font-bold text-ink transition hover:text-leaf">Edit</button><button type="button" onClick={() => removeAddress(address._id)} className="rounded-full bg-linen px-4 py-2 text-xs font-bold text-danger">Delete</button>{!address.isDefault && <button type="button" onClick={() => makeDefaultAddress(address)} className="rounded-full bg-linen px-4 py-2 text-xs font-bold text-ink transition hover:text-leaf">Make Default</button>}</div>
                      </article>)}
                    </div>
                  </div>
                </section>
              )}

              {!loading && activeTab === "wishlist" && (
                <section>
                  <h2 className="font-serif text-3xl font-semibold">Wishlist</h2>
                  <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {wishlistItems.length === 0 && <div className="rounded-2xl bg-cream p-6 text-center md:col-span-2 xl:col-span-3"><Heart className="mx-auto text-leaf" /><p className="mt-3 font-semibold">No saved products yet.</p><Button to="/shop" className="mt-5">Explore Products</Button></div>}
                    {wishlistItems.map((product) => <article key={product.id} className="rounded-2xl border border-ink/10 p-4">
                      <Link to={`/product/${product.slug}`} className="block"><SafeImage src={product.image} alt={product.name} className="aspect-[4/3] w-full rounded-xl object-cover" /><h3 className="mt-4 min-h-12 font-serif text-xl font-semibold leading-tight hover:text-leaf">{product.name}</h3></Link>
                      <p className="mt-2 font-bold">{formatCurrency(product.price)}</p>
                      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2"><AddToCartButton product={product} className="h-11 rounded-full text-xs" /><WishlistToggle product={product} className="h-11 w-11" labelPrefix="Remove" /></div>
                    </article>)}
                  </div>
                </section>
              )}

              {!loading && activeTab === "security" && <AccountSecurityPanel onLogout={() => handleLogout({ skipConfirm: true })} />}

              {!loading && activeTab === "logout" && (
                <section className="grid place-items-center py-12 text-center">
                  <LogOut className="text-leaf" size={32} />
                  <h2 className="mt-4 font-serif text-3xl font-semibold">Ready to logout?</h2>
                  <p className="mt-3 max-w-md text-ink/60">You can sign back in anytime to view your orders and saved pantry details.</p>
                  <button type="button" className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-danger/10 px-7 text-sm font-bold text-danger transition hover:bg-danger hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30" onClick={() => handleLogout()}><LogOut size={17} />Logout</button>
                </section>
              )}
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function AdminMetric({ label, value }) {
  return <div className="rounded-2xl bg-cream p-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-ink/40">{label}</p><p className="mt-2 text-lg font-bold">{value ?? <span className="inline-block h-5 w-16 animate-pulse rounded bg-ink/10" />}</p></div>;
}







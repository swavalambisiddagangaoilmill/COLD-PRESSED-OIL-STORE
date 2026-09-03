// Admin shell with permission-aware navigation, global search, and profile controls.
import "../adminTheme.css";
import { BarChart3, Bell, Boxes, ChevronDown, ClipboardList, Home, Image as ImageIcon, LayoutDashboard, LockKeyhole, Mail, Megaphone, Menu, Package, Percent, Settings, ShieldCheck, Truck, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { adminApi } from "../services/adminApi.js";
import AdminNotificationBell from "../components/AdminNotificationBell.jsx";

const roleModules = {
  OWNER: ["*"],
  ORDER_MANAGER: ["Dashboard", "Orders", "Fulfillment", "Shipping", "Customers", "Payments", "Reports", "Notifications"],
  PRODUCT_MANAGER: ["Dashboard", "Products", "Inventory", "Categories", "Reports", "Notifications"],
  CONTENT_MANAGER: ["Dashboard", "Homepage Carousel", "Gallery", "Messages", "Notifications"],
};

const BellIcon = Bell;

const navItems = [
  { label: "Dashboard", to: "/admin", icon: LayoutDashboard, end: true },
  { label: "Orders", to: "/admin/orders", icon: ClipboardList },
  { label: "Fulfillment", to: "/admin/fulfillment", icon: Package },
  { label: "Products", to: "/admin/products", icon: Package },
  { label: "Inventory", to: "/admin/inventory", icon: Boxes },
  { label: "Categories", to: "/admin/categories", icon: Home },
  { label: "Offers", to: "/admin/offers", icon: Megaphone, group: "Marketing" },
  { label: "Coupons", to: "/admin/coupons", icon: Percent, group: "Marketing" },
  { label: "Homepage Carousel", to: "/admin/carousel", icon: ImageIcon, group: "Marketing" },
  { label: "Gallery", to: "/admin/gallery", icon: ImageIcon, group: "Marketing" },
  { label: "Shipping", to: "/admin/shipping", icon: Truck },
  { label: "Customers", to: "/admin/customers", icon: Users },
  { label: "Payments", to: "/admin/payments", icon: BarChart3 },
  { label: "Messages", to: "/admin/messages", icon: Mail },
  { label: "Reports", to: "/admin/reports", icon: BarChart3 },
  { label: "Notifications", to: "/admin/notifications", icon: BellIcon },
  { label: "Admin Users", to: "/admin/users", icon: ShieldCheck },
  { label: "Audit Logs", to: "/admin/audit-logs", icon: ClipboardList },
  { label: "Restrictions", to: "/admin/restrictions", icon: LockKeyhole },
  { label: "Settings", to: "/admin/settings", icon: Settings },
];

function canSee(user, label) {
  const allowed = roleModules[user?.adminRole || "OWNER"] || [];
  return allowed.includes("*") || allowed.includes(label);
}

function Sidebar({ collapsed, close, user }) {
  const items = navItems.filter((item) => canSee(user, item.label));
  return <aside className={`${collapsed ? "lg:w-20" : "lg:w-64"} flex h-full flex-col border-r border-white/10 bg-[var(--admin-primary-hover)] text-white transition-all`}>
    <div className="flex h-14 items-center justify-between border-b border-white/10 px-4"><p className="truncate font-serif text-xl font-semibold text-white">{collapsed ? "SS" : "Swavalambi Siddaganga Oil Mill Admin"}</p><button type="button" onClick={close} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10 lg:hidden"><X size={18} /></button></div>
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">{items.map((item, index) => { const Icon = item.icon; const showGroup = item.group && item.group !== items[index - 1]?.group && !collapsed; return <div key={item.to}>{showGroup && <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">{item.group}</p>}<NavLink end={item.end} to={item.to} onClick={close} className={({ isActive }) => `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${isActive ? "bg-white/15 text-white before:absolute before:-left-3 before:h-6 before:w-1 before:rounded-r-full before:bg-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}><Icon size={18} /><span className={collapsed ? "lg:hidden" : ""}>{item.label}</span></NavLink></div>; })}</nav>
  </aside>;
}

function AdminSearch() {
  const navigate = useNavigate();
  const ref = useRef(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return undefined; }
    const timer = window.setTimeout(() => adminApi.search(q).then(setResults).catch(() => setResults({ pages: [], products: [], orders: [], customers: [], categories: [] })), 300);
    return () => window.clearTimeout(timer);
  }, [q]);
  useEffect(() => { const close = (e) => { if (!ref.current?.contains(e.target)) setResults(null); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, []);
  const groups = results ? [["Pages", results.pages], ["Products", results.products], ["Orders", results.orders], ["Customers", results.customers], ["Categories", results.categories]].filter(([, items]) => items?.length) : [];
  const open = (path) => { navigate(path); setQ(""); setResults(null); };
  return <div ref={ref} className="relative hidden md:block"><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && groups[0]?.[1]?.[0]) open(groups[0][1][0].path || "/admin/products"); }} placeholder="Search admin" className="h-9 w-72 rounded-lg border border-[var(--admin-border)] bg-linen/50 px-3 text-sm outline-none focus:border-[var(--admin-primary)]" />{results && <div className="absolute right-0 mt-2 max-h-96 w-96 overflow-y-auto rounded-xl border border-[var(--admin-border)] bg-white p-2 shadow-soft">{groups.length === 0 && <p className="p-3 text-sm text-ink/55">No results found</p>}{groups.map(([label, items]) => <div key={label} className="mb-2"><p className="px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink/40">{label}</p>{items.slice(0, 5).map((item) => <button key={item._id || item.path || item.slug || item.label} onClick={() => open(item.path || (label === "Orders" ? "/admin/orders" : label === "Customers" ? "/admin/customers" : label === "Categories" ? "/admin/categories" : "/admin/products"))} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-linen">{item.label || item.title || item.name || item.shippingAddress?.fullName || item.email || item._id}</button>)}</div>)}</div>}</div>;
}

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout: websiteLogout } = useAuth();
  const items = useMemo(() => navItems.filter((item) => canSee(user, item.label)), [user]);
  const current = items.find((item) => item.to === location.pathname || (!item.end && location.pathname.startsWith(item.to))) || items[0] || navItems[0];
  const logout = async () => { await websiteLogout(); navigate("/", { replace: true }); };
  return <div className="min-h-screen bg-[var(--admin-bg)] text-[var(--admin-text)]"><div className="fixed inset-y-0 left-0 z-50 hidden lg:block"><Sidebar collapsed={collapsed} user={user} /></div>{mobileOpen && <div className="fixed inset-0 z-50 bg-ink/30 lg:hidden"><div className="h-full w-72"><Sidebar close={() => setMobileOpen(false)} user={user} /></div></div>}<div className={`${collapsed ? "lg:pl-20" : "lg:pl-64"} transition-all`}><header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--admin-border)] bg-[var(--admin-surface)] px-4 shadow-sm"><div className="flex items-center gap-3"><button type="button" onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-linen lg:hidden"><Menu size={18} /></button><button type="button" onClick={() => setCollapsed((value) => !value)} className="hidden h-9 rounded-lg border border-[var(--admin-border)] px-3 text-sm font-bold text-ink/65 hover:text-[var(--admin-primary)] lg:inline-flex">{collapsed ? "Expand" : "Collapse"}</button><div><p className="text-sm font-bold">{current.label}</p><p className="hidden text-xs text-ink/45 sm:block">{current.label === "Dashboard" ? "Store operations overview" : `Manage ${current.label.toLowerCase()}`}</p></div></div><div className="flex items-center gap-2"><Link to="/" className="hidden h-9 items-center rounded-lg border border-[var(--admin-border)] px-3 text-sm font-bold text-ink/65 transition hover:text-[var(--admin-primary)] md:inline-flex">View Website</Link><AdminSearch /><AdminNotificationBell /><div className="relative"><button type="button" onClick={() => setProfileOpen((value) => !value)} className="flex h-9 items-center gap-2 rounded-lg border border-[var(--admin-border)] px-2 text-sm font-bold"><span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--admin-primary)] text-xs text-white">{user?.name?.[0] || "A"}</span><span className="hidden sm:inline">{user?.name || "Admin"}</span><span className="hidden text-xs text-ink/45 lg:inline">{user?.adminRole || "OWNER"}</span><ChevronDown size={14} /></button>{profileOpen && <div className="absolute right-0 mt-2 w-44 rounded-xl border border-[var(--admin-border)] bg-white p-2 shadow-soft"><Link to="/account" className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-linen">View Website Profile</Link><Link to="/" className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-linen">View Store</Link><button onClick={logout} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-linen">Logout</button></div>}</div></div></header><main className="p-4 lg:p-6"><Outlet /></main></div></div>;
}







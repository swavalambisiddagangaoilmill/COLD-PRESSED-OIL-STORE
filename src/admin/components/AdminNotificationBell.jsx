// Admin notification bell with unread count, polling, and quick actions.
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../services/adminApi.js";

function relativeTime(value) {
  const diff = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

function categoryLabel(value) {
  return String(value || "system").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const [pending, setPending] = useState({});
  const ref = useRef(null);
  const loadingRef = useRef(false);
  const load = async () => {
    if (loadingRef.current || document.visibilityState !== "visible") return;
    loadingRef.current = true;
    try {
      const result = await adminApi.notifications("?limit=8");
      setData({ ...result, items: Array.isArray(result?.items) ? result.items.filter(Boolean) : [], unread: Number(result?.unread) || 0 });
    } catch {
      // Keep the last successful notification snapshot; polling never retries immediately.
    } finally {
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60000);
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const markAll = async () => {
    if (pending.markAll) return;
    setPending((current) => ({ ...current, markAll: true }));
    try {
      await adminApi.markAllNotificationsRead();
      setData((current) => ({ ...current, unread: 0, items: (current?.items || []).filter(Boolean).map((item) => ({ ...item, read: true })) }));
    } finally {
      setPending((current) => ({ ...current, markAll: false }));
    }
  };

  const markRead = async (item) => {
    if (item.read || pending[item._id]) return;
    setPending((current) => ({ ...current, [item._id]: true }));
    setData((current) => ({ ...current, unread: Math.max(0, (current?.unread || 0) - 1), items: (current?.items || []).filter(Boolean).map((entry) => entry._id === item._id ? { ...entry, read: true } : entry) }));
    try {
      await adminApi.markNotification(item._id, true);
    } catch {
      await load();
    } finally {
      setPending((current) => ({ ...current, [item._id]: false }));
    }
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} className="relative grid h-9 w-9 place-items-center rounded-lg hover:bg-linen">
        <Bell size={18} />
        {data.unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(380px,calc(100vw-24px))] rounded-xl border border-[var(--admin-border)] bg-white p-2 shadow-soft">
          <div className="flex items-center justify-between px-2 py-2">
            <div>
              <p className="text-sm font-bold leading-none">Notifications</p>
              <p className="mt-1 text-[11px] font-semibold text-ink/40">{data.unread || 0} unread</p>
            </div>
            <button type="button" disabled={pending.markAll} onClick={markAll} className="rounded-full px-2 py-1 text-xs font-bold text-[var(--admin-primary)] transition hover:bg-linen disabled:pointer-events-none disabled:opacity-60">Mark all read</button>
          </div>
          <div className="max-h-[22rem] space-y-1 overflow-y-auto pr-1 admin-notification-scroll">
            {data.items?.length ? data.items.map((item) => (
              <Link
                key={item._id}
                to={item.related?.path || "/admin/notifications"}
                onClick={() => { markRead(item); setOpen(false); }}
                className={`block rounded-lg border p-3 text-sm transition hover:border-[var(--admin-primary)]/25 hover:bg-linen ${item.read ? "border-transparent text-ink/60" : "border-leaf/15 bg-leaf/5 text-ink"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="line-clamp-1 font-bold leading-5">{item.title}</span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink/45 shadow-sm">{categoryLabel(item.category)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink/55">{item.description}</p>
                <p className="mt-1 text-[11px] font-semibold text-ink/35">{relativeTime(item.createdAt)}</p>
              </Link>
            )) : <p className="p-4 text-center text-sm text-ink/50">No notifications</p>}
          </div>
          <Link to="/admin/notifications" onClick={() => setOpen(false)} className="mt-2 block rounded-lg bg-ink px-3 py-2 text-center text-sm font-bold text-white transition hover:bg-ink/90">View All</Link>
        </div>
      )}
    </div>
  );
}

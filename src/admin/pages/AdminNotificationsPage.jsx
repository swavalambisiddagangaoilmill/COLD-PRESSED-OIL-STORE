// Dedicated admin notification management page.
import { Bell, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../components/features/feedback/ToastProvider.jsx";
import { AdminBadge, AdminButton, AdminPageHeader, AdminTable } from "../components/AdminUi.jsx";
import { adminApi } from "../services/adminApi.js";

const statusText = (value) => String(value || "-").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());

function Cell({ children }) {
  return <td className="whitespace-nowrap px-4 py-3 align-middle">{children}</td>;
}

export default function AdminNotificationsPage() {
  const { showToast } = useToast();
  const [data, setData] = useState({ items: [], unread: 0 });
  const [loading, setLoading] = useState(true);
  const pendingRef = useRef({});
  const [pending, setPending] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const result = await adminApi.notifications("?limit=100");
      setData({ ...result, items: Array.isArray(result?.items) ? result.items.filter(Boolean) : [], unread: Number(result?.unread) || 0 });
    } catch (err) {
      showToast(err.message || "Unable to load notifications.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const run = async (key, action, success) => {
    if (pendingRef.current[key]) return null;
    pendingRef.current[key] = true;
    setPending((current) => ({ ...current, [key]: true }));
    try {
      const result = await action();
      showToast(success, "success");
      return result || true;
    } catch (err) {
      showToast(err.message || "Action failed. Please try again.", "error");
      return null;
    } finally {
      pendingRef.current[key] = false;
      setPending((current) => ({ ...current, [key]: false }));
    }
  };

  const mark = async (id, read) => {
    const result = await run(`mark:${id}`, () => adminApi.markNotification(id, read), read ? "Notification marked read." : "Notification marked unread.");
    if (result) setData((current) => ({ ...current, unread: Math.max(0, (current?.unread || 0) + (read ? -1 : 1)), items: (current?.items || []).filter(Boolean).map((item) => item._id === id ? { ...item, read } : item) }));
  };

  const remove = async (id) => {
    const item = (data?.items || []).find((entry) => entry?._id === id);
    const result = await run(`delete:${id}`, () => adminApi.deleteNotification(id), "Notification deleted.");
    if (result) setData((current) => ({ ...current, unread: Math.max(0, (current?.unread || 0) - (item?.read ? 0 : 1)), items: (current?.items || []).filter((entry) => entry?._id !== id) }));
  };

  const markAll = async () => {
    const result = await run("mark-all", adminApi.markAllNotificationsRead, "All notifications marked read.");
    if (result) setData((current) => ({ ...current, unread: 0, items: (current?.items || []).filter(Boolean).map((item) => ({ ...item, read: true })) }));
  };

  const clearRead = async () => {
    const result = await run("clear-read", adminApi.clearReadNotifications, "Read notifications cleared.");
    if (result) setData((current) => ({ ...current, items: (current?.items || []).filter((item) => item && !item.read) }));
  };

  return <><AdminPageHeader title="Notifications" description="Review admin alerts across orders, payments, inventory, customers, security, and system events." action={<div className="flex gap-2"><AdminButton variant="secondary" loading={pending["mark-all"]} onClick={markAll}>Mark All Read</AdminButton><AdminButton variant="secondary" loading={pending["clear-read"]} onClick={clearRead}>Clear Read</AdminButton></div>} />{loading ? <div className="rounded-xl bg-white p-6 text-sm font-semibold text-ink/55">Loading...</div> : <AdminTable columns={["", "Title", "Category", "Related", "Status", "Time", "Actions"]} rows={data.items.map((item) => <tr key={item._id}><Cell><Bell size={16} className={item.read ? "text-ink/35" : "text-leaf"} /></Cell><Cell><p className="font-bold">{item.title}</p><p className="max-w-md truncate text-xs text-ink/55">{item.description}</p></Cell><Cell>{statusText(item.category)}</Cell><Cell>{item.related?.path ? <Link className="font-bold text-leaf" to={item.related.path}>{item.related.label || item.related.kind}</Link> : item.related?.label || "-"}</Cell><Cell><AdminBadge>{item.read ? "Read" : "New"}</AdminBadge></Cell><Cell>{new Date(item.createdAt).toLocaleString("en-IN")}</Cell><Cell><div className="flex gap-2"><AdminButton variant="secondary" loading={pending[`mark:${item._id}`]} onClick={() => mark(item._id, !item.read)}>{item.read ? "Mark Unread" : "Mark Read"}</AdminButton><AdminButton variant="danger" loading={pending[`delete:${item._id}`]} onClick={() => remove(item._id)}><Trash2 size={14} /></AdminButton></div></Cell></tr>)} empty="No notifications found." />}</>;
}

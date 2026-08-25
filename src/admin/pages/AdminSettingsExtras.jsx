// Admin settings panels for notification preferences and active sessions.
import { useEffect, useRef, useState } from "react";
import { useToast } from "../../components/features/feedback/ToastProvider.jsx";
import { AdminButton, AdminCard } from "../components/AdminUi.jsx";
import { adminApi } from "../services/adminApi.js";

const labels = {
  new_order: "New Order", order_cancelled: "Order Cancelled", order_returned: "Order Returned", refund_requested: "Refund Requested", order_delivered: "Order Delivered",
  payment_successful: "Payment Successful", payment_failed: "Payment Failed", payment_refunded: "Payment Refunded",
  low_stock: "Low Stock", out_of_stock: "Out Of Stock", back_in_stock: "Product Back In Stock",
  new_user_registration: "New User Registration", contact_form_submission: "Contact Form Submission", newsletter_subscription: "Newsletter Subscription",
  failed_admin_login: "Failed Admin Login", multiple_failed_login_attempts: "Multiple Failed Login Attempts", password_changed: "Password Changed", suspicious_activity: "Suspicious Activity", admin_login: "Admin Login", admin_logout: "Admin Logout", admin_session_revoked: "Admin Session Revoked",
  email_delivery_failed: "Email Delivery Failed", shipping_api_error: "Shipping API Error", backup_failed: "Backup Failed", critical_server_error: "Critical Server Error",
};

function title(value) { return String(value).replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()); }

export default function AdminSettingsExtras() {
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState([]);
  const [sessions, setSessions] = useState(null);
  const [enabled, setEnabled] = useState({});
  const pendingRef = useRef({});
  const [pending, setPending] = useState({});
  const load = async () => {
    const [prefData, sessionData] = await Promise.all([adminApi.notificationPreferences(), adminApi.sessions()]);
    setPrefs(prefData.types || []);
    setEnabled(Object.fromEntries((prefData.types || []).map((item) => [item.type, item.enabled])));
    setSessions(sessionData);
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

  const savePrefs = async () => { await run("prefs", () => adminApi.saveNotificationPreferences(enabled), "Notification settings saved."); };
  const revoke = async (ids) => {
    const key = ids.length > 1 ? "sessions:all" : `session:${ids[0]}`;
    const result = await run(key, () => adminApi.revokeSessions(ids), ids.length > 1 ? "Other sessions signed out." : "Device signed out.");
    if (result) setSessions((current) => current ? { ...current, active: current.active.filter((session) => !ids.includes(session.sessionId)) } : current);
  };
  const grouped = prefs.reduce((acc, item) => ({ ...acc, [item.category]: [...(acc[item.category] || []), item] }), {});

  return <><section className="grid gap-4 rounded-xl border border-[var(--admin-border)] bg-white p-5 shadow-sm xl:col-span-2"><div className="flex items-center justify-between gap-3"><h2 className="font-bold">Notification Settings</h2><AdminButton type="button" loading={pending.prefs} onClick={savePrefs}>Save Notifications</AdminButton></div><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{Object.entries(grouped).map(([category, items]) => <div key={category} className="rounded-xl bg-linen/60 p-4"><p className="mb-3 text-sm font-bold">{title(category)}</p><div className="grid gap-2">{items.map((item) => <label key={item.type} className="flex items-center gap-2 text-sm font-semibold text-ink/70"><input type="checkbox" checked={enabled[item.type] !== false} onChange={(event) => setEnabled((current) => ({ ...current, [item.type]: event.target.checked }))} />{labels[item.type] || title(item.type)}</label>)}</div></div>)}</div></section><section className="grid gap-4 rounded-xl border border-[var(--admin-border)] bg-white p-5 shadow-sm xl:col-span-2"><div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">Security / Active Sessions</h2><p className="mt-1 text-sm text-ink/50">Manage authenticated admin devices.</p></div><span className="text-sm font-semibold text-ink/50">{sessions?.active?.length || 0}/{sessions?.max || 5} active devices</span></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{sessions?.active?.map((session) => <AdminCard key={session.sessionId} title={session.current ? `${session.deviceName} (Current)` : session.deviceName} value={session.current ? "Active now" : `Last active ${new Date(session.lastActiveAt).toLocaleString("en-IN")}`} note={`${session.os} · ${session.ip}`}><p className="mt-3 text-xs text-ink/50">Login time: {new Date(session.loginAt).toLocaleString("en-IN")}</p><p className="mt-1 text-xs font-semibold text-leaf">Status: Active</p>{!session.current && <AdminButton type="button" variant="secondary" className="mt-3" loading={pending[`session:${session.sessionId}`]} onClick={() => revoke([session.sessionId])}>Revoke</AdminButton>}</AdminCard>)}</div>{sessions?.active?.some((session) => !session.current) && <AdminButton type="button" variant="secondary" loading={pending["sessions:all"]} onClick={() => revoke(sessions.active.filter((session) => !session.current).map((session) => session.sessionId))}>Sign Out All Other Devices</AdminButton>}</section></>;
}

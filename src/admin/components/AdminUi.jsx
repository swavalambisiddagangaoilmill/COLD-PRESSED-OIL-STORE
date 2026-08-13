// Shared compact UI primitives for the admin prototype.
import { Loader2, X } from "lucide-react";

const statusStyles = {
  Active: "bg-leaf/10 text-leaf",
  Paid: "bg-leaf/10 text-leaf",
  Delivered: "bg-leaf/10 text-leaf",
  New: "bg-clay/10 text-clay",
  Scheduled: "bg-clay/10 text-clay",
  Pending: "bg-clay/10 text-clay",
  Processing: "bg-ink/10 text-ink",
  Confirmed: "bg-ink/10 text-ink",
  COD: "bg-ink/10 text-ink",
  Inactive: "bg-ink/10 text-ink/60",
  Disabled: "bg-ink/10 text-ink/60",
  Cancelled: "bg-danger/10 text-danger",
  Failed: "bg-danger/10 text-danger",
  Expired: "bg-danger/10 text-danger",
  "Low Stock": "bg-clay/10 text-clay",
  "Out of Stock": "bg-danger/10 text-danger",
  "In Stock": "bg-leaf/10 text-leaf",
};

export function AdminButton({ children, variant = "primary", className = "", loading = false, disabled, ...props }) {
  const styles = variant === "secondary"
    ? "border border-ink/10 bg-white text-ink hover:border-leaf hover:text-leaf"
    : variant === "danger"
      ? "bg-danger text-white hover:bg-danger/90"
      : "bg-ink text-white hover:bg-leaf";
  return <button disabled={disabled || loading} className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`} {...props}>{loading && <Loader2 size={14} className="animate-spin" />}{children}</button>;
}

export function AdminBadge({ children }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[children] || "bg-linen text-ink/70"}`}>{children}</span>;
}

export function AdminCard({ title, value, note, children }) {
  return <div className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.12em] text-ink/45">{title}</p>{value && <p className="mt-2 text-2xl font-bold text-ink">{value}</p>}{note && <p className="mt-1 text-xs font-semibold text-ink/50">{note}</p>}{children}</div>;
}

export function AdminInput({ label, className = "", error = "", hint = "", ...props }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-ink/65"><span>{label}</span><input aria-invalid={Boolean(error)} className={`h-10 rounded-lg border bg-white px-3 text-sm text-ink outline-none transition ${error ? "border-red-400 focus:border-red-600" : "border-ink/10 focus:border-leaf"} ${className}`} {...props} />{error ? <span className="text-xs font-semibold text-red-700">{error}</span> : hint ? <span className="text-xs font-medium text-ink/45">{hint}</span> : null}</label>;
}

export function AdminSelect({ label, children, className = "", ...props }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-ink/65"><span>{label}</span><select className={`h-10 rounded-lg border border-ink/10 bg-white px-3 text-sm text-ink outline-none transition focus:border-leaf ${className}`} {...props}>{children}</select></label>;
}

export function AdminTextarea({ label, className = "", ...props }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-ink/65"><span>{label}</span><textarea className={`min-h-24 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-leaf ${className}`} {...props} /></label>;
}

export function AdminPageHeader({ title, description, action }) {
  return <div className="mb-5 flex flex-col gap-3 border-b border-ink/10 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold text-ink">{title}</h1>{description && <p className="mt-1 text-sm text-ink/55">{description}</p>}</div>{action}</div>;
}

export function AdminTable({ columns, rows, empty = "No records found." }) {
  return <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white shadow-sm"><table className="min-w-full divide-y divide-ink/10 text-sm"><thead className="bg-linen/70"><tr>{columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.08em] text-ink/50">{column}</th>)}</tr></thead><tbody className="divide-y divide-ink/10">{rows.length ? rows : <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-ink/50">{empty}</td></tr>}</tbody></table></div>;
}

export function AdminModal({ title, open, onClose, children, footer }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/35 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-soft"><div className="flex items-center justify-between border-b border-ink/10 px-5 py-4"><h2 className="text-lg font-bold">{title}</h2><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-linen"><X size={18} /></button></div><div className="max-h-[65vh] overflow-y-auto p-5">{children}</div>{footer && <div className="flex justify-end gap-2 border-t border-ink/10 px-5 py-4">{footer}</div>}</div></div>;
}

export function AdminFilters({ children }) {
  return <div className="mb-4 grid gap-3 rounded-xl border border-ink/10 bg-white p-3 shadow-sm md:grid-cols-4">{children}</div>;
}

// Admin-specific access denied page.
export default function AdminAccessDenied() {
  return <div className="min-h-screen bg-[var(--admin-bg)] p-6 text-[var(--admin-text)]"><div className="mx-auto mt-20 max-w-lg rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-8 text-center shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--admin-primary)]">Admin Access</p><h1 className="mt-3 text-2xl font-bold">Access denied</h1><p className="mt-3 text-sm text-[var(--admin-muted)]">Your account is signed in, but it does not have permission to open the Swavalambi Siddaganga Oil Mill admin panel.</p></div></div>;
}


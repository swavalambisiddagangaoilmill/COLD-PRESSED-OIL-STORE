// Blocks interaction while the global boundary performs bounded, non-mutating recovery.
export default function RecoveryOverlay({ attempt, maximum }) {
  return (
    <div
      className="fixed inset-0 z-[1000] grid cursor-wait place-items-center bg-ink/20 px-5 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`Recovering the page, attempt ${attempt} of ${maximum}`}
    >
      <div className="grid place-items-center gap-4 rounded-3xl border border-white/50 bg-white/95 px-8 py-7 shadow-soft">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-leaf/20 border-t-leaf" aria-hidden="true" />
        <p className="text-sm font-bold text-leaf">Restoring this page…</p>
      </div>
    </div>
  );
}

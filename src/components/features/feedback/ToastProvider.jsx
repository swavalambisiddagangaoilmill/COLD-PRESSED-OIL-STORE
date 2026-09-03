// Provides unified toast notifications for storefront feedback.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, AlertTriangle, CheckCircle, Heart, Info, ShoppingBag, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

const ToastContext = createContext(null);
const icons = { success: CheckCircle, error: AlertCircle, warning: AlertTriangle, info: Info, wishlist: Heart, cart: ShoppingBag };
const tones = {
  success: "bg-leaf/10 text-leaf",
  error: "bg-danger/10 text-danger",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-sky-100 text-sky-800",
  wishlist: "bg-linen text-leaf",
  cart: "bg-linen text-leaf",
};

export function ToastProvider({ children }) {
  const reduceMotion = useReducedMotion();
  const [toasts, setToasts] = useState([]);
  const [critical, setCritical] = useState(null);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    window.clearTimeout(timersRef.current.get(id));
    timersRef.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message, tone = "success", action = null, options = {}) => {
    const id = options.id || `${tone}-${message}`;
    setToasts((current) => {
      const next = current.filter((toast) => toast.id !== id).slice(-1);
      return [...next, { id, message, tone, action }];
    });
    window.clearTimeout(timersRef.current.get(id));
    const defaultDuration = tone === "error" ? 6500 : tone === "warning" ? 5000 : 3200;
    timersRef.current.set(id, window.setTimeout(() => dismissToast(id), options.duration || defaultDuration));
  }, [dismissToast]);

  const showCritical = useCallback((title, message, options = {}) => {
    setCritical({ title, message, action: options.action || null });
  }, []);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!critical) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") setCritical(null); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [critical]);

  const value = useMemo(() => ({ showToast, dismissToast, showCritical, closeCritical: () => setCritical(null) }), [dismissToast, showCritical, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[140] ml-auto grid w-auto max-w-[390px] gap-3 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[min(92vw,390px)]" aria-live="polite" aria-relevant="additions">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = icons[toast.tone] || icons.success;
            return (
              <motion.div
                key={toast.id}
                layout
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
                transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: "easeOut" }}
                className="rounded-[1.35rem] border border-ink/10 bg-white p-4 text-ink shadow-soft"
              >
                <div className="flex items-start gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${tones[toast.tone] || tones.info}`}><Icon size={19} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-6">{toast.message}</p>
                    {toast.action?.to && (
                      <Link to={toast.action.to} onClick={() => dismissToast(toast.id)} className="mt-3 inline-flex rounded-full bg-ink px-4 py-2 text-xs font-bold text-white transition hover:bg-leaf">
                        {toast.action.label}
                      </Link>
                    )}
                    {toast.action?.onClick && <button type="button" onClick={() => { dismissToast(toast.id); toast.action.onClick(); }} className="mt-3 inline-flex rounded-full bg-ink px-4 py-2 text-xs font-bold text-white transition hover:bg-leaf">{toast.action.label}</button>}
                  </div>
                  <button type="button" aria-label="Dismiss notification" onClick={() => dismissToast(toast.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink/40 transition hover:bg-linen hover:text-ink"><X size={15} /></button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {critical && (
          <motion.div className="fixed inset-0 z-[170] grid place-items-center bg-ink/35 px-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="presentation">
            <motion.div role="alertdialog" aria-modal="true" aria-labelledby="critical-notification-title" aria-describedby="critical-notification-message" className="w-full max-w-md rounded-[1.5rem] border border-ink/10 bg-white p-6 shadow-soft" initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}>
              <div className="flex items-start justify-between gap-4"><span className="grid h-11 w-11 place-items-center rounded-full bg-danger/10 text-danger"><AlertCircle size={21} /></span><button type="button" aria-label="Close" onClick={() => setCritical(null)} className="grid h-9 w-9 place-items-center rounded-full bg-linen text-ink/60 hover:text-ink"><X size={17} /></button></div>
              <h2 id="critical-notification-title" className="mt-5 font-serif text-3xl font-semibold">{critical.title}</h2>
              <p id="critical-notification-message" className="mt-3 text-sm leading-7 text-ink/65">{critical.message}</p>
              {critical.action?.to ? <Link autoFocus to={critical.action.to} onClick={() => setCritical(null)} className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-ink px-5 text-sm font-bold text-white transition hover:bg-leaf">{critical.action.label}</Link> : <button autoFocus type="button" onClick={() => { setCritical(null); critical.action?.onClick?.(); }} className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-ink px-5 text-sm font-bold text-white transition hover:bg-leaf">{critical.action?.label || "Close"}</button>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}




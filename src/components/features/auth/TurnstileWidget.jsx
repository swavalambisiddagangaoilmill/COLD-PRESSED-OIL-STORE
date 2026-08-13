// Renders Cloudflare Turnstile when a site key is configured.
import { useEffect, useRef } from "react";

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

export default function TurnstileWidget({ onVerify, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!siteKey) {
      onVerify?.("");
      return undefined;
    }
    let widgetId;
    const render = () => {
      if (!window.turnstile || !ref.current || widgetId) return;
      widgetId = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (token) => onVerify?.(token),
        "expired-callback": () => onVerify?.(""),
        "error-callback": () => onVerify?.(""),
      });
    };
    const existing = document.querySelector('script[data-turnstile="true"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = "true";
      script.onload = render;
      document.head.appendChild(script);
    } else render();
    const timer = window.setInterval(render, 300);
    return () => {
      window.clearInterval(timer);
      if (window.turnstile && widgetId) window.turnstile.remove(widgetId);
    };
  }, [onVerify]);

  if (!siteKey) return <div role="alert" className={`${className} rounded-xl border border-danger/20 bg-danger/5 p-3 text-sm font-semibold text-danger`}>Human verification is temporarily unavailable. Please try again shortly.</div>;
  return <div className={className} ref={ref} />;
}

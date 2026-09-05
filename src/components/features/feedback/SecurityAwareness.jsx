// Adds client-side deterrents and reports repeated high-confidence suspicious activity.
import { useEffect, useRef, useState } from "react";
import { reportSecurityActivity } from "../../../services/securityService.js";

const warningThreshold = 6;
const blockedKeys = new Set(["F12"]);
const blockedCombos = [
  (event) => (event.ctrlKey || event.metaKey) && event.shiftKey && ["I", "J", "C"].includes(event.key.toUpperCase()),
  (event) => (event.ctrlKey || event.metaKey) && event.key.toUpperCase() === "U",
];

function getDeviceId() {
  const key = "ss_oil_mill_device_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function isTouchDevice() {
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches;
  const touchPoints = navigator.maxTouchPoints > 0;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile|CriOS|FxiOS|EdgiOS/i.test(navigator.userAgent);
  return Boolean(coarsePointer || touchPoints || mobileUserAgent);
}

function isEditableTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

export default function SecurityAwareness() {
  const [warning, setWarning] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [restrictedUntil, setRestrictedUntil] = useState("");
  const localCountRef = useRef(0);
  const lastReportRef = useRef(0);
  const signalReportRef = useRef({});
  const contextMenuTimesRef = useRef([]);
  const restrictedRef = useRef(false);
  const overlayRef = useRef(null);

  useEffect(() => {
    restrictedRef.current = restricted;
  }, [restricted]);


  useEffect(() => {
    if (!restricted) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyTouchAction = document.body.style.touchAction;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    window.setTimeout(() => overlayRef.current?.focus(), 30);

    const blockInteraction = (event) => {
      if (overlayRef.current?.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const blockScroll = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const blockKeyboard = (event) => {
      event.preventDefault();
      event.stopPropagation();
      overlayRef.current?.focus();
    };

    document.addEventListener("click", blockInteraction, true);
    document.addEventListener("pointerdown", blockInteraction, true);
    document.addEventListener("touchstart", blockInteraction, true);
    document.addEventListener("wheel", blockScroll, { capture: true, passive: false });
    document.addEventListener("touchmove", blockScroll, { capture: true, passive: false });
    document.addEventListener("keydown", blockKeyboard, true);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.touchAction = previousBodyTouchAction;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.overscrollBehavior = previousOverscroll;
      document.removeEventListener("click", blockInteraction, true);
      document.removeEventListener("pointerdown", blockInteraction, true);
      document.removeEventListener("touchstart", blockInteraction, true);
      document.removeEventListener("wheel", blockScroll, true);
      document.removeEventListener("touchmove", blockScroll, true);
      document.removeEventListener("keydown", blockKeyboard, true);
    };
  }, [restricted]);

  useEffect(() => {
    const deviceId = getDeviceId();
    const touchDevice = isTouchDevice();

    const report = async (signal) => {
      localCountRef.current += 1;
      const count = localCountRef.current;
      if (count >= warningThreshold) setWarning(true);

      const now = Date.now();
      const lastSignalReport = signalReportRef.current[signal] || 0;
      const signalCooldown = signal === "devtools_size" ? 60000 : 5000;
      if (count < 3 || now - lastReportRef.current < 1800 || now - lastSignalReport < signalCooldown) return;

      lastReportRef.current = now;
      signalReportRef.current[signal] = now;
      const response = await reportSecurityActivity(signal, deviceId).catch(() => null);
      if (response?.warning) setWarning(true);
      if (response?.restricted) {
        setRestricted(true);
        setRestrictedUntil(response.restrictedUntil || "");
      }
    };

    const observeContextMenu = (event) => {
      const fromTouch = event.pointerType === "touch" || event.sourceCapabilities?.firesTouchEvents;
      if (touchDevice || fromTouch || isEditableTarget(event.target)) return;

      const now = Date.now();
      contextMenuTimesRef.current = [...contextMenuTimesRef.current, now].filter((time) => now - time < 30000);
      if (contextMenuTimesRef.current.length >= 3) report("context_menu_repeated");
      if (restrictedRef.current) event.preventDefault();
    };

    const observeKeyboard = (event) => {
      if (isEditableTarget(event.target)) return;
      if (blockedKeys.has(event.key) || blockedCombos.some((match) => match(event))) {
        report(`key_${event.key.toUpperCase()}`);
        if (localCountRef.current >= warningThreshold) event.preventDefault();
      }
    };

    const checkDevTools = () => {
      if (touchDevice || window.innerWidth < 768) return;
      const widthGap = Math.abs(window.outerWidth - window.innerWidth);
      const heightGap = Math.abs(window.outerHeight - window.innerHeight);
      const opened = widthGap > 240 || heightGap > 240;
      if (opened) report("devtools_size");
    };

    document.addEventListener("contextmenu", observeContextMenu);
    document.addEventListener("keydown", observeKeyboard);
    const interval = window.setInterval(checkDevTools, 5000);
    return () => {
      document.removeEventListener("contextmenu", observeContextMenu);
      document.removeEventListener("keydown", observeKeyboard);
      window.clearInterval(interval);
    };
  }, []);

  if (restricted) {
    return (
      <div className="fixed inset-0 z-[99999] grid place-items-center bg-cream px-5 text-center text-ink" onMouseDown={(event) => event.stopPropagation()}>
        <div ref={overlayRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="restriction-title" className="max-w-md rounded-3xl bg-white p-8 shadow-soft outline-none">
          <h1 id="restriction-title" className="font-serif text-4xl font-semibold">Access Restricted</h1>
          <p className="mt-4 leading-7 text-ink/65">Repeated unusual browser activity was detected. Please return later or contact support if this was a mistake.</p>
          {restrictedUntil && <p className="mt-4 text-sm font-semibold text-ink/45">Restriction ends after {new Date(restrictedUntil).toLocaleString()}.</p>}
        </div>
      </div>
    );
  }

  if (!warning) return null;

  return (
    <div className="fixed left-1/2 top-4 z-[130] w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl border border-clay/20 bg-white p-4 text-center text-sm font-semibold text-ink shadow-soft">
      Unusual browser activity was noticed. Some actions may be restricted if it continues.
    </div>
  );
}


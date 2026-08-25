// Renders production error, auth, offline, and reliability state pages.
import { Copy, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import Breadcrumb from "../components/common/Breadcrumb.jsx";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";

const defaults = {
  401: ["Login Required", "Please log in first to proceed."],
  403: ["Access Denied", "You do not have permission to view this page."],
  404: ["Page Not Found", "The page you are looking for may have moved."],
  429: ["Too Many Requests", "Please wait a moment before trying again."],
  500: ["Server Error", "Something failed unexpectedly. Please retry."],
  503: ["Service Unavailable", "The storefront is temporarily unavailable."],
  offline: ["Network Offline", "Check your connection and try again."],
  expired: ["Promotion Expired", "This offer is no longer active."],
  "session-expired": ["Session Expired", "Please log in again to continue."],
  "email-not-verified": ["Email Not Verified", "Verify your email before accessing this area."],
  "payment-success": ["Payment Successful", "Your order has been received."],
  "payment-failure": ["Payment Failed", "Your payment could not be completed."],
  "payment-pending": ["Payment Pending", "We are waiting for payment confirmation."],
  "order-cancelled": ["Order Cancelled", "This order has been cancelled."],
};

export default function StatusPage({ code = "404", title, message, retry = false }) {
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  const [defaultTitle, defaultMessage] = defaults[code] || defaults["404"];
  const orderId = "SS-OIL-MILL-DEMO-1001";

  const copyOrderId = async () => {
    await navigator.clipboard.writeText(orderId);
    setCopied(true);
  };

  const isLoginRequired = String(code) === "401";
  const isOrderState = String(code).startsWith("payment") || code === "order-cancelled";

  return (
    <>
      <Breadcrumb items={[{ label: title || defaultTitle }]} />
      <section className="section-padding">
        <Container className="grid place-items-center text-center">
          <div className="max-w-2xl rounded-[2rem] border border-ink/10 bg-white p-8 shadow-soft">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">{code}</p>
            <h1 className="mt-4 font-serif text-5xl font-semibold">{title || defaultTitle}</h1>
            <p className="mx-auto mt-4 max-w-xl leading-7 text-ink/62">{message || defaultMessage}</p>
            {isOrderState && (
              <div className="mx-auto mt-7 max-w-sm rounded-2xl bg-linen p-4 text-left">
                <p className="text-sm font-semibold text-ink/55">Order tracking timeline</p>
                <div className="mt-4 grid gap-3 text-sm font-semibold">
                  <span>Order placed</span>
                  <span>Payment review</span>
                  <span>Fresh batch dispatch</span>
                </div>
                <button type="button" onClick={copyOrderId} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-leaf">
                  <Copy size={15} /> {copied ? "Copied" : orderId}
                </button>
              </div>
            )}
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              {isLoginRequired && <Button to="/login" state={{ from: location.pathname }}>Login to continue</Button>}
              {retry && !isLoginRequired && (
                <Button onClick={() => window.location.reload()}>
                  <RotateCcw size={17} /> Try Again
                </Button>
              )}
              <Button to="/shop" variant={retry || isLoginRequired ? "secondary" : "primary"}>Shop Oils</Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}





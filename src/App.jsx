// Renders the global storefront shell.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import CookieConsentBanner from "./components/features/feedback/CookieConsentBanner.jsx";
import ErrorBoundary from "./components/features/feedback/ErrorBoundary.jsx";
import RecoveryOverlay from "./components/features/feedback/RecoveryOverlay.jsx";
import DevelopmentRenderError from "./components/features/feedback/DevelopmentRenderError.jsx";
import GuestSessionNotice from "./components/features/feedback/GuestSessionNotice.jsx";
import NetworkStatusBanner from "./components/features/feedback/NetworkStatusBanner.jsx";
import RouteTransitionLoader from "./components/features/feedback/RouteTransitionLoader.jsx";
import InstallAppPrompt from "./components/features/feedback/InstallAppPrompt.jsx";
import ScrollToTop from "./components/features/feedback/ScrollToTop.jsx";
import SecurityAwareness from "./components/features/feedback/SecurityAwareness.jsx";
import ChatWidget from "./components/features/widgets/ChatWidget.jsx";
import WishlistWidget from "./components/features/widgets/WishlistWidget.jsx";
import AnnouncementBar from "./components/layout/AnnouncementBar.jsx";
import Navbar from "./components/layout/Navbar.jsx";
import Footer from "./components/layout/Footer.jsx";
import AppRoutes from "./routes/AppRoutes.jsx";
import { showConsoleSecurityWarning } from "./utils/consoleWarning.js";
import useBodyScrollLock from "./hooks/useBodyScrollLock.js";

function GlobalRequestRecovery() {
  const [recoveries, setRecoveries] = useState(new Map());
  const active = recoveries.size > 0;
  useBodyScrollLock(active);

  useEffect(() => {
    if (!active) return undefined;
    const content = document.getElementById("application-content");
    if (!content) return undefined;
    const previouslyInert = content.inert;
    content.inert = true;
    return () => { content.inert = previouslyInert; };
  }, [active]);

  useEffect(() => {
    const update = (event) => setRecoveries((current) => {
      const next = new Map(current);
      next.set(event.detail.requestId, event.detail);
      return next;
    });
    const finish = (event) => setRecoveries((current) => {
      const next = new Map(current);
      next.delete(event.detail.requestId);
      return next;
    });
    window.addEventListener("ss-oil-mill-recovery-start", update);
    window.addEventListener("ss-oil-mill-recovery-progress", update);
    window.addEventListener("ss-oil-mill-recovery-end", finish);
    return () => {
      window.removeEventListener("ss-oil-mill-recovery-start", update);
      window.removeEventListener("ss-oil-mill-recovery-progress", update);
      window.removeEventListener("ss-oil-mill-recovery-end", finish);
    };
  }, []);

  if (!recoveries.size) return null;
  const latest = [...recoveries.values()].at(-1);
  return <RecoveryOverlay attempt={latest?.attempt || 1} maximum={latest?.maximum || 2} />;
}

export default function App() {
  const { pathname } = useLocation();
  const authPage = pathname === "/login" || pathname === "/signup" || pathname === "/admin/login";
  const adminPage = pathname.startsWith("/admin");

  useEffect(() => {
    showConsoleSecurityWarning();
  }, []);

  return (
    <div className="min-h-screen bg-cream text-ink">
      <GlobalRequestRecovery />
      <div id="application-content">
        <ErrorBoundary key={pathname}>
          <DevelopmentRenderError />
          <ScrollToTop />
          <RouteTransitionLoader />
          <SecurityAwareness />
          <NetworkStatusBanner />
          {!authPage && !adminPage && <AnnouncementBar />}
          {!authPage && !adminPage && <Navbar />}
          <main>
            <AppRoutes />
          </main>
          {!authPage && !adminPage && <Footer />}
          <GuestSessionNotice />
          {!authPage && !adminPage && <InstallAppPrompt />}
          {!adminPage && <CookieConsentBanner />}
          {!authPage && !adminPage && <WishlistWidget />}
          {!authPage && !adminPage && <ChatWidget />}
        </ErrorBoundary>
      </div>
    </div>
  );
}

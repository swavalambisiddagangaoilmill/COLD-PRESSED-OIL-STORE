// Renders the global storefront shell.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import CookieConsentBanner from "./components/features/feedback/CookieConsentBanner.jsx";
import ErrorBoundary from "./components/features/feedback/ErrorBoundary.jsx";
import GuestSessionNotice from "./components/features/feedback/GuestSessionNotice.jsx";
import NetworkStatusBanner from "./components/features/feedback/NetworkStatusBanner.jsx";
import RouteTransitionLoader from "./components/features/feedback/RouteTransitionLoader.jsx";
import InstallAppPrompt from "./components/features/feedback/InstallAppPrompt.jsx";
import ScrollToTop from "./components/features/feedback/ScrollToTop.jsx";
import ChatWidget from "./components/features/widgets/ChatWidget.jsx";
import WishlistWidget from "./components/features/widgets/WishlistWidget.jsx";
import AnnouncementBar from "./components/layout/AnnouncementBar.jsx";
import Navbar from "./components/layout/Navbar.jsx";
import Footer from "./components/layout/Footer.jsx";
import AppRoutes from "./routes/AppRoutes.jsx";
import UnderDevelopment from "./pages/UnderDevelopment.jsx";
import { showConsoleSecurityWarning } from "./utils/consoleWarning.js";

const SITE_UNDER_DEVELOPMENT = true;

export default function App() {
  const { pathname } = useLocation();
  const authPage = pathname === "/login" || pathname === "/signup" || pathname === "/verify-otp";
  const adminPage = pathname.startsWith("/admin");

  useEffect(() => {
    showConsoleSecurityWarning();
  }, []);

  if (SITE_UNDER_DEVELOPMENT && !adminPage) return <UnderDevelopment />;

  return (
    <div className="min-h-screen bg-cream text-ink">
      <ErrorBoundary>
        <ScrollToTop />
        <RouteTransitionLoader />
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
  );
}

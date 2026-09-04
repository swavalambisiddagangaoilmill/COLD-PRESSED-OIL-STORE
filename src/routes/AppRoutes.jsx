// Defines all public storefront routes.
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "../components/features/auth/ProtectedRoute.jsx";
import PageLoader from "../components/features/feedback/PageLoader.jsx";
import About from "../pages/About.jsx";
import Home from "../pages/Home.jsx";
import StatusPage from "../pages/StatusPage.jsx";

const AdminProtectedRoute = lazy(() => import("../admin/routes/AdminProtectedRoute.jsx"));
const AdminRoutes = lazy(() => import("../admin/routes/AdminRoutes.jsx"));
const AdminLogin = lazy(() => import("../admin/pages/AdminLogin.jsx"));
const Account = lazy(() => import("../pages/Account.jsx"));
const AdminSessionLimit = lazy(() => import("../pages/AdminSessionLimit.jsx"));
const Cart = lazy(() => import("../pages/Cart.jsx"));
const Checkout = lazy(() => import("../pages/Checkout.jsx"));
const Contact = lazy(() => import("../pages/Contact.jsx"));
const FAQ = lazy(() => import("../pages/FAQ.jsx"));
const LegalPage = lazy(() => import("../pages/LegalPage.jsx"));
const Login = lazy(() => import("../pages/Login.jsx"));
const Signup = lazy(() => import("../pages/Signup.jsx"));
const OrderDetails = lazy(() => import("../pages/OrderDetails.jsx"));
const OrderSuccess = lazy(() => import("../pages/OrderSuccess.jsx"));
const NotFound = lazy(() => import("../pages/NotFound.jsx"));
const OurStory = lazy(() => import("../pages/OurStory.jsx"));
const ProductDetails = lazy(() => import("../pages/ProductDetails.jsx"));
const Shop = lazy(() => import("../pages/Shop.jsx"));
const TrackOrder = lazy(() => import("../pages/TrackOrder.jsx"));

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader label="Loading page" />}>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/*" element={<AdminProtectedRoute><AdminRoutes /></AdminProtectedRoute>} />
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/product/:slug" element={<ProductDetails />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
        <Route path="/account/orders/:id" element={<ProtectedRoute><OrderDetails /></ProtectedRoute>} />
        <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
        <Route path="/about" element={<About />} />
        <Route path="/about/faq" element={<FAQ />} />
        <Route path="/about/story" element={<OurStory />} />
        <Route path="/about/process" element={<Navigate to="/about/story" replace />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin-session-limit" element={<AdminSessionLimit />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/order/success" element={<OrderSuccess />} />
        <Route path="/track/:id" element={<ProtectedRoute><TrackOrder /></ProtectedRoute>} />
        <Route path="/legal/:slug" element={<LegalPage />} />
        <Route path="/auth/login-required" element={<StatusPage code="401" retry />} />
        <Route path="/auth/access-denied" element={<StatusPage code="403" />} />
        <Route path="/auth/session-expired" element={<StatusPage code="session-expired" retry />} />
        <Route path="/auth/email-not-verified" element={<StatusPage code="email-not-verified" />} />
        <Route path="/errors/500" element={<StatusPage code="500" retry />} />
        <Route path="/errors/503" element={<StatusPage code="503" retry />} />
        <Route path="/errors/429" element={<StatusPage code="429" retry />} />
        <Route path="/offline" element={<StatusPage code="offline" retry />} />
        <Route path="/promotion-expired" element={<StatusPage code="expired" />} />
        <Route path="/payment/success" element={<StatusPage code="payment-success" />} />
        <Route path="/payment/failure" element={<StatusPage code="payment-failure" retry />} />
        <Route path="/payment/pending" element={<StatusPage code="payment-pending" />} />
        <Route path="/payment/return" element={<StatusPage code="payment-return" />} />
        <Route path="/order/cancelled" element={<StatusPage code="order-cancelled" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

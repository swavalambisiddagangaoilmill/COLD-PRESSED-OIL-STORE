// Route map for the isolated admin UI prototype.
import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "../layouts/AdminLayout.jsx";
import AdminNotificationsPage from "../pages/AdminNotificationsPage.jsx";
import RestrictionManagementPage from "../pages/RestrictionManagementPage.jsx";
import CarouselPage from "../pages/CarouselPage.jsx";
import { AuditLogsPage, CouponsPage, CustomersPage, DashboardPage, GalleryPage, InventoryPage, MessagesPage, OffersPage, OrdersPage, PaymentsPage, ProductFormPage, ProductsPage, ReportsPage, SettingsPage, ShippingPage, UsersPage } from "../pages/AdminPages.jsx";

export default function AdminRoutes() {
  return <Routes>
    <Route element={<AdminLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="orders" element={<OrdersPage />} />
      <Route path="products" element={<ProductsPage />} />
      <Route path="products/new" element={<ProductFormPage />} />
      <Route path="inventory" element={<InventoryPage />} />
      <Route path="offers" element={<OffersPage />} />
      <Route path="coupons" element={<CouponsPage />} />
      <Route path="gallery" element={<GalleryPage />} />
      <Route path="carousel" element={<CarouselPage />} />
      <Route path="shipping" element={<ShippingPage />} />
      <Route path="customers" element={<CustomersPage />} />
      <Route path="payments" element={<PaymentsPage />} />
      <Route path="messages" element={<MessagesPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="notifications" element={<AdminNotificationsPage />} />
      <Route path="users" element={<UsersPage />} />
      <Route path="audit-logs" element={<AuditLogsPage />} />
      <Route path="restrictions" element={<RestrictionManagementPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Route>
  </Routes>;
}




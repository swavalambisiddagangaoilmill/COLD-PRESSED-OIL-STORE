// Protects admin routes using the existing storefront authentication session.
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import AdminAccessDenied from "../pages/AdminAccessDenied.jsx";

export default function AdminProtectedRoute({ children }) {
  const location = useLocation();
  const { authenticated, loading, user } = useAuth();
  if (loading) return null;
  if (!authenticated) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  if (user?.role !== "admin") return <AdminAccessDenied />;
  return children;
}

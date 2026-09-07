// Guards routes that require an authenticated session.
import StatusPage from "../../../pages/StatusPage.jsx";
import { useAuth } from "../../../context/AuthContext.jsx";

export default function ProtectedRoute({ allowed = true, children }) {
  const { authenticated, loading, authError } = useAuth();
  if (loading) return null;
  if (authError) return <StatusPage code={Number(authError.status) === 403 ? "403" : "503"} retry={Number(authError.status) !== 403} />;
  return allowed && authenticated ? children : <StatusPage code="401" retry />;
}

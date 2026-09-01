import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useCallback, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import TurnstileWidget from "../../components/features/auth/TurnstileWidget.jsx";
import Button from "../../components/ui/Button.jsx";
import Container from "../../components/ui/Container.jsx";
import Input from "../../components/ui/Input.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

export default function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authenticated, loading: authLoading, user, login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpRequired, setOtpRequired] = useState(false);
  const [requiresTurnstile, setRequiresTurnstile] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleTurnstile = useCallback((token) => setTurnstileToken(token), []);

  if (!authLoading && authenticated && user?.role === "admin") return <Navigate to="/admin" replace />;
  if (!authLoading && authenticated) return <Navigate to="/auth/access-denied" replace />;

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;
    const form = new FormData(event.currentTarget);
    setLoading(true); setError(""); setMessage("");
    try {
      const data = await login({ email: form.get("email"), password: form.get("password"), otpCode: form.get("otpCode") || undefined, turnstileToken, remember: false });
      if (data.otpRequired) { setOtpRequired(true); setMessage(data.message || "Enter the security code sent to the admin email."); return; }
      if (data.user?.role !== "admin") throw new Error("Administrator access is required.");
      navigate(location.state?.from?.startsWith("/admin") ? location.state.from : "/admin", { replace: true });
    } catch (err) {
      const sessionLimit = err.errors?.find((item) => item.code === "ADMIN_SESSION_LIMIT");
      if (sessionLimit) { navigate("/admin-session-limit", { state: { pendingToken: sessionLimit.pendingToken, sessions: sessionLimit.sessions }, replace: true }); return; }
      if (err.errors?.some((item) => item.code === "TURNSTILE_REQUIRED")) setRequiresTurnstile(true);
      setError(err.message || "Unable to sign in as administrator.");
    } finally { setLoading(false); }
  };

  return <section className="grid min-h-[100dvh] place-items-center bg-[var(--admin-bg)] px-4 py-10"><Container className="grid place-items-center"><form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-[var(--admin-border)] bg-white p-6 shadow-soft sm:p-8"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--admin-primary)] text-white"><ShieldCheck size={24} /></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-ink/40">Restricted access</p><h1 className="font-serif text-3xl font-semibold">Admin Login</h1></div></div><p className="mt-5 text-sm leading-6 text-ink/60">Sign in with your administrator email and password.</p><div className="mt-6 grid gap-5"><Input label="Admin Email" name="email" type="email" autoComplete="username" required autoFocus /><div className="relative"><Input label="Password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-linen text-ink">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>{otpRequired && <Input label="Email security code" name="otpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus />}{requiresTurnstile && <TurnstileWidget onVerify={handleTurnstile} className="min-h-[65px]" />}</div>{message && <p role="status" className="mt-5 rounded-xl bg-leaf/10 p-4 text-sm font-semibold text-leaf">{message}</p>}{error && <p role="alert" className="mt-5 rounded-xl bg-danger/10 p-4 text-sm font-semibold text-danger">{error}</p>}<Button type="submit" className="mt-6 w-full" loading={loading}>{otpRequired ? "Verify & Open Admin" : "Login to Admin"}</Button></form></Container></section>;
}

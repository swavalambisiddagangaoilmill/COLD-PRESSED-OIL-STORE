// Dedicated admin email, password, and email-OTP login screen.
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button.jsx";
import Container from "../../components/ui/Container.jsx";
import Input from "../../components/ui/Input.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { loginAdmin } from "../../services/adminAuthService.js";

export default function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading, refreshAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpRequired, setOtpRequired] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (!authLoading && user?.role === "admin") return <Navigate to="/admin" replace />;

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await loginAdmin({ email, password, ...(otpRequired ? { otpCode } : {}) });
      if (data.otpRequired) {
        setOtpRequired(true);
        setMessage(data.message || "Security code sent to your admin email.");
        return;
      }
      const admin = await refreshAuth();
      if (admin?.role !== "admin") throw new Error("Admin session could not be verified.");
      navigate(location.state?.from || "/admin", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to sign in to the admin dashboard.");
      if (err.errors?.some((item) => item.code === "OTP_EXPIRED")) {
        setOtpRequired(false);
        setOtpCode("");
      }
    } finally {
      setLoading(false);
    }
  }

  return <section className="grid min-h-[100dvh] place-items-center bg-[var(--admin-bg)] px-4 py-12"><Container className="grid place-items-center"><form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-[var(--admin-border)] bg-white p-6 shadow-soft sm:p-9"><div className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--admin-primary)] text-white"><LockKeyhole size={22} /></div><p className="mt-7 text-xs font-bold uppercase tracking-[0.22em] text-clay">Secure administration</p><h1 className="mt-3 font-serif text-4xl font-semibold">Admin Login</h1><p className="mt-3 leading-7 text-ink/60">Enter your admin email and password. Every login requires a security code sent by email.</p><div className="mt-7 grid gap-5"><Input label="Admin Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required autoFocus disabled={otpRequired} /><div className="relative"><Input label="Password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={otpRequired} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-linen text-ink">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>{otpRequired && <Input label="Email Security Code" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus />}</div>{message && <p role="status" className="mt-5 rounded-xl bg-leaf/10 p-4 text-sm font-semibold text-leaf">{message}</p>}{error && <p role="alert" className="mt-5 rounded-xl bg-danger/5 p-4 text-sm font-semibold text-danger">{error}</p>}<Button type="submit" loading={loading} className="mt-7 w-full">{otpRequired ? "Verify & Open Dashboard" : "Continue"}</Button>{otpRequired && <button type="button" className="mt-4 w-full text-sm font-bold text-ink/55" onClick={() => { setOtpRequired(false); setOtpCode(""); setMessage(""); setError(""); }}>Start again</button>}</form></Container></section>;
}

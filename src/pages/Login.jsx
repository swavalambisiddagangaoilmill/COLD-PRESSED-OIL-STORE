// Renders the existing email/password login flow with Google sign-in.
import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import GoogleSignInButton from "../components/features/auth/GoogleSignInButton.jsx";
import TurnstileWidget from "../components/features/auth/TurnstileWidget.jsx";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";
import Input from "../components/ui/Input.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const emailRef = useRef(null);
  const { login, loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [requiresTurnstile, setRequiresTurnstile] = useState(false);
  const [otpRequired, setOtpRequired] = useState(false);

  const afterLogin = (user) => navigate(location.state?.from || (user?.role === "admin" ? "/admin" : "/account"), { replace: true });
  const handleTurnstile = useCallback((token) => setTurnstileToken(token), []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    const form = new FormData(event.currentTarget);
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const data = await login({
        email: form.get("email"),
        password: form.get("password"),
        remember: false,
        turnstileToken,
        otpCode: form.get("otpCode") || undefined,
      });
      if (data.otpRequired) {
        setOtpRequired(true);
        setMessage(data.message || "Enter the security code sent to your email.");
        return;
      }
      afterLogin(data.user);
    } catch (err) {
      const sessionLimit = err.errors?.find((item) => item.code === "ADMIN_SESSION_LIMIT");
      if (sessionLimit) {
        navigate("/admin-session-limit", { state: { pendingToken: sessionLimit.pendingToken, sessions: sessionLimit.sessions }, replace: true });
        return;
      }
      if (err.errors?.some((item) => item.code === "TURNSTILE_REQUIRED")) setRequiresTurnstile(true);
      setError(err.message || "Unable to login. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async (credential) => {
    if (!credential || loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await loginWithGoogle({ credential, remember: true });
      afterLogin(data.user);
    } catch (err) {
      setError(err.message || "Google login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="relative grid min-h-[100dvh] place-items-center px-4 py-10">
      <button type="button" onClick={() => navigate(-1)} className="absolute left-4 top-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-ink shadow-sm transition hover:bg-linen sm:left-6 sm:top-6"><ChevronLeft size={17} /> Back</button>
      <Container className="grid place-items-center">
        <form className="w-full max-w-md rounded-[2rem] border border-ink/10 bg-white p-6 shadow-soft sm:p-8" onSubmit={handleSubmit} noValidate>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">Account access</p>
          <h1 className="mt-3 font-serif text-5xl font-semibold">Welcome Back</h1>
          <p className="mt-4 leading-7 text-ink/60">Sign in with your email and password to view orders, saved addresses, and cart.</p>
          <div className="mt-7 grid gap-5">
            <Input inputRef={emailRef} label="Email" name="email" type="email" autoComplete="email" required autoFocus />
            <div className="relative"><Input label="Password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((current) => !current)} className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-linen text-ink">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
            {otpRequired && <Input label="Email security code" name="otpCode" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />}
            {requiresTurnstile && <TurnstileWidget onVerify={handleTurnstile} className="min-h-[65px]" />}
          </div>
          <div className="mt-5 flex justify-end text-sm"><Link to="/auth/forgot-password" className="font-semibold text-leaf">Forgot Password?</Link></div>
          {message && <p role="status" className="mt-5 rounded-2xl bg-linen p-4 text-sm font-semibold text-leaf">{message}</p>}
          {error && <p role="alert" className="mt-5 rounded-2xl bg-linen p-4 text-sm font-semibold text-danger">{error}</p>}
          <Button type="submit" className="mt-7 w-full" loading={loading}>{otpRequired ? "Verify & Login" : "Login"}</Button>
          <div className="my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-ink/35"><span className="h-px flex-1 bg-ink/10" />OR<span className="h-px flex-1 bg-ink/10" /></div>
          <GoogleSignInButton onCredential={handleGoogle} disabled={loading} />
          <p className="mt-5 text-center text-sm text-ink/60">Don&apos;t have an account? <Link to="/signup" state={location.state} className="font-bold text-leaf">Sign Up</Link></p>
        </form>
      </Container>
    </section>
  );
}

// Renders the existing email-based signup flow with Google sign-up.
import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import GoogleSignInButton from "../components/features/auth/GoogleSignInButton.jsx";
import TurnstileWidget from "../components/features/auth/TurnstileWidget.jsx";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";
import Input from "../components/ui/Input.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, loginWithGoogle } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });

  const strength = useMemo(() => Number(form.password.length >= 8) + Number(/[A-Z]/.test(form.password)) + Number(/[a-z]/.test(form.password)) + Number(/\d/.test(form.password)), [form.password]);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const handleTurnstile = useCallback((token) => setTurnstileToken(token), []);
  const afterSignup = () => navigate(location.state?.from || "/account", { replace: true });

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    if (form.name.trim().length < 2) return setError("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError("Enter a valid email.");
    if (strength < 4) return setError("Use at least 8 characters with uppercase, lowercase, and a number.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    setLoading(true);
    setError("");
    try {
      await register({ name: form.name.trim(), email: form.email, password: form.password, turnstileToken });
      afterSignup();
    } catch (err) {
      setError(err.message || "Unable to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async (credential) => {
    if (!credential || loading) return;
    setLoading(true);
    setError("");
    try {
      await loginWithGoogle({ credential, remember: true });
      afterSignup();
    } catch (err) {
      setError(err.message || "Google signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="relative grid min-h-[100dvh] place-items-center px-4 py-10">
      <button type="button" onClick={() => navigate(-1)} className="absolute left-4 top-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-ink shadow-sm transition hover:bg-linen sm:left-6 sm:top-6"><ChevronLeft size={17} /> Back</button>
      <Container className="grid place-items-center">
        <form className="w-full max-w-lg rounded-[2rem] border border-ink/10 bg-white p-6 shadow-soft sm:p-8" onSubmit={handleSubmit} noValidate>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">Create account</p>
          <h1 className="mt-3 font-serif text-5xl font-semibold">Sign Up</h1>
          <p className="mt-4 leading-7 text-ink/60">Create an account with your email and password. We&apos;ll send an email verification link.</p>
          <div className="mt-7 grid gap-5">
            <Input label="Full Name" value={form.name} onChange={update("name")} autoComplete="name" required autoFocus />
            <Input label="Email" type="email" value={form.email} onChange={update("email")} autoComplete="email" required />
            <div><div className="relative"><Input label="Password" type={showPassword ? "text" : "password"} value={form.password} onChange={update("password")} autoComplete="new-password" required /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((current) => !current)} className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-linen text-ink">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div><div className="mt-3 grid grid-cols-4 gap-2" aria-label="Password strength">{Array.from({ length: 4 }).map((_, index) => <span key={index} className={`h-1.5 rounded-full ${index < strength ? "bg-leaf" : "bg-ink/10"}`} />)}</div></div>
            <Input label="Confirm Password" type={showPassword ? "text" : "password"} value={form.confirm} onChange={update("confirm")} autoComplete="new-password" required />
            <TurnstileWidget onVerify={handleTurnstile} className="min-h-[65px]" />
          </div>
          {error && <p role="alert" className="mt-5 rounded-2xl bg-linen p-4 text-sm font-semibold text-danger">{error}</p>}
          <Button type="submit" className="mt-7 w-full" loading={loading}>Create Account</Button>
          <div className="my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-ink/35"><span className="h-px flex-1 bg-ink/10" />OR<span className="h-px flex-1 bg-ink/10" /></div>
          <GoogleSignInButton onCredential={handleGoogle} disabled={loading} />
          <p className="mt-6 text-center text-sm leading-6 text-ink/60">By creating an account, you agree to our <Link to="/legal/terms" className="font-bold text-leaf">Terms & Conditions</Link> and <Link to="/legal/privacy" className="font-bold text-leaf">Privacy Policy</Link>.</p>
          <p className="mt-4 text-center text-sm text-ink/60">Already have an account? <Link to="/login" state={location.state} className="font-bold text-leaf">Login</Link></p>
        </form>
      </Container>
    </section>
  );
}

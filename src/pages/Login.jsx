// Renders the customer phone OTP login page while preserving Google sign-in.
import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import GoogleSignInButton from "../components/features/auth/GoogleSignInButton.jsx";
import TurnstileWidget from "../components/features/auth/TurnstileWidget.jsx";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";
import Input from "../components/ui/Input.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function normalizeIndianMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const phoneRef = useRef(null);
  const { requestOtp, resendOtp, verifyOtp, loginWithGoogle } = useAuth();
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const mobile = useMemo(() => normalizeIndianMobile(phone), [phone]);
  const afterLogin = () => navigate(location.state?.from || "/account", { replace: true });
  const handleTurnstile = useCallback((token) => setTurnstileToken(token), []);

  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = window.setInterval(() => setCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const validatePhone = () => {
    if (!phone.trim()) return "Phone number is required.";
    if (!/^[6-9]\d{9}$/.test(mobile)) return "Enter a valid 10-digit mobile number.";
    return "";
  };

  const sendOtp = async (resend = false) => {
    if (loading) return;
    const phoneError = validatePhone();
    if (phoneError) { setError(phoneError); phoneRef.current?.focus(); return; }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const payload = { phone, turnstileToken };
      const data = resend ? await resendOtp(payload) : await requestOtp(payload);
      setCooldown(Number(data.resendAfterSeconds) || 60);
      setStep("otp");
      setMessage("If the number is eligible, an OTP has been sent.");
    } catch (err) {
      if (err.errors?.some((item) => ["TURNSTILE_REQUIRED", "TURNSTILE_FAILED"].includes(item.code))) setTurnstileToken("");
      setError(err.message || "Unable to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async () => {
    if (loading) return;
    if (!/^\d{6}$/.test(otp.trim())) { setError("Enter the 6-digit OTP."); return; }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await verifyOtp({ phone, otp });
      if (data.nameRequired) {
        setSignupToken(data.signupToken);
        setStep("name");
        return;
      }
      afterLogin();
    } catch (err) {
      setError(err.message || "Unable to verify OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const completeSignup = async () => {
    if (loading) return;
    if (name.trim().length < 2) { setError("Enter your full name."); return; }
    setLoading(true);
    setError("");
    try {
      await verifyOtp({ signupToken, name: name.trim() });
      afterLogin();
    } catch (err) {
      setError(err.message || "Unable to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (step === "phone") return sendOtp(false);
    if (step === "otp") return submitOtp();
    return completeSignup();
  };

  const handleGoogle = async (credential) => {
    if (!credential || loading) return;
    setLoading(true);
    setError("");
    try {
      await loginWithGoogle({ credential, remember: true });
      afterLogin();
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
          <p className="mt-4 leading-7 text-ink/60">Sign in with your mobile number to view orders, saved addresses, and cart.</p>
          <div className="mt-7"><GoogleSignInButton onCredential={handleGoogle} disabled={loading} /></div>
          <div className="my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-ink/35"><span className="h-px flex-1 bg-ink/10" />OR<span className="h-px flex-1 bg-ink/10" /></div>
          <div className="grid gap-5">
            <Input inputRef={phoneRef} label="Mobile Number" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={step !== "phone"} required autoFocus />
            {step === "otp" && <Input label="OTP" name="otp" inputMode="numeric" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} required />}
            {step === "name" && <Input label="Full Name" name="name" value={name} onChange={(event) => setName(event.target.value)} required />}
            {step === "phone" && <TurnstileWidget onVerify={handleTurnstile} className="min-h-[65px]" />}
          </div>
          {message && <p role="status" className="mt-5 rounded-2xl bg-linen p-4 text-sm font-semibold text-leaf">{message}</p>}
          {error && <p role="alert" className="mt-5 rounded-2xl bg-linen p-4 text-sm font-semibold text-danger">{error}</p>}
          <Button type="submit" className="mt-7 w-full" loading={loading}>{step === "phone" ? "Send OTP" : step === "otp" ? "Verify OTP" : "Continue"}</Button>
          {step === "otp" && <div className="mt-4 flex items-center justify-between text-sm"><button type="button" className="font-bold text-leaf" onClick={() => { setStep("phone"); setOtp(""); setError(""); }}>Change Number</button><button type="button" disabled={cooldown > 0 || loading} className="font-bold text-leaf disabled:text-ink/35" onClick={() => sendOtp(true)}>{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}</button></div>}
          <p className="mt-5 text-center text-sm text-ink/60">New here? Enter your phone number and we&apos;ll create your account after OTP verification.</p>
          <p className="mt-3 text-center text-xs leading-5 text-ink/45">Admin users should continue using the separate admin login flow.</p>
        </form>
      </Container>
    </section>
  );
}
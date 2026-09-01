import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import GoogleSignInButton from "../components/features/auth/GoogleSignInButton.jsx";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";
import Input from "../components/ui/Input.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { requestOtp, verifyOtp, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const afterLogin = () => navigate(location.state?.from || "/account", { replace: true });

  const sendCode = async (event) => {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try { await requestOtp({ email, flow: "login" }); setCodeSent(true); setMessage("If this email can receive a code, it has been sent."); }
    catch (err) { setError(err.message || "Unable to send the verification code."); }
    finally { setLoading(false); }
  };
  const verify = async (event) => {
    event.preventDefault(); setLoading(true); setError("");
    try { await verifyOtp({ email, otp }); afterLogin(); }
    catch (err) { setError(err.message || "Unable to verify the code."); }
    finally { setLoading(false); }
  };
  const google = async (credential) => {
    if (!credential || loading) return; setLoading(true); setError("");
    try { await loginWithGoogle({ credential, remember: true }); afterLogin(); }
    catch (err) { setError(err.message || "Google login failed. Please try again."); }
    finally { setLoading(false); }
  };

  return <section className="relative grid min-h-[100dvh] place-items-center px-4 py-10"><button type="button" onClick={() => navigate(-1)} className="absolute left-4 top-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-ink shadow-sm sm:left-6 sm:top-6"><ChevronLeft size={17} /> Back</button><Container className="grid place-items-center"><div className="w-full max-w-md rounded-[2rem] border border-ink/10 bg-white p-6 shadow-soft sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">Account access</p><h1 className="mt-3 font-serif text-5xl font-semibold">Welcome Back</h1><p className="mt-4 leading-7 text-ink/60">Sign in with your email and a one-time verification code.</p><div className="mt-7"><GoogleSignInButton onCredential={google} disabled={loading} /></div><div className="my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-ink/35"><span className="h-px flex-1 bg-ink/10" />OR<span className="h-px flex-1 bg-ink/10" /></div><form onSubmit={codeSent ? verify : sendCode} className="grid gap-5"><Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus={!codeSent} disabled={codeSent} />{codeSent && <Input label="Enter 6-digit OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus />}{message && <p role="status" className="rounded-2xl bg-linen p-4 text-sm font-semibold text-leaf">{message}</p>}{error && <p role="alert" className="rounded-2xl bg-linen p-4 text-sm font-semibold text-danger">{error}</p>}<Button type="submit" className="w-full" loading={loading}>{codeSent ? "Verify OTP" : "Send OTP"}</Button>{codeSent && <button type="button" className="text-sm font-bold text-leaf" onClick={() => { setCodeSent(false); setOtp(""); setMessage(""); }}>Use a different email</button>}</form><p className="mt-6 text-center text-sm text-ink/60">Don&apos;t have an account? <Link to="/signup" state={location.state} className="font-bold text-leaf">Create Account</Link></p></div></Container></section>;
}

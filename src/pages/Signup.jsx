// Routes customer account creation through the phone OTP login flow.
import { ChevronLeft, Phone } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import GoogleSignInButton from "../components/features/auth/GoogleSignInButton.jsx";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useState } from "react";

export default function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const afterSignup = () => navigate(location.state?.from || "/account", { replace: true });

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
        <div className="w-full max-w-md rounded-[2rem] border border-ink/10 bg-white p-6 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">Create account</p>
          <h1 className="mt-3 font-serif text-5xl font-semibold">Sign Up</h1>
          <p className="mt-4 leading-7 text-ink/60">Create your account with a secure mobile OTP. New customers only need to verify their phone number and enter their name.</p>
          <Button type="button" className="mt-7 w-full" onClick={() => navigate("/login", { state: location.state })}>
            <Phone size={18} /> Continue with Mobile OTP
          </Button>
          <div className="my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-ink/35"><span className="h-px flex-1 bg-ink/10" />OR<span className="h-px flex-1 bg-ink/10" /></div>
          <GoogleSignInButton onCredential={handleGoogle} disabled={loading} />
          {error && <p role="alert" className="mt-5 rounded-2xl bg-linen p-4 text-sm font-semibold text-danger">{error}</p>}
          <p className="mt-6 text-center text-sm leading-6 text-ink/60">By creating an account, you agree to our <Link to="/legal/terms" className="font-bold text-leaf">Terms & Conditions</Link> and <Link to="/legal/privacy" className="font-bold text-leaf">Privacy Policy</Link>.</p>
          <p className="mt-4 text-center text-sm text-ink/60">Already have an account? <Link to="/login" className="font-bold text-leaf">Login</Link></p>
        </div>
      </Container>
    </section>
  );
}
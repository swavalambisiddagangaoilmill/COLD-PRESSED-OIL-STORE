import { ChevronLeft, Mail } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";
import Input from "../components/ui/Input.jsx";
import { requestOtp } from "../services/authService.js";

export default function Signup() {
  const navigate = useNavigate(), location = useLocation();
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [loading, setLoading] = useState(false), [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (name.trim().length < 2) return setError("Enter your full name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address.");
    setLoading(true); setError("");
    try {
      await requestOtp({ name: name.trim(), email: email.trim() });
      navigate("/verify-otp", { state: { name: name.trim(), email: email.trim(), purpose: "signup", from: location.state?.from } });
    } catch (err) { setError(err.errors?.[0]?.message || err.message); }
    finally { setLoading(false); }
  }
  return <section className="relative grid min-h-[100dvh] place-items-center bg-linen px-4 py-14"><button onClick={() => navigate(-1)} className="absolute left-4 top-4 inline-flex h-10 items-center gap-2 bg-white px-4 text-sm font-bold shadow-sm"><ChevronLeft size={17}/>Back</button><Container className="grid place-items-center"><form onSubmit={submit} className="w-full max-w-md border border-ink/10 bg-white p-6 shadow-soft sm:p-9"><div className="mb-7 flex h-12 w-12 items-center justify-center bg-leaf text-white"><Mail size={22}/></div><p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">Create account</p><h1 className="mt-3 font-serif text-5xl font-semibold">Join the mill</h1><p className="mt-4 leading-7 text-ink/60">Your name and email are all we need.</p><div className="mt-7 grid gap-5"><Input label="Full name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required autoFocus/><Input label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required/></div>{error&&<p role="alert" className="mt-5 bg-danger/5 p-4 text-sm font-semibold text-danger">{error}</p>}<Button type="submit" loading={loading} className="mt-7 w-full">Send OTP</Button><p className="mt-6 text-center text-sm text-ink/60">Already have an account? <Link to="/login" state={location.state} className="font-bold text-leaf">Login</Link></p></form></Container></section>;
}

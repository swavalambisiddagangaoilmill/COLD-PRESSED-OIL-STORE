import { ChevronLeft, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PhoneField from "../components/features/auth/PhoneField.jsx";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";
import { requestOtp } from "../services/authService.js";

export default function Login() {
  const navigate = useNavigate(), location = useLocation();
  const [phone, setPhone] = useState(""), [loading, setLoading] = useState(false), [error, setError] = useState("");
  async function submit(event) { event.preventDefault(); if (!/^[6-9]\d{9}$/.test(phone)) return setError("Enter a valid 10-digit Indian mobile number."); setLoading(true); setError(""); try { const data = await requestOtp({ phone, purpose: "login" }); navigate("/verify-otp", { state: { phone, purpose: "login", maskedPhone: data.phoneNumber, from: location.state?.from } }); } catch (err) { setError(err.message); } finally { setLoading(false); } }
  return <section className="relative grid min-h-[100dvh] place-items-center bg-linen px-4 py-14"><button onClick={() => navigate(-1)} className="absolute left-4 top-4 inline-flex h-10 items-center gap-2 bg-white px-4 text-sm font-bold shadow-sm"><ChevronLeft size={17} />Back</button><Container className="grid place-items-center"><form onSubmit={submit} className="w-full max-w-md border border-ink/10 bg-white p-6 shadow-soft sm:p-9"><div className="mb-7 flex h-12 w-12 items-center justify-center bg-leaf text-white"><MessageCircle size={22} /></div><p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">Account access</p><h1 className="mt-3 font-serif text-5xl font-semibold">Login</h1><p className="mt-4 leading-7 text-ink/60">We’ll send a one-time code to your WhatsApp. No password needed.</p><div className="mt-7"><PhoneField value={phone} onChange={setPhone} autoFocus /></div>{error && <p role="alert" className="mt-5 bg-danger/5 p-4 text-sm font-semibold text-danger">{error}</p>}<Button type="submit" loading={loading} className="mt-7 w-full">Continue</Button><p className="mt-6 text-center text-sm text-ink/60">Don&apos;t have an account? <Link to="/signup" state={location.state} className="font-bold text-leaf">Sign up</Link></p></form></Container></section>;
}

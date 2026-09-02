// Renders the Contact page experience.
import { ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { useState } from "react";
import Breadcrumb from "../components/common/Breadcrumb.jsx";
import TurnstileWidget from "../components/features/auth/TurnstileWidget.jsx";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";
import Input from "../components/ui/Input.jsx";
import { submitContactMessage } from "../services/contactService.js";
import { socialLinks } from "../data/socialLinks.js";

export default function Contact() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setLoading(true);
    setMessage("");
    try {
      await submitContactMessage({ name: form.get("name"), email: form.get("email"), message: form.get("message"), turnstileToken });
      setMessage("Message sent successfully.");
      formElement?.reset();
      setTurnstileToken("");
      setTurnstileKey((key) => key + 1);
    } catch (err) {
      setMessage(err.message || "Unable to send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Breadcrumb items={[{ label: "Contact" }]} />
      <section className="section-padding">
        <Container className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
          <form className="rounded-3xl border border-ink/10 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
            <h1 className="font-serif text-5xl font-semibold">Contact Us</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-ink/60">Questions about a batch, bulk orders, gifting, or your pantry? Send a note and our care team will respond.</p>
            {message && <p className="mt-5 rounded-2xl bg-linen p-4 text-sm font-semibold text-ink/65">{message}</p>}
            <div className="mt-8 grid gap-5 sm:grid-cols-2"><Input label="Name" name="name" required /><Input label="Email" name="email" type="email" required /></div>
            <div className="mt-5"><label className="block"><span className="mb-2 block text-sm font-semibold text-ink/75">Message</span><textarea name="message" className="min-h-40 w-full rounded-xl border border-ink/10 bg-white p-4 outline-none focus:border-leaf focus:ring-4 focus:ring-leaf/10" required /></label></div>
            <TurnstileWidget key={turnstileKey} onVerify={setTurnstileToken} className="mt-5 min-h-[65px]" />
            <Button type="submit" className="mt-6" loading={loading}>Send Message</Button>
          </form>
          <div className="space-y-5">
            <div className="grid min-h-72 place-items-center rounded-3xl bg-linen p-8 text-center"><div><MapPin className="mx-auto text-leaf" size={34} /><p className="mt-4 font-serif text-3xl font-semibold">Visit Swavalambi Siddaganga Oil Mill</p><p className="mt-2 text-ink/60">SIDDAGANGA OIL MILL, Near Small City Club Road, Sira Gate, TUDA Layout, Tumakuru, Karnataka 572106</p></div></div>
            <div className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="font-serif text-3xl font-semibold">Business Details</h2><div className="mt-5 grid gap-4 text-ink/65"><p className="flex gap-3"><Phone size={19} /> 09972565174</p><p className="flex gap-3"><Mail size={19} /> support@swavalambisiddagangaoilmill.com</p><p className="flex gap-3"><MapPin size={19} /> SIDDAGANGA OIL MILL, Near Small City Club Road, Sira Gate, TUDA Layout, Tumakuru, Karnataka 572106</p></div></div>
            <div className="rounded-3xl bg-ink p-6 text-white shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">Social media</p>
              <h2 className="mt-3 font-serif text-3xl font-semibold">Follow us</h2>
              <p className="mt-2 text-sm leading-6 text-white/60">See updates, new products, and stories from the mill.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {socialLinks.map(({ label, handle, icon: Icon, href }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex min-h-28 flex-col justify-between border border-white/12 bg-white/[0.06] p-4 transition hover:-translate-y-1 hover:bg-white hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    aria-label={`Follow us on ${label}`}
                  >
                    <span className="flex items-center justify-between">
                      <Icon size={22} aria-hidden="true" />
                      <ExternalLink size={15} className="opacity-45 transition group-hover:opacity-80" aria-hidden="true" />
                    </span>
                    <span className="mt-5">
                      <span className="block text-sm font-bold">{label}</span>
                      <span className="mt-1 block truncate text-xs text-white/50 group-hover:text-ink/55">{handle}</span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

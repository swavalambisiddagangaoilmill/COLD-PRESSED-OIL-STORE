// Renders the premium footer layout element.
import {
  ArrowUpRight,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import Container from "../ui/Container.jsx";
import companyLogo from "/logo.webp";
import gloraLogo from "/glora-black.webp";
import { socialLinks } from "../../data/socialLinks.js";

export default function Footer() {
  const { authenticated } = useAuth();
  const accountHref = authenticated ? "/account" : "/login";
  const footerColumns = [
    {
      title: "Navigation",
      links: [
        { label: "Home", href: "/" },
        { label: "Shop Oils", href: "/shop" },
        { label: "Essential Oils", href: "/shop?q=Essential%20Oils&focus=search" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      title: "About",
      links: [
        { label: "About", href: "/about" },
        { label: "Our Story", href: "/about/story" },
        { label: "FAQ", href: "/about/faq" },
      ],
    },
    {
      title: "Support",
      links: [
        { label: "Care Guide", href: "/about/faq" },
        { label: "Shipping", href: "/legal/shipping" },
        { label: "Returns", href: "/legal/returns" },
        { label: "Account", href: accountHref },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy Policy", href: "/legal/privacy" },
        { label: "Terms & Conditions", href: "/legal/terms" },
        { label: "Refund Policy", href: "/legal/refund" },
        { label: "Cancellation Policy", href: "/legal/cancellation" },
        { label: "Cookie Policy", href: "/legal/cookies" },
      ],
    },
  ];

  return (
    <footer className="bg-ink text-white">
      <Container className="py-12 md:py-16 xl:py-20">
        <div className="mx-auto max-w-5xl text-center">
          <Link
            to="/"
            className="group flex flex-col items-center rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-8 transition hover:-translate-y-1 hover:bg-white/[0.07] sm:py-10"
            aria-label="Swavalambi Siddaganga Oil Mill home"
          >
            <img
              src={companyLogo}
              alt="Swavalambi Siddaganga Oil Mill logo"
              className="h-28 w-auto object-contain drop-shadow-[0_12px_30px_rgb(0_0_0_/_0.28)] transition duration-500 group-hover:scale-105 sm:h-36"
              loading="lazy"
              decoding="async"
            />
            <span className="mt-5 block font-serif text-3xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              Swavalambi Siddaganga Oil Mill
            </span>
            <span className="mt-3 text-[10px] font-bold uppercase tracking-[0.3em] text-clay sm:text-xs">
              Traditional cold pressed oils
            </span>
          </Link>
          <a
            href="https://glora.studio"
            target="_blank"
            rel="noopener noreferrer"
            className="group mx-auto mt-5 inline-flex min-w-56 items-center justify-center gap-1.5 rounded-3xl border border-white/10 bg-white px-4 py-3 text-ink shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay motion-reduce:transform-none motion-reduce:transition-none"
            aria-label="Visit Glora Studio"
          >
            <img
              src={gloraLogo}
              alt=""
              className="h-7 w-7 object-contain"
            />
            <span className="relative grid h-4 min-w-[9.25rem] overflow-hidden whitespace-nowrap text-left text-[10px] font-medium text-ink/45">
              <span className="col-start-1 row-start-1 transition duration-300 group-hover:-translate-y-full group-hover:opacity-0 motion-reduce:transition-none">crafted by <strong className="text-xs text-ink">Glora Studio</strong></span>
              <span className="col-start-1 row-start-1 translate-y-full opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none">built with care by <strong className="text-xs text-ink">Glora Studio</strong></span>
            </span>
            <ArrowUpRight size={13} strokeWidth={2} className="text-ink/45 transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink motion-reduce:transform-none motion-reduce:transition-none" />
          </a>
        </div>

        <div className="mt-12 grid gap-5 xl:mt-16 xl:grid-cols-[1fr_0.82fr]">
          <div className="grid gap-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 sm:grid-cols-2 sm:p-8 lg:grid-cols-4">
            {footerColumns.map((column) => (
              <nav
                key={column.title}
                aria-label={`${column.title} footer links`}
              >
                <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-clay">
                  {column.title}
                </h3>
                <div className="mt-5 grid gap-3">
                  {column.links.map((link) => (
                    <Link
                      key={link.label}
                      to={link.href}
                      className="font-semibold text-white/62 transition hover:translate-x-1 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </nav>
            ))}
          </div>

          <div className="grid gap-5">
            <div className="rounded-[2rem] bg-cream p-6 text-ink shadow-soft sm:p-8">
              <div className="inline-grid h-12 w-12 place-items-center rounded-full bg-leaf/10 text-leaf">
                <ShieldCheck size={20} />
              </div>
              <h3 className="mt-5 font-serif text-3xl font-semibold">
                Customer care, handled with attention
              </h3>
              <p className="mt-3 leading-7 text-ink/62">
                For order questions, bulk enquiries, delivery support, or product guidance, our team is ready to help through the contact page.
              </p>
              <Link
                to="/contact"
                className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-sm font-semibold text-white transition hover:bg-leaf"
              >
                Contact Support
              </Link>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 sm:p-8">
              <div className="grid gap-3 text-sm font-semibold text-white/62">
                <span className="flex items-start gap-3">
                  <MapPin size={18} className="mt-0.5 shrink-0 text-clay" />
                  SIDDAGANGA OIL MILL, Near Small City Club Road, Sira Gate,
                  TUDA Layout, Tumakuru, Karnataka 572106
                </span>
                <span className="flex items-center gap-3">
                  <Phone size={18} className="text-clay" /> 09972565174
                </span>
                <span className="flex items-center gap-3">
                  <Mail size={18} className="text-clay" />
                  support@swavalambisiddagangaoilmill.com
                </span>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                {socialLinks.map(({ label, icon: Icon, href }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:-translate-y-1 hover:bg-white hover:text-ink"
                  >
                    <Icon size={18} />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm font-medium text-white/52 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; 2026 Swavalambi Siddaganga Oil Mill. All rights reserved.
          </p>
          <p>ಕಾಯಕವೇ ಕೈಲಾಸ.</p>
        </div>
      </Container>
    </footer>
  );
}

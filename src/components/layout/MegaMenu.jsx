// Renders the MegaMenu layout element.
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link, NavLink } from "react-router-dom";

function shortcutHref(link) {
  return link.href === "/shop" ? `/shop?q=${encodeURIComponent(link.label)}&focus=search` : link.href;
}

export default function MegaMenu({ menu, open, onNavigate }) {
  const data = menu?.data;
  const isShop = data?.variant === "shop";
  const isAbout = menu?.label === "About";

  return (
    <motion.div
      className={`absolute left-0 top-[54px] w-full overflow-hidden rounded-b-3xl border border-t-0 border-ink/10 bg-white shadow-soft ${
        open ? "pointer-events-auto visible" : "pointer-events-none invisible"
      }`}
      initial={false}
      animate={{ opacity: open ? 1 : 0, y: open ? 0 : -12 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      aria-hidden={!open}
    >
      {data && (
        <div className="grid gap-6 p-6 xl:grid-cols-[26%_1fr] 2xl:p-7">
          <nav
            aria-label={`${menu.label} links`}
            className={isAbout ? "grid content-start gap-3" : "grid content-start gap-2"}
          >
            {data.links.map((link) => {
              const href = shortcutHref(link);
              if (isAbout) {
                return (
                  <NavLink
                    key={link.label}
                    to={href}
                    end={href === "/about"}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `group relative flex h-12 items-center rounded-2xl px-5 text-base font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf ${
                        isActive
                          ? "bg-linen text-leaf"
                          : "text-ink/75 hover:bg-linen hover:text-leaf"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`absolute left-3 h-6 w-1 rounded-full bg-leaf transition duration-200 ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`} />
                        <span className="pl-3">{link.label}</span>
                      </>
                    )}
                  </NavLink>
                );
              }
              return (
                <Link
                  key={link.label}
                  to={href}
                  onClick={onNavigate}
                  className={
                    isShop
                      ? "flex h-12 items-center rounded-2xl px-5 text-base font-semibold text-ink/75 transition duration-200 hover:bg-linen hover:text-leaf focus-visible:bg-linen focus-visible:text-leaf focus-visible:outline-none"
                      : "flex h-12 items-center rounded-2xl px-5 text-base font-semibold text-ink/75 transition duration-200 hover:bg-linen hover:translate-x-1 hover:text-leaf focus-visible:bg-linen focus-visible:translate-x-1 focus-visible:text-leaf focus-visible:outline-none"
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <Link to={data.banner.href} onClick={onNavigate} className="group grid max-h-[300px] overflow-hidden rounded-3xl bg-linen lg:grid-cols-[0.9fr_1.1fr]">
            <div className={`relative max-h-[300px] overflow-hidden ${data.banner.rotateImage ? "bg-linen" : ""}`}>
              <img
                src={data.banner.image}
                alt={data.banner.title}
                loading="lazy"
                className={data.banner.rotateImage
                  ? "absolute left-1/2 top-1/2 h-[150%] w-[63%] -translate-x-1/2 -translate-y-1/2 rotate-90 object-contain"
                  : "h-full min-h-[260px] w-full object-cover"}
              />
            </div>
            <div className="flex flex-col justify-center p-7 2xl:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">{data.banner.eyebrow}</p>
              <h3 className="mt-3 max-w-2xl font-serif text-3xl font-semibold leading-tight text-ink">
                {data.banner.title}
              </h3>
              <p className="mt-3 max-w-xl leading-7 text-ink/60">{data.banner.description}</p>
              <span className="mt-5 inline-flex h-12 w-max items-center gap-2 rounded-xl bg-ink px-6 text-sm font-semibold text-white transition duration-300 group-hover:bg-leaf">
                {data.banner.ctaLabel || "Shop Now"} <ArrowRight size={18} />
              </span>
            </div>
          </Link>
        </div>
      )}
    </motion.div>
  );
}

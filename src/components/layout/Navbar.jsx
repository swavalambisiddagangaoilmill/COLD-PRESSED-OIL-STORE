// Renders the Navbar layout element.
import { Heart, Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { usePopup } from "../../context/PopupContext.jsx";
import { useCart } from "../../hooks/useCart.jsx";
import { useWishlist } from "../../context/WishlistContext.jsx";
import useTypewriterPlaceholder from "../../hooks/useTypewriterPlaceholder.js";
import { getNavbarProducts } from "../../services/catalogService.js";
import DesktopMenu from "./DesktopMenu.jsx";
import MobileDrawer from "./MobileDrawer.jsx";
import MobileSearchPanel from "./MobileSearchPanel.jsx";
import basavannaLogo from "/basavanna.png";
import companyLogo from "/logo.webp";
import drshivkumarswamiji from "/drshivkumarswamiji.webp";

function IconLink({ to, label, children, badge, className = "", onClick }) {
  const content = (
    <>
      {children}
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">
          {badge}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        data-popup-trigger={label.toLowerCase()}
        className={`relative h-11 w-11 place-items-center rounded-full bg-white text-ink shadow-sm transition duration-200 hover:scale-105 hover:bg-linen focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf ${className || "grid"}`}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      to={to}
      aria-label={label}
      className={`relative h-11 w-11 place-items-center rounded-full bg-white text-ink shadow-sm transition duration-200 hover:scale-105 hover:bg-linen focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf ${className || "grid"}`}
    >
      {content}
    </Link>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [navbarProducts, setNavbarProducts] = useState([]);
  const mobileSearchInputRef = useRef(null);
  const desktopSearchInputRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { items } = useCart();
  const { items: wishlistItems } = useWishlist();
  const { authenticated, user, logout } = useAuth();
  const { togglePopup } = usePopup();
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const accountPath = authenticated ? "/account" : "/login";
  const isAdmin = user?.role === "admin";
  const searchPlaceholder = useTypewriterPlaceholder(searchValue);

  const handleLogout = async () => {
    if (!window.confirm("Are you sure you want to log out?")) return;
    await logout();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    let active = true;
    getNavbarProducts().then((products) => active && setNavbarProducts(products)).catch(() => active && setNavbarProducts([]));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchValue(params.get("q") || "");
  }, [location.search]);

  const navigateToShopSearch = (value = searchValue, replace = false) => {
    const params = new URLSearchParams();
    params.set("focus", "search");
    if (value) params.set("q", value);
    navigate(`/shop?${params.toString()}`, { replace });
  };

  const focusActiveSearchInput = () => {
    const input = window.innerWidth >= 1280 ? desktopSearchInputRef.current : mobileSearchInputRef.current;
    input?.focus();
  };

  const openMobileSearch = () => {
    if (mobileSearchOpen) return;
    setMobileSearchOpen(true);
    window.history.pushState({ mobileSearch: true }, "");
    window.setTimeout(focusActiveSearchInput, 50);
  };

  const homeSearchOverlay = location.pathname === "/";

  const handleDesktopSearchChange = (event) => {
    const value = event.target.value;
    setSearchValue(value);
    if (homeSearchOverlay) {
      if (!mobileSearchOpen) openMobileSearch();
      return;
    }
    navigateToShopSearch(value, location.pathname === "/shop");
  };

  const closeMobileSearch = () => {
    if (!mobileSearchOpen) return;
    if (window.history.state?.mobileSearch) window.history.back();
    else setMobileSearchOpen(false);
  };

  const finishMobileSearchNavigation = () => {
    setMobileSearchOpen(false);
    if (window.history.state?.mobileSearch) window.history.replaceState({}, "");
  };

  useEffect(() => {
    const handlePopState = () => setMobileSearchOpen(false);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <header
        className={`sticky top-0 z-40 bg-white/98 backdrop-blur transition duration-300 ${
          scrolled ? "border-b border-ink/10" : ""
        }`}
      >
        <div className="border-b border-ink/10">
          <div className="mx-auto grid h-[58px] max-w-screen-2xl grid-cols-[auto_1fr_auto] items-center px-4 sm:px-6 md:h-20 lg:px-8 xl:grid-cols-[1fr_auto_1fr] xl:h-[88px] xl:px-10 2xl:px-12">
            <div className="flex items-center justify-start gap-2 sm:gap-3">
              <Link
                to="/"
                className="flex items-center xl:hidden"
                aria-label="Swavalambi Siddaganga Oil Mill home"
              >
                <img
                  src={companyLogo}
                  alt="Logo"
                  className="h-10 w-10 shrink-0 object-cover sm:h-12 sm:w-12"
                />
              </Link>
              <div className="flex items-center gap-1.5 xl:hidden" aria-label="Spiritual guides">
                <img
                  src={basavannaLogo}
                  alt="Basavanna"
                  className="h-9 w-9 shrink-0 rounded-full object-cover object-top sm:h-11 sm:w-11"
                />
                <img
                  src={drshivkumarswamiji}
                  alt="Dr Shivakumara Swamiji"
                  className="h-9 w-9 shrink-0 rounded-full object-cover object-top sm:h-11 sm:w-11"
                />
              </div>
              <form
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (homeSearchOverlay) openMobileSearch();
                  else navigateToShopSearch(searchValue, location.pathname === "/shop");
                }}
                className="hidden h-11 min-w-0 items-center gap-3 rounded-md border border-ink/15 bg-white px-4 text-sm font-medium text-ink/70 transition duration-200 focus-within:border-leaf focus-within:outline-none xl:inline-flex xl:w-[220px] 2xl:w-[260px]"
              >
                <Search size={18} className="shrink-0" />
                <input
                  ref={desktopSearchInputRef}
                  value={searchValue}
                  onFocus={() => homeSearchOverlay ? openMobileSearch() : navigateToShopSearch(searchValue, location.pathname === "/shop")}
                  onChange={handleDesktopSearchChange}
                  placeholder={searchPlaceholder}
                  aria-label="Search oils"
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink/70 placeholder:text-ink/50 outline-none"
                />
                {homeSearchOverlay && mobileSearchOpen && <button type="button" aria-label={searchValue ? "Clear search" : "Close search"} onClick={() => searchValue ? setSearchValue("") : closeMobileSearch()} className="grid h-8 w-8 shrink-0 place-items-center text-ink/55 hover:text-leaf"><X size={17} /></button>}
              </form>
              <img
                src={companyLogo}
                alt="Logo"
                className="ml-3 hidden h-16 w-16 shrink-0 object-cover xl:block"
              />
            </div>
            <Link
              to="/"
              className="hidden min-w-0 justify-self-center px-2 text-center font-serif text-3xl font-semibold leading-tight tracking-tight xl:block"
            >
              Swavalambi Siddaganga Oil Mill
              {/* ಸ್ವಾವಲಂಬಿ ಸಿದ್ದಗಂಗಾ ಆಯಿಲ್ ಮಿಲ್ */}
            </Link>
            <div className="flex items-center justify-end gap-0.5 sm:gap-1 xl:gap-3">
              <div className="hidden items-center gap-2 xl:flex" aria-label="Spiritual guides">
                <img
                  src={basavannaLogo}
                  alt="Basavanna"
                  className="h-16 w-16 shrink-0 rounded-full object-cover object-top"
                />
                <img
                  src={drshivkumarswamiji}
                  alt="Dr Shivakumara Swamiji"
                  className="h-16 w-16 shrink-0 rounded-full object-cover object-top"
                />
              </div>
              <IconLink
                label="Wishlist"
                badge={wishlistItems.length}
                className="hidden xl:grid"
                onClick={() => togglePopup("wishlist")}
              >
                <Heart size={19} />
              </IconLink>
              <Link to={accountPath} aria-label="Account" className="grid h-9 w-9 place-items-center text-ink transition hover:text-leaf xl:hidden"><UserRound size={18} fill={authenticated ? "currentColor" : "none"} /></Link>
              <button type="button" aria-label="Wishlist" data-popup-trigger="wishlist" onClick={() => togglePopup("wishlist")} className="relative grid h-9 w-9 place-items-center text-ink transition hover:text-leaf xl:hidden"><Heart size={18} />{wishlistItems.length > 0 && <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center bg-brand px-0.5 text-[9px] font-bold text-white">{wishlistItems.length}</span>}</button>
              <Link to="/cart" aria-label="Cart" className="relative grid h-9 w-9 place-items-center text-ink transition hover:text-leaf xl:hidden"><ShoppingBag size={18} />{count > 0 && <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center bg-brand px-0.5 text-[9px] font-bold text-white">{count}</span>}</Link>
              <div className="hidden items-center gap-2 xl:flex">
                <IconLink to={accountPath} label="Account" className="grid">
                  <UserRound
                    size={19}
                    fill={authenticated ? "currentColor" : "none"}
                  />
                </IconLink>
                {isAdmin && (
                  <span className="rounded-full bg-leaf/10 px-2.5 py-1 text-xs font-bold text-leaf">
                    Admin
                  </span>
                )}
              </div>
              <IconLink
                to="/cart"
                label="Cart"
                badge={count}
                className="hidden xl:grid"
              >
                <ShoppingBag size={19} />
              </IconLink>
              <button
                type="button"
                aria-label="Open menu"
                className="grid h-10 w-10 place-items-center bg-white text-ink transition duration-200 hover:bg-linen focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf xl:hidden"
                onClick={() => setOpen(true)}
              >
                <Menu size={20} />
              </button>
            </div>
          </div>
        </div>
        <div className="border-t border-ink/10 px-4 py-2.5 xl:hidden">
          <form role="search" onSubmit={(event) => { event.preventDefault(); openMobileSearch(); }} className="mx-auto flex h-10 max-w-2xl items-center gap-3 rounded-md border border-ink/30 bg-white px-3 focus-within:border-leaf">
            <Search size={17} className="text-ink/50" />
            <input ref={mobileSearchInputRef} value={searchValue} onFocus={openMobileSearch} onChange={(event) => { setSearchValue(event.target.value); if (!mobileSearchOpen) openMobileSearch(); }} placeholder={searchPlaceholder} aria-label="Search products" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink/40" />
            {mobileSearchOpen && <button type="button" aria-label={searchValue ? "Clear search" : "Close search"} onClick={() => searchValue ? setSearchValue("") : closeMobileSearch()} className="grid h-8 w-8 place-items-center text-ink/55 hover:text-leaf"><X size={17} /></button>}
          </form>
        </div>
        <DesktopMenu products={navbarProducts} />
      </header>
      <MobileSearchPanel open={mobileSearchOpen} query={searchValue} onQueryChange={(value) => { setSearchValue(value); window.setTimeout(focusActiveSearchInput, 0); }} onClose={finishMobileSearchNavigation} />
      <MobileDrawer
        open={open}
        onClose={() => setOpen(false)}
        onWishlist={() => togglePopup("wishlist")}
        accountPath={accountPath}
        authenticated={authenticated}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        products={navbarProducts}
      />
    </>
  );
}






// Renders the DesktopMenu layout element.
import { useEffect, useRef, useState } from "react";
import { megaMenus } from "../../data/siteData.js";
import MenuItem from "./MenuItem.jsx";
import MegaMenu from "./MegaMenu.jsx";

const desktopItems = [
  { label: "Shop", href: "/shop", dropdown: "shop", state: { resetShop: true } },
  { label: "Cold Pressed Oils", href: "/shop?q=Cold%20Pressed%20Oils&focus=search", dropdown: "coldPressed", state: { resetShop: true } },
  { label: "Specialty Oils", href: "/shop?q=Specialty%20Oils&focus=search", dropdown: "essential", state: { resetShop: true } },
  { label: "About", href: "/about/story", dropdown: "about" },
  { label: "Contact", href: "/contact" },
];

export default function DesktopMenu({ products = [] }) {
  const [active, setActive] = useState(null);
  const itemRefs = useRef([]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setActive(null);
        document.activeElement?.blur();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const focusItem = (index) => itemRefs.current[index]?.focus();

  const handleKeyDown = (event, index, item) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusItem((index + 1) % desktopItems.length);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusItem((index - 1 + desktopItems.length) % desktopItems.length);
    }
    if (
      (event.key === "ArrowDown" ||
        event.key === "Enter" ||
        event.key === " ") &&
      item.dropdown
    ) {
      event.preventDefault();
      setActive(item.dropdown);
    }
  };

  const activeItem = desktopItems.find((item) => item.dropdown === active);
  const activeMega =
    active === "shop" ||
    active === "coldPressed" ||
    active === "essential" ||
    active === "about";
  const productLinks = products.slice(0, 5).map((product) => ({ label: product.name, href: `/product/${product.slug}` }));
  const activeData = megaMenus[active];
  const menuData = activeData && active !== "about" && productLinks.length ? { ...activeData, links: productLinks } : activeData;

  return (
    <div
      className="hidden bg-ink xl:block"
      onMouseLeave={() => setActive(null)}
    >
      <div className="relative mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <nav
          className="flex h-[54px] items-center justify-center"
          aria-label="Primary navigation"
          role="menubar"
        >
          {desktopItems.map((item, index) => (
            <div key={item.label} className="relative h-[54px]">
              <MenuItem
                item={item}
                active={active === item.dropdown}
                hasDropdown={Boolean(item.dropdown)}
                onMouseEnter={() => item.dropdown && setActive(item.dropdown)}
                onFocus={() => item.dropdown && setActive(item.dropdown)}
                onKeyDown={(event) => handleKeyDown(event, index, item)}
                onNavigate={() => setActive(null)}
                onDropdownToggle={() =>
                  item.dropdown &&
                  setActive((current) =>
                    current === item.dropdown ? null : item.dropdown
                  )
                }
                buttonRef={(node) => {
                  itemRefs.current[index] = node;
                }}
              />
            </div>
          ))}
        </nav>
        <MegaMenu
          menu={
            activeMega
              ? { label: activeItem?.label, data: menuData }
              : null
          }
          open={activeMega}
          onNavigate={() => setActive(null)}
        />
      </div>
    </div>
  );
}

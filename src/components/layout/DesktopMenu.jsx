// Renders the DesktopMenu layout element.
import { useEffect, useRef, useState } from "react";
import { megaMenus } from "../../data/siteData.js";
import { orderedActiveNavbar } from "../../../shared/navbarConfig.js";
import MenuItem from "./MenuItem.jsx";
import MegaMenu from "./MegaMenu.jsx";

export default function DesktopMenu({ navigation }) {
  const [active, setActive] = useState(null);
  const itemRefs = useRef([]);
  const managedItems = orderedActiveNavbar(navigation).map((item) => ({ ...item, dropdown: item.dropdownEnabled && item.children.length ? item.key : null, state: { resetShop: true } }));
  const desktopItems = [...managedItems, { key: "about", label: "About", href: "/about/story", dropdown: "about" }, { key: "contact", label: "Contact", href: "/contact" }];

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
  const activeMega = Boolean(activeItem);
  const template = active === "about" ? megaMenus.about : activeItem?.key === "speciality-oils" ? megaMenus.essential : activeItem?.key === "shop" ? megaMenus.shop : megaMenus.coldPressed;
  const menuData = activeItem && template ? { ...template, links: active === "about" ? template.links : activeItem.children } : null;

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
            <div key={item.key} className="relative h-[54px]">
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

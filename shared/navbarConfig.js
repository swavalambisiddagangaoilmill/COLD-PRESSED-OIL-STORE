const oil = (key, label) => ({ key, label, type: "LINK", href: `/shop?q=${encodeURIComponent(label)}&focus=search`, active: true });

export const DEFAULT_NAVBAR_CONFIG = Object.freeze({
  items: [
    { key: "shop", label: "Shop", active: true, order: 1, href: "/shop", dropdownEnabled: false, children: [] },
    { key: "cold-pressed-oils", label: "Cold Pressed Oils", active: true, order: 2, href: "/shop", dropdownEnabled: true, children: [oil("coconut-oil", "Coconut Oil"), oil("sunflower-oil", "Sunflower Oil"), oil("safflower-oil", "Safflower Oil"), oil("mustard-oil", "Mustard Oil"), oil("gingelly-oil", "Gingelly Oil"), oil("groundnut-oil", "Groundnut Oil")].map((item, index) => ({ ...item, order: index + 1 })) },
    { key: "speciality-oils", label: "Speciality Oils", active: true, order: 3, href: "/shop", dropdownEnabled: true, children: [oil("castor-oil", "Castor Oil"), oil("neem-oil", "Neem Oil"), oil("herbal-oil", "Herbal Oil"), oil("caranja-oil", "Caranja Oil")].map((item, index) => ({ ...item, order: index + 1 })) },
  ],
});

export function orderedActiveNavbar(config = DEFAULT_NAVBAR_CONFIG) {
  return [...(config?.items || [])].filter((item) => item.active).sort((a, b) => a.order - b.order).map((item) => ({ ...item, children: [...(item.children || [])].filter((child) => child.active).sort((a, b) => a.order - b.order) }));
}

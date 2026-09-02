// Static site navigation and marketing content used across layout sections.
import { Leaf, ShieldCheck, Sprout, Truck, Wheat, BadgeCheck } from "lucide-react";

export const announcementMessages = [
  "100% Cold Pressed Oils",
  "Chemical Free",
  "Free Shipping Above Rs. 999",
  "Farm Fresh",
  "Cold Pressed",
];

export const oilMenuLinks = [
  { label: "Groundnut Oil", href: "/shop" },
  { label: "Sesame Oil", href: "/shop" },
  { label: "Coconut Oil", href: "/shop" },
  { label: "Mustard Oil", href: "/shop" },
  { label: "Safflower Oil", href: "/shop" },
];

export const categoryMenuLinks = [
  { label: "Cooking Oils", href: "/shop" },
  { label: "Health Oils", href: "/shop" },
  { label: "Combo Packs", href: "/shop" },
  { label: "Gift Packs", href: "/shop" },
  { label: "Family Staples", href: "/shop" },
  { label: "Wellness Rituals", href: "/shop" },
];

export const essentialOilLinks = [
  { label: "Castor Oil", href: "/shop" },
  { label: "Neem Oil", href: "/shop" },
  { label: "Caranja Oil", href: "/shop" },
  { label: "Herbal Oil", href: "/shop" },
];

export const aboutMenuLinks = [
  { label: "About", href: "/about" },
  { label: "Our Story", href: "/about/story" },
  { label: "FAQ", href: "/about/faq" },
  { label: "Contact", href: "/contact" },
];

export const megaMenus = {
  shop: {
    variant: "shop",
    links: oilMenuLinks,
    banner: {
      href: "/shop?q=Groundnut%20Oil&focus=search",
      image: "/shop-groundnut.png",
      eyebrow: "Groundnut oil",
      title: "Pure groundnut oil, cold pressed.",
      description: "Made from fresh groundnuts for a rich, natural cooking oil.",
    },
  },
  coldPressed: {
    variant: "compact",
    links: oilMenuLinks,
    banner: {
      href: "/shop?q=Coconut%20Oil&focus=search",
      image: "/cold-pressed-coconut.png",
      rotateImage: true,
      eyebrow: "Coconut oil",
      title: "Pure coconut oil, cold pressed.",
      description: "Made from fresh coconuts with a naturally rich aroma.",
    },
  },
  essential: {
    variant: "compact",
    links: essentialOilLinks,
    banner: {
      href: "/shop?q=Neem%20Oil&focus=search",
      image: "/specialty-oils-neem.png",
      eyebrow: "Neem oil",
      title: "Pure neem oil, naturally pressed.",
      description: "Made from neem seeds for traditional and versatile everyday use.",
    },
  },
  about: {
    variant: "compact",
    links: aboutMenuLinks,
    banner: {
      href: "/about",
      image: "/about-oil-mill.png",
      ctaLabel: "About Us",
      eyebrow: "Our oil mill",
      title: "Inside our cold pressed oil mill.",
      description: "See the equipment and careful process used to prepare our oils.",
    },
  },
};

export const benefits = [
  { icon: Leaf, title: "Cold Pressed", text: "Pressed slowly below heat-intensive thresholds to preserve aroma and nutrients." },
  { icon: ShieldCheck, title: "Lab Tested", text: "Each batch is checked for purity, freshness, and clean sourcing standards." },
  { icon: Sprout, title: "Single Origin", text: "Seeds are selected from trusted farms and milled in traceable small batches." },
  { icon: Truck, title: "Fresh Dispatch", text: "Bottled after pressing and shipped in protective, recyclable packaging." },
];

export const processSteps = [
  "Seeds are cleaned, sun-rested, and sorted by density.",
  "Slow wooden pressing draws oil without harsh refining.",
  "Natural settling keeps the oil clean while retaining character.",
  "Small batches are bottled in amber glass for pantry freshness.",
];

export const testimonials = [
  { name: "Ananya Rao", role: "Home chef", rating: 5, review: "Verified pantry review", quote: "The groundnut oil has the kind of aroma I remember from my grandmother's kitchen, but the packaging feels beautifully modern." },
  { name: "Ritwik Sharma", role: "Cafe owner", rating: 5, review: "Repeat buyer", quote: "Consistent batches, honest flavor, and an elegant shelf presence. The sesame oil is now part of our signature menu." },
  { name: "Mira Nair", role: "Nutrition coach", rating: 5, review: "Wellness kitchen review", quote: "I recommend Swavalambi Siddaganga Oil Mill to clients who want cleaner pantry staples without compromising taste or cooking performance." },
  { name: "Devika Menon", role: "Family kitchen buyer", rating: 5, review: "Monthly subscriber", quote: "The oils feel fresh from the first pour. Mustard for pickles and groundnut for daily cooking have become our regular pair." },
  { name: "Kabir Sethi", role: "Private chef", rating: 5, review: "Chef tested", quote: "What stands out is balance. The oils carry flavor without overpowering the dish, and the bottles look refined on open shelves." },
  { name: "Nisha Iyer", role: "New parent", rating: 5, review: "Family review", quote: "I wanted pantry staples that felt trustworthy and simple. Swavalambi Siddaganga Oil Mill made it easy to switch without changing the way we cook." },
];

export const faqs = [
  { q: "Are these oils refined?", a: "No. Every oil is cold pressed, naturally settled, and bottled without refining, bleaching, or deodorising." },
  { q: "How should I store cold pressed oils?", a: "Keep bottles tightly closed in a cool pantry away from direct sunlight and strong heat." },
  { q: "Can I use them for Indian cooking?", a: "Yes. Groundnut, mustard, sesame, and sunflower oils are excellent for everyday Indian recipes." },
  { q: "Do you ship across India?", a: "This frontend includes a complete shopping flow and can be connected to your MERN backend for live shipping rules." },
];

export const trustStats = [
  { value: "7", label: "Single-origin oils" },
  { value: "40 C", label: "Low-heat pressing" },
  { value: "24h", label: "Batch dispatch" },
  { value: "0", label: "Refined additives" },
];

export const instagramImages = [
  "https://images.unsplash.com/photo-1501430654243-c934cec2e1c0?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80",
];

export const brandValues = [
  { icon: Wheat, label: "Farm selected" },
  { icon: BadgeCheck, label: "Batch numbered" },
  { icon: Leaf, label: "Naturally settled" },
  { icon: ShieldCheck, label: "Purity checked" },
];



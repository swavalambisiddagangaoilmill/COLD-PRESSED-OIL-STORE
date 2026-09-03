// Static site navigation and marketing content used across layout sections.
import { Leaf, ShieldCheck, Sprout, Truck, Wheat, BadgeCheck } from "lucide-react";
import { PRODUCT_CATEGORY_SLUGS } from "../../shared/productCategories.js";

export const announcementMessages = [
  "100% Cold Pressed Oils",
  "Chemical Free",
  "Free Shipping Above Rs. 999",
  "Farm Fresh",
  "Cold Pressed",
];

export const oilMenuLinks = PRODUCT_CATEGORY_SLUGS.map(({ name, slug }) => ({ label: name, href: `/shop?category=${slug}` }));

export const categoryMenuLinks = oilMenuLinks;

export const essentialOilLinks = oilMenuLinks.filter(({ label }) => ["Castor Oil", "Neem Oil", "Caranja Oil", "Herbal Oil"].includes(label));

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
  { name: "Jayashree Manjunath", role: "Google customer", rating: 5, review: "Source: Google", quote: "Siddaganga Oil Mill products maintain high quality with consistent aroma and rich flavor. The oils are pure, free from adulteration, and offered at a comparatively reasonable price!!!" },
  { name: "Dakshina Murthy", role: "Google customer", rating: 5, review: "Source: Google", quote: "Highly recommended for pure groundnut oil and other oil. I purchased Ground nut oil and Other products here.. good price (wholesale price), environment friendly person (No plastic)." },
  { name: "Vijaya Shankar", role: "Google customer", rating: 5, review: "Source: Google", quote: "Hi I am using the groundnut oil since two years the quality is good and price also very affordable and staff behaviour good and I recommend every one to purchase" },
  { name: "Kavya Shree", role: "Google customer", rating: 5, review: "Source: Google", quote: "We are regular customer to siddaganga oil mill. The Oil quality which they are giving is very pure. This time we purchased from his new factory. Their we witnessed more than 10 machines are in function.The  place also neat and tidy. We recommand siddaganga oil mill for your good health and reasonable price." },
  { name: "Sahana Sahana", role: "Google customer", rating: 5, review: "Source: Google", quote: "It's nice oil and we are coming 2years and natural oil  it will get every type of oil here and come and visit here it's nice quality and pure...!!🍃🥥" },
  { name: "Hanumappa Hanumappa", role: "Google customer", rating: 5, review: "Source: Google", quote: "This oil proves that purity needs no additives. Its natural aroma is a mark of genuine quality." },
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



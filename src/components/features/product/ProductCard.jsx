// Renders ProductCard for product catalog surfaces.
import { Star } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import SafeImage from "../../common/SafeImage.jsx";
import { formatCurrency } from "../../../utils/formatCurrency.js";
import AddToCartButton from "./AddToCartButton.jsx";
import WishlistToggle from "./WishlistToggle.jsx";

function getDiscount(product) {
  if (!product.mrp || product.mrp <= product.price) return null;
  return Math.round(((product.mrp - product.price) / product.mrp) * 100);
}

function PremiumProductCard({ product }) {
  const discount = getDiscount(product);
  const stockLabel = product.stock <= 8 ? "Low stock" : "In stock";

  return (
    <motion.article initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.45 }} className="group flex h-full min-w-0 flex-col overflow-hidden rounded-[1.4rem] border border-ink/10 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-soft">
      <div className="relative overflow-hidden bg-linen">
        <Link to={`/product/${product.slug}`} className="block aspect-[4/5.15] overflow-hidden"><SafeImage src={product.image} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.045]" /></Link>
        {discount && <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-leaf shadow-sm sm:left-3 sm:top-3 sm:text-[11px]">{discount}% off</span>}
        <WishlistToggle product={product} className="absolute right-2.5 top-2.5 h-9 w-9 sm:right-3 sm:top-3" size={16} />
        <div className="absolute inset-x-2.5 bottom-2.5 translate-y-0 opacity-100 transition duration-300 xl:translate-y-3 xl:opacity-0 xl:group-hover:translate-y-0 xl:group-hover:opacity-100">
          <AddToCartButton product={product} className="h-11 w-full rounded-full bg-ink/95 px-3 text-xs shadow-soft backdrop-blur hover:bg-leaf sm:h-12 sm:text-sm" iconSize={16} />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3.5 sm:p-4 lg:p-5">
        <Link to={`/product/${product.slug}`} className="min-h-[3.15rem] overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] font-serif text-xl font-semibold leading-tight transition hover:text-leaf sm:min-h-[3.5rem] sm:text-2xl">{product.name}</Link>
        <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-ink/55 sm:text-sm"><Star size={15} className="shrink-0 fill-clay text-clay" /><span>{product.rating}</span><span className="text-ink/25">/</span><span>{product.reviews ?? 84} reviews</span></div>
        <p className={`mt-2 text-xs font-bold uppercase tracking-[0.16em] ${product.stock <= 8 ? "text-clay" : "text-leaf"}`}>{stockLabel}</p>
        <div className="mt-auto flex min-h-[2.75rem] flex-wrap items-end gap-x-2 gap-y-1 pt-4"><span className="text-lg font-bold leading-none text-ink sm:text-xl">{formatCurrency(product.price)}</span>{product.mrp && product.mrp > product.price && <span className="text-xs font-semibold leading-none text-ink/35 line-through sm:text-sm">{formatCurrency(product.mrp)}</span>}</div>
      </div>
    </motion.article>
  );
}

function CatalogProductCard({ product }) {
  return (
    <motion.article initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.45 }} className="group overflow-hidden rounded-3xl border border-ink/10 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-soft">
      <div className="relative overflow-hidden bg-linen">
        <Link to={`/product/${product.slug}`} className="block aspect-[4/5] overflow-hidden"><SafeImage src={product.image} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></Link>
        <WishlistToggle product={product} className="absolute right-3 top-3 h-10 w-10" />
      </div>
      <div className="p-5">
        <div className="mb-3 flex flex-wrap gap-2">{product.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-linen px-3 py-1 text-xs font-semibold text-ink/65">{tag}</span>)}</div>
        <Link to={`/product/${product.slug}`} className="font-serif text-2xl font-semibold leading-tight hover:text-leaf">{product.name}</Link>
        <div className="mt-3 flex items-center gap-2 text-sm text-ink/60"><Star size={16} className="fill-clay text-clay" /> {product.rating} / {product.volume}</div>
        <div className="mt-4 flex items-end gap-3"><span className="text-xl font-bold">{formatCurrency(product.price)}</span><span className="text-sm text-ink/40 line-through">{formatCurrency(product.mrp)}</span></div>
        <p className={`mt-3 text-xs font-bold uppercase tracking-[0.16em] ${product.stock <= 8 ? "text-clay" : "text-leaf"}`}>{product.stock <= 8 ? "Low stock" : "In stock"}</p>
        <AddToCartButton product={product} className="mt-5 w-full" />
      </div>
    </motion.article>
  );
}

export default function ProductCard({ product, variant = "catalog" }) {
  if (variant === "premium") return <PremiumProductCard product={product} />;
  return <CatalogProductCard product={product} />;
}
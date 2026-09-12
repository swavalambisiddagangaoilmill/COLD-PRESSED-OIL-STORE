// Renders ProductCard for product catalog surfaces.
import { motion } from "framer-motion";
import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SafeImage from "../../common/SafeImage.jsx";
import AddToCartButton from "./AddToCartButton.jsx";
import ProductPrice from "./ProductPrice.jsx";
import WishlistToggle from "./WishlistToggle.jsx";

const staticCartClass = "h-11 w-full px-3 text-xs sm:h-12 sm:text-sm";

function variantId(variant) {
  return String(variant?._id || variant?.id || "");
}

function productForVariant(product, variant) {
  if (!variant) return product;
  const images = variant.images?.length ? variant.images : product.images;
  return {
    ...product,
    variantId: variantId(variant),
    volume: variant.size,
    price: variant.effectivePrice ?? variant.price,
    effectivePrice: variant.effectivePrice ?? variant.price,
    baseSellingPrice: variant.baseSellingPrice ?? variant.price,
    mrp: variant.appliedOffer ? (variant.baseSellingPrice ?? variant.price) : (variant.mrp ?? variant.price),
    appliedOffer: variant.appliedOffer || null,
    image: images?.[0]?.url || images?.[0] || product.image,
    images,
    inStock: variant.isAvailable !== false,
    stock: variant.isAvailable === false ? 0 : Number.MAX_SAFE_INTEGER,
  };
}

function useCardVariant(product) {
  const activeVariants = useMemo(() => (product.variants || []).filter((variant) => variant.isActive !== false), [product.variants]);
  const defaultId = variantId(activeVariants.find((variant) => variant.isAvailable !== false) || activeVariants[0]);
  const [selectedId, setSelectedId] = useState(defaultId);

  useEffect(() => {
    if (!activeVariants.some((variant) => variantId(variant) === selectedId)) setSelectedId(defaultId);
  }, [activeVariants, defaultId, selectedId]);

  const selectedVariant = activeVariants.find((variant) => variantId(variant) === selectedId) || activeVariants[0];
  return { activeVariants, selectedId: variantId(selectedVariant), setSelectedId, selectedProduct: productForVariant(product, selectedVariant) };
}

function VariantSelect({ productName, variants, value, onChange }) {
  const id = useId();
  if (!variants.length) return null;
  return (
    <div className="mt-3 min-w-0">
      <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-[0.14em] text-ink/55">Select variant</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-label={`Select variant for ${productName}`} className="mt-1.5 h-11 w-full min-w-0 rounded-md border border-ink/15 bg-white px-3 text-sm font-semibold text-ink outline-none transition hover:border-ink/30 focus:border-leaf focus:ring-2 focus:ring-leaf/20">
        {variants.map((variant) => <option key={variantId(variant)} value={variantId(variant)}>{variant.size}{variant.isAvailable === false ? " — Out of stock" : ""}</option>)}
      </select>
    </div>
  );
}

function PremiumProductCard({ product }) {
  const { activeVariants, selectedId, setSelectedId, selectedProduct } = useCardVariant(product);
  const stockLabel = selectedProduct.inStock === false ? "Out of stock" : "In stock";

  return (
    <motion.article initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.35 }} className="group flex h-full min-w-0 flex-col overflow-hidden rounded-md border border-ink/10 bg-white transition duration-300 hover:border-leaf/35">
      <div className="relative overflow-hidden bg-linen">
        <Link to={`/product/${product.slug}`} className="block aspect-[4/5.15] overflow-hidden"><SafeImage src={selectedProduct.image} alt={`${product.name}${selectedProduct.volume ? `, ${selectedProduct.volume}` : ""}`} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.045]" /></Link>
        <WishlistToggle product={product} className="absolute right-2.5 top-2.5 h-9 w-9 sm:right-3 sm:top-3" size={16} />
      </div>
      <div className="flex flex-1 flex-col p-3.5 sm:p-4 lg:p-5">
        <Link to={`/product/${product.slug}`} className="min-h-[2.7rem] overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] text-sm font-semibold leading-snug transition hover:text-leaf sm:min-h-[3rem] sm:text-base">{product.name}</Link>
        <VariantSelect productName={product.name} variants={activeVariants} value={selectedId} onChange={setSelectedId} />
        <p aria-live="polite" className={`mt-3 text-xs font-bold uppercase tracking-[0.16em] ${selectedProduct.inStock === false ? "text-clay" : "text-leaf"}`}>{stockLabel}</p>
        <div aria-live="polite" className="mt-auto"><ProductPrice product={selectedProduct} compact className="min-h-[4.25rem] pt-4" /></div>
        <AddToCartButton product={selectedProduct} className={`mt-4 ${staticCartClass}`} iconSize={16} />
      </div>
    </motion.article>
  );
}

function CatalogProductCard({ product }) {
  const tags = Array.isArray(product.tags) ? product.tags : [];
  const { activeVariants, selectedId, setSelectedId, selectedProduct } = useCardVariant(product);
  return (
    <motion.article initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.35 }} className="group flex h-full min-w-0 flex-col overflow-hidden rounded-md border border-ink/10 bg-white transition duration-300 hover:border-leaf/35">
      <div className="relative overflow-hidden bg-linen">
        <Link to={`/product/${product.slug}`} className="block aspect-[4/5] overflow-hidden"><SafeImage src={selectedProduct.image} alt={`${product.name}${selectedProduct.volume ? `, ${selectedProduct.volume}` : ""}`} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></Link>
        <WishlistToggle product={product} className="absolute right-2 top-2 h-9 w-9 sm:right-3 sm:top-3 sm:h-10 sm:w-10" />
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-4 lg:p-5">
        {tags.length > 0 && <div className="mb-2 hidden flex-wrap gap-2 sm:flex">{tags.slice(0, 2).map((tag) => <span key={tag} className="border border-ink/10 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink/60">{tag}</span>)}</div>}
        <Link to={`/product/${product.slug}`} className="block min-h-[2.7rem] overflow-hidden font-serif text-lg font-semibold leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] hover:text-leaf sm:text-xl lg:text-2xl">{product.name}</Link>
        <VariantSelect productName={product.name} variants={activeVariants} value={selectedId} onChange={setSelectedId} />
        <p aria-live="polite" className={`mt-3 text-xs font-bold uppercase tracking-[0.16em] ${selectedProduct.inStock === false ? "text-clay" : "text-leaf"}`}>{selectedProduct.inStock === false ? "Out of stock" : "In stock"}</p>
        <div aria-live="polite" className="mt-auto"><ProductPrice product={selectedProduct} compact className="pt-4" /></div>
        <AddToCartButton product={selectedProduct} className={`mt-3 sm:mt-5 ${staticCartClass}`} iconSize={16} />
      </div>
    </motion.article>
  );
}

export default function ProductCard({ product, variant = "catalog" }) {
  if (!product || typeof product !== "object" || !product.slug) return null;
  if (variant === "premium") return <PremiumProductCard product={product} />;
  return <CatalogProductCard product={product} />;
}

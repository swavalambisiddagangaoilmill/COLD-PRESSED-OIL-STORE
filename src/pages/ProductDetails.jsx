// Renders the ProductDetails page experience.
import { Check, Star } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import AddToCartModal from "../components/features/feedback/AddToCartModal.jsx";
import Breadcrumb from "../components/common/Breadcrumb.jsx";
import QuantitySelector from "../components/common/QuantitySelector.jsx";
import AddToCartButton from "../components/features/product/AddToCartButton.jsx";
import ProductGallery from "../components/features/product/ProductGallery.jsx";
import ProductPrice from "../components/features/product/ProductPrice.jsx";
import RelatedProducts from "../components/features/product/RelatedProducts.jsx";
import WishlistToggle from "../components/features/product/WishlistToggle.jsx";
import Container from "../components/ui/Container.jsx";
import { getProductBySlug } from "../services/catalogService.js";
import { readGuestSession, writeGuestSession } from "../utils/guestSession.js";

export default function ProductDetails() {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalQuantity, setModalQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    getProductBySlug(slug)
      .then((item) => { if (active) { setProduct(item); setMissing(!item); setSelectedVariantId(String(item?.variants?.find((variant) => variant.isActive !== false && variant.stock > 0)?._id || item?.variants?.find((variant) => variant.isActive !== false)?._id || "")); } })
      .catch(() => active && setMissing(true))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug]);

  if (!loading && missing) return <Navigate to="/404" replace />;
  if (loading || !product) return <section className="section-padding"><Container><p className="rounded-3xl bg-white p-10 text-center text-ink/60">Loading product...</p></Container></section>;

  const selectedVariant = product.variants?.find((variant) => String(variant._id || variant.id) === selectedVariantId);
  const selectedProduct = selectedVariant ? {
    ...product,
    variantId: selectedVariantId,
    volume: selectedVariant.size,
    sku: selectedVariant.sku,
    stock: selectedVariant.stock,
    stockLitres: selectedVariant.stock,
    availableQuantity: Math.floor((Number(selectedVariant.stock) + Number.EPSILON) / Number(selectedVariant.litres || parseFloat(selectedVariant.size))),
    price: selectedVariant.effectivePrice ?? selectedVariant.price,
    effectivePrice: selectedVariant.effectivePrice ?? selectedVariant.price,
    baseSellingPrice: selectedVariant.baseSellingPrice ?? selectedVariant.price,
    mrp: selectedVariant.appliedOffer ? (selectedVariant.baseSellingPrice ?? selectedVariant.price) : (selectedVariant.mrp ?? selectedVariant.price),
    appliedOffer: selectedVariant.appliedOffer || null,
    images: selectedVariant.images?.length ? selectedVariant.images : product.images,
    image: selectedVariant.images?.[0]?.url || product.image,
    gallery: (selectedVariant.images?.length ? selectedVariant.images : product.images || []).map((image) => image.url || image),
  } : product;

  const handleAdded = (details) => {
    const session = readGuestSession().data;
    writeGuestSession({ recentlyViewed: [product, ...session.recentlyViewed.filter((item) => item.id !== product.id)].slice(0, 8) });
    setModalQuantity(details?.quantity || quantity);
    setModalOpen(true);
  };

  return (
    <>
      <Breadcrumb items={[{ label: "Shop", href: "/shop" }, { label: product.name }]} />
      <section className="section-padding pt-10">
        <Container>
          <div className="grid gap-10 lg:grid-cols-2">
            <ProductGallery product={selectedProduct} />
            <div className="lg:pl-8">
              <div className="flex items-start justify-between gap-4"><p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">{product.category}</p><WishlistToggle product={product} className="h-12 w-12 shrink-0" size={21} /></div>
              <h1 className="mt-4 font-serif text-5xl font-semibold leading-tight lg:text-6xl">{product.name}</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/65">{product.description}</p>
              <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-ink/60"><Star size={17} className="fill-clay text-clay" /> {product.rating} rating · {selectedProduct.volume}</div>
              {product.variants?.length > 0 && <fieldset className="mt-6"><legend className="text-xs font-bold uppercase tracking-[0.2em] text-ink/65">Select size</legend><div className="mt-3 flex flex-wrap gap-3">{product.variants.filter((variant) => variant.isActive !== false).map((variant) => <button key={variant._id || variant.id} type="button" disabled={variant.stock < 1} onClick={() => { setSelectedVariantId(String(variant._id || variant.id)); setQuantity(1); }} className={`min-w-20 rounded-xl border px-4 py-3 text-sm font-bold transition ${selectedVariantId === String(variant._id || variant.id) ? "border-leaf bg-leaf text-white" : "border-ink/15 bg-white text-ink hover:border-leaf"} disabled:cursor-not-allowed disabled:opacity-40`}>{variant.size}{variant.stock < 1 ? " · Out" : ""}</button>)}</div></fieldset>}
              <p className={`mt-3 text-xs font-bold uppercase tracking-[0.16em] ${selectedProduct.stock === 0 ? "text-clay" : "text-leaf"}`}>{selectedProduct.stock === 0 ? "Out of stock" : selectedProduct.stock <= 8 ? "Low stock" : "In stock"}</p>
              <ProductPrice product={selectedProduct} className="mt-6" />
              <div className="sticky bottom-0 z-20 -mx-4 mt-8 flex flex-col gap-4 border-t border-ink/10 bg-cream/95 p-4 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:border-0 sm:bg-transparent sm:p-0">
                <QuantitySelector value={quantity} onChange={setQuantity} />
                <AddToCartButton product={selectedProduct} quantity={quantity} onAdded={handleAdded} className="min-h-14 flex-1 rounded-2xl px-7 text-base shadow-soft active:scale-[0.98] sm:min-h-[52px]" iconSize={20} />
              </div>
              <div className="mt-10 grid gap-3 sm:grid-cols-2">{product.benefits.map((benefit) => <div key={benefit} className="flex gap-3 rounded-2xl bg-white p-4"><Check size={19} className="mt-1 shrink-0 text-leaf" /><span className="font-semibold">{benefit}</span></div>)}</div>
            </div>
          </div>
          <div className="mt-16 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-3xl bg-white p-7"><h2 className="font-serif text-3xl font-semibold">Description</h2><p className="mt-4 text-lg leading-8 text-ink/65">{product.description} It is produced without chemical refining, packed for freshness, and suited for customers who want a more expressive cooking oil.</p></div>
            <div className="rounded-3xl bg-white p-7"><h2 className="font-serif text-3xl font-semibold">Specifications</h2><dl className="mt-5 grid gap-4 sm:grid-cols-2">{Object.entries(product.specifications).map(([key, value]) => <div key={key} className="rounded-2xl bg-linen p-4"><dt className="text-xs font-bold uppercase tracking-[0.16em] text-ink/45">{key}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl></div>
          </div>
          <RelatedProducts current={product} />
        </Container>
      </section>
      <AddToCartModal open={modalOpen} product={selectedProduct} quantity={modalQuantity} onClose={() => setModalOpen(false)} />
    </>
  );
}

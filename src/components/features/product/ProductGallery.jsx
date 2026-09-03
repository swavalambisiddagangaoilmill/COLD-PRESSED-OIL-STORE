// Renders a touch-friendly product image gallery with looping controls.
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import SafeImage from "../../common/SafeImage.jsx";

export default function ProductGallery({ product }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const images = product.gallery?.length ? product.gallery : [product.image];
  const active = images[activeIndex];

  const goTo = (index) => setActiveIndex((index + images.length) % images.length);

  useEffect(() => {
    setActiveIndex(0);
    setZoomed(false);
  }, [product.id, product.variantId]);

  return (
    <div className="grid gap-4 lg:grid-cols-[96px_1fr]">
      <div className="order-2 flex gap-3 overflow-x-auto pb-1 lg:order-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {images.map((image, index) => (
          <button
            key={image}
            type="button"
            onClick={() => goTo(index)}
            aria-label={`Show ${product.name} image ${index + 1}`}
            className={`h-20 w-20 shrink-0 overflow-hidden rounded-2xl border transition ${activeIndex === index ? "border-leaf ring-2 ring-leaf/15" : "border-ink/10 hover:border-leaf/50"}`}
          >
            <SafeImage src={image} alt={`${product.name} thumbnail ${index + 1}`} className="h-full w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
      <div className="order-1 lg:order-2">
        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-linen">
          <SafeImage key={active} src={active} alt={product.name} className={`h-full w-full object-cover transition duration-500 ${zoomed ? "scale-125 cursor-zoom-out" : "cursor-zoom-in"}`} onClick={() => setZoomed((current) => !current)} />
          <button type="button" aria-label="Previous image" onClick={() => goTo(activeIndex - 1)} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-sm transition hover:bg-leaf hover:text-white"><ChevronLeft size={19} /></button>
          <button type="button" aria-label="Next image" onClick={() => goTo(activeIndex + 1)} className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-sm transition hover:bg-leaf hover:text-white"><ChevronRight size={19} /></button>
          <button type="button" aria-label="Toggle image zoom" onClick={() => setZoomed((current) => !current)} className="absolute bottom-3 right-3 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-ink shadow-sm transition hover:bg-leaf hover:text-white"><Search size={18} /></button>
        </div>
      </div>
    </div>
  );
}




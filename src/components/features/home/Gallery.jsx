// Renders the dynamic gallery as an infinite, inspectable film strip.
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import SafeImage from "../../common/SafeImage.jsx";
import { fetchGalleryImages } from "../../../services/contentService.js";

export default function Gallery() {
  const [images, setImages] = useState([]);
  const [touching, setTouching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(null);
  const [zoomed, setZoomed] = useState(false);
  const touchStartRef = useRef(null);

  useEffect(() => {
    let active = true;
    fetchGalleryImages()
      .then((items) => { if (active) setImages(items.filter((item) => item.image)); })
      .catch(() => { if (active) setImages([]); });
    return () => { active = false; };
  }, []);

  const marqueeImages = useMemo(() => [...images, ...images], [images]);
  const activeImage = activeIndex === null ? null : images[activeIndex];

  const showImage = (index) => {
    setZoomed(false);
    setActiveIndex((index + images.length) % images.length);
  };

  const closeViewer = () => {
    setActiveIndex(null);
    setZoomed(false);
  };

  useEffect(() => {
    if (!activeImage) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event) => {
      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowLeft") showImage(activeIndex - 1);
      if (event.key === "ArrowRight") showImage(activeIndex + 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [activeImage, activeIndex]);

  const handleViewerTouchEnd = (event) => {
    const start = touchStartRef.current;
    const end = event.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !end || zoomed) return;
    const distance = end.clientX - start;
    if (Math.abs(distance) > 55) showImage(activeIndex + (distance < 0 ? 1 : -1));
  };

  if (!images.length) return null;

  return (
    <section className="overflow-hidden bg-cream py-10 md:py-12 xl:py-14">
      <div className="mx-auto mb-7 flex max-w-screen-2xl items-end justify-between gap-6 px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-clay">Inside the mill</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold text-ink sm:text-4xl">Frames from the making</h2>
        </div>
        <p className="hidden max-w-xs text-right text-sm leading-6 text-ink/50 md:block">Hover to pause. Select any frame to explore the complete gallery.</p>
      </div>
      <div
        className={`gallery-marquee relative overflow-hidden ${touching || activeImage ? "is-paused" : ""}`}
        aria-label="Oil mill gallery"
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") setTouching(true);
        }}
        onPointerUp={() => setTouching(false)}
        onPointerCancel={() => setTouching(false)}
        onPointerLeave={() => setTouching(false)}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-cream to-transparent sm:w-24" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-cream to-transparent sm:w-24" />
        <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.45 }} className="gallery-marquee-track flex w-max gap-3 px-4 sm:gap-4 sm:px-6 lg:gap-5 lg:px-8">
          {marqueeImages.map((item, index) => {
            const imageIndex = index % images.length;
            const duplicate = index >= images.length;
            return (
              <button
                key={`${item.id || item._id}-${index}`}
                type="button"
                onClick={() => showImage(imageIndex)}
                aria-label={`Open ${item.alt || item.title || "gallery image"} ${imageIndex + 1} of ${images.length}`}
                aria-hidden={duplicate || undefined}
                tabIndex={duplicate ? -1 : 0}
                className={`gallery-card group relative shrink-0 overflow-hidden rounded-[1.35rem] border border-white/70 bg-white text-left shadow-[0_10px_35px_rgb(64_46_32_/_0.09)] transition duration-500 ${imageIndex % 3 === 1 ? "mt-7 w-[50vw] max-w-[340px] sm:w-[34vw] lg:w-[25vw]" : "w-[42vw] max-w-[280px] sm:w-[29vw] lg:w-[20vw]"}`}
              >
                <span className={`block overflow-hidden bg-linen ${imageIndex % 3 === 1 ? "aspect-[5/4]" : "aspect-[4/5]"}`}>
                  <SafeImage src={item.image} alt={item.alt || item.title || "Swavalambi Siddaganga Oil Mill gallery image"} loading="lazy" className="gallery-card-image h-full w-full object-cover transition duration-300" />
                </span>
                <span className="absolute inset-0 grid place-items-center bg-ink/0 text-white transition group-hover:bg-ink/20 group-focus-visible:bg-ink/20">
                  <span className="grid h-12 w-12 scale-90 place-items-center rounded-full border border-white/60 bg-white/90 text-ink opacity-0 shadow-xl backdrop-blur transition group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"><Search size={18} /></span>
                </span>
                <span className="absolute bottom-3 left-3 rounded-full bg-black/38 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-white opacity-0 backdrop-blur transition group-hover:opacity-100">View frame {imageIndex + 1}</span>
              </button>
            );
          })}
        </motion.div>
      </div>

      {createPortal(
        <AnimatePresence>
          {activeImage && (
            <motion.div className="fixed inset-0 z-[100] grid place-items-center bg-[#100d0a]/97 p-3 backdrop-blur-xl sm:p-6" role="dialog" aria-modal="true" aria-label="Gallery image viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeViewer}>
              <div className="absolute left-4 top-4 z-20 text-white sm:left-6 sm:top-6">
                <p className="text-[9px] font-black uppercase tracking-[0.28em] text-[#d5a54a]">Inside the mill</p>
                <p className="mt-1 hidden max-w-md truncate font-serif text-xl sm:block">{activeImage.title || activeImage.alt || "Oil mill gallery"}</p>
              </div>
              <button type="button" onClick={closeViewer} aria-label="Close gallery" className="absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-6 sm:top-6"><X size={21} /></button>
              <button type="button" onClick={(event) => { event.stopPropagation(); showImage(activeIndex - 1); }} aria-label="Previous image" className="absolute left-3 top-1/2 z-20 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-lg transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-6"><ChevronLeft size={23} /></button>
              <motion.div
                key={activeImage.id || activeImage._id || activeImage.image}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative flex h-[70vh] w-full max-w-6xl touch-pan-y items-center justify-center overflow-hidden sm:h-[74vh]"
                onClick={(event) => event.stopPropagation()}
                onTouchStart={(event) => { touchStartRef.current = event.touches[0]; }}
                onTouchEnd={handleViewerTouchEnd}
              >
                <SafeImage src={activeImage.image} alt={activeImage.alt || activeImage.title || "Oil mill gallery image"} className={`max-h-full max-w-full select-none object-contain transition-transform duration-300 ${zoomed ? "cursor-zoom-out scale-[1.6]" : "cursor-zoom-in scale-100"}`} draggable="false" onClick={() => setZoomed((current) => !current)} />
              </motion.div>
              <button type="button" onClick={(event) => { event.stopPropagation(); showImage(activeIndex + 1); }} aria-label="Next image" className="absolute right-3 top-1/2 z-20 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-lg transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-6"><ChevronRight size={23} /></button>
              <div className="absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/15 bg-black/45 p-2 text-white shadow-2xl backdrop-blur-xl sm:bottom-5 sm:gap-3">
                <div className="flex max-w-[62vw] gap-1.5 overflow-x-auto sm:max-w-[70vw] sm:gap-2">
                  {images.map((item, index) => (
                    <button key={item.id || item._id || item.image} type="button" onClick={(event) => { event.stopPropagation(); showImage(index); }} aria-label={`Show image ${index + 1}`} className={`h-11 w-11 shrink-0 overflow-hidden rounded-lg border-2 transition sm:h-14 sm:w-14 ${activeIndex === index ? "border-[#d5a54a] opacity-100" : "border-transparent opacity-45 hover:opacity-90"}`}>
                      <SafeImage src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
                <span className="hidden h-7 w-px bg-white/20 sm:block" />
                <span className="min-w-10 text-center text-[10px] font-bold tabular-nums text-white/75">{activeIndex + 1}/{images.length}</span>
                <button type="button" onClick={(event) => { event.stopPropagation(); setZoomed((current) => !current); }} aria-label={zoomed ? "Zoom out" : "Zoom in"} className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{zoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </section>
  );
}

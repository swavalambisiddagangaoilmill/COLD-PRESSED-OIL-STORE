// Renders the dynamic gallery as an infinite, inspectable film strip.
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import SafeImage from "../../common/SafeImage.jsx";
import { fetchGalleryImages } from "../../../services/contentService.js";

export default function Gallery() {
  const [images, setImages] = useState([]);
  const [paused, setPaused] = useState(false);
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
    setPaused(true);
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
      <div
        className={`gallery-marquee relative overflow-hidden ${paused ? "is-paused" : ""}`}
        aria-label="Oil mill gallery"
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") setPaused(true);
        }}
      >
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
                className="gallery-card group relative w-[42vw] max-w-[280px] shrink-0 overflow-hidden rounded-xl border border-ink/10 bg-white text-left shadow-sm transition duration-300 sm:w-[30vw] md:w-[28vw] lg:w-[22vw] xl:w-[18vw] 2xl:w-[15vw]"
              >
                <span className="block aspect-[4/5] overflow-hidden bg-linen">
                  <SafeImage src={item.image} alt={item.alt || item.title || "Swavalambi Siddaganga Oil Mill gallery image"} loading="lazy" className="gallery-card-image h-full w-full object-cover transition duration-300" />
                </span>
                <span className="absolute inset-0 grid place-items-center bg-ink/0 text-white transition group-hover:bg-ink/20 group-focus-visible:bg-ink/20">
                  <span className="grid h-11 w-11 scale-90 place-items-center rounded-full bg-white/90 text-ink opacity-0 shadow-lg transition group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"><Search size={18} /></span>
                </span>
              </button>
            );
          })}
        </motion.div>
        <button type="button" onClick={() => setPaused((current) => !current)} aria-label={paused ? "Resume gallery movement" : "Pause gallery movement"} className="absolute bottom-3 right-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/55 bg-white/90 text-ink shadow-md backdrop-blur transition hover:bg-leaf hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf sm:right-6 lg:right-8">
          {paused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
        </button>
      </div>

      {createPortal(
        <AnimatePresence>
          {activeImage && (
            <motion.div className="fixed inset-0 z-[100] grid place-items-center bg-ink/95 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="Gallery image viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeViewer}>
              <button type="button" onClick={closeViewer} aria-label="Close gallery" className="absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-6 sm:top-6"><X size={21} /></button>
              <button type="button" onClick={(event) => { event.stopPropagation(); showImage(activeIndex - 1); }} aria-label="Previous image" className="absolute left-3 top-1/2 z-20 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-lg transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-6"><ChevronLeft size={23} /></button>
              <motion.div
                key={activeImage.id || activeImage._id || activeImage.image}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative flex h-[82vh] w-full max-w-6xl touch-pan-y items-center justify-center overflow-hidden"
                onClick={(event) => event.stopPropagation()}
                onTouchStart={(event) => { touchStartRef.current = event.touches[0]; }}
                onTouchEnd={handleViewerTouchEnd}
              >
                <SafeImage src={activeImage.image} alt={activeImage.alt || activeImage.title || "Oil mill gallery image"} className={`max-h-full max-w-full select-none object-contain transition-transform duration-300 ${zoomed ? "cursor-zoom-out scale-[1.6]" : "cursor-zoom-in scale-100"}`} draggable="false" onClick={() => setZoomed((current) => !current)} />
              </motion.div>
              <button type="button" onClick={(event) => { event.stopPropagation(); showImage(activeIndex + 1); }} aria-label="Next image" className="absolute right-3 top-1/2 z-20 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-lg transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-6"><ChevronRight size={23} /></button>
              <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/15 bg-black/35 px-3 py-2 text-white backdrop-blur sm:bottom-6">
                <span className="min-w-12 text-center text-xs font-bold tracking-[0.12em]">{activeIndex + 1} / {images.length}</span>
                <span className="h-5 w-px bg-white/20" />
                <button type="button" onClick={(event) => { event.stopPropagation(); setZoomed((current) => !current); }} aria-label={zoomed ? "Zoom out" : "Zoom in"} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{zoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </section>
  );
}

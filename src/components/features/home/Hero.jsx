import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getActiveCarousel } from "../../../services/carouselService.js";

const AUTOPLAY_DELAY = 6000;
const SWIPE_THRESHOLD = 52;
const normalizeSlides = (items) => items.map((item) => ({ id: item._id, name: item.name || "Homepage promotion", image: item.image?.url || item.desktopImage?.url || item.imageUrl, width: item.image?.width || item.desktopImage?.width || 1920, height: item.image?.height || item.desktopImage?.height || 1080 })).filter((slide) => slide.id && slide.image);

export default function Hero() {
  const [slides, setSlides] = useState([]);
  const slideCount = slides.length;
  const renderedSlides = useMemo(() => slideCount ? [slides[slideCount - 1], ...slides, slides[0]] : [], [slideCount, slides]);
  const [trackIndex, setTrackIndex] = useState(1);
  const [transitioning, setTransitioning] = useState(true);
  const [dragOffset, setDragOffset] = useState(0);
  const [interactionCycle, setInteractionCycle] = useState(0);
  const [paused, setPaused] = useState({ hover: false, focus: false, hidden: false, outside: false, drag: false });
  const [reducedMotion, setReducedMotion] = useState(false);
  const rootRef = useRef(null);
  const pointerRef = useRef(null);
  const activeIndex = slideCount ? (trackIndex - 1 + slideCount) % slideCount : 0;
  const isPaused = reducedMotion || Object.values(paused).some(Boolean);
  const loadSlides = useCallback(() => getActiveCarousel().then((items) => { setSlides(normalizeSlides(items)); setTransitioning(false); setTrackIndex(1); }), []);

  useEffect(() => { loadSlides(); window.addEventListener("ss-oil-mill-promotions-changed", loadSlides); return () => window.removeEventListener("ss-oil-mill-promotions-changed", loadSlides); }, [loadSlides]);
  const updatePause = useCallback((reason, value) => setPaused((current) => current[reason] === value ? current : { ...current, [reason]: value }), []);
  const moveBy = useCallback((amount, manual = true) => { if (slideCount < 2) return; setTransitioning(!reducedMotion); setTrackIndex((current) => current + amount); if (manual) setInteractionCycle((cycle) => cycle + 1); }, [reducedMotion, slideCount]);
  const goTo = useCallback((index) => { setTransitioning(!reducedMotion); setTrackIndex(index + 1); setInteractionCycle((cycle) => cycle + 1); }, [reducedMotion]);

  useEffect(() => { const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const sync = () => setReducedMotion(media.matches); sync(); media.addEventListener("change", sync); return () => media.removeEventListener("change", sync); }, []);
  useEffect(() => { const sync = () => updatePause("hidden", document.hidden); sync(); document.addEventListener("visibilitychange", sync); return () => document.removeEventListener("visibilitychange", sync); }, [updatePause]);
  useEffect(() => { const observer = new IntersectionObserver(([entry]) => updatePause("outside", !entry.isIntersecting), { threshold: 0.2 }); if (rootRef.current) observer.observe(rootRef.current); return () => observer.disconnect(); }, [updatePause]);
  useEffect(() => { if (isPaused || slideCount < 2) return undefined; const timer = window.setTimeout(() => moveBy(1, false), AUTOPLAY_DELAY); return () => window.clearTimeout(timer); }, [activeIndex, interactionCycle, isPaused, moveBy, slideCount]);

  const handleTransitionEnd = () => { if (trackIndex === 0) { setTransitioning(false); setTrackIndex(slideCount); } else if (trackIndex === slideCount + 1) { setTransitioning(false); setTrackIndex(1); } };
  const handlePointerDown = (event) => { if (event.button !== undefined && event.button !== 0) return; pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false }; updatePause("drag", true); };
  const handlePointerMove = (event) => { const pointer = pointerRef.current; if (!pointer || pointer.id !== event.pointerId) return; const deltaX = event.clientX - pointer.x; const deltaY = event.clientY - pointer.y; if (!pointer.horizontal && Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) { pointer.horizontal = true; event.currentTarget.setPointerCapture?.(event.pointerId); } if (!pointer.horizontal) return; event.preventDefault(); setTransitioning(false); setDragOffset(deltaX * 0.82); };
  const finishPointer = (event) => { const pointer = pointerRef.current; if (!pointer || pointer.id !== event.pointerId) return; const distance = event.clientX - pointer.x; pointerRef.current = null; setDragOffset(0); updatePause("drag", false); if (pointer.horizontal && Math.abs(distance) >= SWIPE_THRESHOLD) moveBy(distance < 0 ? 1 : -1); else setTransitioning(true); };

  if (!slideCount) return <section className="hero-carousel" aria-label="Homepage promotions"><div className="hero-carousel__viewport bg-linen" /></section>;
  return <section ref={rootRef} className="hero-carousel" aria-label="Homepage promotions" aria-roledescription="carousel" onMouseEnter={() => updatePause("hover", true)} onMouseLeave={() => updatePause("hover", false)} onFocusCapture={() => updatePause("focus", true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) updatePause("focus", false); }} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); moveBy(-1); } if (event.key === "ArrowRight") { event.preventDefault(); moveBy(1); } }}>
    <div className="hero-carousel__viewport" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishPointer} onPointerCancel={finishPointer}>
      <div className="hero-carousel__track" onTransitionEnd={handleTransitionEnd} style={{ transform: `translate3d(calc(${-trackIndex * 100}% + ${dragOffset}px), 0, 0)`, transitionDuration: transitioning ? undefined : "0ms" }}>
        {renderedSlides.map((slide, index) => <div key={`${slide.id}-${index}`} className="hero-carousel__slide" role="group" aria-roledescription="slide" aria-label={`Slide ${(index - 1 + slideCount) % slideCount + 1} of ${slideCount}`} aria-hidden={index !== trackIndex}><img src={slide.image} alt={slide.name} width={slide.width} height={slide.height} loading={index === 1 ? "eager" : "lazy"} fetchPriority={index === 1 ? "high" : "auto"} draggable="false" onError={() => setSlides((current) => current.filter((item) => item.id !== slide.id))} /></div>)}
      </div>
      {slideCount > 1 && <><button className="hero-carousel__arrow hero-carousel__arrow--previous" type="button" aria-label="Previous slide" onClick={() => moveBy(-1)}><ChevronLeft aria-hidden="true" /></button><button className="hero-carousel__arrow hero-carousel__arrow--next" type="button" aria-label="Next slide" onClick={() => moveBy(1)}><ChevronRight aria-hidden="true" /></button></>}
      <div className="hero-carousel__pagination" aria-label="Choose a promotion">{slides.map((slide, index) => <button key={slide.id} type="button" aria-label={`Go to slide ${index + 1}`} aria-current={index === activeIndex ? "true" : undefined} onClick={() => goTo(index)} className="hero-carousel__dot-button"><span className="hero-carousel__dot">{index === activeIndex && !isPaused && <svg key={`${activeIndex}-${interactionCycle}`} className="hero-carousel__progress" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" /></svg>}</span></button>)}</div>
    </div>
  </section>;
}

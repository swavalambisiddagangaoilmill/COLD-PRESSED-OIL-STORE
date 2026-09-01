import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getActiveCarousel } from "../../../services/carouselService.js";

const AUTOPLAY_DELAY = 6000;
const SWIPE_THRESHOLD = 52;

const FALLBACK_SLIDES = {
  desktop: [
    { id: "badam-desktop", name: "Cold pressed almond oil", image: "/carousel/badam-desktop.png" },
    { id: "flaxseed-desktop", name: "Cold pressed flaxseed oil", image: "/carousel/flaxseed-desktop.png" },
    { id: "herbal-desktop", name: "Herbal oil", image: "/carousel/herbal-desktop.png" },
    { id: "sunflower-desktop", name: "Cold pressed sunflower oil", image: "/carousel/sunflower-desktop.png" },
  ],
  mobile: [
    { id: "badam-mobile", name: "Cold pressed almond oil", image: "/carousel/badam-mobile.png" },
    { id: "flaxseed-mobile", name: "Cold pressed flaxseed oil", image: "/carousel/flaxseed-mobile.png" },
    { id: "herbal-mobile", name: "Herbal oil", image: "/carousel/herbal-mobile.png" },
  ],
};

function managedSlides(items, category) {
  return items
    .filter((item) => (item.category || "desktop") === category && item.imageUrl)
    .map((item, index) => ({ id: item._id || `${category}-${index}`, name: `${category === "mobile" ? "Mobile" : "Desktop"} homepage banner ${index + 1}`, image: item.imageUrl }));
}

export default function Hero() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const [remoteItems, setRemoteItems] = useState([]);
  const category = isDesktop ? "desktop" : "mobile";
  const slides = useMemo(() => {
    const configured = managedSlides(remoteItems, category);
    return configured.length ? configured : FALLBACK_SLIDES[category];
  }, [category, remoteItems]);
  const slideCount = slides.length;
  const renderedSlides = useMemo(() => [slides[slideCount - 1], ...slides, slides[0]], [slideCount, slides]);
  const [trackIndex, setTrackIndex] = useState(1);
  const [transitioning, setTransitioning] = useState(true);
  const [dragOffset, setDragOffset] = useState(0);
  const [interactionCycle, setInteractionCycle] = useState(0);
  const [paused, setPaused] = useState({ hover: false, focus: false, hidden: false, outside: false, drag: false });
  const [reducedMotion, setReducedMotion] = useState(false);
  const rootRef = useRef(null);
  const pointerRef = useRef(null);

  const activeIndex = (trackIndex - 1 + slideCount) % slideCount;
  const isPaused = reducedMotion || Object.values(paused).some(Boolean);
  const updatePause = useCallback((reason, value) => setPaused((current) => (current[reason] === value ? current : { ...current, [reason]: value })), []);
  const moveBy = useCallback((amount, manual = true) => {
    setTransitioning(!reducedMotion);
    setTrackIndex((current) => current + amount);
    if (manual) setInteractionCycle((cycle) => cycle + 1);
  }, [reducedMotion]);
  const goTo = useCallback((index) => {
    setTransitioning(!reducedMotion);
    setTrackIndex(index + 1);
    setInteractionCycle((cycle) => cycle + 1);
  }, [reducedMotion]);

  useEffect(() => {
    let active = true;
    const load = () => getActiveCarousel().then((items) => { if (active) setRemoteItems(items); });
    load();
    window.addEventListener("ss-oil-mill-promotions-changed", load);
    return () => { active = false; window.removeEventListener("ss-oil-mill-promotions-changed", load); };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => { setTransitioning(false); setTrackIndex(1); }, [category, slides]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    const sync = () => updatePause("hidden", document.hidden);
    sync(); document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [updatePause]);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => updatePause("outside", !entry.isIntersecting), { threshold: 0.2 });
    if (rootRef.current) observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [updatePause]);
  useEffect(() => {
    if (isPaused || slideCount < 2) return undefined;
    const timer = window.setTimeout(() => moveBy(1, false), AUTOPLAY_DELAY);
    return () => window.clearTimeout(timer);
  }, [activeIndex, interactionCycle, isPaused, moveBy, slideCount]);

  const handleTransitionEnd = () => {
    if (trackIndex === 0) { setTransitioning(false); setTrackIndex(slideCount); }
    else if (trackIndex === slideCount + 1) { setTransitioning(false); setTrackIndex(1); }
  };
  const handlePointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false };
    updatePause("drag", true);
  };
  const handlePointerMove = (event) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    if (!pointer.horizontal && Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
      pointer.horizontal = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (!pointer.horizontal) return;
    event.preventDefault(); setTransitioning(false); setDragOffset(deltaX * 0.82);
  };
  const finishPointer = (event) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const distance = event.clientX - pointer.x;
    pointerRef.current = null; setDragOffset(0); updatePause("drag", false);
    if (pointer.horizontal && Math.abs(distance) >= SWIPE_THRESHOLD) moveBy(distance < 0 ? 1 : -1);
    else setTransitioning(true);
  };
  const useFallbackImage = (event, realIndex) => {
    if (event.currentTarget.dataset.fallbackApplied) return;
    event.currentTarget.dataset.fallbackApplied = "true";
    event.currentTarget.src = FALLBACK_SLIDES[category][realIndex % FALLBACK_SLIDES[category].length].image;
  };

  return (
    <section ref={rootRef} className="hero-carousel" aria-label="Homepage promotions" aria-roledescription="carousel" onMouseEnter={() => updatePause("hover", true)} onMouseLeave={() => updatePause("hover", false)} onFocusCapture={() => updatePause("focus", true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) updatePause("focus", false); }} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); moveBy(-1); } if (event.key === "ArrowRight") { event.preventDefault(); moveBy(1); } }}>
      <div className="hero-carousel__viewport" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishPointer} onPointerCancel={finishPointer}>
        <div className="hero-carousel__track" onTransitionEnd={handleTransitionEnd} style={{ transform: `translate3d(calc(${-trackIndex * 100}% + ${dragOffset}px), 0, 0)`, transitionDuration: transitioning ? undefined : "0ms" }}>
          {renderedSlides.map((slide, index) => {
            const realIndex = (index - 1 + slideCount) % slideCount;
            const priority = index === 1;
            return <div key={`${slide.id}-${index}`} className="hero-carousel__slide" role="group" aria-roledescription="slide" aria-label={`Slide ${realIndex + 1} of ${slideCount}`} aria-hidden={index !== trackIndex}>
              <img src={slide.image} alt={slide.name} width={category === "desktop" ? "1920" : "1080"} height={category === "desktop" ? "700" : "1350"} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} draggable="false" onError={(event) => useFallbackImage(event, realIndex)} />
            </div>;
          })}
        </div>
        {slideCount > 1 && <><button className="hero-carousel__arrow hero-carousel__arrow--previous" type="button" aria-label="Previous slide" onClick={() => moveBy(-1)}><ChevronLeft aria-hidden="true" /></button><button className="hero-carousel__arrow hero-carousel__arrow--next" type="button" aria-label="Next slide" onClick={() => moveBy(1)}><ChevronRight aria-hidden="true" /></button></>}
        <div className="hero-carousel__pagination" aria-label="Choose a promotion">{slides.map((slide, index) => <button key={slide.id} type="button" aria-label={`Go to slide ${index + 1}`} aria-current={index === activeIndex ? "true" : undefined} onClick={() => goTo(index)} className="hero-carousel__dot-button"><span className="hero-carousel__dot">{index === activeIndex && !isPaused && <svg key={`${activeIndex}-${interactionCycle}`} className="hero-carousel__progress" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" /></svg>}</span></button>)}</div>
      </div>
    </section>
  );
}

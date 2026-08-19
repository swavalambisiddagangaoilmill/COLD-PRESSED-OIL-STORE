// Shared CinematicHero component used across pages.
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";

export const OIL_MILL_HERO_VIDEO = "https://res.cloudinary.com/lxlsemiu/video/upload/v1787124119/ss-oil-mill/videos/swavalambi-oil-mill-glimpse.mp4";
export const OIL_MILL_HERO_POSTER = "/media/swavalambi-oil-mill-glimpse-poster.webp";

export default function CinematicHero({ eyebrow, title, text, image, video, posterLabel, contentVisible = true }) {
  const heroRef = useRef(null);
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState(null);
  const lastTapRef = useRef({ time: 0, side: null });
  const feedbackTimerRef = useRef(null);
  const videoAvailable = Boolean(video) && !videoFailed;

  const seekBy = (seconds) => {
    const element = videoRef.current;
    if (!element || !Number.isFinite(element.duration)) return;
    element.currentTime = Math.min(element.duration, Math.max(0, element.currentTime + seconds));
    setSeekFeedback(seconds);
    window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setSeekFeedback(null), 650);
  };

  const handleDoubleTap = (event) => {
    if (event.target.closest("button")) return;
    const touch = event.changedTouches[0];
    const bounds = heroRef.current?.getBoundingClientRect();
    if (!touch || !bounds) return;
    const side = touch.clientX < bounds.left + bounds.width / 2 ? "left" : "right";
    const now = Date.now();
    const previous = lastTapRef.current;
    if (previous.side === side && now - previous.time < 320) {
      event.preventDefault();
      seekBy(side === "left" ? -10 : 10);
      lastTapRef.current = { time: 0, side: null };
      return;
    }
    lastTapRef.current = { time: now, side };
  };

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return undefined;

    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: "200px 0px", threshold: 0.01 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!videoAvailable || !isVisible) return undefined;

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const constrainedConnection = connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType);
    if (prefersReducedMotion || constrainedConnection) return undefined;

    const startLoading = () => setShouldLoadVideo(true);
    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(startLoading, { timeout: 1200 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(startLoading, 500);
    return () => window.clearTimeout(timeoutId);
  }, [isVisible, videoAvailable]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !videoReady) return;
    if (isVisible) element.play().catch(() => {});
    else element.pause();
  }, [isVisible, videoReady]);

  useEffect(() => () => window.clearTimeout(feedbackTimerRef.current), []);

  return (
    <section className="w-full pt-3 sm:pt-4">
      <motion.div
        ref={heroRef}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="group relative aspect-video w-full touch-manipulation overflow-hidden bg-ink shadow-soft"
        onTouchEnd={handleDoubleTap}
      >
        <img
          src={image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
        {videoAvailable && shouldLoadVideo && (
          <video
            ref={videoRef}
            src={video}
            poster={image}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${videoReady ? "opacity-100" : "opacity-0"}`}
            autoPlay
            loop
            muted={muted}
            playsInline
            preload="none"
            controls={false}
            controlsList="nodownload nofullscreen noremoteplayback"
            disablePictureInPicture
            onContextMenu={(event) => event.preventDefault()}
            onCanPlay={() => setVideoReady(true)}
            onError={() => {
              setVideoFailed(true);
              setVideoReady(false);
            }}
            aria-hidden="true"
          />
        )}
        {videoAvailable && shouldLoadVideo && !videoReady && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center" role="status" aria-live="polite">
            <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/35 border-t-white shadow-sm" />
            <span className="sr-only">Loading oil mill video</span>
          </div>
        )}
        {contentVisible && <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/52 to-ink/16" />}
        {videoAvailable && videoReady && (
          <button
            type="button"
            aria-label={muted ? "Unmute hero video" : "Mute hero video"}
            className="absolute left-5 top-5 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-white/12 text-white backdrop-blur transition hover:bg-white/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:left-8 sm:top-8"
            onClick={() => setMuted((current) => !current)}
          >
            {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
          </button>
        )}
        {videoAvailable && videoReady && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-between px-5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 md:flex lg:px-8">
            <button type="button" onClick={() => seekBy(-10)} aria-label="Go back 10 seconds" className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full border border-white/25 bg-black/45 text-white shadow-lg backdrop-blur transition hover:scale-105 hover:bg-black/65 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <RotateCcw size={22} aria-hidden="true" />
              <span className="absolute text-[9px] font-black">10</span>
            </button>
            <button type="button" onClick={() => seekBy(10)} aria-label="Go forward 10 seconds" className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full border border-white/25 bg-black/45 text-white shadow-lg backdrop-blur transition hover:scale-105 hover:bg-black/65 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <RotateCw size={22} aria-hidden="true" />
              <span className="absolute text-[9px] font-black">10</span>
            </button>
          </div>
        )}
        {seekFeedback && (
          <div className={`pointer-events-none absolute ${seekFeedback < 0 ? "left-1/4" : "right-1/4"} top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/55 px-4 py-2 text-sm font-bold text-white backdrop-blur`} aria-live="polite">
            {seekFeedback > 0 ? "+10 sec" : "-10 sec"}
          </div>
        )}
        {contentVisible && (
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12 xl:px-10 2xl:px-12">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/72">{eyebrow}</p>
            <h1 className="mt-4 max-w-4xl font-serif text-5xl font-semibold leading-none text-white sm:text-6xl lg:text-7xl">
              {title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">{text}</p>
          </div>
        )}
        {contentVisible && posterLabel && (
          <div className="absolute right-5 top-5 rounded-full border border-white/25 bg-white/12 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white backdrop-blur sm:right-8 sm:top-8">
            {posterLabel}
          </div>
        )}
      </motion.div>
    </section>
  );
}

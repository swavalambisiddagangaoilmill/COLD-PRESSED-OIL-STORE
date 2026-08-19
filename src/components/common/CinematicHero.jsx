// Shared CinematicHero component used across pages.
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Maximize2, Minimize2, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";

export const OIL_MILL_HERO_VIDEO = "https://res.cloudinary.com/lxlsemiu/video/upload/v1787124119/ss-oil-mill/videos/swavalambi-oil-mill-glimpse.mp4";
export const OIL_MILL_HERO_POSTER = "/media/swavalambi-oil-mill-glimpse-poster.webp";

function formatTime(value) {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function CinematicHero({ eyebrow, title, text, image, video, posterLabel, contentVisible = true }) {
  const heroRef = useRef(null);
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState(null);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const lastTapRef = useRef({ time: 0, side: null });
  const feedbackTimerRef = useRef(null);
  const tapTimerRef = useRef(null);
  const videoAvailable = Boolean(video) && !videoFailed;

  const seekBy = (seconds) => {
    const element = videoRef.current;
    if (!element || !Number.isFinite(element.duration)) return;
    element.currentTime = Math.min(element.duration, Math.max(0, element.currentTime + seconds));
    setSeekFeedback(seconds);
    window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setSeekFeedback(null), 650);
  };

  const togglePlayback = () => {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) element.play().catch(() => {});
    else element.pause();
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) await heroRef.current?.requestFullscreen?.();
    else await document.exitFullscreen?.();
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
      window.clearTimeout(tapTimerRef.current);
      seekBy(side === "left" ? -10 : 10);
      lastTapRef.current = { time: 0, side: null };
      return;
    }
    lastTapRef.current = { time: now, side };
    tapTimerRef.current = window.setTimeout(togglePlayback, 320);
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

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(document.fullscreenElement === heroRef.current);
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(feedbackTimerRef.current);
    window.clearTimeout(tapTimerRef.current);
  }, []);

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
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
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
          <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black/75 via-transparent to-black/10 opacity-100 transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            <div className="absolute inset-x-0 top-1/2 hidden -translate-y-1/2 items-center justify-between px-[8%] md:flex">
              <button type="button" onClick={() => seekBy(-10)} aria-label="Go back 10 seconds" className="pointer-events-auto grid h-16 w-16 place-items-center rounded-full border border-white/20 bg-black/35 text-white shadow-2xl backdrop-blur-xl transition hover:scale-110 hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                <RotateCcw size={28} strokeWidth={1.7} aria-hidden="true" />
                <span className="absolute text-[10px] font-black">10</span>
              </button>
              <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause video" : "Play video"} className="pointer-events-auto grid h-20 w-20 place-items-center rounded-full border border-white/25 bg-white/90 text-ink shadow-2xl transition hover:scale-105 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40">
                {playing ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" className="ml-1" />}
              </button>
              <button type="button" onClick={() => seekBy(10)} aria-label="Go forward 10 seconds" className="pointer-events-auto grid h-16 w-16 place-items-center rounded-full border border-white/20 bg-black/35 text-white shadow-2xl backdrop-blur-xl transition hover:scale-110 hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                <RotateCw size={28} strokeWidth={1.7} aria-hidden="true" />
                <span className="absolute text-[10px] font-black">10</span>
              </button>
            </div>
            <div className="pointer-events-auto absolute inset-x-0 bottom-0 px-3 pb-3 sm:px-5 sm:pb-4 lg:px-7 lg:pb-5">
              <input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={(event) => { if (videoRef.current) videoRef.current.currentTime = Number(event.target.value); }} aria-label="Video progress" className="cinematic-progress block w-full" style={{ "--video-progress": duration ? `${(currentTime / duration) * 100}%` : "0%" }} />
              <div className="mt-2 flex items-center gap-2 text-white sm:gap-3">
                <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause video" : "Play video"} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
                <button type="button" aria-label={muted ? "Unmute video" : "Mute video"} onClick={() => setMuted((current) => !current)} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
                <span className="font-mono text-[11px] font-semibold tabular-nums text-white/85 sm:text-xs">{formatTime(currentTime)} <span className="text-white/45">/</span> {formatTime(duration)}</span>
                <span className="ml-auto hidden text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 sm:block">Oil mill glimpse</span>
                <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} className="ml-auto grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:ml-0">{fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
              </div>
            </div>
          </div>
        )}
        {seekFeedback && (
          <div className={`pointer-events-none absolute ${seekFeedback < 0 ? "left-[18%]" : "right-[18%]"} top-1/2 z-30 grid h-20 w-20 -translate-y-1/2 animate-pulse place-items-center rounded-full border border-white/25 bg-black/55 text-white shadow-2xl backdrop-blur-xl`} aria-live="polite">
            <span className="text-center text-xs font-black">{seekFeedback > 0 ? "+10" : "−10"}<span className="block text-[9px] font-semibold uppercase tracking-wider text-white/65">seconds</span></span>
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

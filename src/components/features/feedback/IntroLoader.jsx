import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const EASE_OUT = [0.16, 1, 0.3, 1];
const EASE_IN_OUT = [0.76, 0, 0.24, 1];
const INTRO_DURATION = 2100;
const EXIT_DURATION = 360;

const splashImages = [
  { src: "/basavanna.webp", alt: "Basavanna", size: "side" },
  { src: "/logo.webp", alt: "Swavalambi Siddaganga Oil Mill logo", size: "main" },
  { src: "/drshivkumarswamiji.webp", alt: "Dr Shivakumara Swamiji", size: "side" },
];

function Background() {
  return (
    <div className="absolute inset-0 bg-cream">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,248,239,0.98)_0%,rgba(248,242,230,0.96)_58%,rgba(230,215,185,0.82)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,153,51,0.14)_0%,rgba(255,153,51,0.05)_36%,transparent_70%)]" />
    </div>
  );
}

function IntroScreen({ reduced }) {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center"
      initial={{ opacity: 0, scale: reduced ? 1 : 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduced ? 0.2 : 0.72, ease: EASE_OUT }}
    >
      <div className="flex w-full max-w-[520px] items-center justify-center gap-3 sm:gap-5">
        {splashImages.map((image) => {
          const main = image.size === "main";
          return (
            <motion.div
              key={image.src}
              className={`${main ? "h-28 w-28 sm:h-36 sm:w-36 md:h-40 md:w-40" : "h-20 w-20 sm:h-28 sm:w-28 md:h-32 md:w-32"} rounded-full border border-brand/30 bg-white p-2 shadow-soft ring-1 ring-white/70`}
              initial={{ opacity: 0, scale: reduced ? 1 : 0.94, y: reduced ? 0 : 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: reduced ? 0.2 : 0.68, ease: EASE_OUT }}
            >
              <img src={image.src} alt={image.alt} draggable={false} className="h-full w-full rounded-full object-cover" />
            </motion.div>
          );
        })}
      </div>
      <motion.div
        className="mt-8"
        initial={{ opacity: 0, y: reduced ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduced ? 0 : 0.16, duration: reduced ? 0.2 : 0.54, ease: EASE_OUT }}
      >
        <p className="font-serif text-4xl font-semibold leading-tight text-ink sm:text-5xl lg:text-6xl">
          Swavalambi Siddaganga Oil Mill
          {/* ಸ್ವಾವಲಂಬಿ ಸಿದ್ದಗಂಗಾ ಆಯಿಲ್ ಮಿಲ್ */}
        </p>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.34em] text-brand sm:text-sm">WORK IS WORSHIP</p>
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.3em] text-ink/45 sm:text-xs">ESTD. 2024</p>
      </motion.div>
    </motion.div>
  );
}

function LoaderAnimation({ reduced, exiting }) {
  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="ss-oil-mill-intro"
          className="fixed inset-0 z-[9999] overflow-hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.2 : EXIT_DURATION / 1000, ease: EASE_IN_OUT }}
          role="status"
          aria-label="Loading Swavalambi Siddaganga Oil Mill"
        >
          <Background />
          <IntroScreen reduced={reduced} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function IntroLoader({ children }) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("ssOilMillIntroSeen")) {
      return "skip";
    }
    return "playing";
  });
  const holdTimer = useRef(null);
  const exitTimer = useRef(null);

  useEffect(() => {
    if (phase !== "playing") return undefined;
    const totalDuration = reduced ? 900 : INTRO_DURATION;
    const exitDuration = reduced ? 220 : EXIT_DURATION;

    holdTimer.current = window.setTimeout(() => {
      setPhase("exiting");
      exitTimer.current = window.setTimeout(() => {
        sessionStorage.setItem("ssOilMillIntroSeen", "true");
        setPhase("done");
      }, exitDuration);
    }, totalDuration);

    return () => {
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(exitTimer.current);
    };
  }, [phase, reduced]);

  if (phase === "skip" || phase === "done") return children;

  return (
    <>
      {phase === "exiting" && children}
      <LoaderAnimation reduced={reduced} exiting={phase === "exiting"} />
    </>
  );
}

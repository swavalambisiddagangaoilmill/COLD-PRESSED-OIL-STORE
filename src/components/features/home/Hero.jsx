import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const STATIC_SLIDES = [
  { _id: "static-carousel-1", imageUrl: "/carousel/image1.png" },
  { _id: "static-carousel-2", imageUrl: "/carousel/image2.png" },
  { _id: "static-carousel-3", imageUrl: "/carousel/image3.jpeg" },
  { _id: "static-carousel-4", imageUrl: "/carousel/image4.jpeg" },
];

export default function Hero() {
  const [slides, setSlides] = useState(STATIC_SLIDES);
  const [active, setActive] = useState(0);
  const [touchStart, setTouchStart] = useState(null);

  useEffect(() => {
    if (slides.length < 2) return undefined;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 5000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  if (!slides.length) return null;
  const goTo = (index) => setActive((index + slides.length) % slides.length);

  return (
    <section className="hero-banner group relative mx-3 my-3 overflow-hidden bg-white sm:mx-5 md:mx-6" aria-label="Homepage promotions" onTouchStart={(event) => slides.length > 1 && setTouchStart(event.touches[0].clientX)} onTouchEnd={(event) => {
      if (touchStart === null || slides.length < 2) return;
      const distance = touchStart - event.changedTouches[0].clientX;
      if (distance > 48) goTo(active + 1);
      if (distance < -48) goTo(active - 1);
      setTouchStart(null);
    }}>
      {slides.map((slide, index) => (
        <motion.img key={slide._id} src={slide.imageUrl} alt="" loading={index === 0 ? "eager" : "lazy"} draggable="false" onError={() => { setSlides((current) => current.filter((item) => item._id !== slide._id)); setActive(0); }} className="absolute inset-0 h-full w-full select-none object-contain" initial={false} animate={{ opacity: index === active ? 1 : 0 }} transition={{ duration: 0.55, ease: "easeOut" }} />
      ))}
      {slides.length > 1 && <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 bg-white/75 p-1.5 backdrop-blur-sm">
        {slides.map((slide, index) => <button key={slide._id} type="button" aria-label={`Show promotion ${index + 1}`} onClick={() => goTo(index)} className={`h-1 w-6 transition-colors ${index === active ? "bg-brand" : "bg-ink/20"}`} />)}
      </div>}
    </section>
  );
}

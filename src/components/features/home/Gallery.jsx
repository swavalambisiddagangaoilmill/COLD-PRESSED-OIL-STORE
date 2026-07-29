// Renders the dynamic Gallery marquee from backend-managed Cloudinary images.
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import SafeImage from "../../common/SafeImage.jsx";
import { fetchGalleryImages } from "../../../services/contentService.js";

export default function Gallery() {
  const [images, setImages] = useState([]);

  useEffect(() => {
    let active = true;
    fetchGalleryImages()
      .then((items) => { if (active) setImages(items.filter((item) => item.image)); })
      .catch(() => { if (active) setImages([]); });
    return () => { active = false; };
  }, []);

  const marqueeImages = useMemo(() => [...images, ...images], [images]);
  if (!images.length) return null;

  return (
    <section className="py-10 md:py-12 xl:py-14 overflow-hidden bg-cream">
      <div className="gallery-marquee overflow-hidden" aria-label="Gallery images">
        <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.45 }} className="gallery-marquee-track flex w-max gap-3 px-4 sm:gap-4 sm:px-6 lg:gap-5 lg:px-8">
          {marqueeImages.map((item, index) => (
            <figure key={`${item.id || item._id}-${index}`} className="gallery-card w-[42vw] max-w-[280px] shrink-0 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm transition duration-300 sm:w-[30vw] md:w-[28vw] lg:w-[22vw] xl:w-[18vw] 2xl:w-[15vw]">
              <div className="aspect-[4/5] overflow-hidden bg-linen">
                <SafeImage src={item.image} alt={item.alt || item.title || "Swavalambi Siddaganga Oil Mill gallery image"} loading="lazy" className="gallery-card-image h-full w-full object-cover transition duration-300" />
              </div>
            </figure>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// Renders RelatedProducts for product catalog surfaces.
import { useEffect, useState } from "react";
import { getRelatedProducts } from "../../../services/catalogService.js";
import ProductCard from "./ProductCard.jsx";
import SectionHeading from "../../ui/SectionHeading.jsx";

export default function RelatedProducts({ current }) {
  const [related, setRelated] = useState([]);

  useEffect(() => {
    let active = true;
    getRelatedProducts(current, 6).then((items) => active && setRelated(items)).catch(() => active && setRelated([]));
    return () => { active = false; };
  }, [current]);

  if (related.length === 0) return null;

  return (
    <section className="section-padding">
      <SectionHeading eyebrow="You may also like" title="More oils from this family" />
      <div className="flex snap-x scroll-px-0 gap-3.5 overflow-x-auto pb-3 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {related.map((product) => <div key={product.id} className="w-[min(72vw,18rem)] shrink-0 snap-start sm:w-auto"><ProductCard product={product} /></div>)}
      </div>
    </section>
  );
}

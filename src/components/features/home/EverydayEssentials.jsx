// Renders the homepage EverydayEssentials section.
import { useEffect, useState } from "react";
import ProductCard from "../product/ProductCard.jsx";
import Container from "../../ui/Container.jsx";
import SectionHeading from "../../ui/SectionHeading.jsx";
import { getEverydayEssentials } from "../../../services/catalogService.js";

export default function EverydayEssentials() {
  const [everydayEssentials, setEverydayEssentials] = useState([]);

  useEffect(() => {
    let active = true;
    getEverydayEssentials().then((items) => active && setEverydayEssentials(items)).catch(() => active && setEverydayEssentials([]));
    return () => { active = false; };
  }, []);

  return (
    <section className="py-12 md:py-16 xl:py-20">
      <Container>
        <SectionHeading eyebrow="Pantry staples" title="Everyday Essentials" text="Five slow-pressed oils selected for daily cooking, quiet rituals, and a pantry that feels considered." />
        <div className="grid grid-cols-2 gap-3.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-5">
          {everydayEssentials.map((product) => <ProductCard key={product.id} product={product} variant="premium" />)}
        </div>
      </Container>
    </section>
  );
}

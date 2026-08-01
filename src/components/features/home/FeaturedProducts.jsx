// Renders the homepage Essential Oils section.
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { getEssentialOilProducts } from "../../../services/catalogService.js";
import ProductCard from "../product/ProductCard.jsx";
import Container from "../../ui/Container.jsx";
import SectionHeading from "../../ui/SectionHeading.jsx";

export default function FeaturedProducts() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let active = true;
    getEssentialOilProducts().then((items) => active && setProducts(items)).catch(() => active && setProducts([]));
    return () => { active = false; };
  }, []);

  return (
    <section className="section-padding">
      <Container>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading eyebrow="Essential oils" title="Aromatic essentials for refined daily care" />
          <Link to="/shop?q=Essential%20Oils&focus=search" className="inline-flex h-11 items-center gap-2 self-start rounded-full bg-ink px-5 text-sm font-bold text-white transition hover:bg-leaf sm:self-auto">
            View All <ArrowRight size={16} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-5">
          {products.map((product) => <ProductCard key={product.id} product={product} variant="premium" />)}
        </div>
      </Container>
    </section>
  );
}

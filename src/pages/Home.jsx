// Renders the Home page experience.
import BrandStrip from "../components/features/home/BrandStrip.jsx";
import EverydayEssentials from "../components/features/home/EverydayEssentials.jsx";
import ExtractionProcess from "../components/features/home/ExtractionProcess.jsx";
import FAQ from "../components/features/home/FAQ.jsx";
import FeaturedProducts from "../components/features/home/FeaturedProducts.jsx";
import Gallery from "../components/features/home/Gallery.jsx";
import Hero from "../components/features/home/Hero.jsx";
import InstagramGallery from "../components/features/home/InstagramGallery.jsx";
import StorySection from "../components/features/home/StorySection.jsx";
import Testimonials from "../components/features/home/Testimonials.jsx";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";

export default function Home() {
  return (
    <>
      <h1 className="sr-only">Swavalambi Siddaganga Oil Mill cold pressed edible oils</h1>
      <Hero />
      <EverydayEssentials />
      <FeaturedProducts />
      <BrandStrip />
      <StorySection />
      <ExtractionProcess />
      <section className="section-padding bg-surface">
        <Container className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">
              Lifestyle edit
            </p>
            <h2 className="mt-4 max-w-2xl font-serif text-3xl font-semibold leading-tight lg:text-5xl">
              Build a pantry that cooks beautifully every day.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/65">
              Curated oil bundles for daily meals, festive cooking, and wellness
              routines, bottled in gift-ready amber glass.
            </p>
            <Button to="/shop" className="mt-8">
              Shop Bundles
            </Button>
          </div>
          <img
            src="/our-story-community.png"
            alt="Swavalambi Siddaganga Oil Mill community gathering"
            loading="lazy"
            className="aspect-[16/10] w-full object-cover"
          />
        </Container>
      </section>
      <Gallery />
      <Testimonials />
      <FAQ />
      <InstagramGallery />
    </>
  );
}

// Renders the About page experience.
import Breadcrumb from "../components/common/Breadcrumb.jsx";
import CinematicHero, { OIL_MILL_HERO_POSTER, OIL_MILL_HERO_VIDEO } from "../components/common/CinematicHero.jsx";
import TestimonialCarousel from "../components/common/TestimonialCarousel.jsx";
import Benefits from "../components/features/home/Benefits.jsx";
import ExtractionProcess from "../components/features/home/ExtractionProcess.jsx";
import Container from "../components/ui/Container.jsx";
import SectionHeading from "../components/ui/SectionHeading.jsx";
import { processStepsDetailed, qualityStandards, sustainabilityPoints } from "../data/pageData.js";
import { testimonials } from "../data/siteData.js";

export default function About() {
  return (
    <>
      <Breadcrumb items={[{ label: "About" }]} />
      <CinematicHero
        eyebrow="About us"
        title="A premium oil house built around patience."
        text="Swavalambi Siddaganga Oil Mill exists to make traditional cold pressed oils feel reliable, elegant, and deeply useful in modern kitchens."
        image={OIL_MILL_HERO_POSTER}
        video={OIL_MILL_HERO_VIDEO}
        contentVisible={false}
      />
      <Benefits />
      <ExtractionProcess />
      <section className="section-padding bg-cream">
        <Container>
          <SectionHeading eyebrow="How we work" title="Sourced, pressed, and packed with care" text="Our process stays simple: careful seed selection, slow extraction, natural settling, protective packing, and fresh dispatch." />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {processStepsDetailed.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-3xl bg-white p-5 shadow-sm">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-linen text-leaf"><Icon size={19} /></span>
                <h2 className="mt-4 font-serif text-2xl font-semibold">{title}</h2>
                <p className="mt-2 leading-7 text-ink/62">{text}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="font-serif text-3xl font-semibold">Quality standards</h2>
              <div className="mt-4 grid gap-3">
                {qualityStandards.map((item) => <p key={item} className="rounded-2xl bg-linen px-4 py-3 font-semibold text-ink/70">{item}</p>)}
              </div>
            </article>
            <article className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="font-serif text-3xl font-semibold">Responsible choices</h2>
              <div className="mt-4 grid gap-3">
                {sustainabilityPoints.map(({ icon: Icon, title, text }) => (
                  <div key={title} className="flex gap-3 rounded-2xl bg-linen p-4">
                    <Icon size={18} className="mt-1 shrink-0 text-leaf" />
                    <p className="text-sm leading-6 text-ink/62"><span className="font-bold text-ink">{title}:</span> {text}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </Container>
      </section>
      <section className="section-padding bg-surface">
        <Container>
          <SectionHeading eyebrow="Customer notes" title="Trusted by modern kitchens" text="Real reviews from families, chefs, and wellness-led homes using Swavalambi Siddaganga Oil Mill in everyday cooking." />
          <TestimonialCarousel items={testimonials} />
        </Container>
      </section>
    </>
  );
}

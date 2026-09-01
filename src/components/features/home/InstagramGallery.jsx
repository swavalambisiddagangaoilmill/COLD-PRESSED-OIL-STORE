// Renders the real extraction process gallery on the homepage.
import Container from "../../ui/Container.jsx";

const extractionSteps = [
  { image: "/extraction/01-seed-selection.png", title: "Seed Selection" },
  { image: "/extraction/02-slow-grinding.png", title: "Slow Grinding" },
  { image: "/extraction/03-natural-filtering.png", title: "Natural Filtering" },
  { image: "/extraction/04-oil-collection.png", title: "Fresh Oil Collection" },
];

export default function InstagramGallery() {
  return (
    <section className="section-padding">
      <Container>
        <p className="mb-7 text-center text-xs font-bold uppercase tracking-[0.24em] text-forest sm:mb-9">
          Our Extraction Process
        </p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {extractionSteps.map((step, index) => (
            <figure key={step.image} className="group">
              <div className="aspect-[4/5] overflow-hidden rounded-3xl bg-linen">
                <img
                  src={step.image}
                  alt={`${step.title} at Swavalambi Siddaganga Oil Mill`}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                />
              </div>
              <figcaption className="mt-3 text-center font-serif text-lg font-semibold text-ink">
                <span className="mr-2 text-sm text-clay">0{index + 1}</span>
                {step.title}
              </figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </section>
  );
}

// Renders the homepage Testimonials section.
import { testimonials } from "../../../data/siteData.js";
import TestimonialCarousel from "../../common/TestimonialCarousel.jsx";
import Container from "../../ui/Container.jsx";
import SectionHeading from "../../ui/SectionHeading.jsx";

export default function Testimonials() {
  return (
    <section className="section-padding bg-surface">
      <Container>
        <SectionHeading eyebrow="Customer notes" title="Loved by thoughtful kitchens" />
        <TestimonialCarousel items={testimonials} />
      </Container>
    </section>
  );
}




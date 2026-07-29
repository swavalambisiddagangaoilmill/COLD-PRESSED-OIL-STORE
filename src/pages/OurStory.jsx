// Renders the OurStory page experience.
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Breadcrumb from "../components/common/Breadcrumb.jsx";
import CinematicHero, { DEMO_HERO_VIDEO } from "../components/common/CinematicHero.jsx";
import Gallery from "../components/features/home/Gallery.jsx";
import PageCta from "../components/common/PageCta.jsx";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";
import SectionHeading from "../components/ui/SectionHeading.jsx";
import { getStoryContent } from "../services/contentService.js";

const { brandValuesDetailed, milestones, storyTimeline } = getStoryContent();

export default function OurStory() {
  return (
    <>
      <Breadcrumb items={[{ label: "About", href: "/about" }, { label: "Our Story" }]} />
      <CinematicHero
        eyebrow="Our story"
        title="A slower oil house for everyday kitchens."
        text="Swavalambi Siddaganga Oil Mill brings traditional cold pressed oils into a refined modern pantry, with patience, clarity, and sensory warmth guiding every bottle."
        image="https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1800&q=85"
        video={DEMO_HERO_VIDEO}
        contentVisible={false}
      />

      <section className="section-padding">
        <Container className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">Brand introduction</p>
            <h2 className="mt-4 font-serif text-4xl font-semibold leading-tight lg:text-6xl">
              Built for customers who read the label and remember the aroma.
            </h2>
          </div>
          <div className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8">
            <p className="text-lg leading-8 text-ink/65">
              Swavalambi Siddaganga Oil Mill was shaped around a simple belief: everyday cooking staples can be honest, beautiful, and reliable at the same time. Our work is to preserve the natural character of seeds while making the buying experience feel calm and premium.
            </p>
            <Button to="/shop" className="mt-7">
              Explore Oils <ArrowRight size={18} />
            </Button>
          </div>
        </Container>
      </section>

      <section className="bg-linen/70 py-12 md:py-16 xl:py-20">
        <Container>
          <SectionHeading eyebrow="Journey" title="The company journey" text="A quiet progression from pantry curiosity to a premium cold pressed oil experience." />
          <div className="grid gap-4 lg:grid-cols-4">
            {storyTimeline.map((item, index) => (
              <motion.article
                key={item.year}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: index * 0.06 }}
                className="rounded-[2rem] bg-white p-6 shadow-sm"
              >
                <p className="text-sm font-bold text-leaf">{item.year}</p>
                <h3 className="mt-4 font-serif text-3xl font-semibold">{item.title}</h3>
                <p className="mt-3 leading-7 text-ink/62">{item.text}</p>
              </motion.article>
            ))}
          </div>
        </Container>
      </section>

      <section className="section-padding">
        <Container className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] bg-ink p-7 text-white sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/45">Mission</p>
            <h2 className="mt-4 font-serif text-4xl font-semibold">Protect taste through patient making.</h2>
            <p className="mt-5 leading-8 text-white/68">We make cold pressed oils easier to trust, understand, and use every day without stripping away their natural personality.</p>
          </div>
          <div className="rounded-[2rem] bg-white p-7 shadow-sm sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">Vision</p>
            <h2 className="mt-4 font-serif text-4xl font-semibold">Set a cleaner pantry standard.</h2>
            <p className="mt-5 leading-8 text-ink/65">Our vision is a home pantry where staples are sourced carefully, presented beautifully, and chosen with confidence.</p>
          </div>
        </Container>
      </section>

      <section className="bg-surface py-12 md:py-16 xl:py-20">
        <Container>
          <SectionHeading eyebrow="Values" title="What the brand stands for" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {brandValuesDetailed.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-[2rem] bg-white p-6 shadow-sm">
                <Icon size={26} className="text-leaf" />
                <h3 className="mt-5 font-serif text-3xl font-semibold">{title}</h3>
                <p className="mt-3 leading-7 text-ink/62">{text}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="section-padding">
        <Container className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <SectionHeading eyebrow="Milestones" title="Signals of progress" align="left" />
          <div className="grid gap-3">
            {milestones.map((item) => (
              <div key={item} className="rounded-2xl border border-ink/10 bg-white p-5 font-semibold shadow-sm">
                {item}
              </div>
            ))}
          </div>
        </Container>
      </section>

      <Gallery />
      <PageCta eyebrow="Bring it home" title="Start with oils that make daily cooking feel considered." text="Explore the Swavalambi Siddaganga Oil Mill range and build a calmer, cleaner pantry around cold pressed staples." />
    </>
  );
}


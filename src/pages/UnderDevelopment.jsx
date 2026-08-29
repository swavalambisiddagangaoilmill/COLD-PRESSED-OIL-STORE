// Temporary public storefront holding page. No application or API logic lives here.
export default function UnderDevelopment() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-cream px-6 py-16 text-ink">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-2 bg-leaf" />
      <section className="relative w-full max-w-2xl text-center" aria-labelledby="under-development-title">
        <img src="/logo.webp" alt="Swavalambi Siddaganga Oil Mill" className="mx-auto mb-9 h-24 w-24 object-contain sm:h-28 sm:w-28" />
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-leaf">Swavalambi Siddaganga Oil Mill</p>
        <h1 id="under-development-title" className="text-4xl font-semibold leading-tight sm:text-6xl">Website Under Development</h1>
        <div aria-hidden="true" className="mx-auto my-7 h-px w-20 bg-gold/70" />
        <p className="mx-auto max-w-lg text-base leading-8 text-ink/65 sm:text-lg">
          We&apos;re currently making a few improvements.<br />Please check back soon.
        </p>
      </section>
    </main>
  );
}

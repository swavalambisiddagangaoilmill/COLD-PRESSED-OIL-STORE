import { AdminPageHeader } from "../components/AdminUi.jsx";

export default function CarouselPage() {
  return (
    <>
      <AdminPageHeader
        title="Homepage Carousel"
        description="Carousel management is temporarily quarantined."
      />
      <section className="border border-[var(--admin-border)] bg-white p-6">
        <p className="text-sm font-bold text-ink">Admin carousel uploads are paused.</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">
          The homepage is currently using four static banner images deployed with the website.
          Uploading, reordering, enabling, and deleting carousel images are unavailable until the
          admin carousel system is restored.
        </p>
      </section>
    </>
  );
}

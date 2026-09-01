import { ArrowDown, ArrowUp, ImagePlus, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../components/features/feedback/ToastProvider.jsx";
import { AdminBadge, AdminButton, AdminPageHeader } from "../components/AdminUi.jsx";
import { adminApi } from "../services/adminApi.js";

const categoryDetails = {
  desktop: { title: "Desktop Carousel", dimensions: "1920 × 700 px", Icon: Monitor },
  mobile: { title: "Mobile Carousel", dimensions: "1080 × 1350 px", Icon: Smartphone },
};

function CarouselSection({ category, items, pending, onUpload, onReplace, onMove, onToggle }) {
  const { title, dimensions, Icon } = categoryDetails[category];
  const uploadRef = useRef(null);
  const replaceRef = useRef(null);
  const replacingId = useRef("");
  return <section className="rounded-xl border border-[var(--admin-border)] bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-col gap-3 border-b border-ink/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--admin-primary-soft)] text-[var(--admin-primary)]"><Icon size={20} /></span><div><h2 className="font-bold text-ink">{title}</h2><p className="text-sm text-ink/55">Recommended: {dimensions}</p></div></div>
      <AdminButton type="button" onClick={() => uploadRef.current?.click()} loading={pending === `${category}:upload`}><ImagePlus size={16} />Add Image</AdminButton>
      <input ref={uploadRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(category, file); event.target.value = ""; }} />
      <input ref={replaceRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file && replacingId.current) onReplace(replacingId.current, file); event.target.value = ""; }} />
    </div>
    {!items.length ? <div className="py-10 text-center"><p className="text-sm font-bold text-ink">Using built-in fallback images</p><p className="mt-1 text-sm text-ink/50">Add an image when you are ready. The homepage will not be left blank.</p></div> : <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item, index) => <article key={item._id} className="overflow-hidden rounded-xl border border-ink/10 bg-linen/30">
        <div className={`${category === "mobile" ? "aspect-[4/5]" : "aspect-[16/7]"} bg-linen`}><img src={item.imageUrl} alt={`${title} image ${index + 1}`} className="h-full w-full object-cover" /></div>
        <div className="grid gap-3 p-3"><div className="flex items-center justify-between gap-2"><AdminBadge>{item.isActive ? "Active" : "Disabled"}</AdminBadge><span className="text-xs font-semibold text-ink/45">{item.width && item.height ? `${item.width} × ${item.height}px` : `Position ${index + 1}`}</span></div>
          {item.aspectWarning && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">{item.aspectWarning}</p>}
          <div className="flex flex-wrap gap-2"><AdminButton type="button" variant="secondary" disabled={index === 0 || pending === `${category}:reorder`} onClick={() => onMove(category, index, -1)} aria-label="Move image up"><ArrowUp size={14} /></AdminButton><AdminButton type="button" variant="secondary" disabled={index === items.length - 1 || pending === `${category}:reorder`} onClick={() => onMove(category, index, 1)} aria-label="Move image down"><ArrowDown size={14} /></AdminButton><AdminButton type="button" variant="secondary" loading={pending === `${item._id}:replace`} onClick={() => { replacingId.current = item._id; replaceRef.current?.click(); }}><RefreshCw size={14} />Replace</AdminButton><AdminButton type="button" variant="secondary" loading={pending === `${item._id}:toggle`} onClick={() => onToggle(item)}>{item.isActive ? "Disable" : "Enable"}</AdminButton></div>
        </div>
      </article>)}
    </div>}
  </section>;
}

export default function CarouselPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const grouped = useMemo(() => ({ desktop: items.filter((item) => (item.category || "desktop") === "desktop"), mobile: items.filter((item) => item.category === "mobile") }), [items]);
  const load = async () => { setLoading(true); setError(""); try { const data = await adminApi.carousel(); setItems(data.items || []); } catch (err) { setError(err.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const run = async (key, action, success) => { setPending(key); try { const result = await action(); showToast(success, "success"); return result; } catch (err) { showToast(err.message || "Carousel update failed.", "error"); return null; } finally { setPending(""); } };
  const upload = async (category, file) => { const result = await run(`${category}:upload`, () => adminApi.createCarousel(file, category), "Carousel image added."); if (result?.item) setItems((current) => [...current, result.item]); };
  const replace = async (id, file) => { const result = await run(`${id}:replace`, () => adminApi.replaceCarousel(id, file), "Carousel image replaced."); if (result?.item) setItems((current) => current.map((item) => item._id === id ? result.item : item)); };
  const toggle = async (item) => { const result = await run(`${item._id}:toggle`, () => adminApi.carouselStatus(item._id, !item.isActive), item.isActive ? "Carousel image disabled." : "Carousel image enabled."); if (result?.item) setItems((current) => current.map((entry) => entry._id === item._id ? { ...entry, ...result.item } : entry)); };
  const move = async (category, index, direction) => { const categoryItems = [...grouped[category]]; const target = index + direction; if (target < 0 || target >= categoryItems.length) return; [categoryItems[index], categoryItems[target]] = [categoryItems[target], categoryItems[index]]; const result = await run(`${category}:reorder`, () => adminApi.reorderCarousel(category, categoryItems.map((item) => item._id)), "Carousel order updated."); if (result?.items) setItems(result.items); };
  return <><AdminPageHeader title="Homepage Carousel" description="Manage desktop and mobile banners independently." />
    <aside className="mb-5 grid gap-2 rounded-xl border border-[var(--admin-primary)]/20 bg-[var(--admin-primary-soft)] p-4 text-sm text-ink/70"><p><strong>Desktop:</strong> 1920 × 700 px · <strong>Mobile:</strong> 1080 × 1350 px</p><p>JPG, PNG, or WebP · Keep files optimized for web · Avoid important text or logos near edges.</p><p>Images are compressed during Cloudinary upload. Different dimensions are accepted when reasonable and shown with a warning.</p></aside>
    {loading && <p className="py-8 text-center text-sm font-semibold text-ink/50">Loading carousel images…</p>}{error && <div className="mb-5 rounded-xl bg-danger/10 p-4 text-sm font-semibold text-danger"><p>{error}</p><AdminButton type="button" variant="secondary" className="mt-3" onClick={load}>Try Again</AdminButton></div>}
    {!loading && !error && <div className="grid gap-5"><CarouselSection category="desktop" items={grouped.desktop} pending={pending} onUpload={upload} onReplace={replace} onMove={move} onToggle={toggle} /><CarouselSection category="mobile" items={grouped.mobile} pending={pending} onUpload={upload} onReplace={replace} onMove={move} onToggle={toggle} /></div>}
  </>;
}

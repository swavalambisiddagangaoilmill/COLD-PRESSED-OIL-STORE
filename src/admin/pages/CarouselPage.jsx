import { ArrowDown, ArrowUp, ImagePlus, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../components/features/feedback/ToastProvider.jsx";
import { AdminBadge, AdminButton, AdminModal, AdminPageHeader } from "../components/AdminUi.jsx";
import { adminApi } from "../services/adminApi.js";
import { CAROUSEL_CROP, drawCarouselCrop, exportCarouselCrop } from "../utils/carouselCrop.js";

const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

async function validateImage(file) {
  if (!file) throw new Error("Select an image to continue.");
  if (!IMAGE_TYPES.includes(file.type.toLowerCase())) throw new Error("Use a JPEG, PNG, or WebP image.");
  if (file.size > MAX_BYTES) throw new Error("Carousel images must be 8 MB or smaller.");
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve({ image, url }); else { URL.revokeObjectURL(url); reject(new Error("The selected file contains invalid image data.")); } };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The selected file could not be read as an image.")); };
    image.src = url;
  });
}

function CropEditor({ source, originalFile, setExporter }) {
  const canvas = useRef(null); const drag = useRef(null); const pointers = useRef(new Map()); const pinch = useRef(null);
  const [zoom, setZoom] = useState(1); const [position, setPosition] = useState({ x: 0, y: 0 });
  useEffect(() => { if (canvas.current && source) drawCarouselCrop(canvas.current.getContext("2d"), source, "image", zoom, position, canvas.current.width, canvas.current.height); }, [position, source, zoom]);
  useEffect(() => { setExporter(() => exportCarouselCrop(source, originalFile, "image", zoom, position)); return () => setExporter(null); }, [originalFile, position, setExporter, source, zoom]);
  const distance = () => { const [first, second] = [...pointers.current.values()]; return first && second ? Math.hypot(second.x - first.x, second.y - first.y) : 0; };
  const start = (event) => { event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.current.size === 2) pinch.current = { distance: distance(), zoom }; else drag.current = { x: event.clientX, y: event.clientY, position }; };
  const move = (event) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) return setZoom(Math.max(1, Math.min(3, pinch.current.zoom * distance() / Math.max(1, pinch.current.distance))));
    if (!drag.current) return;
    const rect = canvas.current.getBoundingClientRect();
    setPosition({ x: Math.max(-1, Math.min(1, drag.current.position.x + ((event.clientX - drag.current.x) / rect.width) * 2)), y: Math.max(-1, Math.min(1, drag.current.position.y + ((event.clientY - drag.current.y) / rect.height) * 2)) });
  };
  const finish = (event) => { pointers.current.delete(event.pointerId); canvas.current?.releasePointerCapture?.(event.pointerId); drag.current = null; pinch.current = null; };
  return <div className="grid gap-3"><div className="relative mx-auto w-full max-w-[720px] overflow-hidden border-2 border-[var(--admin-primary)] bg-black shadow-inner"><canvas ref={canvas} width={640} height={360} className="block aspect-video w-full cursor-grab touch-none active:cursor-grabbing" onWheel={(event) => { event.preventDefault(); setZoom((current) => Math.max(1, Math.min(3, current + (event.deltaY < 0 ? 0.1 : -0.1)))); }} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} aria-label="Carousel crop preview" /><div className="pointer-events-none absolute inset-0 border border-white/70" /><span className="pointer-events-none absolute bottom-2 left-2 bg-black/65 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">All devices · 16:9 preview</span></div><p className="text-center text-xs font-semibold text-ink/55">Drag to position. Pinch or use the mouse wheel to zoom. Zoom: {Math.round(zoom * 100)}%</p><div className="flex justify-center"><AdminButton type="button" variant="secondary" onClick={() => { setZoom(1); setPosition({ x: 0, y: 0 }); }}><RotateCcw size={15} />Reset</AdminButton></div></div>;
}

function UploadArtboard({ file, existing, removed, onFile, onRemove, setExporter }) {
  const input = useRef(null); const [crop, setCrop] = useState(null);
  const preview = useMemo(() => file ? URL.createObjectURL(file) : removed ? "" : existing?.url, [existing?.url, file, removed]);
  useEffect(() => () => { if (file && preview) URL.revokeObjectURL(preview); }, [file, preview]);
  useEffect(() => () => { if (crop?.url) URL.revokeObjectURL(crop.url); }, [crop?.url]);
  const select = async (next) => { const decoded = await validateImage(next); onFile(null); setCrop({ file: next, ...decoded }); };
  const choose = (event) => { const next = event.target.files?.[0]; event.target.value = ""; select(next).catch((error) => onFile(null, error.message)); };
  const picker = <input ref={input} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/jpg,image/png,image/webp" onChange={choose} />;
  if (crop) return <section className="grid gap-4"><div><p className="text-sm font-extrabold uppercase tracking-[0.12em] text-ink">Fit carousel image</p><p className="mt-1 text-xs font-semibold text-ink/50">The visible frame is physically exported at 16:9, up to {CAROUSEL_CROP.image.width} × {CAROUSEL_CROP.image.height}, without upscaling.</p></div><CropEditor source={crop.image} originalFile={crop.file} setExporter={setExporter} />{picker}<div className="flex justify-center gap-2"><AdminButton type="button" variant="secondary" onClick={() => input.current?.click()}>Replace</AdminButton><AdminButton type="button" variant="danger" onClick={() => { setCrop(null); setExporter(null); onRemove(); }}>Remove</AdminButton></div></section>;
  return <section className="grid gap-3"><div><p className="text-sm font-extrabold uppercase tracking-[0.12em] text-ink">Image</p><p className="mt-1 text-xs font-semibold text-ink/50">One landscape crop for desktop, tablet, and mobile.</p></div><div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); select(event.dataTransfer.files?.[0]).catch((error) => onFile(null, error.message)); }} className="relative grid aspect-video w-full place-items-center overflow-hidden border-2 border-dashed border-[var(--admin-border)] bg-linen/50">{preview ? <img src={preview} alt="Carousel preview" className="h-full w-full object-cover" /> : <div className="p-6 text-center"><ImagePlus className="mx-auto text-[var(--admin-primary)]" /><p className="mt-3 text-sm font-bold">Drag and drop or Browse</p></div>}{picker}</div><div className="flex justify-center gap-2"><AdminButton type="button" variant="secondary" onClick={() => input.current?.click()}>{preview ? "Replace & crop" : "Browse & crop"}</AdminButton>{preview && <AdminButton type="button" variant="danger" onClick={onRemove}>Remove</AdminButton>}</div></section>;
}

function SlideEditor({ item, onClose, onSaved }) {
  const { showToast } = useToast(); const [imageFile, setImageFile] = useState(null); const [removeImage, setRemoveImage] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const requestKey = useRef(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`); const exporter = useRef(null);
  const existing = item?.image || item?.desktopImage || (item?.imageUrl ? { url: item.imageUrl } : item?.mobileImage);
  const save = async () => { if (saving) return; setSaving(true); setError(""); try { const finalImage = exporter.current ? await exporter.current() : imageFile; if (!finalImage && (removeImage || !existing?.url)) throw new Error("Keep an image, or delete the slide."); const data = await adminApi.saveCarousel({ id: item?._id, imageFile: finalImage, removeImage, isActive: item?.isActive ?? true, requestKey: requestKey.current }); onSaved(data.item); showToast(item?._id ? "Carousel slide updated successfully." : "Carousel slide created successfully.", "success"); onClose(); } catch (saveError) { setError(saveError.message || "Carousel slide could not be saved."); } finally { setSaving(false); } };
  return <AdminModal title={item?._id ? "Edit carousel slide" : "Create carousel slide"} open onClose={onClose} footer={<AdminButton loading={saving} disabled={saving} onClick={save}>Save slide</AdminButton>}><p className="mb-5 text-sm text-ink/55">Upload one image, then zoom and drag it inside the final carousel frame.</p>{error && <p role="alert" className="mb-4 border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}<UploadArtboard file={imageFile} existing={existing} removed={removeImage} onFile={(file, message) => { if (message) return setError(message); setError(""); if (file) setImageFile(file); setRemoveImage(false); }} onRemove={() => { setImageFile(null); setRemoveImage(true); exporter.current = null; }} setExporter={(value) => { exporter.current = value; }} /></AdminModal>;
}

export default function CarouselPage() {
  const { showToast } = useToast(); const [items, setItems] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [editing, setEditing] = useState(null); const [busy, setBusy] = useState("");
  const load = () => { setLoading(true); adminApi.carousel().then((data) => setItems(data.items || [])).catch((loadError) => setError(loadError.message || "Carousel could not be loaded.")).finally(() => setLoading(false)); };
  useEffect(load, []);
  const saveRow = (item) => setItems((current) => current.some((value) => value._id === item._id) ? current.map((value) => value._id === item._id ? item : value) : [...current, item]);
  const reorder = async (index, amount) => { const nextIndex = index + amount; if (nextIndex < 0 || nextIndex >= items.length || busy) return; const next = [...items]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; setItems(next); setBusy("reorder"); try { const data = await adminApi.reorderCarousel(next.map((item) => item._id)); setItems(data.items); } catch (reorderError) { load(); showToast(reorderError.message || "Carousel order could not be saved.", "error"); } finally { setBusy(""); } };
  return <><AdminPageHeader title="Homepage Carousel" description="Manage one responsive image per slide and its display order." action={<AdminButton onClick={() => setEditing({})}><Plus size={16} />Create slide</AdminButton>} />{error && <p className="border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}{loading ? <p className="bg-white p-6 text-sm font-semibold">Loading carousel…</p> : <div className="grid gap-4">{items.map((item, index) => { const image = item.image || item.desktopImage || (item.imageUrl ? { url: item.imageUrl } : item.mobileImage); return <article key={item._id} className="grid gap-4 border border-[var(--admin-border)] bg-white p-4 lg:grid-cols-[260px_1fr_auto] lg:items-center"><img src={image?.url} alt={`Carousel slide ${index + 1}`} className="aspect-video w-full object-cover" /><div><p className="font-bold">Slide {index + 1}</p><div className="mt-2 flex gap-2"><AdminBadge>{item.isActive ? "Active" : "Inactive"}</AdminBadge><span className="text-xs text-ink/45">One image · all devices</span></div></div><div className="flex flex-wrap gap-2"><AdminButton variant="secondary" disabled={index === 0 || busy} onClick={() => reorder(index, -1)}><ArrowUp size={15} /></AdminButton><AdminButton variant="secondary" disabled={index === items.length - 1 || busy} onClick={() => reorder(index, 1)}><ArrowDown size={15} /></AdminButton><AdminButton variant="secondary" onClick={() => setEditing(item)}><Pencil size={15} />Edit</AdminButton><AdminButton variant="secondary" onClick={async () => { setBusy(item._id); try { const data = await adminApi.carouselStatus(item._id, !item.isActive); saveRow(data.item); } finally { setBusy(""); } }}>{item.isActive ? "Disable" : "Activate"}</AdminButton><AdminButton variant="danger" onClick={async () => { if (!window.confirm("Delete this carousel slide?")) return; setBusy(item._id); try { await adminApi.deleteCarousel(item._id); setItems((current) => current.filter((value) => value._id !== item._id)); showToast("Slide deleted successfully.", "success"); } catch (deleteError) { showToast(deleteError.message || "Carousel slide could not be deleted.", "error"); } finally { setBusy(""); } }}><Trash2 size={15} /></AdminButton></div></article>; })}{!items.length && <div className="border border-dashed border-[var(--admin-border)] bg-white p-10 text-center"><p className="font-bold">No carousel slides</p><p className="mt-2 text-sm text-ink/50">Create a carousel image to restore the homepage carousel.</p></div>}</div>}{editing && <SlideEditor item={editing._id ? editing : null} onClose={() => setEditing(null)} onSaved={saveRow} />}</>;
}

import { Eye, EyeOff, GripVertical, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminBadge, AdminButton, AdminModal, AdminPageHeader, AdminTable } from "../components/AdminUi.jsx";
import { adminApi } from "../services/adminApi.js";

async function inspectFile(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use a JPEG, PNG, or WebP image.");
  if (file.size > 3 * 1024 * 1024) throw new Error("Carousel images must be 3 MB or smaller.");
  const url = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = reject; image.src = url; });
    if (dimensions.width < 800 || dimensions.height < 300) throw new Error("Carousel images must be at least 800 × 300 pixels.");
    return { url, ...dimensions, warning: Math.abs((dimensions.width / dimensions.height) - (16 / 9)) > 0.25 ? "This image differs from the recommended 16:9 banner ratio. It will be fitted without cropping." : "" };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function CarouselUploadModal({ open, onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [warning, setWarning] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setFile(null); setPreview(""); setWarning(""); setStatus("");
  }, [open]);
  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  const choose = async (selected) => {
    try {
      const info = await inspectFile(selected);
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
      setFile(selected); setPreview(info.url); setWarning(info.warning); setStatus(`${info.width} × ${info.height} · ${(selected.size / 1024 / 1024).toFixed(2)} MB`);
    } catch (error) { setFile(null); setPreview(""); setWarning(""); setStatus(error.message || "The selected image could not be read."); }
  };

  const upload = async () => {
    if (!file || saving) { if (!file) setStatus("Select a carousel image."); return; }
    setSaving(true); setStatus("Uploading to Cloudinary…");
    try {
      const data = await adminApi.createCarousel(file);
      onUploaded(data.item);
      onClose();
    } catch (error) { setStatus(error.message || "Carousel image could not be uploaded."); }
    finally { setSaving(false); }
  };

  return <AdminModal title="Add Carousel Image" open={open} onClose={onClose} footer={<><AdminButton variant="secondary" onClick={onClose}>Cancel</AdminButton><AdminButton loading={saving} onClick={upload}><Upload size={15} />Upload</AdminButton></>}><div className="grid gap-4">{preview && <img src={preview} alt="Selected carousel preview" className="aspect-video w-full border border-ink/10 object-contain" />}<label className="grid min-h-28 cursor-pointer place-items-center border border-dashed border-[var(--admin-border)] p-5 text-center text-sm font-bold transition hover:border-[var(--admin-primary)]"><span>{file ? file.name : "Choose Image"}</span><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => event.target.files?.[0] && choose(event.target.files[0])} /></label>{warning && <p className="bg-clay/10 p-3 text-sm font-semibold text-clay">{warning}</p>}{status && <p role="status" className="text-sm font-semibold text-ink/55">{status}</p>}</div></AdminModal>;
}

export default function CarouselPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [draggedId, setDraggedId] = useState("");
  const load = () => { setLoading(true); adminApi.carousel().then((data) => { setItems(data.items || []); setError(""); }).catch((err) => setError(err.message || "Carousel images could not be loaded.")).finally(() => setLoading(false)); };
  useEffect(load, []);

  const reorder = async (targetId) => {
    if (!draggedId || draggedId === targetId) return;
    const previous = items;
    const next = [...items];
    const from = next.findIndex((item) => item._id === draggedId);
    const to = next.findIndex((item) => item._id === targetId);
    const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
    setItems(next); setDraggedId(""); setError("");
    try { const data = await adminApi.reorderCarousel(next.map((item) => item._id)); setItems(data.items || next); setNotice("Carousel order updated."); }
    catch (err) { setItems(previous); setError(err.message || "Carousel order could not be updated."); }
  };
  const toggle = async (item) => { setError(""); try { const data = await adminApi.carouselStatus(item._id, !item.isActive); setItems((current) => current.map((entry) => entry._id === item._id ? data.item : entry)); setNotice(data.item.isActive ? "Carousel image enabled." : "Carousel image disabled."); } catch (err) { setError(err.message || "Carousel status could not be updated."); } };
  const remove = async (item) => { if (!window.confirm("Delete this carousel image?")) return; setError(""); try { await adminApi.deleteCarousel(item._id); setItems((current) => current.filter((entry) => entry._id !== item._id).map((entry, index) => ({ ...entry, order: index + 1 }))); setNotice("Carousel image deleted."); } catch (err) { setError(err.message || "Carousel image could not be deleted."); } };
  const uploaded = (item) => { setItems((current) => [...current, item].sort((a, b) => a.order - b.order)); setNotice("Carousel image uploaded."); setError(""); };

  return <><AdminPageHeader title="Homepage Carousel" description="Upload banners, choose which are live, and drag them into display order." action={<AdminButton onClick={() => setOpen(true)}><Plus size={16} />Add Carousel Image</AdminButton>} />{notice && <p role="status" className="mb-4 bg-leaf/10 p-3 text-sm font-semibold text-leaf">{notice}</p>}{error && <p role="alert" className="mb-4 bg-danger/10 p-3 text-sm font-semibold text-danger">{error}</p>}{loading ? <p className="py-10 text-center text-ink/50">Loading carousel images…</p> : <AdminTable columns={["Preview", "Status", "Order", "Actions"]} empty="No carousel images yet. Upload the first homepage banner." rows={items.map((item) => <tr key={item._id} draggable onDragStart={() => setDraggedId(item._id)} onDragEnd={() => setDraggedId("")} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(item._id)} className={`${draggedId === item._id ? "opacity-40" : ""} cursor-grab transition`}><td className="px-4 py-3"><div className="flex items-center gap-3"><GripVertical size={17} className="shrink-0 text-ink/35" aria-hidden="true" /><img src={item.imageUrl} alt="" className="h-16 w-28 border border-ink/10 object-contain" /></div></td><td className="px-4 py-3"><AdminBadge>{item.isActive ? "Active" : "Disabled"}</AdminBadge></td><td className="px-4 py-3 font-bold">Order {item.order}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><AdminButton variant="secondary" onClick={() => toggle(item)}>{item.isActive ? <EyeOff size={14} /> : <Eye size={14} />}{item.isActive ? "Disable" : "Enable"}</AdminButton><AdminButton variant="danger" onClick={() => remove(item)}><Trash2 size={14} />Delete</AdminButton></div></td></tr>)} />}<CarouselUploadModal open={open} onClose={() => setOpen(false)} onUploaded={uploaded} /></>;
}

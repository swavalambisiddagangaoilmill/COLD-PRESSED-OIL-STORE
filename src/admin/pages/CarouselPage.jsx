import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminBadge, AdminButton, AdminInput, AdminModal, AdminPageHeader, AdminTable } from "../components/AdminUi.jsx";
import { adminApi } from "../services/adminApi.js";

const emptyForm = { title: "", altText: "", imageUrl: "", storagePath: "", provider: "cloudinary", order: 1, isActive: true };

function Toggle({ checked, onChange }) {
  return <label className="flex items-center gap-2 text-sm font-semibold text-ink/65"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> Active</label>;
}

async function inspectFile(file) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) throw new Error("Use a JPEG, PNG, or WebP image.");
  if (file.size > 3 * 1024 * 1024) throw new Error("Carousel images must be 3 MB or smaller.");
  const url = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = reject; image.src = url; });
    return { url, ...dimensions, warning: Math.abs((dimensions.width / dimensions.height) - (16 / 9)) > 0.25 ? "This image differs from the recommended 16:9 banner ratio and may show empty space." : "" };
  } catch { URL.revokeObjectURL(url); throw new Error("The selected image could not be read."); }
}

function CarouselModal({ open, item, count, onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [warning, setWarning] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(item ? { ...emptyForm, ...item } : { ...emptyForm, order: count + 1 }); setPreview(item?.imageUrl || ""); setFile(null); setWarning(""); setStatus(""); }, [item, open, count]);
  const choose = async (selected) => {
    try { const info = await inspectFile(selected); if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); setFile(selected); setPreview(info.url); setWarning(info.warning); setStatus(`${info.width} × ${info.height} · ${(selected.size / 1024 / 1024).toFixed(2)} MB`); } catch (error) { setStatus(error.message); }
  };
  const save = async () => {
    if (!file && !form.imageUrl) { setStatus("Select a carousel image."); return; }
    setSaving(true);
    try {
      let payload = { ...form, order: Number(form.order) || 0 };
      if (file) {
        setStatus("Uploading image…");
        const uploaded = await adminApi.uploadImage(file, "carousel");
        const image = uploaded.image || uploaded;
        payload = { ...payload, imageUrl: image.url, storagePath: image.publicId || "", provider: image.provider || "cloudinary" };
        if (image.aspectWarning) setWarning(image.aspectWarning);
      }
      setStatus("Saving carousel record…");
      const result = await adminApi.saveCarousel(payload, item?._id);
      onSaved(result.item);
      onClose();
    } catch (error) { setStatus(error.message || "Failed to upload image. Please try again."); } finally { setSaving(false); }
  };
  return <AdminModal title={item ? "Edit Carousel Image" : "Add Carousel Image"} open={open} onClose={onClose} footer={<><AdminButton variant="secondary" onClick={onClose}>Cancel</AdminButton><AdminButton loading={saving} onClick={save}>Save</AdminButton></>}><div className="grid gap-4">{preview && <img src={preview} alt="Carousel preview" className="aspect-video w-full border border-ink/10 object-contain" />}<label className="grid cursor-pointer gap-2 border border-dashed border-[var(--admin-border)] p-4 text-center text-sm font-bold">{file ? file.name : item ? "Choose a replacement image" : "Select carousel image"}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => event.target.files?.[0] && choose(event.target.files[0])} /></label>{warning && <p className="bg-clay/10 p-3 text-sm font-semibold text-clay">{warning}</p>}{status && <p className="text-sm font-semibold text-ink/55">{status}</p>}<AdminInput label="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /><AdminInput label="Alt text" value={form.altText} onChange={(event) => setForm({ ...form, altText: event.target.value })} /><AdminInput label="Display order" type="number" min="0" value={form.order} onChange={(event) => setForm({ ...form, order: event.target.value })} /><Toggle checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} /></div></AdminModal>;
}

export default function CarouselPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const load = () => { setLoading(true); adminApi.carousel().then((data) => { setItems(data.items || []); setError(""); }).catch((err) => setError(err.message || "Failed to load carousel images.")).finally(() => setLoading(false)); };
  useEffect(load, []);
  const move = async (index, direction) => { const next = [...items]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; setItems(next); try { const data = await adminApi.reorderCarousel(next.map((item) => item._id)); setItems(data.items || next); } catch (err) { setError(err.message); load(); } };
  const toggle = async (item) => { try { const data = await adminApi.carouselStatus(item._id, !item.isActive); setItems((current) => current.map((entry) => entry._id === item._id ? data.item : entry)); } catch (err) { setError(err.message); } };
  const remove = async (item) => { if (!window.confirm("Delete this carousel image?")) return; try { await adminApi.deleteCarousel(item._id); setItems((current) => current.filter((entry) => entry._id !== item._id)); } catch (err) { setError(err.message || "Failed to delete image."); } };
  const saved = (item) => setItems((current) => current.some((entry) => entry._id === item._id) ? current.map((entry) => entry._id === item._id ? item : entry).sort((a, b) => a.order - b.order) : [...current, item].sort((a, b) => a.order - b.order));
  return <><AdminPageHeader title="Homepage Carousel" description="Manage the promotional banners currently available on the storefront." action={<AdminButton onClick={() => { setEditing(null); setOpen(true); }}><Plus size={16} />Add Carousel Image</AdminButton>} />{error && <p className="mb-4 bg-danger/10 p-3 text-sm font-semibold text-danger">{error}</p>}{loading ? <p className="py-10 text-center text-ink/50">Loading carousel images…</p> : <AdminTable columns={["Preview", "Title", "Status", "Order", "Storage", "Actions"]} empty="No active carousel images." rows={items.map((item, index) => <tr key={item._id}><td className="px-4 py-3"><img src={item.imageUrl} alt={item.altText || item.title} className="h-16 w-28 border border-ink/10 object-contain" /></td><td className="px-4 py-3"><p className="font-bold">{item.title || "Untitled image"}</p><p className="mt-1 max-w-xs truncate text-xs text-ink/45">{item.altText}</p></td><td className="px-4 py-3"><AdminBadge>{item.isActive ? "Active" : "Disabled"}</AdminBadge></td><td className="px-4 py-3 font-bold">{item.order}</td><td className="px-4 py-3 text-xs text-ink/55">{item.provider}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><AdminButton variant="secondary" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></AdminButton><AdminButton variant="secondary" disabled={index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></AdminButton><AdminButton variant="secondary" onClick={() => { setEditing(item); setOpen(true); }}><Pencil size={14} />Edit</AdminButton><AdminButton variant="secondary" onClick={() => toggle(item)}>{item.isActive ? <EyeOff size={14} /> : <Eye size={14} />}{item.isActive ? "Disable" : "Enable"}</AdminButton><AdminButton variant="danger" onClick={() => remove(item)}><Trash2 size={14} /></AdminButton></div></td></tr>)} /> }<CarouselModal open={open} item={editing} count={items.length} onClose={() => setOpen(false)} onSaved={saved} /></>;
}

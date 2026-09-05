import { useEffect, useMemo, useState } from "react";
import { AdminBadge, AdminButton, AdminCard, AdminInput, AdminPageHeader, AdminSelect, AdminTable } from "../components/AdminUi.jsx";
import { adminApi } from "../services/adminApi.js";

export default function DataCleanupPage() {
  const [types, setTypes] = useState([]); const [history, setHistory] = useState([]);
  const [dataType, setDataType] = useState(""); const [mode, setMode] = useState("selected");
  const [ids, setIds] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [preview, setPreview] = useState(null); const [phrase, setPhrase] = useState("");
  const [completed, setCompleted] = useState(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const load = async () => { const [typeData, historyData] = await Promise.all([adminApi.cleanupTypes(), adminApi.cleanupHistory()]); setTypes(typeData.types || []); setHistory(historyData.operations || []); setDataType((value) => value || typeData.types?.[0]?.value || ""); };
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  const selectedType = useMemo(() => types.find((item) => item.value === dataType), [types, dataType]);
  useEffect(() => { if (mode === "dateRange" && selectedType && !selectedType.supportsDateRange) setMode("selected"); setPreview(null); setPhrase(""); }, [dataType, mode, selectedType]);
  const createPreview = async () => { setLoading(true); setError(""); setCompleted(null); try { const payload = { dataType, mode, requestKey: crypto.randomUUID() }; if (mode === "selected") payload.ids = ids.split(/[\s,]+/).filter(Boolean); if (mode === "dateRange") { payload.from = from; payload.to = to; } setPreview(await adminApi.cleanupPreview(payload)); setPhrase(""); } catch (e) { setError(e.message); } finally { setLoading(false); } };
  const execute = async () => { setLoading(true); setError(""); try { const result = await adminApi.cleanupExecute(preview.operation.id, phrase); setCompleted(result.operation); setPreview(null); setPhrase(""); await load(); window.dispatchEvent(new CustomEvent("admin-data-cleanup-completed", { detail: { dataType } })); } catch (e) { setError(e.message); } finally { setLoading(false); } };
  const rows = history.map((item) => <tr key={item.id}><td className="px-4 py-3">{item.administrator || "Owner"}</td><td className="px-4 py-3 font-semibold capitalize">{item.dataType}</td><td className="px-4 py-3">{item.mode}</td><td className="px-4 py-3">{item.deletedCount}/{item.targetCount}</td><td className="px-4 py-3">{item.backupStatus}</td><td className="px-4 py-3"><AdminBadge>{item.status[0].toUpperCase() + item.status.slice(1)}</AdminBadge></td><td className="px-4 py-3 text-xs">{item.backupIdentifier || "—"}</td><td className="px-4 py-3 whitespace-nowrap">{new Date(item.createdAt).toLocaleString()}</td></tr>);
  return <div><AdminPageHeader title="Data Cleanup" description="OWNER-only cleanup with dependency checks and a verified encrypted backup before deletion." />
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</div>}
    {completed && <div role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-900">Backup: SUCCESS · Targeted: {completed.targetCount} · Deleted: {completed.deletedCount} · Remaining matching records: 0 · Provider-side data was not modified.</div>}
    <div className="grid gap-4 lg:grid-cols-2"><AdminCard title="Cleanup scope"><div className="mt-3 grid gap-3">
      <AdminSelect label="Business data type" value={dataType} onChange={(e) => setDataType(e.target.value)}>{types.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</AdminSelect>
      <AdminSelect label="Mode" value={mode} onChange={(e) => setMode(e.target.value)}><option value="selected">Selected record IDs</option>{selectedType?.supportsDateRange && <option value="dateRange">Date range</option>}<option value="all">Delete all of this type</option></AdminSelect>
      {mode === "selected" && <label className="grid gap-1.5 text-sm font-semibold text-ink/65"><span>MongoDB record IDs</span><textarea value={ids} onChange={(e) => setIds(e.target.value)} className="min-h-28 rounded-lg border border-ink/10 p-3" placeholder="Paste comma, space, or line-separated IDs" /></label>}
      {mode === "dateRange" && <div className="grid gap-3 sm:grid-cols-2"><AdminInput label="From (UTC date)" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><AdminInput label="To (UTC date, inclusive)" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>}
      {mode === "all" && <p className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">This targets every allowlisted {selectedType?.label?.toLowerCase()} record. Admin accounts, settings, indexes, and external provider data are never included.</p>}
      <AdminButton loading={loading} onClick={createPreview}>Preview exact records</AdminButton>
    </div></AdminCard>
    <AdminCard title="Verified backup and deletion">{!preview ? <p className="mt-3 text-sm text-ink/55">Create a preview to see the exact count, safety warnings, dependencies, and required confirmation phrase.</p> : <div className="mt-3 grid gap-3"><p className="text-2xl font-bold">{preview.operation.targetCount} record(s)</p><p className="text-xs text-ink/55">Mode: {preview.operation.mode}{preview.operation.filter?.from ? ` · ${new Date(preview.operation.filter.from).toLocaleString()} → ${new Date(preview.operation.filter.to).toLocaleString()}` : ""}</p>
      <div className="max-h-40 overflow-y-auto rounded-lg border border-ink/10 p-2 text-xs">{preview.records?.length ? preview.records.map((record) => <p key={record.id} className="border-b border-ink/5 py-1 last:border-0">{record.label} <span className="text-ink/40">({record.id})</span></p>) : "No matching records."}</div>
      {preview.operation.warnings?.map((warning) => <p key={warning} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>)}
      {preview.operation.blockers?.map((blocker) => <p key={blocker} className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Blocked: {blocker}</p>)}
      {!preview.operation.blockers?.length && <><p className="rounded-lg bg-blue-50 p-3 text-sm font-semibold text-blue-900">Backup status: READY TO CREATE. Deletion cannot start until the encrypted backup is persisted and verified.</p><p className="text-sm">Type <strong className="select-all">{preview.confirmationPhrase}</strong> to authorize the encrypted backup and deletion.</p><AdminInput label="Confirmation phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" /><AdminButton variant="danger" loading={loading} disabled={!preview.operation.targetCount || phrase !== preview.confirmationPhrase} onClick={execute}>Backup, verify, then delete</AdminButton></>}
    </div>}</AdminCard></div>
    <div className="mt-6"><h2 className="mb-3 text-lg font-bold">Cleanup history</h2><AdminTable columns={["Administrator", "Type", "Mode", "Deleted", "Backup", "Status", "Backup ID", "Created"]} rows={rows} empty="No cleanup operations yet." /></div>
  </div>;
}

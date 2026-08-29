// Secure WhatsApp marketing admin views; all recipient and template decisions remain server-owned.
import { useEffect, useMemo, useState } from "react";
import { AdminBadge, AdminButton, AdminCard, AdminInput, AdminModal, AdminPageHeader, AdminSelect, AdminTable } from "../components/AdminUi.jsx";
import { adminApi } from "../services/adminApi.js";

function ErrorMessage({ message }) { return message ? <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm font-semibold text-danger">{message}</p> : null; }
function Loading({ show }) { return show ? <p className="py-8 text-center text-sm font-semibold text-ink/50">Loading…</p> : null; }
function Cell({ children }) { return <td className="whitespace-nowrap px-4 py-3 text-sm text-ink/70">{children}</td>; }
const statusLabel = (value = "") => value.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");

export function WhatsAppOverviewPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { adminApi.whatsappOverview().then(setData).catch((err) => setError(err.message)); }, []);
  return <><AdminPageHeader title="WhatsApp Overview" description="Consent-safe marketing activity through approved Meta templates." /><ErrorMessage message={error} /><Loading show={!data && !error} />{data && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AdminCard title="Opted-in customers" value={String(data.optedInCustomers)} note="Eligible valid recipients" /><AdminCard title="Campaigns" value={String(data.campaigns)} /><AdminCard title="Messages sent" value={String(data.sent)} /><AdminCard title="Failed" value={String(data.failed)} /></div>}{data?.latestCampaign && <section className="mt-5 rounded-xl border border-ink/10 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.12em] text-ink/45">Latest campaign</p><div className="mt-3 flex flex-wrap items-center gap-4"><strong>{data.latestCampaign.name}</strong><AdminBadge>{statusLabel(data.latestCampaign.status)}</AdminBadge><span className="text-sm text-ink/55">{data.latestCampaign.sentCount}/{data.latestCampaign.recipientCount} sent</span></div></section>}</>;
}

export function WhatsAppMarketingPage() {
  const [templates, setTemplates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [audience, setAudience] = useState("opted_in_customers");
  const [selectedIds, setSelectedIds] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState({});
  const [name, setName] = useState("");
  const [recipientCount, setRecipientCount] = useState(0);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const selectedTemplate = useMemo(() => templates.find((item) => item.id === templateId), [templates, templateId]);
  const criteria = useMemo(() => ({ audience, ...(audience === "individual_customers" ? { customerIds: selectedIds } : {}) }), [audience, selectedIds]);

  useEffect(() => {
    Promise.all([adminApi.whatsappTemplates(), adminApi.whatsappCustomers()]).then(([templateData, customerData]) => {
      const items = templateData.items || [];
      setTemplates(items); setCustomers(customerData.items || []);
      if (items[0]) { setTemplateId(items[0].id); setVariables(Object.fromEntries(items[0].variables.map((item) => [item.key, ""]))); }
    }).catch((err) => setError(err.message));
  }, []);
  useEffect(() => {
    if (audience === "individual_customers" && !selectedIds.length) { setRecipientCount(0); return; }
    const timer = window.setTimeout(() => adminApi.whatsappAudiencePreview(criteria).then((data) => setRecipientCount(data.recipientCount)).catch(() => setRecipientCount(0)), 250);
    return () => window.clearTimeout(timer);
  }, [criteria, audience, selectedIds.length]);
  useEffect(() => {
    if (!templateId || !selectedTemplate || selectedTemplate.variables.some((item) => !String(variables[item.key] || "").trim())) { setPreview(""); return; }
    const timer = window.setTimeout(() => adminApi.whatsappTemplatePreview({ templateId, variables }).then((data) => setPreview(data.preview)).catch(() => setPreview("")), 200);
    return () => window.clearTimeout(timer);
  }, [templateId, variables, selectedTemplate]);

  const payload = () => ({ name, templateId, variables, ...criteria });
  const sendTest = async () => { setPending("test"); setError(""); setNotice(""); try { await adminApi.whatsappTest({ templateId, variables }); setNotice("Test message sent to the configured test destination."); } catch (err) { setError(err.message); } finally { setPending(""); } };
  const sendCampaign = async () => { setPending("campaign"); setError(""); try { const result = await adminApi.whatsappCreateCampaign(payload(), idempotencyKey); setNotice(result.duplicate ? "This campaign request was already accepted." : "Campaign queued safely."); setConfirming(false); setIdempotencyKey(""); } catch (err) { setError(err.message); } finally { setPending(""); } };
  const canSend = recipientCount > 0 && templateId && selectedTemplate?.variables.every((item) => String(variables[item.key] || "").trim());

  return <><AdminPageHeader title="WhatsApp Marketing" description="Send approved templates only to customers who have explicitly opted in." /><ErrorMessage message={error} />{notice && <p className="mb-4 rounded-lg bg-leaf/10 p-3 text-sm font-semibold text-leaf">{notice}</p>}<div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]"><section className="grid gap-4 rounded-xl border border-ink/10 bg-white p-5 shadow-sm"><AdminInput label="Campaign name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="August offer" /><AdminSelect label="Audience" value={audience} onChange={(e) => { setAudience(e.target.value); setSelectedIds([]); }}><option value="opted_in_customers">All opted-in customers</option><option value="recent_customers">Recent customers (30 days)</option><option value="previous_buyers">Previous buyers</option><option value="individual_customers">Individual customers</option></AdminSelect>{audience === "individual_customers" && <div><p className="mb-2 text-sm font-semibold text-ink/65">Eligible opted-in customers</p><div className="max-h-56 overflow-y-auto rounded-lg border border-ink/10">{customers.map((customer) => <label key={customer.id} className="flex items-center gap-3 border-b border-ink/10 px-3 py-2 text-sm last:border-0"><input type="checkbox" checked={selectedIds.includes(customer.id)} onChange={(e) => setSelectedIds((current) => e.target.checked ? [...current, customer.id] : current.filter((id) => id !== customer.id))} /><span className="font-semibold">{customer.name}</span><span className="ml-auto text-ink/45">{customer.maskedPhone}</span></label>)}</div></div>}<div className="rounded-lg bg-linen p-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-ink/45">Recipients</p><p className="mt-1 text-2xl font-bold">{recipientCount} customers</p></div><AdminSelect label="Approved template" value={templateId} onChange={(e) => { const id = e.target.value; const template = templates.find((item) => item.id === id); setTemplateId(id); setVariables(Object.fromEntries((template?.variables || []).map((item) => [item.key, ""]))); }}>{templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</AdminSelect>{selectedTemplate?.variables.map((item) => <AdminInput key={item.key} label={item.label} value={variables[item.key] || ""} maxLength={item.maxLength} onChange={(e) => setVariables((current) => ({ ...current, [item.key]: e.target.value }))} />)}<div className="flex flex-wrap gap-2"><AdminButton variant="secondary" disabled={!canSend} loading={pending === "test"} onClick={sendTest}>Send Test</AdminButton><AdminButton disabled={!canSend} onClick={() => { setIdempotencyKey(crypto.randomUUID()); setConfirming(true); }}>Send Campaign</AdminButton></div></section><section className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.12em] text-ink/45">Message preview</p><div className="mt-4 rounded-xl bg-[#e7f7df] p-4 text-sm leading-6 text-ink shadow-sm">{preview || "Fill the approved template variables to preview the message."}</div><p className="mt-4 text-xs leading-5 text-ink/45">The actual Meta template body cannot be edited here. Recipient eligibility is recalculated by the backend before every send.</p></section></div><AdminModal title="Confirm WhatsApp campaign" open={confirming} onClose={() => !pending && setConfirming(false)} footer={<><AdminButton variant="secondary" disabled={Boolean(pending)} onClick={() => setConfirming(false)}>Cancel</AdminButton><AdminButton loading={pending === "campaign"} onClick={sendCampaign}>Confirm & Send</AdminButton></>}><p className="text-sm leading-6">Send this campaign to <strong>{recipientCount} opted-in customers</strong>?</p><p className="mt-3 text-sm text-ink/55">Customers who opt out or become invalid before processing will be skipped automatically.</p></AdminModal></>;
}

export function WhatsAppHistoryPage() {
  const [items, setItems] = useState([]);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => adminApi.whatsappCampaigns().then((data) => setItems(data.items || [])).catch((err) => setError(err.message)).finally(() => setLoading(false));
  useEffect(load, []);
  const open = async (id) => { try { const data = await adminApi.whatsappCampaign(id); setDetail(data.campaign); } catch (err) { setError(err.message); } };
  return <><AdminPageHeader title="WhatsApp Message History" description="Campaign results and consent-safe recipient status." action={<AdminButton variant="secondary" onClick={load}>Refresh</AdminButton>} /><ErrorMessage message={error} /><Loading show={loading} />{!loading && <AdminTable columns={["Date", "Campaign", "Template", "Recipients", "Sent", "Delivered", "Failed", "Status"]} rows={items.map((item) => <tr key={item.id} className="cursor-pointer hover:bg-linen/50" onClick={() => open(item.id)}><Cell>{new Date(item.createdAt).toLocaleString("en-IN")}</Cell><Cell><button className="font-bold text-[var(--admin-primary)]">{item.name}</button></Cell><Cell>{item.templateId}</Cell><Cell>{item.recipientCount}</Cell><Cell>{item.sentCount}</Cell><Cell>{item.deliveredCount}</Cell><Cell>{item.failedCount}</Cell><Cell><AdminBadge>{statusLabel(item.status)}</AdminBadge></Cell></tr>)} /> }<AdminModal title={detail?.name || "Campaign details"} open={Boolean(detail)} onClose={() => setDetail(null)}>{detail && <><div className="mb-4 grid grid-cols-2 gap-3 text-sm"><p>Audience: <strong>{statusLabel(detail.audience)}</strong></p><p>Status: <strong>{statusLabel(detail.status)}</strong></p><p>Recipients: <strong>{detail.recipientCount}</strong></p><p>Initiated by: <strong>{detail.initiatedBy?.name || "Admin"}</strong></p></div><AdminTable columns={["Customer", "Phone", "Opt-in", "Result"]} rows={detail.recipients.map((recipient, index) => <tr key={`${recipient.customerId}-${index}`}><Cell>{recipient.name}</Cell><Cell>{recipient.maskedPhone}</Cell><Cell>{recipient.optedIn ? "Yes" : "No"}</Cell><Cell><AdminBadge>{statusLabel(recipient.status)}</AdminBadge></Cell></tr>)} /></>}</AdminModal></>;
}

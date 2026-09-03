// Displays shipment tracking details for real and development mock shipments.
import { ArrowLeft, CheckCircle, Circle, Package, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Breadcrumb from "../components/common/Breadcrumb.jsx";
import Button from "../components/ui/Button.jsx";
import Container from "../components/ui/Container.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { advanceMockShipment, fetchOrderTracking } from "../services/orderService.js";

const fallbackSteps = [
  { status: "ready_for_pickup", label: "Ready to Ship" },
  { status: "picked_up", label: "Picked Up" },
  { status: "shipped", label: "Shipped" },
  { status: "in_transit", label: "In Transit" },
  { status: "out_for_delivery", label: "Out for Delivery" },
  { status: "delivered", label: "Delivered" },
];

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";
}

export default function TrackOrder() {
  const { id } = useParams();
  const { user } = useAuth();
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState("");

  async function loadTracking() {
    setError("");
    const data = await fetchOrderTracking(id);
    setTracking(data);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadTracking().catch((err) => active && setError(err.message || "Unable to load tracking."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const order = tracking?.order;
  const steps = useMemo(() => tracking?.steps?.length ? tracking.steps : fallbackSteps, [tracking]);
  const currentIndex = Math.max(0, steps.findIndex((step) => step.status === order?.shippingStatus));
  const canAdvance = order?.isMockShipment && user?.role === "admin" && order?.shippingStatus !== "delivered";

  const handleAdvance = async () => {
    setAdvancing(true);
    setError("");
    try {
      const data = await advanceMockShipment(id);
      setTracking((current) => ({ ...(current || {}), order: data.order, steps: current?.steps || fallbackSteps }));
    } catch (err) {
      setError(err.message || "Unable to advance mock shipment.");
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <>
      <Breadcrumb items={[{ label: "My Account", href: "/account" }, { label: "Track Order" }]} />
      <section className="section-padding">
        <Container className="max-w-5xl">
          <Link to={`/account/orders/${id}`} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-leaf"><ArrowLeft size={17} /> Back to order</Link>
          {loading && <div className="rounded-[2rem] bg-white p-6 shadow-sm"><div className="h-8 w-52 animate-pulse rounded-full bg-linen" /><div className="mt-5 h-64 animate-pulse rounded-2xl bg-linen" /></div>}
          {!loading && error && <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm"><Package className="mx-auto text-leaf" /><h1 className="mt-4 font-serif text-4xl font-semibold">Tracking unavailable</h1><p className="mt-3 text-ink/60">{error}</p><Button to="/account" className="mt-6">Back to Account</Button></div>}
          {!loading && order && !error && <div className="rounded-[2rem] border border-ink/10 bg-white p-5 shadow-sm sm:p-8">
            <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-clay">Order {order._id}</p>
                <h1 className="mt-3 font-serif text-4xl font-semibold sm:text-5xl">Track Order</h1>
                <p className="mt-3 text-sm font-semibold text-ink/55">{order.awbCode ? "Shipment tracking active" : "Courier assignment pending"}</p>
              </div>
              <div className="rounded-2xl bg-cream p-4 text-sm">
                <p className="font-bold text-ink">AWB {order.awbCode || "Pending"}</p>
                <p className="mt-1 text-ink/55">{order.isMockShipment ? "Development mock shipment" : "Live shipment"}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-4">
              {steps.map((step, index) => {
                const done = index <= currentIndex;
                const history = (order.mockShippingHistory || []).find((item) => item.status === step.status);
                return <div key={step.status} className="grid grid-cols-[36px_1fr] gap-4">
                  <div className="flex flex-col items-center">
                    <span className={`grid h-9 w-9 place-items-center rounded-full ${done ? "bg-leaf text-white" : "bg-linen text-ink/35"}`}>{done ? <CheckCircle size={18} /> : <Circle size={18} />}</span>
                    {index < steps.length - 1 && <span className={`mt-2 h-10 w-px ${index < currentIndex ? "bg-leaf" : "bg-ink/10"}`} />}
                  </div>
                  <div className="rounded-2xl border border-ink/10 p-4">
                    <p className="font-serif text-2xl font-semibold">{step.label}</p>
                    <p className="mt-1 text-sm text-ink/55">{history ? formatDate(history.createdAt) : done ? "Updated" : "Pending"}</p>
                  </div>
                </div>;
              })}
            </div>

            {canAdvance && <div className="mt-8 rounded-2xl bg-cream p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-white text-leaf"><Truck size={18} /></span><p className="text-sm font-semibold text-ink/65">Development admin testing: move this mock shipment to the next status.</p></div>
              <Button type="button" loading={advancing} onClick={handleAdvance} className="mt-4 sm:mt-0">Move to Next Status</Button>
            </div>}
          </div>}
        </Container>
      </section>
    </>
  );
}

import { useMemo } from "react";
import { useDispatchStore } from "../data/store";

// 视图层：顶部指标

export default function Metrics() {
  const orders = useDispatchStore((s) => s.orders);
  const trips = useDispatchStore((s) => s.trips);
  const handovers = useDispatchStore((s) => s.handovers);

  const metrics = useMemo(() => {
    const assignedIds = new Set<string>();
    let activeWeight = 0;
    trips.forEach((t) => {
      if (t.status === "completed") return;
      t.stops.forEach((st) => {
        assignedIds.add(st.orderId);
        const order = orders.find((o) => o.id === st.orderId);
        if (order) activeWeight += order.weightKg;
      });
    });
    return [
      { label: "待分配订单", value: orders.filter((o) => !assignedIds.has(o.id)).length },
      { label: "运输中车次", value: trips.filter((t) => t.status === "in_transit").length },
      { label: "在途占用重量", value: `${activeWeight}kg` },
      { label: "待生效交接单", value: handovers.filter((h) => h.status === "pending").length }
    ];
  }, [orders, trips, handovers]);

  return (
    <section className="metrics">
      {metrics.map((m) => (
        <article className="metric" key={m.label}>
          <span>{m.label}</span>
          <strong>{m.value}</strong>
        </article>
      ))}
    </section>
  );
}

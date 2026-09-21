import { CSS } from "@dnd-kit/utilities";
import { useDraggable } from "@dnd-kit/core";
import type { ConflictField, Order } from "../types";
import { orderHandoverChain, zoneLabel } from "../utils/helpers";
import { useScheduleStore } from "../store/scheduleStore";

interface Props {
  order: Order;
  frozen?: boolean;
  conflictFields?: ConflictField[];
  chainBadge?: boolean;
}

const FIELD_NAME: Record<ConflictField, string> = {
  window: "时段",
  zone: "温区",
  capacity: "载重",
  frozen: "冻结",
  departed: "已锁",
  structure: "无效"
};

export default function OrderCard({ order, frozen, conflictFields, chainBadge = true }: Props) {
  const handovers = useScheduleStore((s) => s.handovers);
  const trips = useScheduleStore((s) => s.trips);
  const unassignOrder = useScheduleStore((s) => s.unassignOrder);
  const markDelivered = useScheduleStore((s) => s.markDelivered);

  const draggable = order.status === "unassigned" || order.status === "assigned";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `order-${order.id}`,
    disabled: !draggable || frozen
  });

  const chain = chainBadge ? orderHandoverChain(handovers, order.id) : [];
  const inTransit = order.status === "inTransit";
  const delivered = order.status === "delivered";

  return (
    <article
      ref={setNodeRef}
      className={`order-card zone-${order.zone}${isDragging ? " dragging" : ""}${frozen ? " frozen" : ""}${
        delivered ? " delivered" : ""
      }`}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      {...(draggable && !frozen ? listeners : {})}
      {...(draggable && !frozen ? attributes : {})}
      title={draggable && !frozen ? "拖动排到车次" : frozen ? "交接单未生效，订单冻结" : undefined}
    >
      <header className="order-head">
        <strong>{order.orderNo}</strong>
        <span className={`zone-pill ${order.zone}`}>
          {zoneLabel(order.zone)}
          {order.zone !== "ambient" && <em>冷链</em>}
        </span>
      </header>
      <p className="order-dest">{order.destination}</p>
      <div className="order-meta">
        <span>送达 {order.windowStart}–{order.windowEnd}</span>
        <span>{order.weight}kg</span>
      </div>
      {order.note && <p className="order-note">{order.note}</p>}

      {conflictFields && conflictFields.length > 0 && (
        <div className="conflict-row">
          {conflictFields.map((f) => (
            <span key={f} className={`conflict-chip ${f}`}>{FIELD_NAME[f]}不符</span>
          ))}
        </div>
      )}

      {frozen && <p className="frozen-tag">交接冻结 · 原车占用未释放</p>}

      {chain.length > 0 && (
        <p className="chain-tag">
          交接链：
          {chain
            .map((h) => {
              const from = trips.find((t) => t.id === h.fromTripId)?.code ?? "?";
              const to = trips.find((t) => t.id === h.toTripId)?.code ?? "?";
              return `${h.code} ${from}→${to}（${h.status === "effective" ? "已生效" : h.status === "pending" ? "待生效" : "已作废"}）`;
            })
            .join("；")}
        </p>
      )}

      <footer className="order-actions">
        {order.status === "assigned" && (
          <button type="button" className="mini" onClick={() => unassignOrder(order.id)}>
            撤出回池
          </button>
        )}
        {inTransit && (
          <button
            type="button"
            className="mini"
            disabled={frozen}
            onClick={() => markDelivered(order.id)}
          >
            确认送达
          </button>
        )}
        {delivered && <span className="delivered-text">已送达</span>}
      </footer>
    </article>
  );
}

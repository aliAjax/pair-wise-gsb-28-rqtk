import { useDroppable } from "@dnd-kit/core";
import type { ConflictField, Order, Trip } from "../types";
import { frozenOrderIds, incomingPending, occupiedWeight, outgoingPending, tripOrders, zoneLabel } from "../utils/helpers";
import { orderTripConflicts } from "../rules/validation";
import { useScheduleStore } from "../store/scheduleStore";
import OrderCard from "./OrderCard";

interface Props {
  trip: Trip;
  draggedOrder: Order | null;
}

export default function TripCard({ trip, draggedOrder }: Props) {
  const orders = useScheduleStore((s) => s.orders);
  const handovers = useScheduleStore((s) => s.handovers);
  const depart = useScheduleStore((s) => s.depart);
  const openHandoverModal = useScheduleStore((s) => s.openHandoverModal);
  const rejectFlash = useScheduleStore((s) => s.rejectFlash);

  const { setNodeRef, isOver } = useDroppable({ id: `trip-${trip.id}` });

  const tripOrderList = tripOrders(orders, trip.id);
  const frozen = frozenOrderIds(handovers);
  const used = occupiedWeight(orders, trip.id);
  const over = used > trip.capacity;
  const departed = trip.status === "departed";
  const incoming = incomingPending(handovers, trip.id);
  const outgoing = outgoingPending(handovers, trip.id);

  // 拖动悬停时，实时算出该订单对本车的冲突字段，标红目标字段。
  let previewFields: ConflictField[] = [];
  if (draggedOrder) {
    previewFields = orderTripConflicts(draggedOrder, trip, frozen);
    const capacityHit = used + draggedOrder.weight > trip.capacity;
    if (capacityHit && !previewFields.includes("capacity")) previewFields.push("capacity");
  }
  const flash = rejectFlash?.targetId === trip.id ? rejectFlash : null;
  const highlight = new Set<ConflictField>([...previewFields, ...(flash?.fields ?? [])]);

  return (
    <article
      ref={setNodeRef}
      className={`trip-card ${departed ? "departed" : "scheduled"}${isOver ? " over" : ""}${
        highlight.size ? " has-conflict" : ""
      }`}
    >
      <header className="trip-head">
        <div>
          <div className="trip-title-row">
            <strong className="trip-code">{trip.code}</strong>
            <span className={`zone-pill ${trip.zone}`}>{zoneLabel(trip.zone)}</span>
            {departed ? (
              <span className="status-badge departed">已发车 · 已锁</span>
            ) : (
              <span className="status-badge scheduled">已排待发</span>
            )}
          </div>
          <p className="trip-sub">
            司机 <b>{trip.driver}</b> · 时段{" "}
            <span className={highlight.has("window") ? "field-bad" : ""}>
              {trip.windowStart}–{trip.windowEnd}
            </span>
          </p>
        </div>
        <div className="trip-actions">
          {!departed && (
            <button type="button" className="mini primary" onClick={() => depart(trip.id)}>
              发车
            </button>
          )}
          {departed && (
            <button type="button" className="mini warn" onClick={() => openHandoverModal(trip.id)}>
              改派（建交接单）
            </button>
          )}
        </div>
      </header>

      <div className={`capacity ${over ? "over" : ""}${highlight.has("capacity") ? " field-bad" : ""}`}>
        <div className="capacity-bar">
          <div className="capacity-fill" style={{ width: `${Math.min(100, (used / trip.capacity) * 100)}%` }} />
        </div>
        <span>
          载重 {used}/{trip.capacity}kg{over && <b className="bad"> · 超限</b>}
        </span>
      </div>

      {incoming.length > 0 && (
        <p className="incoming-tag">
          待生效交接 {incoming.length} 单（{incoming.map((h) => h.code).join("、")}）：生效前不得发车
        </p>
      )}
      {outgoing.length > 0 && (
        <p className="outgoing-tag">
          改派处理中 {outgoing.length} 单（{outgoing.map((h) => h.code).join("、")}）：原车占用未释放
        </p>
      )}

      <ol className="trip-order-list">
        {tripOrderList.length === 0 && <li className="trip-empty">拖入订单排车（时段/温区/载重不符会整次拒绝）</li>}
        {tripOrderList.map((order) => (
          <li key={order.id} className="trip-order-item">
            <span className="seq">{order.position + 1}</span>
            <OrderCard order={order} frozen={frozen.has(order.id)} />
          </li>
        ))}
      </ol>
    </article>
  );
}

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import type { Order } from "../types";
import { useScheduleStore } from "../store/scheduleStore";
import { frozenOrderIds, zoneLabel } from "../utils/helpers";
import OrderCard from "./OrderCard";
import TripCard from "./TripCard";

function UnassignedPool() {
  const orders = useScheduleStore((s) => s.orders);
  const handovers = useScheduleStore((s) => s.handovers);
  const { setNodeRef, isOver } = useDroppable({ id: "pool-unassigned" });
  const frozen = frozenOrderIds(handovers);
  const list = useMemo(
    () => orders.filter((o) => o.status === "unassigned"),
    [orders]
  );

  return (
    <section ref={setNodeRef} className={`column pool-column${isOver ? " over" : ""}`}>
      <header className="column-head">
        <h2>待分配</h2>
        <span className="column-count">{list.length}</span>
      </header>
      <p className="column-hint">拖到车次排车；已排订单也可拖回这里撤出。</p>
      <div className="pool-list">
        {list.length === 0 && <div className="empty">待分配池为空</div>}
        {list.map((order) => (
          <OrderCard key={order.id} order={order} frozen={frozen.has(order.id)} />
        ))}
      </div>
    </section>
  );
}

export default function Board() {
  const trips = useScheduleStore((s) => s.trips);
  const orders = useScheduleStore((s) => s.orders);
  const assignOrder = useScheduleStore((s) => s.assignOrder);
  const unassignOrder = useScheduleStore((s) => s.unassignOrder);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const scheduled = trips.filter((t) => t.status === "scheduled");
  const departed = trips.filter((t) => t.status === "departed");

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id).replace("order-", "");
    setActiveOrder(orders.find((o) => o.id === id) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    const orderId = String(event.active.id).replace("order-", "");
    const target = event.over ? String(event.over.id) : null;
    setActiveOrder(null);
    if (!target) return;

    if (target === "pool-unassigned") {
      unassignOrder(orderId);
      return;
    }
    if (target.startsWith("trip-")) {
      const toTripId = target.replace("trip-", "");
      assignOrder(orderId, toTripId);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="board">
        <UnassignedPool />

        <section className="column trips-column">
          <header className="column-head">
            <h2>已排车次</h2>
            <span className="column-count">{scheduled.length}</span>
          </header>
          <p className="column-hint">发车前可继续拖入/撤出；发车后顺序、司机、温区锁定。</p>
          <div className="trip-list">
            {scheduled.length === 0 && <div className="empty">暂无未发车次</div>}
            {scheduled.map((trip) => (
              <TripCard key={trip.id} trip={trip} draggedOrder={activeOrder} />
            ))}
          </div>
        </section>

        <section className="column trips-column in-transit">
          <header className="column-head">
            <h2>运输中车次</h2>
            <span className="column-count">{departed.length}</span>
          </header>
          <p className="column-hint">已锁，不可再装货；改派必须先建交接单，生效后原车才释放占用。</p>
          <div className="trip-list">
            {departed.length === 0 && <div className="empty">暂无运输中车次</div>}
            {departed.map((trip) => (
              <TripCard key={trip.id} trip={trip} draggedOrder={activeOrder} />
            ))}
          </div>
        </section>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeOrder ? (
          <div className="drag-ghost">
            <strong>{activeOrder.orderNo}</strong>
            <span>
              {zoneLabel(activeOrder.zone)} · {activeOrder.weight}kg · {activeOrder.windowStart}–{activeOrder.windowEnd}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

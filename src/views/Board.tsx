import { useMemo, useState } from "react";
import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { message } from "antd";
import { Order } from "../data/types";
import { useDispatchStore } from "../data/store";
import {
  assignedTripId,
  evaluateAssign,
  getOrder,
  getTrip
} from "../rules/dispatch";
import OrderCard, { parseOrderDragId, parseStopDroppableId } from "./OrderCard";
import TripCard from "./TripCard";
import NewOrderModal from "./NewOrderModal";
import HandoverModal from "./HandoverModal";
import AddTripButton from "./AddTripButton";

const POOL_ID = "pool-unassigned";

function PoolColumn({ orders }: { orders: Order[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: POOL_ID });
  return (
    <section ref={setNodeRef} className={`column column-pool ${isOver ? "is-over" : ""}`}>
      <header className="column-head">
        <h2>待分配</h2>
        <span className="column-count">{orders.length}</span>
      </header>
      <p className="column-hint">拖入车次即排班；从已排车次松回本栏即摘回待分配</p>
      <div className="column-body pool-cards">
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} draggable />
        ))}
        {orders.length === 0 && <div className="empty">暂无待分配订单</div>}
      </div>
    </section>
  );
}

const customCollision: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  return rectIntersection(args);
};

export default function Board() {
  const orders = useDispatchStore((s) => s.orders);
  const trips = useDispatchStore((s) => s.trips);
  const assign = useDispatchStore((s) => s.assign);
  const unassign = useDispatchStore((s) => s.unassign);

  const [draggingOrderId, setDraggingOrderId] = useState<string | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [reassignTripId, setReassignTripId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const assignedOrderIds = useMemo(() => {
    const set = new Set<string>();
    trips.forEach((t) => t.stops.forEach((st) => set.add(st.orderId)));
    return set;
  }, [trips]);

  const poolOrders = useMemo(
    () => orders.filter((o) => !assignedOrderIds.has(o.id)),
    [orders, assignedOrderIds]
  );

  const scheduledTrips = trips.filter((t) => t.status === "scheduled");
  const transitTrips = trips.filter((t) => t.status !== "scheduled");

  function reject(reason: string) {
    message.error({ content: `${reason}（布局未改动）`, duration: 2.4 });
  }

  function onDragStart(e: DragStartEvent) {
    setDraggingOrderId(parseOrderDragId(String(e.active.id)));
  }

  function onDragEnd(e: DragEndEvent) {
    const orderId = parseOrderDragId(String(e.active.id));
    const overId = e.over ? String(e.over.id) : "";
    setDraggingOrderId(null);
    if (!orderId) return;

    const state = useDispatchStore.getState();

    // 松到待分配栏：从已排车次摘回
    if (overId === POOL_ID) {
      const tid = assignedTripId(state, orderId);
      if (tid) {
        const trip = getTrip(state, tid);
        if (trip?.status !== "scheduled") {
          reject("发车后车次已锁定，不能摘回；请使用改派（交接单）");
          return;
        }
        unassign(orderId);
      }
      return;
    }

    // 松到停靠槽：同车次重排 / 跨车次插入
    const stopTarget = parseStopDroppableId(overId);
    if (stopTarget) {
      const targetTrip = getTrip(state, stopTarget.tripId);
      if (!targetTrip) {
        reject("车次不存在");
        return;
      }
      const result = assign(stopTarget.tripId, orderId, stopTarget.index);
      if (!result.ok) reject(result.message ?? "整次拒绝");
      return;
    }

    // 松到车次卡：追加末尾
    if (overId.startsWith("trip-")) {
      const tripId = overId.slice("trip-".length);
      const targetTrip = getTrip(state, tripId);
      if (!targetTrip) {
        reject("车次不存在");
        return;
      }
      const result = evaluateAssign(state, targetTrip, orderId);
      if (!result.ok) {
        reject(result.message ?? "整次拒绝");
        return;
      }
      assign(tripId, orderId, targetTrip.stops.length);
    }
  }

  const draggingOrder = draggingOrderId ? getOrder(useDispatchStore.getState(), draggingOrderId) : undefined;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={customCollision}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDraggingOrderId(null)}
      >
        <div className="board-toolbar">
          <button type="button" onClick={() => setNewOrderOpen(true)}>
            ＋ 新增待分配订单
          </button>
          <AddTripButton />
          <span className="toolbar-hint">
            规则：送达时段须落在车辆班次内 · 冷链↔冷藏 · 不超载重；不符整次拒绝且不动布局
          </span>
        </div>

        <div className="board">
          <PoolColumn orders={poolOrders} />

          <section className="column column-scheduled">
            <header className="column-head">
              <h2>已排车次</h2>
              <span className="column-count">{scheduledTrips.length}</span>
            </header>
            <p className="column-hint">发车前可调整停靠顺序与换车；发车后顺序 / 司机 / 温区锁定</p>
            <div className="column-body">
              {scheduledTrips.map((trip) => (
                <TripCard key={trip.id} trip={trip} draggingOrderId={draggingOrderId} onReassign={setReassignTripId} />
              ))}
              {scheduledTrips.length === 0 && <div className="empty">暂无已排车次</div>}
            </div>
          </section>

          <section className="column column-transit">
            <header className="column-head">
              <h2>运输中 / 已完成</h2>
              <span className="column-count">{transitTrips.length}</span>
            </header>
            <p className="column-hint">车次已锁；改派先建交接单，生效前原车占用不释放、新车不得装货</p>
            <div className="column-body">
              {transitTrips.map((trip) => (
                <TripCard key={trip.id} trip={trip} draggingOrderId={draggingOrderId} onReassign={setReassignTripId} />
              ))}
              {transitTrips.length === 0 && <div className="empty">暂无运输中车次</div>}
            </div>
          </section>

          <DragOverlay dropAnimation={null}>
            {draggingOrder ? (
              <div className="drag-overlay">
                <OrderCard order={draggingOrder} draggable={false} />
              </div>
            ) : null}
          </DragOverlay>
        </div>
      </DndContext>

      <NewOrderModal open={newOrderOpen} onClose={() => setNewOrderOpen(false)} />
      <HandoverModal tripId={reassignTripId} onClose={() => setReassignTripId(null)} />
    </>
  );
}

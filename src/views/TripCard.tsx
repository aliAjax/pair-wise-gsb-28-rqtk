import { useDroppable } from "@dnd-kit/core";
import { ConflictKind, DispatchState, Handover, Order, Trip } from "../data/types";
import { useDispatchStore } from "../data/store";
import {
  describeConflicts,
  evaluateAssign,
  getOrder,
  getVehicle,
  orderInPendingHandover,
  pendingHandoverForTrip,
  tripHandoverChain,
  undeliveredStops,
  usedCapacity
} from "../rules/dispatch";
import OrderCard, { stopDroppableId } from "./OrderCard";
import { fmtDateTime, windowLabel } from "./format";

interface TripCardProps {
  trip: Trip;
  draggingOrderId: string | null;
  onReassign: (tripId: string) => void;
}

function InsertSlot({ tripId, index, active }: { tripId: string; index: number; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stopDroppableId(tripId, index) });
  return (
    <div ref={setNodeRef} className={`insert-slot${isOver ? " over" : ""}${active ? " active" : ""}`} />
  );
}

function conflictPreview(state: DispatchState, trip: Trip, orderId: string | null) {
  if (!orderId) return { kinds: [] as ConflictKind[], locked: false };
  const result = evaluateAssign(state, trip, orderId);
  return { kinds: result.conflicts, locked: result.conflicts.includes("locked") };
}

function HandoverBanner({
  ho,
  state,
  role
}: {
  ho: Handover;
  state: DispatchState;
  role: "from" | "to";
}) {
  const apply = useDispatchStore((s) => s.applyHandover);
  const revoke = useDispatchStore((s) => s.revokeHandover);
  const toVehicle = getVehicle(state, ho.toVehicleId);
  const fromVehicle = getVehicle(state, ho.fromVehicleId);
  const totalKg = ho.snapshot.reduce((a, x) => a + x.weightKg, 0);

  return (
    <div className={`ho-banner ${role === "to" ? "ho-to" : "ho-from"}`}>
      <div className="ho-banner-head">
        <span className="chip chip-transfer">交接单 {ho.code} · 待生效</span>
        <span>{role === "from" ? `原车 → ${toVehicle?.plate ?? "?"}` : `${fromVehicle?.plate ?? "?"} → 本车`}</span>
      </div>
      <div className="ho-banner-body">
        {role === "from"
          ? `占用未释放：${ho.orderIds.length} 单未送 / ${totalKg}kg，待交接生效`
          : `未生效不得装货：预占 ${ho.orderIds.length} 单 / ${totalKg}kg，生效后自动发车`}
      </div>
      {role === "to" && (
        <div className="ho-actions">
          <button type="button" className="mini" onClick={() => apply(ho.id)}>
            交接生效
          </button>
          <button type="button" className="mini secondary" onClick={() => revoke(ho.id)}>
            作废
          </button>
        </div>
      )}
    </div>
  );
}

export default function TripCard({ trip, draggingOrderId, onReassign }: TripCardProps) {
  const state = useDispatchStore();
  const depart = useDispatchStore((s) => s.depart);
  const complete = useDispatchStore((s) => s.complete);
  const deliver = useDispatchStore((s) => s.deliver);
  const unassign = useDispatchStore((s) => s.unassign);

  const vehicle = getVehicle(state, trip.vehicleId);
  const used = usedCapacity(state, trip);
  const overloaded = vehicle ? used > vehicle.capacityKg : false;
  const locked = trip.status !== "scheduled";
  const pendingHo = pendingHandoverForTrip(state, trip.id);
  const chain = tripHandoverChain(state, trip.id);

  // 拖放命中：整卡作为放置区
  const { setNodeRef, isOver } = useDroppable({
    id: `trip-${trip.id}`,
    disabled: locked || Boolean(trip.pendingHandoverId)
  });

  const preview = conflictPreview(state, trip, draggingOrderId);
  const previewOrder = draggingOrderId ? getOrder(state, draggingOrderId) : undefined;
  const incoming = trip.incomingOrderIds
    ?.map((id) => getOrder(state, id))
    .filter((o): o is Order => Boolean(o));

  const stopOrders = trip.stops
    .map((st) => ({ stop: st, order: getOrder(state, st.orderId) }))
    .filter((x): x is { stop: Trip["stops"][number]; order: Order } => Boolean(x.order));

  return (
    <article
      ref={setNodeRef}
      className={[
        "trip-card",
        `trip-${trip.status}`,
        isOver ? "is-over" : "",
        preview.kinds.length && draggingOrderId ? "has-conflict" : "",
        trip.pendingHandoverId ? "frozen" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="trip-head">
        <div className="trip-title">
          <strong>{trip.code}</strong>
          <span className={`trip-badge status-${trip.status}`}>
            {trip.status === "scheduled" ? "已排" : trip.status === "in_transit" ? "运输中" : "已完成"}
          </span>
          {locked && <span className="chip chip-lock">🔒 已锁顺序/司机/温区</span>}
        </div>
        <div className="trip-vehicle">
          {vehicle && (
            <>
              <span>{vehicle.plate}</span>
              <span>{vehicle.driver}</span>
              <span className={vehicle.zone === "cold" ? "zone-cold" : "zone-normal"}>
                {vehicle.zone === "cold" ? "❄ 冷藏" : "常温"}
              </span>
              <span>班次 {windowLabel(vehicle.startMin, vehicle.endMin)}</span>
            </>
          )}
        </div>
      </header>

      {/* 拖拽期间：冲突字段标记（所有车次卡实时显示，锁定车次标“已锁车次”） */}
      {draggingOrderId && previewOrder && (
        <div className={`conflict-strip ${preview.kinds.length ? "bad" : "good"}`}>
          {preview.kinds.length === 0 ? (
            <span>✓ {previewOrder.code} 可排入</span>
          ) : (
            describeConflicts(preview.kinds).map((c) => (
              <span key={c.kind} className="conflict-pill" title={c.desc}>
                ⛔ {c.label}
              </span>
            ))
          )}
        </div>
      )}

      <div className="trip-load">
        <div className="load-track">
          <div
            className={`load-fill ${overloaded ? "load-over" : ""}`}
            style={{
              width: `${Math.min(100, vehicle ? (used / vehicle.capacityKg) * 100 : 0)}%`
            }}
          />
        </div>
        <span className={overloaded ? "load-text over" : "load-text"}>
          载重 {used}/{vehicle?.capacityKg ?? 0}kg
        </span>
        <span className="stop-count">{trip.stops.length} 单</span>
      </div>

      {pendingHo && <HandoverBanner ho={pendingHo} state={state} role={pendingHo.fromTripId === trip.id ? "from" : "to"} />}

      <div className="stops">
        {trip.status === "scheduled" && !trip.pendingHandoverId && stopOrders.length > 0 && (
          <InsertSlot tripId={trip.id} index={0} active={Boolean(draggingOrderId)} />
        )}
        {stopOrders.map(({ stop, order }, i) => {
          const stopPendingHo = orderInPendingHandover(state, order.id);
          return (
            <div key={stop.orderId} className="stop-row">
              {locked ? (
                <div className="stop-locked">
                  <span className="seq">{i + 1}</span>
                  <OrderCard
                    order={order}
                    draggable={false}
                    delivered={stop.delivered}
                    pendingTransfer={Boolean(stopPendingHo)}
                    onDeliver={() => deliver(trip.id, stop.orderId)}
                  />
                </div>
              ) : (
                <div className="stop-editable">
                  <OrderCard
                    order={order}
                    draggable={!trip.pendingHandoverId}
                    pendingTransfer={Boolean(stopPendingHo)}
                  />
                  <button
                    type="button"
                    className="mini secondary remove-btn"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => unassign(stop.orderId)}
                  >
                    摘回
                  </button>
                </div>
              )}
              {trip.status === "scheduled" && !trip.pendingHandoverId && (
                <InsertSlot tripId={trip.id} index={i + 1} active={Boolean(draggingOrderId)} />
              )}
            </div>
          );
        })}
        {stopOrders.length === 0 && !incoming?.length && <div className="trip-empty">空车次 · 拖入订单排班</div>}
      </div>

      {/* 待生效交接：预占订单清单（不计载重、不可装货） */}
      {trip.pendingHandoverId && incoming && incoming.length > 0 && (
        <div className="incoming">
          <p className="incoming-title">交接预占（未生效，不得装货）</p>
          {incoming.map((order) => (
            <div key={order.id} className="incoming-item">
              <span>{order.code}</span>
              <span>{order.destination}</span>
              <span>{order.weightKg}kg</span>
            </div>
          ))}
        </div>
      )}

      <footer className="trip-foot">
        <div className="trip-actions">
          {trip.status === "scheduled" && !trip.pendingHandoverId && (
            <button type="button" className="mini" onClick={() => depart(trip.id)} disabled={trip.stops.length === 0}>
              发车
            </button>
          )}
          {trip.status === "in_transit" && (
            <>
              <button
                type="button"
                className="mini"
                onClick={() => complete(trip.id)}
                disabled={undeliveredStops(trip).length > 0 || Boolean(pendingHo)}
                title={pendingHo ? "存在待生效交接单" : undeliveredStops(trip).length ? "尚有未送订单" : "全部送达，可收车"}
              >
                收车
              </button>
              <button type="button" className="mini warn" onClick={() => onReassign(trip.id)}>
                发车后改派（建交接单）
              </button>
            </>
          )}
          {trip.status === "in_transit" && trip.departedAt && (
            <span className="depart-time">发车于 {fmtDateTime(trip.departedAt)}</span>
          )}
        </div>
        {chain.length > 0 && (
          <div className="chain">
            {chain.map((h) => (
              <span key={h.id} className={`chain-node chain-${h.status}`} title={`${h.code} ${h.status}`}>
                {h.status === "pending" ? "⏳" : h.status === "effective" ? "➡" : "✕"} {h.code}
              </span>
            ))}
          </div>
        )}
      </footer>
    </article>
  );
}

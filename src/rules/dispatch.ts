import { ConflictKind, DispatchState, Handover, Order, OrderSnapshot, Trip, Vehicle } from "../data/types";

// 规则层：纯函数领域规则（与 UI、持久化解耦）

export interface ActionResult {
  ok: boolean;
  conflicts: ConflictKind[];
  message?: string;
}

export interface ConflictInfo {
  kind: ConflictKind;
  label: string;
  desc: string;
}

export const CONFLICT_META: Record<ConflictKind, { label: string; desc: string }> = {
  window: { label: "时段冲突", desc: "送达时段不在车辆班次时段内" },
  zone: { label: "温区冲突", desc: "冷链订单必须使用冷藏车，常温订单不可使用冷藏车" },
  capacity: { label: "载重冲突", desc: "超出车辆核定载重" },
  locked: { label: "已锁车次", desc: "发车后顺序、司机与温区已锁定，须走交接单改派" }
};

export function describeConflicts(kinds: ConflictKind[]): ConflictInfo[] {
  return kinds.map((kind) => ({ kind, ...CONFLICT_META[kind] }));
}

export const getVehicle = (s: DispatchState, id: string): Vehicle | undefined =>
  s.vehicles.find((v) => v.id === id);

export const getTrip = (s: DispatchState, id: string): Trip | undefined =>
  s.trips.find((t) => t.id === id);

export const getOrder = (s: DispatchState, id: string): Order | undefined =>
  s.orders.find((o) => o.id === id);

export function tripOrders(trip: Trip, s: DispatchState): Order[] {
  return trip.stops
    .map((st) => getOrder(s, st.orderId))
    .filter((o): o is Order => Boolean(o));
}

/** 车辆实际占用重量（已排停靠点；待生效交接的预占订单不计入） */
export function usedCapacity(s: DispatchState, trip: Trip): number {
  return trip.stops.reduce((sum, st) => {
    const order = getOrder(s, st.orderId);
    return sum + (order?.weightKg ?? 0);
  }, 0);
}

export function undeliveredStops(trip: Trip) {
  return trip.stops.filter((st) => !st.delivered);
}

/** 校验单个订单能否排入车辆（温区 / 时段 / 载重） */
export function evaluateOrderAgainstVehicle(
  order: Order,
  vehicle: Vehicle,
  currentUsedKg: number
): ConflictKind[] {
  const conflicts: ConflictKind[] = [];
  if (order.coldChain !== (vehicle.zone === "cold")) conflicts.push("zone");
  if (order.startMin < vehicle.startMin || order.endMin > vehicle.endMin) conflicts.push("window");
  if (currentUsedKg + order.weightKg > vehicle.capacityKg) conflicts.push("capacity");
  return conflicts;
}

/** 拖入车次校验：锁定状态 + 待生效交接禁装 + 车辆规则 */
export function evaluateAssign(
  s: DispatchState,
  trip: Trip,
  orderId: string
): ActionResult {
  const order = getOrder(s, orderId);
  if (!order) return { ok: false, conflicts: [], message: "订单不存在" };

  if (trip.status !== "scheduled") {
    return { ok: false, conflicts: ["locked"], message: CONFLICT_META.locked.desc };
  }
  // 待生效交接单的新承接车次：未生效不得装货
  if (trip.pendingHandoverId) {
    return {
      ok: false,
      conflicts: ["locked"],
      message: "交接单未生效，新承接车辆暂不得装货"
    };
  }

  const vehicle = getVehicle(s, trip.vehicleId);
  if (!vehicle) return { ok: false, conflicts: [], message: "车辆不存在" };

  const already = trip.stops.some((st) => st.orderId === orderId);
  const used = already
    ? usedCapacity(s, trip) - order.weightKg
    : usedCapacity(s, trip);

  const kinds = evaluateOrderAgainstVehicle(order, vehicle, used);
  if (kinds.length) {
    return {
      ok: false,
      conflicts: kinds,
      message: `整次拒绝：${describeConflicts(kinds)
        .map((c) => c.label)
        .join("、")}`
    };
  }
  return { ok: true, conflicts: [] };
}

function withoutStop(stops: Trip["stops"], orderId: string): Trip["stops"] {
  return stops.filter((st) => st.orderId !== orderId);
}

/** 排入 / 调整顺序：返回新状态（调用方必须先通过 evaluateAssign 校验） */
export function assignOrder(
  s: DispatchState,
  tripId: string,
  orderId: string,
  toIndex?: number
): DispatchState {
  return {
    ...s,
    trips: s.trips.map((t) => {
      if (t.id !== tripId) {
        // 从其它车次中摘出（一次调度只可能落在一个车次）
        return t.stops.some((st) => st.orderId === orderId)
          ? { ...t, stops: withoutStop(t.stops, orderId) }
          : t;
      }
      const moved = t.stops.find((st) => st.orderId === orderId);
      const stops = withoutStop(t.stops, orderId);
      const insertAt = Math.max(0, Math.min(toIndex ?? stops.length, stops.length));
      stops.splice(insertAt, 0, moved ?? { orderId, delivered: false });
      return { ...t, stops };
    })
  };
}

/** 从车次摘回待分配池（仅发车前） */
export function unassignOrder(s: DispatchState, orderId: string): DispatchState {
  return {
    ...s,
    trips: s.trips.map((t) =>
      t.status === "scheduled" && !t.pendingHandoverId
        ? { ...t, stops: withoutStop(t.stops, orderId) }
        : t
    )
  };
}

function nextTripCode(s: DispatchState): string {
  const max = s.trips.reduce((acc, t) => {
    const n = Number(t.code.replace(/\D/g, ""));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `TC-${String(max + 1).padStart(3, "0")}`;
}

function hasOpenTrip(s: DispatchState, vehicleId: string): boolean {
  return s.trips.some((t) => t.vehicleId === vehicleId && t.status !== "completed");
}

/** 建空车次 */
export function createTrip(s: DispatchState, vehicleId: string): DispatchState | string {
  if (hasOpenTrip(s, vehicleId)) return "该车辆已有未完成车次";
  const trip: Trip = {
    id: `t-${crypto.randomUUID()}`,
    code: nextTripCode(s),
    vehicleId,
    status: "scheduled",
    stops: [],
    createdAt: new Date().toISOString()
  };
  return { ...s, trips: [...s.trips, trip] };
}

/** 发车：锁顺序、司机、温区 */
export function departTrip(s: DispatchState, tripId: string): DispatchState | string {
  const trip = getTrip(s, tripId);
  if (!trip) return "车次不存在";
  if (trip.status !== "scheduled") return "仅已排车次可以发车";
  if (trip.pendingHandoverId) return "交接单未生效，不能发车";
  if (trip.stops.length === 0) return "空车次不可发车";
  return {
    ...s,
    trips: s.trips.map((t) =>
      t.id === tripId
        ? { ...t, status: "in_transit", departedAt: new Date().toISOString() }
        : t
    )
  };
}

/** 运输中：登记送达 */
export function markDelivered(s: DispatchState, tripId: string, orderId: string): DispatchState {
  return {
    ...s,
    trips: s.trips.map((t) =>
      t.id === tripId
        ? {
            ...t,
            stops: t.stops.map((st) =>
              st.orderId === orderId && !st.delivered
                ? { ...st, delivered: true, deliveredAt: new Date().toISOString() }
                : st
            )
          }
        : t
    )
  };
}

/** 全部送达后收车 */
export function completeTrip(s: DispatchState, tripId: string): DispatchState | string {
  const trip = getTrip(s, tripId);
  if (!trip) return "车次不存在";
  if (trip.status !== "in_transit") return "仅运输中车次可以收车";
  if (trip.stops.some((st) => !st.delivered)) return "尚有未送达订单";
  return {
    ...s,
    trips: s.trips.map((t) =>
      t.id === tripId ? { ...t, status: "completed", completedAt: new Date().toISOString() } : t
    )
  };
}

export function pendingHandoverForTrip(s: DispatchState, tripId: string): Handover | undefined {
  return s.handovers.find(
    (h) => h.status === "pending" && (h.fromTripId === tripId || h.toTripId === tripId)
  );
}

export function orderInPendingHandover(s: DispatchState, orderId: string): Handover | undefined {
  return s.handovers.find((h) => h.status === "pending" && h.orderIds.includes(orderId));
}

/** 改派：建交接单（记原车、新承接车辆和未送订单），原车占用不释放 */
export function createHandover(
  s: DispatchState,
  fromTripId: string,
  toVehicleId: string,
  remark?: string
): { state: DispatchState; handover: Handover } | string {
  const fromTrip = getTrip(s, fromTripId);
  if (!fromTrip) return "原车次不存在";
  if (fromTrip.status !== "in_transit") return "只有发车后的车次需要改派";
  if (pendingHandoverForTrip(s, fromTripId)) return "该车次已有待生效交接单";

  const fromVehicle = getVehicle(s, fromTrip.vehicleId);
  const toVehicle = getVehicle(s, toVehicleId);
  if (!fromVehicle || !toVehicle) return "车辆不存在";
  if (toVehicleId === fromTrip.vehicleId) return "新承接车辆不能与原车相同";
  if (hasOpenTrip(s, toVehicleId)) return "新承接车辆已有未完成车次";

  const undelivered = undeliveredStops(fromTrip);
  if (undelivered.length === 0) return "没有未送订单，无需改派";

  const orders = undelivered
    .map((st) => getOrder(s, st.orderId))
    .filter((o): o is Order => Boolean(o));

  // 新车合规预检：温区/时段/载重（生效转移前先把规则卡住）
  const used = 0;
  let total = 0;
  for (const order of orders) {
    if (order.coldChain !== (toVehicle.zone === "cold"))
      return `订单 ${order.code} 与新车辆温区不符`;
    if (order.startMin < toVehicle.startMin || order.endMin > toVehicle.endMin)
      return `订单 ${order.code} 送达时段超出新车辆班次`;
    total += order.weightKg;
  }
  if (used + total > toVehicle.capacityKg) return "未送订单总重量超出新车载重";

  const snapshot: OrderSnapshot[] = orders.map((order) => ({
    orderId: order.id,
    code: order.code,
    destination: order.destination,
    weightKg: order.weightKg,
    coldChain: order.coldChain,
    startMin: order.startMin,
    endMin: order.endMin
  }));

  const handover: Handover = {
    id: `h-${crypto.randomUUID()}`,
    code: `HO-${String(s.handovers.length + 1).padStart(3, "0")}`,
    fromTripId,
    toTripId: "",
    fromVehicleId: fromTrip.vehicleId,
    toVehicleId,
    orderIds: orders.map((o) => o.id),
    snapshot,
    status: "pending",
    createdAt: new Date().toISOString(),
    remark
  };

  // 新承接车次（占位）：待生效前禁止装货、不可发车
  const newTrip: Trip = {
    id: `t-${crypto.randomUUID()}`,
    code: nextTripCode(s),
    vehicleId: toVehicleId,
    status: "scheduled",
    stops: [],
    createdAt: new Date().toISOString(),
    pendingHandoverId: handover.id,
    incomingOrderIds: handover.orderIds,
    createdByHandoverId: handover.id
  };
  handover.toTripId = newTrip.id;

  return {
    state: { ...s, trips: [...s.trips, newTrip], handovers: [...s.handovers, handover] },
    handover
  };
}

/** 交接单生效：原车占用此刻才释放，未送订单转移给新车，新车解锁可装货/发车 */
export function effectiveHandover(
  s: DispatchState,
  handoverId: string
): DispatchState | string {
  const h = s.handovers.find((x) => x.id === handoverId);
  if (!h) return "交接单不存在";
  if (h.status !== "pending") return "仅待生效交接单可以生效";

  // 以原车次实际仍未送达的订单为准（途中可能已送掉一部分）
  const fromTrip = getTrip(s, h.fromTripId);
  if (!fromTrip) return "原车次不存在";
  const stillUndelivered = new Set(
    fromTrip.stops.filter((st) => !st.delivered).map((st) => st.orderId)
  );
  const movingIds = h.orderIds.filter((id) => stillUndelivered.has(id));
  const skipped = h.orderIds.filter((id) => !stillUndelivered.has(id));

  let next: DispatchState = {
    ...s,
    trips: s.trips.map((t) => {
      if (t.id === h.fromTripId) {
        return { ...t, stops: t.stops.filter((st) => !movingIds.includes(st.orderId)) };
      }
      if (t.id === h.toTripId) {
        return {
          ...t,
          status: "in_transit",
          departedAt: new Date().toISOString(),
          stops: movingIds.map((id) => ({ orderId: id, delivered: false })),
          pendingHandoverId: undefined,
          incomingOrderIds: undefined
        };
      }
      return t;
    }),
    handovers: s.handovers.map((x) =>
      x.id === h.id
        ? { ...x, status: "effective", effectiveAt: new Date().toISOString(), orderIds: movingIds, remark: skipped.length ? `部分订单途中已送达：${skipped.join(", ")}` : x.remark }
        : x
    )
  };

  // 原车若无停靠点则收车
  const updatedFrom = next.trips.find((t) => t.id === h.fromTripId);
  if (updatedFrom && updatedFrom.stops.length === 0 && updatedFrom.status === "in_transit") {
    next = completeTrip(next, h.fromTripId) as DispatchState;
  }
  return next;
}

/** 作废交接单：恢复新承接车次占用状态（占位车次删除） */
export function cancelHandover(s: DispatchState, handoverId: string): DispatchState | string {
  const h = s.handovers.find((x) => x.id === handoverId);
  if (!h) return "交接单不存在";
  if (h.status !== "pending") return "仅待生效交接单可以作废";

  return {
    ...s,
    trips: s.trips.filter((t) => t.id !== h.toTripId),
    handovers: s.handovers.map((x) => (x.id === h.id ? { ...x, status: "cancelled" } : x))
  };
}

/** 车次交接链：按时间排列的与该车次相关的交接记录 */
export function tripHandoverChain(s: DispatchState, tripId: string): Handover[] {
  return s.handovers
    .filter((h) => h.fromTripId === tripId || h.toTripId === tripId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** 视图用：订单是否仍挂在某个已排/运输中车次 */
export function assignedTripId(s: DispatchState, orderId: string): string | undefined {
  return s.trips.find((t) => t.stops.some((st) => st.orderId === orderId))?.id;
}

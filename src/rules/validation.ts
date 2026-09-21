// 规则层：纯函数校验，不依赖 React / store，可独立测试。
// 规则要点：
// 1) 拖入时车辆时段不覆盖送达时段、温区不符、超重 -> 整次拒绝，字段级标注；
// 2) 发车后顺序、司机、温区锁定，已发车次不可再装货；
// 3) 交接单未生效前订单仍被原车占用且被冻结，任何车辆不得装货；
// 4) 交接单生效的前提与排车规则相同（目标未发车 + 时段 + 温区 + 载重）。
import type { CheckResult, ConflictField, Handover, Order, Trip } from "../types";
import { frozenOrderIds, totalWeight, tripOrders, windowContains } from "../utils/helpers";

const FIELD_TEXT: Record<ConflictField, string> = {
  window: "送达时段超出车辆时段",
  zone: "温区不符",
  capacity: "超过车辆载重",
  frozen: "订单被未生效交接单冻结，原车仍占用",
  departed: "目标车次已发车，顺序/司机/温区已锁定",
  structure: "订单或车次状态无效"
};

export function fieldText(field: ConflictField): string {
  return FIELD_TEXT[field];
}

/** 单订单对车次的字段级冲突（不含载重，载重按整批核算）。 */
export function orderTripConflicts(
  order: Order,
  trip: Trip,
  frozen: Set<string>
): ConflictField[] {
  const fields: ConflictField[] = [];
  if (frozen.has(order.id)) fields.push("frozen");
  if (trip.status === "departed") fields.push("departed");
  if (order.zone !== trip.zone) fields.push("zone");
  if (!windowContains(trip.windowStart, trip.windowEnd, order.windowStart, order.windowEnd)) {
    fields.push("window");
  }
  return fields;
}

/**
 * 把一批订单整批排进目标车次的统一校验。
 * 任一订单不符 -> 整次拒绝（all-or-nothing），返回冲突字段与消息。
 */
export function checkAssign(
  candidates: Order[],
  target: Trip,
  allOrders: Order[],
  handovers: Handover[]
): CheckResult {
  const fields = new Set<ConflictField>();
  const messages: string[] = [];
  const frozen = frozenOrderIds(handovers);

  if (candidates.length === 0) {
    return { ok: false, fields: ["structure"], messages: ["没有可排的订单"] };
  }

  for (const order of candidates) {
    if (order.status === "delivered") {
      fields.add("structure");
      messages.push(`${order.orderNo} 已送达，不能再排班`);
      continue;
    }
    for (const field of orderTripConflicts(order, target, frozen)) {
      fields.add(field);
      messages.push(`${order.orderNo}：${FIELD_TEXT[field]}`);
    }
  }

  // 载重按整批同时装车核算（候选订单视为一起装）。
  const currentWeight = totalWeight(tripOrders(allOrders, target.id));
  const candidateWeight = totalWeight(candidates);
  if (currentWeight + candidateWeight > target.capacity + 0.001) {
    fields.add("capacity");
    messages.push(
      `载重超限：现有 ${currentWeight}kg + 本次 ${candidateWeight}kg > 载重 ${target.capacity}kg`
    );
  }

  return { ok: fields.size === 0, fields: [...fields], messages: [...new Set(messages)] };
}

/** 能否对已发车次发起改派（建交接单）。 */
export function canCreateHandover(from: Trip): CheckResult {
  if (from.status !== "departed") {
    return { ok: false, fields: ["departed"], messages: ["只有发车后的车次才能改派"] };
  }
  return { ok: true, fields: [], messages: [] };
}

/** 交接单生效校验：目标车次结构合法 + 整批订单规则通过。 */
export function checkHandoverEffective(
  handover: Handover,
  trips: Trip[],
  allOrders: Order[],
  allHandovers: Handover[]
): CheckResult {
  // 当前交接单自身的冻结不应阻挡自己生效；它预约的占用也按“其他交接单”单独核算。
  const otherHandovers = allHandovers.filter((h) => h.id !== handover.id);
  const to = trips.find((trip) => trip.id === handover.toTripId);
  const from = trips.find((trip) => trip.id === handover.fromTripId);
  const fields = new Set<ConflictField>();
  const messages: string[] = [];

  if (!to || !from) {
    return { ok: false, fields: ["structure"], messages: ["原车次或承接车次不存在"] };
  }
  if (to.status === "departed") {
    fields.add("departed");
    messages.push(`承接车次 ${to.code} 已发车，不能再接单`);
  }
  if (to.id === from.id) {
    fields.add("structure");
    messages.push("承接车次不能与原车次相同");
  }

  const candidates = handover.orderIds
    .map((id) => allOrders.find((order) => order.id === id))
    .filter((o): o is Order => o !== undefined && o.status !== "delivered");

  const assign = checkAssign(candidates, to, allOrders, otherHandovers);
  if (!assign.ok) {
    assign.fields
      .filter((f) => f !== "capacity")
      .forEach((f) => fields.add(f));
    if (assign.fields.includes("capacity")) {
      messages.push(...assign.messages.filter((m) => !m.startsWith("载重超限")));
    } else {
      messages.push(...assign.messages);
    }
  }

  // 其他挂起交接单已预约装进目标车次的载重也要计入，防止重复超配。
  const reserved = totalWeight(
    otherHandovers
      .filter((h) => h.status === "pending" && h.toTripId === to.id)
      .flatMap((h) => h.orderIds)
      .map((id) => allOrders.find((order) => order.id === id))
      .filter((o): o is Order => Boolean(o))
  );
  const currentWeight = totalWeight(tripOrders(allOrders, to.id));
  const candidateWeight = totalWeight(candidates);
  if (currentWeight + reserved + candidateWeight > to.capacity + 0.001) {
    fields.add("capacity");
    messages.push(
      `载重超限：现有 ${currentWeight}kg + 待生效交接 ${reserved}kg + 本次 ${candidateWeight}kg > 载重 ${to.capacity}kg`
    );
  }

  return { ok: fields.size === 0, fields: [...fields], messages: [...new Set(messages)] };
}

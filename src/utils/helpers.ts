// 工具：时间、重量、汇总选择器等纯函数。
import type { Handover, Order, Trip } from "../types";

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** orderWindow 是否被 tripWindow 完整包含。 */
export function windowContains(tripStart: string, tripEnd: string, orderStart: string, orderEnd: string): boolean {
  return minutes(tripStart) <= minutes(orderStart) && minutes(orderEnd) <= minutes(tripEnd);
}

export function zoneLabel(zone: Order["zone"]): string {
  return zone === "ambient" ? "常温" : zone === "chilled" ? "冷藏" : "冷冻";
}

export function totalWeight(orders: Pick<Order, "weight">[]): number {
  return orders.reduce((sum, order) => sum + order.weight, 0);
}

export function tripOrders(orders: Order[], tripId: string): Order[] {
  return orders
    .filter((order) => order.tripId === tripId)
    .sort((a, b) => a.position - b.position);
}

/** 未生效交接单冻结的订单 id（原车仍占用，任何车次都不可装）。 */
export function frozenOrderIds(handovers: Handover[]): Set<string> {
  const ids = new Set<string>();
  for (const handover of handovers) {
    if (handover.status === "pending") handover.orderIds.forEach((id) => ids.add(id));
  }
  return ids;
}

/** 针对某车次的挂起交接单（入向）。 */
export function incomingPending(handovers: Handover[], tripId: string): Handover[] {
  return handovers.filter((h) => h.status === "pending" && h.toTripId === tripId);
}

export function outgoingPending(handovers: Handover[], tripId: string): Handover[] {
  return handovers.filter((h) => h.status === "pending" && h.fromTripId === tripId);
}

/** 车次的实际占用重量：车上订单（含被挂起交接单冻结、仍未释放的部分）。 */
export function occupiedWeight(orders: Order[], tripId: string): number {
  return totalWeight(tripOrders(orders, tripId));
}

export function formatTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

/** 订单经历的交接链（新 → 旧）。 */
export function orderHandoverChain(handovers: Handover[], orderId: string): Handover[] {
  return handovers
    .filter((h) => h.orderIds.includes(orderId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function tripById(trips: Trip[], id: string | null): Trip | undefined {
  return trips.find((trip) => trip.id === id);
}

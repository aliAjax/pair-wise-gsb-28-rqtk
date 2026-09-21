// 状态层：车次排班 + 发车后受控改派（交接单）的全部流转。
// 视图只调用这里的 action；规则全部来自 rules/validation.ts。
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  ConflictField,
  Handover,
  Notice,
  Order,
  OrderStatus,
  RejectFlash,
  Trip,
  Zone
} from "../types";
import { buildSeed } from "../data/seed";
import {
  canCreateHandover,
  checkAssign,
  checkHandoverEffective
} from "../rules/validation";
import { frozenOrderIds, tripOrders } from "../utils/helpers";

interface PersistedState {
  trips: Trip[];
  orders: Order[];
  handovers: Handover[];
  seq: { order: number; handover: number };
}

interface ScheduleState extends PersistedState {
  notice: Notice | null;
  rejectFlash: RejectFlash | null;
  handoverModal: { fromTripId: string } | null;
  createOrder: (input: NewOrderInput) => void;
  assignOrder: (orderId: string, toTripId: string) => CheckResponse;
  unassignOrder: (orderId: string) => void;
  depart: (tripId: string) => void;
  markDelivered: (orderId: string) => void;
  openHandoverModal: (fromTripId: string) => void;
  closeHandoverModal: () => void;
  createHandover: (input: { toTripId: string; orderIds: string[]; reason: string }) => CheckResponse;
  cancelHandover: (handoverId: string) => void;
  effectiveHandover: (handoverId: string) => CheckResponse;
  flashReject: (targetId: string, fields: ConflictField[]) => void;
  clearFlash: () => void;
  clearNotice: () => void;
  resetAll: () => void;
}

export interface NewOrderInput {
  orderNo: string;
  destination: string;
  weight: number;
  zone: Zone;
  windowStart: string;
  windowEnd: string;
  note?: string;
}

interface CheckResponse {
  ok: boolean;
  messages: string[];
  fields: ConflictField[];
}

function withOrdersOnTrip(orders: Order[], tripId: string): Order[] {
  return tripOrders(orders, tripId);
}

function deriveStatus(trip: Trip | undefined, delivered = false): OrderStatus {
  if (delivered) return "delivered";
  if (!trip) return "unassigned";
  return trip.status === "departed" ? "inTransit" : "assigned";
}

const seed = buildSeed();

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      ...seed,
      notice: null,
      rejectFlash: null,
      handoverModal: null,
      seq: { order: 100, handover: 10 },

      createOrder: (input) => {
        set((s) => {
          const order: Order = {
            id: `od-${s.seq.order + 1}`,
            ...input,
            status: "unassigned",
            tripId: null,
            position: -1
          };
          return {
            orders: [order, ...s.orders],
            seq: { ...s.seq, order: s.seq.order + 1 },
            notice: okNotice(`订单 ${input.orderNo} 已加入待分配`)
          };
        });
      },

      // 拖入车次：规则不符 -> 整次拒绝，不改动任何布局（直接返回校验结果）。
      assignOrder: (orderId, toTripId) => {
        const { orders, trips, handovers } = get();
        const order = orders.find((o) => o.id === orderId);
        const target = trips.find((t) => t.id === toTripId);
        if (!order || !target) {
          const result: CheckResponse = { ok: false, fields: ["structure"], messages: ["订单或车次不存在"] };
          set({ notice: errNotice(result.messages.join("；")) });
          return result;
        }
        const check = checkAssign([order], target, orders, handovers);
        if (!check.ok) {
          set({ rejectFlash: { targetId: toTripId, fields: check.fields, key: Date.now() } });
          return { ok: false, messages: check.messages, fields: check.fields };
        }

        set((s) => {
          const nextOrders = s.orders.map((o) => {
            if (o.id !== orderId) {
              // 同车其他订单不受影响；从其他车挪走时由下面的重排补齐。
              return o;
            }
            return { ...o, tripId: toTripId };
          });
          const maxPos = withOrdersOnTrip(nextOrders, toTripId)
            .filter((o) => o.id !== orderId)
            .reduce((max, o) => Math.max(max, o.position), -1);
          const positioned = nextOrders.map((o) =>
            o.id === orderId
              ? { ...o, position: maxPos + 1, status: deriveStatus(target) }
              : o
          );
          const sourceTripId = order.tripId;
          let finalOrders = positioned;
          if (sourceTripId && sourceTripId !== toTripId) {
            finalOrders = resequenceTrip(finalOrders, sourceTripId);
          }
          finalOrders = resequenceTrip(finalOrders, toTripId);
          return { orders: finalOrders };
        });
        return { ok: true, messages: [`${order.orderNo} 已排入 ${target.code}`], fields: [] };
      },

      // 拖回待分配池：仅未发车次上的订单可撤出。
      unassignOrder: (orderId) => {
        const { orders, trips, handovers } = get();
        const order = orders.find((o) => o.id === orderId);
        if (!order || !order.tripId) return;
        const trip = trips.find((t) => t.id === order.tripId);
        if (trip?.status === "departed") {
          set({ notice: errNotice(`${order.orderNo} 所在车次已发车，顺序锁定，不能撤出`) });
          return;
        }
        if (frozenOrderIds(handovers).has(orderId)) {
          set({ notice: errNotice(`${order.orderNo} 被未生效交接单冻结，不能撤出`) });
          return;
        }
        set((s) => ({
          orders: resequenceTrip(
            s.orders.map((o) =>
              o.id === orderId ? { ...o, tripId: null, position: -1, status: "unassigned" } : o
            ),
            order.tripId as string
          )
        }));
      },

      depart: (tripId) => {
        const { trips, orders, handovers } = get();
        const trip = trips.find((t) => t.id === tripId);
        if (!trip || trip.status === "departed") return;
        if (tripOrders(orders, tripId).length === 0) {
          set({ notice: errNotice("空车次不能发车") });
          return;
        }
        const blocked = handovers.some((h) => h.status === "pending" && h.toTripId === tripId);
        if (blocked) {
          set({ notice: errNotice("存在待生效的入向交接单，承接完成前不能发车") });
          return;
        }
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === tripId ? { ...t, status: "departed", departedAt: new Date().toISOString() } : t
          ),
          orders: s.orders.map((o) =>
            o.tripId === tripId ? { ...o, status: "inTransit" } : o
          ),
          notice: okNotice(`车次 ${trip.code} 已发车：顺序、司机、温区锁定`)
        }));
      },

      markDelivered: (orderId) => {
        const { orders, handovers } = get();
        const order = orders.find((o) => o.id === orderId);
        if (!order || order.status !== "inTransit") return;
        if (frozenOrderIds(handovers).has(orderId)) {
          set({ notice: errNotice(`${order.orderNo} 的交接单未生效，不能签收`) });
          return;
        }
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === orderId ? { ...o, status: "delivered" } : o
          ),
          notice: okNotice(`${order.orderNo} 已送达`)
        }));
      },

      openHandoverModal: (fromTripId) => {
        const trip = get().trips.find((t) => t.id === fromTripId);
        if (!trip) return;
        const guard = canCreateHandover(trip);
        if (!guard.ok) {
          set({ notice: errNotice(guard.messages.join("；")) });
          return;
        }
        set({ handoverModal: { fromTripId } });
      },
      closeHandoverModal: () => set({ handoverModal: null }),

      // 改派第一步：建交接单（pending）。原车占用不释放，订单冻结。
      createHandover: ({ toTripId, orderIds, reason }) => {
        const { trips, orders, handovers, seq } = get();
        const fromTripId = get().handoverModal?.fromTripId;
        const from = trips.find((t) => t.id === fromTripId);
        const to = trips.find((t) => t.id === toTripId);
        if (!from || !to) {
          return { ok: false, fields: ["structure"], messages: ["请选择有效的承接车次"] };
        }
        const guard = canCreateHandover(from);
        if (!guard.ok) {
          set({ notice: errNotice(guard.messages.join("；")) });
          return { ok: false, fields: guard.fields, messages: guard.messages };
        }
        const candidates = orderIds
          .map((id) => orders.find((o) => o.id === id))
          .filter((o): o is Order => o !== undefined && o.tripId === from.id && o.status === "inTransit");
        if (candidates.length === 0) {
          return { ok: false, fields: ["structure"], messages: ["请选择原车上未送达的订单"] };
        }

        const nextSeq = seq.handover + 1;
        const handover: Handover = {
          id: `ho-${nextSeq}`,
          code: `HN-${String(nextSeq).padStart(4, "0")}`,
          fromTripId: from.id,
          toTripId: to.id,
          orderIds: candidates.map((o) => o.id),
          reason: reason.trim() || "客户改约，车辆故障改派",
          status: "pending",
          createdAt: new Date().toISOString()
        };
        set((s) => ({
          handovers: [handover, ...s.handovers],
          seq: { ...s.seq, handover: nextSeq },
          handoverModal: null,
          notice: okNotice(
            `交接单 ${handover.code} 已建立：原车 ${from.code} 继续占用，生效前 ${to.code} 不得装货`
          )
        }));
        return { ok: true, messages: [handover.code], fields: [] };
      },

      cancelHandover: (handoverId) => {
        const handover = get().handovers.find((h) => h.id === handoverId);
        if (!handover || handover.status !== "pending") return;
        set((s) => ({
          handovers: s.handovers.map((h) =>
            h.id === handoverId ? { ...h, status: "cancelled" } : h
          ),
          notice: { type: "info", text: `交接单 ${handover.code} 已作废，冻结解除`, key: Date.now() }
        }));
      },

      // 改派第二步：交接单生效 -> 原车释放占用、订单转移到承接车并解除冻结。
      effectiveHandover: (handoverId) => {
        const { handovers, trips, orders } = get();
        const handover = handovers.find((h) => h.id === handoverId);
        if (!handover || handover.status !== "pending") {
          return { ok: false, fields: ["structure"], messages: ["交接单不可生效"] };
        }
        const check = checkHandoverEffective(handover, trips, orders, handovers);
        if (!check.ok) {
          set({ notice: errNotice(`交接单 ${handover.code} 暂不能生效：${check.messages.join("；")}`) });
          return { ok: false, messages: check.messages, fields: check.fields };
        }

        const target = trips.find((t) => t.id === handover.toTripId)!;
        set((s) => {
          let moved = s.orders;
          // 转移订单到承接车次，按交接单顺序接到队尾。
          const baseMax = tripOrders(moved, target.id)
            .filter((o) => !handover.orderIds.includes(o.id))
            .reduce((max, o) => Math.max(max, o.position), -1);
          moved = moved.map((o) => {
            const idx = handover.orderIds.indexOf(o.id);
            if (idx === -1) return o;
            return {
              ...o,
              tripId: target.id,
              position: baseMax + 1 + idx,
              status: deriveStatus(target)
            };
          });
          moved = resequenceTrip(moved, handover.fromTripId);
          return {
            orders: moved,
            handovers: s.handovers.map((h) =>
              h.id === handoverId
                ? { ...h, status: "effective", effectiveAt: new Date().toISOString() }
                : h
            ),
            notice: okNotice(
              `交接单 ${handover.code} 已生效：原车占用释放，${handover.orderIds.length} 单转由 ${target.code} 承接`
            )
          };
        });
        return { ok: true, messages: ["生效成功"], fields: [] };
      },

      flashReject: (targetId, fields) =>
        set({ rejectFlash: { targetId, fields, key: Date.now() } }),
      clearFlash: () => set({ rejectFlash: null }),
      clearNotice: () => set({ notice: null }),

      resetAll: () => {
        const fresh = buildSeed();
        set({
          ...fresh,
          seq: { order: 100, handover: 10 },
          notice: { type: "info", text: "已重置为演示数据", key: Date.now() },
          rejectFlash: null,
          handoverModal: null
        });
      }
    }),
    {
      name: "hxwl-dispatch-controlled-v1",
      // 惰性取 localStorage，保证数据层在浏览器外（测试/SSR）也可实例化。
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : (globalThis as { localStorage: Storage }).localStorage
      ),
      partialize: (s) => ({
        trips: s.trips,
        orders: s.orders,
        handovers: s.handovers,
        seq: s.seq
      })
    }
  )
);

function resequenceTrip(orders: Order[], tripId: string): Order[] {
  const ids = orders
    .filter((o) => o.tripId === tripId)
    .sort((a, b) => a.position - b.position)
    .map((o) => o.id);
  const posMap = new Map(ids.map((id, index) => [id, index]));
  return orders.map((o) => (posMap.has(o.id) ? { ...o, position: posMap.get(o.id)! } : o));
}

function okNotice(text: string): Notice {
  return { type: "success", text, key: Date.now() };
}
function errNotice(text: string): Notice {
  return { type: "error", text, key: Date.now() };
}

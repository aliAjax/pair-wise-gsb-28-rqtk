import { create } from "zustand";
import { DispatchState, Order } from "./types";
import { repository, seedState, STORAGE_KEY } from "./seed";
import {
  assignOrder,
  cancelHandover,
  completeTrip,
  createHandover,
  createTrip,
  departTrip,
  effectiveHandover,
  evaluateAssign,
  getTrip,
  markDelivered,
  unassignOrder,
  type ActionResult
} from "../rules/dispatch";

// 数据层：唯一写入入口（规则校验不通过则不改状态），并桥接 localStorage 持久化

interface DispatchStore extends DispatchState {
  assign: (tripId: string, orderId: string, toIndex?: number) => ActionResult;
  unassign: (orderId: string) => void;
  addEmptyTrip: (vehicleId: string) => string | null;
  depart: (tripId: string) => string | null;
  deliver: (tripId: string, orderId: string) => void;
  complete: (tripId: string) => string | null;
  requestHandover: (fromTripId: string, toVehicleId: string, remark?: string) => string | null;
  applyHandover: (handoverId: string) => string | null;
  revokeHandover: (handoverId: string) => string | null;
  addOrder: (order: Omit<Order, "id">) => void;
  resetDemo: () => void;
}

function initial(): DispatchState {
  const loaded = repository.load();
  if (loaded) return loaded;
  const seeded = seedState(); // 首次载入即落盘：重载后车次、占用与交接链仍对应
  repository.save(seeded);
  return seeded;
}

let current: DispatchState;

function commit(next: DispatchState) {
  current = next;
  repository.save(next);
}

export const useDispatchStore = create<DispatchStore>()((set, get) => {
  const apply = (recipe: (s: DispatchState) => DispatchState) => {
    const next = recipe(current);
    commit(next);
    set(next);
  };

  current = initial();

  return {
    ...current,

    assign: (tripId, orderId, toIndex) => {
      const trip = getTrip(current, tripId);
      if (!trip) return { ok: false, conflicts: [], message: "车次不存在" };
      const result = evaluateAssign(current, trip, orderId);
      if (!result.ok) return result; // 整次拒绝：不写入、布局不动
      apply((s) => assignOrder(s, tripId, orderId, toIndex));
      return { ok: true, conflicts: [] };
    },

    unassign: (orderId) => apply((s) => unassignOrder(s, orderId)),

    addEmptyTrip: (vehicleId) => {
      const next = createTrip(current, vehicleId);
      if (typeof next === "string") return next;
      commit(next);
      set(next);
      return null;
    },

    depart: (tripId) => {
      const next = departTrip(current, tripId);
      if (typeof next === "string") return next;
      commit(next);
      set(next);
      return null;
    },

    deliver: (tripId, orderId) => apply((s) => markDelivered(s, tripId, orderId)),

    complete: (tripId) => {
      const next = completeTrip(current, tripId);
      if (typeof next === "string") return next;
      commit(next);
      set(next);
      return null;
    },

    requestHandover: (fromTripId, toVehicleId, remark) => {
      const res = createHandover(current, fromTripId, toVehicleId, remark);
      if (typeof res === "string") return res;
      commit(res.state);
      set(res.state);
      return null;
    },

    applyHandover: (handoverId) => {
      const next = effectiveHandover(current, handoverId);
      if (typeof next === "string") return next;
      commit(next);
      set(next);
      return null;
    },

    revokeHandover: (handoverId) => {
      const next = cancelHandover(current, handoverId);
      if (typeof next === "string") return next;
      commit(next);
      set(next);
      return null;
    },

    addOrder: (order) =>
      apply((s) => ({
        ...s,
        orders: [{ ...order, id: `o-${crypto.randomUUID()}` }, ...s.orders]
      })),

    resetDemo: () => {
      const next = seedState();
      commit(next);
      set(next);
    }
  };
});

// 跨标签页重载：其它标签页写入后同步，保证车次、占用与交接链对应
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = repository.load();
    if (next) {
      current = next;
      useDispatchStore.setState(next);
    }
  });
}

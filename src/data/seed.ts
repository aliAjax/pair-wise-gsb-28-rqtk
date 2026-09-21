import { DispatchState, Order, Vehicle } from "./types";

// 数据层：种子数据与持久化仓储（localStorage）

export const STORAGE_KEY = "hxwlfront-14-dispatch-v1";

export function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function o(
  code: string,
  destination: string,
  weightKg: number,
  coldChain: boolean,
  sh: string,
  eh: string,
  date = todayStr()
): Order {
  const [shh, smm] = sh.split(":").map(Number);
  const [ehh, emm] = eh.split(":").map(Number);
  return {
    id: `o-${code}`,
    code,
    destination,
    weightKg,
    coldChain,
    date,
    startMin: shh * 60 + smm,
    endMin: ehh * 60 + emm
  };
}

export function seedVehicles(): Vehicle[] {
  const mk = (
    id: string,
    plate: string,
    driver: string,
    zone: Vehicle["zone"],
    capacityKg: number,
    sh: string,
    eh: string
  ): Vehicle => {
    const [shh, smm] = sh.split(":").map(Number);
    const [ehh, emm] = eh.split(":").map(Number);
    return { id, plate, driver, zone, capacityKg, startMin: shh * 60 + smm, endMin: ehh * 60 + emm };
  };
  return [
    mk("v1", "沪A-1023", "刘师傅", "cold", 800, "07:00", "14:00"),
    mk("v2", "沪B-2251", "赵师傅", "normal", 1200, "08:00", "17:00"),
    mk("v3", "沪C-3308", "孙师傅", "normal", 1000, "09:00", "18:00"),
    mk("v4", "沪D-4716", "周师傅", "cold", 600, "06:30", "13:00"),
    mk("v5", "沪E-5829", "吴师傅", "cold", 900, "07:30", "16:00")
  ];
}

export function seedState(): DispatchState {
  const date = todayStr();
  const now = Date.now();
  return {
    version: 1,
    planningDate: date,
    vehicles: seedVehicles(),
    orders: [
      // T1 运输中（冷链车 v1）：含一个已送达
      o("ORD-1001", "浦东张江·医药仓", 180, true, "08:00", "09:00"),
      o("ORD-1002", "浦东金桥·生鲜超市", 220, true, "09:30", "10:30"),
      o("ORD-1003", "川沙·社区医院", 150, true, "10:30", "11:30"),
      // T2 已排（常温车 v2）
      o("ORD-2001", "嘉定新城·建材市场", 460, false, "10:00", "12:00"),
      o("ORD-2002", "安亭·汽配城", 320, false, "13:00", "15:00"),
      // 待分配池
      o("ORD-3001", "静安寺·写字楼", 90, false, "11:00", "13:00"),
      o("ORD-3002", "虹桥枢纽·冷鲜柜", 130, true, "14:00", "15:00"),
      o("ORD-3003", "松江工业园", 520, false, "15:00", "17:00"),
      o("ORD-3004", "临港新片区", 700, false, "08:00", "10:00"),
      o("ORD-3005", "徐汇滨江·餐饮配送中心", 110, true, "16:30", "17:30")
    ],
    trips: [
      {
        id: "t1",
        code: "TC-001",
        vehicleId: "v1",
        status: "in_transit",
        createdAt: new Date(now - 5 * 3600_000).toISOString(),
        departedAt: new Date(now - 2 * 3600_000).toISOString(),
        stops: [
          { orderId: "o-ORD-1001", delivered: true, deliveredAt: new Date(now - 90 * 60_000).toISOString() },
          { orderId: "o-ORD-1002", delivered: false },
          { orderId: "o-ORD-1003", delivered: false }
        ]
      },
      {
        id: "t2",
        code: "TC-002",
        vehicleId: "v2",
        status: "scheduled",
        createdAt: new Date(now - 3600_000).toISOString(),
        stops: [
          { orderId: "o-ORD-2001", delivered: false },
          { orderId: "o-ORD-2002", delivered: false }
        ]
      },
      {
        id: "t3",
        code: "TC-003",
        vehicleId: "v3",
        status: "scheduled",
        createdAt: new Date(now - 1800_000).toISOString(),
        stops: []
      }
    ],
    handovers: []
  };
}

export const repository = {
  load(): DispatchState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DispatchState;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.trips)) return null;
      return parsed;
    } catch {
      return null;
    }
  },
  save(state: DispatchState) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* 存储不可用时静默降级 */
    }
  },
  clear() {
    localStorage.removeItem(STORAGE_KEY);
  }
};

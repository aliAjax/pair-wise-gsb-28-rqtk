// 数据层：初始数据（车辆车次 / 订单），首次加载落位，之后由 localStorage 接管。
import type { Handover, Order, Trip } from "../types";

export interface SeedState {
  trips: Trip[];
  orders: Order[];
  handovers: Handover[];
}

export function buildSeed(): SeedState {
  const now = Date.now();
  const iso = (offsetMin: number) => new Date(now - offsetMin * 60000).toISOString();

  const trips: Trip[] = [
    {
      id: "tr-1",
      code: "沪A·7K21",
      driver: "刘师傅",
      zone: "frozen",
      capacity: 800,
      windowStart: "06:00",
      windowEnd: "14:00",
      status: "departed",
      departedAt: iso(35)
    },
    {
      id: "tr-2",
      code: "沪B·3M88",
      driver: "赵师傅",
      zone: "chilled",
      capacity: 600,
      windowStart: "07:00",
      windowEnd: "16:00",
      status: "scheduled"
    },
    {
      id: "tr-3",
      code: "沪C·9T05",
      driver: "孙师傅",
      zone: "ambient",
      capacity: 1000,
      windowStart: "08:00",
      windowEnd: "18:00",
      status: "scheduled"
    },
    {
      id: "tr-4",
      code: "沪D·2Q66",
      driver: "周师傅",
      zone: "chilled",
      capacity: 500,
      windowStart: "09:00",
      windowEnd: "12:00",
      status: "scheduled"
    }
  ];

  const orders: Order[] = [
    // 已发车次 tr-1（冷冻），运输中
    {
      id: "od-1",
      orderNo: "ORD-9012",
      destination: "浦东·张江冷库",
      weight: 260,
      zone: "frozen",
      windowStart: "07:00",
      windowEnd: "09:00",
      status: "inTransit",
      tripId: "tr-1",
      position: 0
    },
    {
      id: "od-2",
      orderNo: "ORD-9017",
      destination: "浦东·金桥冷链仓",
      weight: 180,
      zone: "frozen",
      windowStart: "08:30",
      windowEnd: "10:30",
      status: "inTransit",
      tripId: "tr-1",
      position: 1
    },
    {
      id: "od-3",
      orderNo: "ORD-9023",
      destination: "浦东·临港冻品城",
      weight: 220,
      zone: "frozen",
      windowStart: "10:00",
      windowEnd: "12:00",
      status: "inTransit",
      tripId: "tr-1",
      position: 2
    },
    // 已排车次 tr-2（冷藏）
    {
      id: "od-4",
      orderNo: "ORD-9031",
      destination: "嘉定·新城商超",
      weight: 140,
      zone: "chilled",
      windowStart: "09:00",
      windowEnd: "11:00",
      status: "assigned",
      tripId: "tr-2",
      position: 0
    },
    {
      id: "od-5",
      orderNo: "ORD-9035",
      destination: "嘉定·安亭生鲜店",
      weight: 210,
      zone: "chilled",
      windowStart: "11:00",
      windowEnd: "13:00",
      status: "assigned",
      tripId: "tr-2",
      position: 1
    },
    // 待分配订单池
    {
      id: "od-6",
      orderNo: "ORD-9040",
      destination: "青浦·虹桥配送站",
      weight: 320,
      zone: "chilled",
      windowStart: "10:00",
      windowEnd: "12:00",
      status: "unassigned",
      tripId: null,
      position: -1,
      note: "冷柜温度要求 0~4℃"
    },
    {
      id: "od-7",
      orderNo: "ORD-9044",
      destination: "松江·九亭日用百货",
      weight: 410,
      zone: "ambient",
      windowStart: "13:00",
      windowEnd: "16:00",
      status: "unassigned",
      tripId: null,
      position: -1
    },
    {
      id: "od-8",
      orderNo: "ORD-9048",
      destination: "闵行·莘庄冻品行",
      weight: 150,
      zone: "frozen",
      windowStart: "08:00",
      windowEnd: "10:00",
      status: "unassigned",
      tripId: null,
      position: -1,
      note: "需 -18℃ 冷冻车"
    },
    {
      id: "od-9",
      orderNo: "ORD-9052",
      destination: "宝山·大场常温仓",
      weight: 260,
      zone: "ambient",
      windowStart: "09:30",
      windowEnd: "11:30",
      status: "unassigned",
      tripId: null,
      position: -1
    }
  ];

  return { trips, orders, handovers: [] };
}

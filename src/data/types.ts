// 数据层：领域模型定义（数据、规则、视图独立落位）

export const SCHEMA_VERSION = 1;

export type Zone = "normal" | "cold";

export type ConflictKind = "window" | "zone" | "capacity" | "locked";

/** 订单：含送达时段、冷链标记与重量 */
export interface Order {
  id: string;
  code: string; // 订单号
  destination: string;
  weightKg: number;
  coldChain: boolean; // true=冷藏温区 false=常温
  date: string; // 送达日期 YYYY-MM-DD
  startMin: number; // 送达时段起（当日分钟数）
  endMin: number; // 送达时段止
}

/** 车辆（车次的承载资源）：班次时段、温区、载重，绑定司机 */
export interface Vehicle {
  id: string;
  plate: string;
  driver: string;
  zone: Zone;
  capacityKg: number;
  startMin: number; // 车辆班次时段起
  endMin: number; // 车辆班次时段止
}

/** 车次停靠点：订单 + 顺序 + 是否已送达 */
export interface Stop {
  orderId: string;
  delivered: boolean;
  deliveredAt?: string;
}

export type TripStatus = "scheduled" | "in_transit" | "completed";

/** 车次：已排 / 运输中 / 已完成 */
export interface Trip {
  id: string;
  code: string;
  vehicleId: string;
  status: TripStatus;
  stops: Stop[]; // 发车后顺序锁定
  createdAt: string;
  departedAt?: string;
  completedAt?: string;
  // —— 交接单受控字段 ——
  /** 本车次是某交接单的新承接车次，待生效前禁止装货/发车 */
  pendingHandoverId?: string;
  /** 预占但未生效的订单（不计入本车载重，展示用） */
  incomingOrderIds?: string[];
  /** 由哪张交接单自动创建 */
  createdByHandoverId?: string;
}

export type HandoverStatus = "pending" | "effective" | "cancelled";

export interface OrderSnapshot {
  orderId: string;
  code: string;
  destination: string;
  weightKg: number;
  coldChain: boolean;
  startMin: number;
  endMin: number;
}

/** 交接单：记原车、新承接车辆和未送订单 */
export interface Handover {
  id: string;
  code: string;
  fromTripId: string;
  toTripId: string;
  fromVehicleId: string;
  toVehicleId: string;
  orderIds: string[]; // 申请改派的未送订单
  snapshot: OrderSnapshot[]; // 建单时快照
  status: HandoverStatus;
  createdAt: string;
  effectiveAt?: string;
  remark?: string;
}

export interface DispatchState {
  version: number;
  planningDate: string;
  orders: Order[];
  vehicles: Vehicle[];
  trips: Trip[];
  handovers: Handover[];
}

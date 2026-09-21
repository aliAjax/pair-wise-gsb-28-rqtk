// 领域模型：数据层独立落位，视图与规则只依赖这里的类型。

export type Zone = "frozen" | "chilled" | "ambient";

export const ZONE_LABEL: Record<Zone, string> = {
  frozen: "冷冻",
  chilled: "冷藏",
  ambient: "常温"
};

export const ZONE_OPTIONS: Zone[] = ["frozen", "chilled", "ambient"];

/** 订单状态：待分配 / 已排（挂在未发车次上）/ 运输中（车次已发车且未送达）/ 已送达 */
export type OrderStatus = "unassigned" | "assigned" | "inTransit" | "delivered";

export interface Order {
  id: string;
  orderNo: string;
  destination: string;
  weight: number; // kg
  zone: Zone; // 温区；非 ambient 即冷链订单
  windowStart: string; // HH:mm 送达时段起
  windowEnd: string; // HH:mm 送达时段止
  status: OrderStatus;
  tripId: string | null;
  position: number; // 车次内顺序，待分配时为 -1
  note?: string;
}

/** 车次（车辆班次）。发车后顺序 / 司机 / 温区全部锁定。 */
export interface Trip {
  id: string;
  code: string; // 车牌号
  driver: string;
  zone: Zone; // 车辆温区
  capacity: number; // 载重 kg
  windowStart: string; // 车次服务时段起
  windowEnd: string;
  status: "scheduled" | "departed";
  departedAt?: string;
}

export type HandoverStatus = "pending" | "effective" | "cancelled";

/** 交接单：发车后改派的唯一合法路径。 */
export interface Handover {
  id: string;
  code: string; // 交接单号
  fromTripId: string; // 原车次（发车后被改派）
  toTripId: string; // 新承接车次（必须未发车）
  orderIds: string[]; // 未送订单，按选择顺序承接
  reason: string;
  status: HandoverStatus;
  createdAt: string;
  effectiveAt?: string;
}

/** 规则可冲突的字段，用于页面标红。 */
export type ConflictField =
  | "window" // 时段不符
  | "zone" // 温区不符
  | "capacity" // 载重超限
  | "frozen" // 订单被未生效交接单冻结
  | "departed" // 目标车次已发车 / 已锁
  | "structure"; // 结构问题（订单已送达、目标缺失等）

export interface CheckResult {
  ok: boolean;
  fields: ConflictField[];
  messages: string[];
}

export interface Notice {
  type: "success" | "error" | "info";
  text: string;
  key: number;
}

export interface RejectFlash {
  targetId: string; // 拖入被拒的车次 id
  fields: ConflictField[];
  key: number;
}

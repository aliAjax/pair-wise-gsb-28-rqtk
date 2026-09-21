import { assert } from "node:console";
import type { Handover, Order, Trip } from "./src/types";
import { checkAssign, checkHandoverEffective } from "./src/rules/validation";

let failures = 0;
function expect(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`PASS ${name}`);
  } else {
    failures++;
    console.error(`FAIL ${name} ${detail}`);
  }
}

const tripChilled: Trip = {
  id: "t1", code: "A", driver: "d", zone: "chilled", capacity: 500,
  windowStart: "08:00", windowEnd: "18:00", status: "scheduled"
};
const tripAmbient: Trip = { ...tripChilled, id: "t2", zone: "ambient" };
const tripDeparted: Trip = { ...tripChilled, id: "t3", status: "departed" };

const orderOK: Order = {
  id: "o1", orderNo: "N1", destination: "x", weight: 100, zone: "chilled",
  windowStart: "09:00", windowEnd: "10:00", status: "unassigned", tripId: null, position: -1
};
const orderAmbient = { ...orderOK, id: "o2", zone: "ambient" as const };
const orderLate = { ...orderOK, id: "o3", windowStart: "17:00", windowEnd: "19:00" };
const orderHeavy = { ...orderOK, id: "o4", weight: 580 };
const frozenOrder: Order = { ...orderOK, id: "o5", status: "inTransit", tripId: "t3", position: 0 };

// 1. 正常排车
expect("ok assignment", checkAssign([orderOK], tripChilled, [], []).ok);

// 2. 温区不符
const r2 = checkAssign([orderAmbient], tripChilled, [], []);
expect("zone reject", !r2.ok && r2.fields.includes("zone"), JSON.stringify(r2));

// 3. 时段不覆盖（送达时段超出车辆时段）
const r3 = checkAssign([orderLate], tripChilled, [], []);
expect("window reject", !r3.ok && r3.fields.includes("window"), JSON.stringify(r3));

// 4. 超重
const r4 = checkAssign([orderHeavy], tripChilled, [], []);
expect("capacity reject", !r4.ok && r4.fields.includes("capacity"), JSON.stringify(r4));

// 5. 一批两单，其一温区不符 -> 整次拒绝（字段含 zone），且调用方不改布局
const r5 = checkAssign([orderOK, orderAmbient], tripChilled, [], []);
expect("batch atomic reject", !r5.ok && r5.fields.includes("zone") && r5.fields.length === 1);

// 6. 已发车次不可装
const r6 = checkAssign([orderOK], tripDeparted, [], []);
expect("departed lock", !r6.ok && r6.fields.includes("departed"), JSON.stringify(r6));

// 7. 待生效交接单冻结订单
const pending: Handover = {
  id: "h1", code: "HN1", fromTripId: "t3", toTripId: "t1", orderIds: ["o5"],
  reason: "r", status: "pending", createdAt: new Date().toISOString()
};
const r7 = checkAssign([frozenOrder], tripChilled, [frozenOrder], [pending]);
expect("frozen order blocked", !r7.ok && r7.fields.includes("frozen"), JSON.stringify(r7));

// 8. 交接生效：目标温区不符 -> 阻塞
const handoverBadZone: Handover = {
  ...pending, id: "h2", toTripId: "t2", orderIds: ["o5"]
};
const allOrders8 = [frozenOrder];
const r8 = checkHandoverEffective(handoverBadZone, [tripChilled, tripAmbient, tripDeparted], allOrders8, [handoverBadZone]);
expect("handover blocked by zone", !r8.ok && r8.fields.includes("zone"), JSON.stringify(r8));

// 9. 交接生效成功 -> 校验通过（store 中生效动作才真正转移/释放，这里验证规则放行）
const r9 = checkHandoverEffective(pending, [tripChilled, tripAmbient, tripDeparted], allOrders8, [pending]);
expect("handover effective allowed", r9.ok, JSON.stringify(r9));

// 10. 目标车已有在途交接预约重量，合并超重 -> 阻塞
const otherPending: Handover = {
  ...pending, id: "h9", code: "HN9", orderIds: ["o4"]
};
const orders10 = [frozenOrder, orderHeavy];
const r10 = checkHandoverEffective(pending, [tripChilled, tripDeparted], orders10, [pending, otherPending]);
expect("reserved capacity blocks", !r10.ok && r10.fields.includes("capacity"), JSON.stringify(r10));

// 11. 承接车已发车 -> 阻塞
const toDeparted = { ...pending, id: "h3", toTripId: "t3" };
const r11 = checkHandoverEffective(toDeparted, [tripChilled, tripDeparted], allOrders8, [toDeparted]);
expect("handover to departed blocked", !r11.ok && r11.fields.includes("departed"), JSON.stringify(r11));

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll rule tests passed");

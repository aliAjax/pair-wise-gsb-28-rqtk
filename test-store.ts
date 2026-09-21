// store 端到端冒烟：localStorage 垫片下验证受控改派全流程。
const mem = new Map<string, string>();
const localStorageShim = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear()
};
Object.assign(globalThis, {
  localStorage: localStorageShim,
  window: { localStorage: localStorageShim, addEventListener: () => {}, removeEventListener: () => {} }
});

const { useScheduleStore } = await import("./src/store/scheduleStore");
const { frozenOrderIds, tripOrders } = await import("./src/utils/helpers");

let failures = 0;
function expect(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`PASS ${name}`);
  else {
    failures++;
    console.error(`FAIL ${name} ${detail}`);
  }
}

const s = useScheduleStore.getState;
const before = s();
const snap = JSON.stringify({ orders: before.orders, trips: before.trips });

// 1. od-6 140+210+320=670 > tr-2 载重 600 -> 拒绝，布局（快照）不变
const reject = s().assignOrder("od-6", "tr-2");
expect("over-capacity rejected", !reject.ok && reject.fields.includes("capacity"), JSON.stringify(reject));
const after1 = s();
expect("layout untouched after reject", JSON.stringify({ orders: after1.orders, trips: after1.trips }) === snap);
expect("od-6 still unassigned", after1.orders.find((o) => o.id === "od-6")!.status === "unassigned");

// 2. od-8 冷冻 -> tr-2 冷藏，温区不符拒绝
const r2 = s().assignOrder("od-8", "tr-2");
expect("zone mismatch rejected", !r2.ok && r2.fields.includes("zone"), JSON.stringify(r2));

// 3. od-7 常温 410kg 13-16 -> tr-3 常温 08-18 1000kg，成功
const r3 = s().assignOrder("od-7", "tr-3");
expect("valid assign ok", r3.ok, JSON.stringify(r3));
expect("od-7 assigned to tr-3", s().orders.find((o) => o.id === "od-7")!.tripId === "tr-3");

// 4. tr-4 存在待生效入向交接单时不得发车（先建交接前置：需先发车 tr-2）
s().depart("tr-2");
expect("tr-2 departed", s().trips.find((t) => t.id === "tr-2")!.status === "departed");

// od-4 冷藏 140kg 09-11 -> tr-4 冷藏 09-12 500kg，规则通过
s().openHandoverModal("tr-2");
const created = s().createHandover({ toTripId: "tr-4", orderIds: ["od-4"], reason: "原车故障冒烟测试" });
expect("handover created", created.ok, JSON.stringify(created));
const ho = s().handovers.find((h) => h.status === "pending")!;
expect("one pending handover", Boolean(ho));

// 5. 未生效：原车占用不释放，订单仍在 tr-2，且被冻结
expect("od-4 still occupies tr-2", s().orders.find((o) => o.id === "od-4")!.tripId === "tr-2");
expect("od-4 frozen", frozenOrderIds(s().handovers).has("od-4"));
expect("tr-2 still carries od-4", tripOrders(s().orders, "tr-2").some((o) => o.id === "od-4"));

// 6. 未生效承接车不得装货（tr-4 有入向 pending -> 发车被拦）
s().assignOrder("od-6", "tr-4"); // 320+140? od-6 320 冷藏 10-12 within 09-12: 320 ≤ 500 ok
s().depart("tr-4");
expect("tr-4 cannot depart with incoming handover", s().trips.find((t) => t.id === "tr-4")!.status === "scheduled");

// 7. 冻结期间不可签收
s().markDelivered("od-4");
expect("frozen order cannot be delivered", s().orders.find((o) => o.id === "od-4")!.status !== "delivered");

// 8. 生效：占用转移，od-4 转 tr-4，顺序为 1（od-6 已在 tr-4，排在其后）
const eff = s().effectiveHandover(ho.id);
expect("handover effective", eff.ok, JSON.stringify(eff));
const od4 = s().orders.find((o) => o.id === "od-4")!;
expect("od-4 moved to tr-4", od4.tripId === "tr-4" && od4.status === "assigned");
expect("od-4 unfrozen", !frozenOrderIds(s().handovers).has("od-4"));
expect("tr-2 occupancy released", !tripOrders(s().orders, "tr-2").some((o) => o.id === "od-4"));
const tr4Orders = tripOrders(s().orders, "tr-4").map((o) => o.id);
expect("tr-4 order sequence", JSON.stringify(tr4Orders) === JSON.stringify(["od-6", "od-4"]), JSON.stringify(tr4Orders));

// 9. 持久化：重开 store 状态从 localStorage 恢复
const persisted = JSON.parse(localStorage.getItem("hxwl-dispatch-controlled-v1")!);
expect("persisted trip/order/handover", Boolean(persisted.state.trips && persisted.state.orders && persisted.state.handovers));
expect("chain persisted", persisted.state.handovers[0].status === "effective" && persisted.state.orders.find((o: any) => o.id === "od-4").tripId === "tr-4");

// 10. 已发车次拖入直接拒绝（tr-2 已发车）
const r10 = s().assignOrder("od-9", "tr-2");
expect("assign into departed rejected", !r10.ok && r10.fields.includes("departed"), JSON.stringify(r10));

// 11. 作废路径：tr-1 -> tr-3 的温区不符交接单，生效被拦；作废后冻结解除
s().openHandoverModal("tr-1");
s().createHandover({ toTripId: "tr-3", orderIds: ["od-2"], reason: "冒烟作废" });
const ho2 = s().handovers.find((h) => h.status === "pending" && h.fromTripId === "tr-1")!;
const blocked = s().effectiveHandover(ho2.id);
expect("bad handover cannot effective", !blocked.ok && blocked.fields.includes("zone"), JSON.stringify(blocked));
s().cancelHandover(ho2.id);
expect("cancel releases frozen", !frozenOrderIds(s().handovers).has("od-2"));
expect("od-2 unchanged on tr-1", s().orders.find((o) => o.id === "od-2")!.tripId === "tr-1");

if (failures > 0) {
  console.error(`\n${failures} smoke test(s) failed`);
  process.exit(1);
}
console.log("\nAll store smoke tests passed");

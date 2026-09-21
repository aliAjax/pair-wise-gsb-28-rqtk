import { message, Modal, Select } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useDispatchStore } from "../data/store";
import {
  evaluateOrderAgainstVehicle,
  getOrder,
  getTrip,
  getVehicle,
  undeliveredStops
} from "../rules/dispatch";
import { windowLabel } from "./format";

// 视图层：发车后改派 —— 先建交接单（原车 / 新承接车辆 / 未送订单）

interface Props {
  tripId: string | null;
  onClose: () => void;
}

export default function HandoverModal({ tripId, onClose }: Props) {
  const state = useDispatchStore();
  const requestHandover = useDispatchStore((s) => s.requestHandover);
  const [targetVehicleId, setTargetVehicleId] = useState<string | undefined>();

  useEffect(() => {
    if (tripId) setTargetVehicleId(undefined);
  }, [tripId]);

  const trip = tripId ? getTrip(state, tripId) : undefined;
  const fromVehicle = trip ? getVehicle(state, trip.vehicleId) : undefined;

  const undelivered = useMemo(
    () =>
      trip
        ? undeliveredStops(trip)
            .map((st) => getOrder(state, st.orderId))
            .filter((o) => Boolean(o))
        : [],
    [trip, state]
  );
  const totalKg = undelivered.reduce((a, o) => a + (o?.weightKg ?? 0), 0);

  const busyVehicleIds = useMemo(
    () =>
      new Set(
        state.trips
          .filter((t) => t.status !== "completed" && t.id !== tripId)
          .map((t) => t.vehicleId)
      ),
    [state.trips, tripId]
  );

  const options = state.vehicles
    .filter((v) => v.id !== trip?.vehicleId)
    .map((v) => {
      const reasons: string[] = [];
      let used = 0;
      for (const order of undelivered) {
        if (!order) continue;
        const kinds = evaluateOrderAgainstVehicle(order, v, used);
        used += order.weightKg;
        kinds.forEach((k) => {
          if (k === "zone" && !reasons.includes("温区不符")) reasons.push("温区不符");
          if (k === "window" && !reasons.includes("时段超出班次")) reasons.push("时段超出班次");
          if (k === "capacity" && !reasons.includes("载重不足")) reasons.push("载重不足");
        });
      }
      const busy = busyVehicleIds.has(v.id);
      const disabled = busy || reasons.length > 0;
      return {
        value: v.id,
        disabled,
        reason: busy ? "车辆已有未完成车次" : reasons.join("、"),
        label: (
          <span>
            {v.plate} · {v.driver} · {v.zone === "cold" ? "❄ 冷藏" : "常温"} · 载重{v.capacityKg}kg ·
            班次 {windowLabel(v.startMin, v.endMin)}
            {disabled ? `（不可承接：${busy ? "车辆已有未完成车次" : reasons.join("、")}）` : "（可承接）"}
          </span>
        )
      };
    });

  function confirm() {
    if (!tripId || !targetVehicleId) return;
    const err = requestHandover(tripId, targetVehicleId);
    if (err) {
      message.error(err);
      return;
    }
    message.success("交接单已建立：原车占用未释放，新车待生效不得装货");
    setTargetVehicleId(undefined);
    onClose();
  }

  return (
    <Modal
      title={`发车后改派 · 新建交接单（原车次 ${trip?.code ?? ""}）`}
      open={Boolean(tripId)}
      onCancel={onClose}
      onOk={confirm}
      okText="建立交接单（不立即转单）"
      cancelText="取消"
      okButtonProps={{ disabled: !targetVehicleId }}
      destroyOnHidden
    >
      {trip && fromVehicle && (
        <div className="ho-form">
          <div className="ho-section">
            <p className="ho-section-title">原车（占用待生效才释放）</p>
            <div className="ho-vehicle">
              {fromVehicle.plate} · {fromVehicle.driver} ·{" "}
              {fromVehicle.zone === "cold" ? "❄ 冷藏" : "常温"}
            </div>
          </div>

          <div className="ho-section">
            <p className="ho-section-title">未送订单快照（{undelivered.length} 单 / {totalKg}kg）</p>
            <div className="ho-order-list">
              {undelivered.map((o) => (
                <div key={o!.id} className="ho-order-row">
                  <span>{o!.code}</span>
                  <span>{o!.destination}</span>
                  <span className={o!.coldChain ? "zone-cold" : "zone-normal"}>
                    {o!.coldChain ? "❄" : "常温"}
                  </span>
                  <span>{windowLabel(o!.startMin, o!.endMin)}</span>
                  <span>{o!.weightKg}kg</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ho-section">
            <p className="ho-section-title">新承接车辆（生效前该车次禁止装货 / 发车）</p>
            <Select
              style={{ width: "100%" }}
              placeholder="选择承接车辆"
              value={targetVehicleId}
              onChange={setTargetVehicleId}
              options={options}
              optionFilterProp="label"
            />
            {targetVehicleId && (() => {
              const opt = options.find((o) => o.value === targetVehicleId);
              return opt && !opt.disabled ? (
                <p className="ho-hint ok">校验通过：可建立交接单，生效时转移未送订单</p>
              ) : (
                <p className="ho-hint bad">{opt?.reason ?? "该车辆不可承接"}</p>
              );
            })()}
          </div>
        </div>
      )}
    </Modal>
  );
}

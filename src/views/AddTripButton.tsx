import { useState } from "react";
import { message, Select } from "antd";
import { useDispatchStore } from "../data/store";
import { windowLabel } from "./format";

// 视图层：为空闲车辆新增空车次（已排栏）

export default function AddTripButton() {
  const vehicles = useDispatchStore((s) => s.vehicles);
  const trips = useDispatchStore((s) => s.trips);
  const addEmptyTrip = useDispatchStore((s) => s.addEmptyTrip);
  const [value, setValue] = useState<string | undefined>();

  const busy = new Set(
    trips.filter((t) => t.status !== "completed").map((t) => t.vehicleId)
  );
  const free = vehicles.filter((v) => !busy.has(v.id));

  return (
    <div className="add-trip">
      <Select
        style={{ width: 320 }}
        placeholder="选择空闲车辆新建空车次"
        value={value}
        onChange={(v) => {
          const err = addEmptyTrip(v);
          if (err) message.warning(err);
          setValue(undefined);
        }}
        options={free.map((v) => ({
          value: v.id,
          label: `${v.plate} · ${v.driver} · ${v.zone === "cold" ? "❄ 冷藏" : "常温"} · ${v.capacityKg}kg · 班次 ${windowLabel(
            v.startMin,
            v.endMin
          )}`
        }))}
        notFoundContent="当前无空闲车辆"
      />
    </div>
  );
}

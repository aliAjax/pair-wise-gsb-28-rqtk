import { useState } from "react";
import { ZONE_LABEL, ZONE_OPTIONS } from "../types";
import type { Zone } from "../types";
import { minutes } from "../utils/helpers";
import { useScheduleStore } from "../store/scheduleStore";

export default function NewOrderForm() {
  const createOrder = useScheduleStore((s) => s.createOrder);
  const [orderNo, setOrderNo] = useState("");
  const [destination, setDestination] = useState("");
  const [weight, setWeight] = useState(100);
  const [zone, setZone] = useState<Zone>("chilled");
  const [windowStart, setStart] = useState("09:00");
  const [windowEnd, setEnd] = useState("11:00");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!orderNo.trim() || !destination.trim()) {
      setError("订单号和目的地必填");
      return;
    }
    if (weight <= 0) {
      setError("重量需大于 0");
      return;
    }
    if (minutes(windowEnd) <= minutes(windowStart)) {
      setError("送达时段结束时间必须晚于开始时间");
      return;
    }
    createOrder({
      orderNo: orderNo.trim(),
      destination: destination.trim(),
      weight,
      zone,
      windowStart,
      windowEnd,
      note: note.trim() || undefined
    });
    setOrderNo("");
    setDestination("");
    setWeight(100);
    setZone("chilled");
    setNote("");
    setError("");
  }

  return (
    <form className="panel order-form" onSubmit={submit}>
      <h2>新增待分配订单</h2>
      <p className="panel-hint">订单携带送达时段、冷链温区与重量；拖入车次时不符即整次拒绝。</p>
      <label>
        订单号
        <input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="如 ORD-9060" />
      </label>
      <label>
        目的地
        <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="卸货地点" />
      </label>
      <div className="form-row">
        <label>
          重量 kg
          <input type="number" min={1} value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
        </label>
        <label>
          冷链 / 温区
          <select value={zone} onChange={(e) => setZone(e.target.value as Zone)}>
            {ZONE_OPTIONS.map((z) => (
              <option key={z} value={z}>
                {ZONE_LABEL[z]}{z !== "ambient" ? "（冷链）" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          送达时段起
          <input type="time" value={windowStart} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          送达时段止
          <input type="time" value={windowEnd} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <label>
        备注
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="温控要求、收货说明等" />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="primary">加入待分配</button>
    </form>
  );
}

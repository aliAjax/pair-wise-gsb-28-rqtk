import { useMemo, useState } from "react";
import type { ConflictField } from "../types";
import { useScheduleStore } from "../store/scheduleStore";
import { frozenOrderIds, totalWeight, tripOrders, zoneLabel } from "../utils/helpers";
import { checkAssign } from "../rules/validation";

const FIELD_NAME: Record<ConflictField, string> = {
  window: "时段",
  zone: "温区",
  capacity: "载重",
  frozen: "冻结",
  departed: "已锁",
  structure: "无效"
};

/** 建交接单弹窗：选未送订单、选新承接车次；实时标出冲突字段，但仍允许先生单（生效再卡）。 */
export default function HandoverModal() {
  const modal = useScheduleStore((s) => s.handoverModal);
  const trips = useScheduleStore((s) => s.trips);
  const orders = useScheduleStore((s) => s.orders);
  const handovers = useScheduleStore((s) => s.handovers);
  const createHandover = useScheduleStore((s) => s.createHandover);
  const closeHandoverModal = useScheduleStore((s) => s.closeHandoverModal);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toTripId, setToTripId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const fromTrip = modal ? trips.find((t) => t.id === modal.fromTripId) : undefined;

  const eligibleOrders = useMemo(() => {
    if (!fromTrip) return [];
    const frozen = frozenOrderIds(handovers);
    return tripOrders(orders, fromTrip.id).filter(
      (o) => o.status === "inTransit" && !frozen.has(o.id)
    );
  }, [fromTrip, orders, handovers]);

  const targets = useMemo(
    () => trips.filter((t) => t.status === "scheduled" && (!fromTrip || t.id !== fromTrip.id)),
    [trips, fromTrip]
  );

  if (!modal || !fromTrip) return null;

  const target = trips.find((t) => t.id === toTripId);
  const selectedOrders = eligibleOrders.filter((o) => selected.has(o.id));

  const check = target
    ? checkAssign(selectedOrders, target, orders, handovers)
    : { ok: false, fields: [] as ConflictField[], messages: [] as string[] };

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (selectedOrders.length === 0) {
      setError("请勾选至少一笔未送订单");
      return;
    }
    if (!toTripId) {
      setError("请选择新承接车辆");
      return;
    }
    if (!reason.trim()) {
      setError("请填写改派原因（交接留痕）");
      return;
    }
    const result = createHandover({ toTripId, orderIds: [...selected], reason });
    if (result.ok) {
      setSelected(new Set());
      setToTripId("");
      setReason("");
      setError("");
    } else {
      setError(result.messages.join("；"));
    }
  }

  return (
    <div className="modal-mask" onMouseDown={closeHandoverModal}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>发车后改派 · 建立交接单</h2>
          <button type="button" className="icon-btn" onClick={closeHandoverModal}>×</button>
        </header>
        <p className="modal-sub">
          原车次 <b>{fromTrip.code}</b>（{fromTrip.driver} · {zoneLabel(fromTrip.zone)}）已发车，顺序/司机/温区锁定。
          交接单生效前原车继续占用、订单冻结，承接车辆不得装货。
        </p>

        <h3>1. 选择未送订单</h3>
        <div className="modal-orders">
          {eligibleOrders.length === 0 && <p className="empty-line">原车上没有可改派的未送订单</p>}
          {eligibleOrders.map((o) => (
            <label key={o.id} className={`pick-row ${selected.has(o.id) ? "picked" : ""}`}>
              <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
              <span className="pick-main">
                <b>{o.orderNo}</b> {o.destination}
              </span>
              <span className="pick-meta">
                {o.windowStart}–{o.windowEnd} · {zoneLabel(o.zone)} · {o.weight}kg
              </span>
            </label>
          ))}
        </div>

        <h3>2. 选择新承接车辆（仅未发车次可承接）</h3>
        <div className="target-list">
          {targets.map((t) => {
            const tOrders = selectedOrders;
            const preview = tOrders.length ? checkAssign(tOrders, t, orders, handovers) : null;
            const active = toTripId === t.id;
            return (
              <button
                type="button"
                key={t.id}
                className={`target-card${active ? " active" : ""}${preview && !preview.ok ? " bad" : ""}`}
                onClick={() => setToTripId(t.id)}
              >
                <span className="target-head">
                  <b>{t.code}</b>
                  <span className={`zone-pill ${t.zone}`}>{zoneLabel(t.zone)}</span>
                </span>
                <span className="target-sub">
                  {t.driver} · {t.windowStart}–{t.windowEnd} · 载重 {totalWeight(tripOrders(orders, t.id))}/{t.capacity}kg
                </span>
                {preview && !preview.ok && (
                  <span className="conflict-row">
                    {preview.fields.map((f) => (
                      <span key={f} className={`conflict-chip ${f}`}>{FIELD_NAME[f]}不符</span>
                    ))}
                  </span>
                )}
                {preview && preview.ok && <span className="ok-line">规则通过，可承接</span>}
              </button>
            );
          })}
        </div>

        <h3>3. 改派原因</h3>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="如：原车制冷故障 / 客户改约，需冷链车下午送达"
        />

        {target && selectedOrders.length > 0 && !check.ok && (
          <p className="form-error">
            当前组合存在冲突，可先建单留痕，但在冲突解除前交接单无法生效：
            {check.messages.join("；")}
          </p>
        )}
        {error && <p className="form-error">{error}</p>}

        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={closeHandoverModal}>取消</button>
          <button type="button" className="primary" onClick={submit}>建立交接单（待生效）</button>
        </footer>
      </div>
    </div>
  );
}

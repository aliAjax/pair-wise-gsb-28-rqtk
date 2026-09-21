import type { ConflictField } from "../types";
import { useScheduleStore } from "../store/scheduleStore";
import { formatTime, totalWeight, zoneLabel } from "../utils/helpers";
import { checkHandoverEffective } from "../rules/validation";

const FIELD_NAME: Record<ConflictField, string> = {
  window: "时段",
  zone: "温区",
  capacity: "载重",
  frozen: "冻结",
  departed: "已锁",
  structure: "无效"
};

/** 交接单面板：待生效（可生效/作废）+ 历史链。 */
export default function HandoverPanel() {
  const handovers = useScheduleStore((s) => s.handovers);
  const trips = useScheduleStore((s) => s.trips);
  const orders = useScheduleStore((s) => s.orders);
  const effectiveHandover = useScheduleStore((s) => s.effectiveHandover);
  const cancelHandover = useScheduleStore((s) => s.cancelHandover);

  const pending = handovers.filter((h) => h.status === "pending");
  const history = handovers.filter((h) => h.status !== "pending");

  return (
    <section className="panel handover-panel">
      <header className="panel-title">
        <h2>发车后改派 · 交接单</h2>
        <span className="panel-count">{pending.length} 待生效</span>
      </header>
      <p className="panel-hint">
        原车占用仅在交接单生效时释放；未生效时承接车辆不得装货，涉及订单全程冻结、不可签收。
      </p>

      {pending.length === 0 && history.length === 0 && (
        <div className="empty">暂无交接单。在“运输中”车次上点“改派”即可创建。</div>
      )}

      <div className="handover-list">
        {pending.map((h) => {
          const from = trips.find((t) => t.id === h.fromTripId);
          const to = trips.find((t) => t.id === h.toTripId);
          const check = checkHandoverEffective(h, trips, orders, handovers);
          const weight = totalWeight(
            h.orderIds
              .map((id) => orders.find((o) => o.id === id))
              .filter((o): o is NonNullable<typeof o> => Boolean(o))
          );
          return (
            <article key={h.id} className={`handover-card pending${check.ok ? "" : " blocked"}`}>
              <div className="handover-head">
                <strong>{h.code}</strong>
                <span className="status-badge pending">待生效</span>
              </div>
              <p className="handover-route">
                <b>{from?.code ?? "原车缺失"}</b>（{from ? `${from.driver}·${zoneLabel(from.zone)}` : "—"}）
                <span className="arrow">→</span>
                <b>{to?.code ?? "承接车缺失"}</b>（{to ? `${to.driver}·${zoneLabel(to.zone)}` : "—"}）
              </p>
              <p className="handover-orders">
                未送订单 {h.orderIds.length} 单 / {weight}kg：
                {h.orderIds
                  .map((id) => orders.find((o) => o.id === id)?.orderNo)
                  .filter(Boolean)
                  .join("、")}
              </p>
              <p className="handover-reason">原因：{h.reason}</p>
              <p className="handover-time">建于 {formatTime(h.createdAt)}</p>
              {!check.ok && (
                <div className="conflict-box">
                  <span>生效冲突字段：</span>
                  {check.fields.map((f) => (
                    <span key={f} className={`conflict-chip ${f}`}>{FIELD_NAME[f]}不符</span>
                  ))}
                  <ul>
                    {check.messages.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="handover-actions">
                <button
                  type="button"
                  className="mini primary"
                  disabled={!check.ok}
                  title={check.ok ? "释放原车占用并转装承接车" : check.messages.join("；")}
                  onClick={() => effectiveHandover(h.id)}
                >
                  交接生效
                </button>
                <button type="button" className="mini" onClick={() => cancelHandover(h.id)}>
                  作废
                </button>
              </div>
            </article>
          );
        })}

        {history.map((h) => {
          const from = trips.find((t) => t.id === h.fromTripId);
          const to = trips.find((t) => t.id === h.toTripId);
          const effective = h.status === "effective";
          return (
            <article key={h.id} className={`handover-card ${h.status}`}>
              <div className="handover-head">
                <strong>{h.code}</strong>
                <span className={`status-badge ${h.status}`}>{effective ? "已生效" : "已作废"}</span>
              </div>
              <p className="handover-route">
                {from?.code ?? "原车缺失"} <span className="arrow">→</span> {to?.code ?? "承接车缺失"}
                <span className="handover-orders-inline">
                  （{h.orderIds.length} 单：
                  {h.orderIds
                    .map((id) => orders.find((o) => o.id === id)?.orderNo)
                    .filter(Boolean)
                    .join("、")}
                  ）
                </span>
              </p>
              <p className="handover-time">
                建于 {formatTime(h.createdAt)}
                {effective && <> · 生效于 {formatTime(h.effectiveAt)}</>}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

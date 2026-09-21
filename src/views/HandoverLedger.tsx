import { useDispatchStore } from "../data/store";
import { getVehicle } from "../rules/dispatch";
import { fmtDateTime } from "./format";

// 视图层：交接链台账（原车 / 新车 / 未送订单 / 状态）

export default function HandoverLedger() {
  const state = useDispatchStore();
  const apply = useDispatchStore((s) => s.applyHandover);
  const revoke = useDispatchStore((s) => s.revokeHandover);

  const list = [...state.handovers].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <section className="ledger">
      <header className="ledger-head">
        <h2>交接链台账</h2>
        <span className="ledger-count">
          待生效 {state.handovers.filter((h) => h.status === "pending").length} · 已生效{" "}
          {state.handovers.filter((h) => h.status === "effective").length} · 已作废{" "}
          {state.handovers.filter((h) => h.status === "cancelled").length}
        </span>
      </header>
      {list.length === 0 ? (
        <div className="empty">暂无交接单；对运输中车次发起“发车后改派”即生成交接链</div>
      ) : (
        <div className="ledger-grid">
          {list.map((h) => {
            const from = getVehicle(state, h.fromVehicleId);
            const to = getVehicle(state, h.toVehicleId);
            const totalKg = h.snapshot.reduce((a, x) => a + x.weightKg, 0);
            return (
              <article key={h.id} className={`ledger-card ho-status-${h.status}`}>
                <div className="ledger-card-head">
                  <strong>{h.code}</strong>
                  <span className={`ledger-badge ho-badge-${h.status}`}>
                    {h.status === "pending" ? "⏳ 待生效" : h.status === "effective" ? "✓ 已生效" : "✕ 已作废"}
                  </span>
                </div>
                <div className="ledger-flow">
                  <span>{from?.plate ?? "?"}（原车）</span>
                  <span className="arrow">→</span>
                  <span>{to?.plate ?? "?"}（新承接）</span>
                </div>
                <div className="ledger-orders">
                  {h.snapshot.map((s) => (
                    <span key={s.orderId} className="ledger-order">
                      {s.code}
                      {s.coldChain ? " ❄" : ""} · {s.weightKg}kg
                    </span>
                  ))}
                </div>
                <div className="ledger-meta">
                  {h.orderIds.length} 单 / {totalKg}kg · {fmtDateTime(h.createdAt)}
                  {h.effectiveAt && ` · 生效于 ${fmtDateTime(h.effectiveAt)}`}
                </div>
                {h.status === "pending" && (
                  <div className="ledger-actions">
                    <button type="button" className="mini" onClick={() => apply(h.id)}>
                      生效（释放原车占用、转单并发车）
                    </button>
                    <button type="button" className="mini secondary" onClick={() => revoke(h.id)}>
                      作废（删除占位车次）
                    </button>
                  </div>
                )}
                {h.remark && h.status === "effective" && <p className="ledger-remark">{h.remark}</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

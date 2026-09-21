import { useScheduleStore } from "./store/scheduleStore";
import Board from "./components/Board";
import NewOrderForm from "./components/NewOrderForm";
import HandoverPanel from "./components/HandoverPanel";
import HandoverModal from "./components/HandoverModal";
import Toast from "./components/Toast";

export default function App() {
  const orders = useScheduleStore((s) => s.orders);
  const trips = useScheduleStore((s) => s.trips);
  const handovers = useScheduleStore((s) => s.handovers);
  const resetAll = useScheduleStore((s) => s.resetAll);

  const unassigned = orders.filter((o) => o.status === "unassigned").length;
  const scheduledTrips = trips.filter((t) => t.status === "scheduled").length;
  const departedTrips = trips.filter((t) => t.status === "departed").length;
  const pendingHandovers = handovers.filter((h) => h.status === "pending").length;
  const inTransitOrders = orders.filter((o) => o.status === "inTransit").length;
  const delivered = orders.filter((o) => o.status === "delivered").length;

  return (
    <main className="app">
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">冷链配送 · 受控排班</p>
            <h1>配送排班与发车后改派平台</h1>
            <p className="subtitle">
              订单按送达时段、冷链温区、重量拖入车次，不符整次拒绝且不动布局；
              发车后锁住顺序、司机和温区，改派一律走交接单——原车占用仅在交接单生效时释放，未生效不得装货。
            </p>
          </div>
          <div className="topbar-side">
            <div className="stack">
              {["React", "dnd-kit", "zustand", "规则/数据/视图分层"].map((item) => (
                <span className="tag" key={item}>{item}</span>
              ))}
            </div>
            <button type="button" className="secondary reset-btn" onClick={resetAll}>
              重置演示数据
            </button>
          </div>
        </header>

        <section className="metrics">
          <article className="metric"><span>待分配订单</span><strong>{unassigned}</strong></article>
          <article className="metric"><span>已排车次（未发车）</span><strong>{scheduledTrips}</strong></article>
          <article className="metric accent"><span>运输中车次 / 在途订单</span><strong>{departedTrips} / {inTransitOrders}</strong></article>
          <article className="metric warn"><span>待生效交接单</span><strong>{pendingHandovers}</strong></article>
          <article className="metric"><span>已送达</span><strong>{delivered}</strong></article>
        </section>

        <Board />

        <div className="bottom-grid">
          <NewOrderForm />
          <HandoverPanel />
        </div>
      </div>

      <HandoverModal />
      <Toast />
    </main>
  );
}

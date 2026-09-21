import { Modal } from "antd";
import { repository } from "./data/seed";
import { useDispatchStore } from "./data/store";
import Board from "./views/Board";
import Metrics from "./views/Metrics";
import HandoverLedger from "./views/HandoverLedger";

export default function App() {
  const planningDate = useDispatchStore((s) => s.planningDate);
  const resetDemo = useDispatchStore((s) => s.resetDemo);

  function confirmReset() {
    Modal.confirm({
      title: "恢复演示数据？",
      content: "将清空 localStorage（key: hxwlfront-14-dispatch-v1）并重载车次、占用与交接链。",
      okText: "恢复",
      cancelText: "取消",
      onOk: () => resetDemo()
    });
  }

  return (
    <main className="app">
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">物流 · 配送排班 / 发车后改派受控</p>
            <h1>配送任务拖拽排班</h1>
            <p className="subtitle">
              排班日 {planningDate}：订单含送达时段、冷链标记与重量；拖入车辆按时段 / 温区 / 载重校验，不符整次拒绝且不动布局。
              发车后锁顺序、司机、温区；改派先建交接单，原车占用仅在生效时释放。
            </p>
          </div>
          <div className="topbar-side">
            <div className="stack">
              {["React", "TypeScript", "Ant Design", "dnd-kit", "zustand"].map((t) => (
                <span className="tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
            <button type="button" className="secondary reset-btn" onClick={confirmReset}>
              恢复演示数据
            </button>
          </div>
        </header>

        <Metrics />
        <Board />
        <HandoverLedger />

        <footer className="foot-note">
          数据（localStorage）、规则（rules/dispatch 纯函数）、视图（views）独立落位；重载后车次、占用与交接链仍对应。
        </footer>
      </div>
    </main>
  );
}

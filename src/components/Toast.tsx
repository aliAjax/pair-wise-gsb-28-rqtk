import { useEffect } from "react";
import { useScheduleStore } from "../store/scheduleStore";

export default function Toast() {
  const notice = useScheduleStore((s) => s.notice);
  const rejectFlash = useScheduleStore((s) => s.rejectFlash);
  const clearNotice = useScheduleStore((s) => s.clearNotice);
  const clearFlash = useScheduleStore((s) => s.clearFlash);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(clearNotice, 3600);
    return () => window.clearTimeout(timer);
  }, [notice, clearNotice]);

  useEffect(() => {
    if (!rejectFlash) return;
    const timer = window.setTimeout(clearFlash, 1800);
    return () => window.clearTimeout(timer);
  }, [rejectFlash, clearFlash]);

  return (
    <div className="toast-stack" aria-live="polite">
      {rejectFlash && (
        <div key={`flash-${rejectFlash.key}`} className="toast reject">
          <b>拖入被拒绝：</b>
          车次{rejectFlash.fields.includes("departed") ? "已发车锁定" : ""}
          {rejectFlash.fields.includes("window") ? " · 时段不符" : ""}
          {rejectFlash.fields.includes("zone") ? " · 温区不符" : ""}
          {rejectFlash.fields.includes("capacity") ? " · 载重超限" : ""}
          {rejectFlash.fields.includes("frozen") ? " · 订单冻结" : ""}
          ，布局未改动
        </div>
      )}
      {notice && (
        <div key={notice.key} className={`toast ${notice.type}`}>
          {notice.text}
        </div>
      )}
    </div>
  );
}

import { CSS } from "@dnd-kit/utilities";
import { useDraggable } from "@dnd-kit/core";
import { Order } from "../data/types";
import { windowLabel } from "./format";

export function orderDragId(orderId: string) {
  return `order-${orderId}`;
}

export function parseOrderDragId(id: string): string | null {
  return id.startsWith("order-") ? id.slice("order-".length) : null;
}

export function stopDroppableId(tripId: string, index: number) {
  return `stop-${tripId}-${index}`;
}

export function parseStopDroppableId(id: string): { tripId: string; index: number } | null {
  const m = /^stop-(.+)-(\d+)$/.exec(String(id));
  if (!m) return null;
  return { tripId: m[1], index: Number(m[2]) };
}

interface OrderCardProps {
  order: Order;
  draggable: boolean;
  delivered?: boolean;
  pendingTransfer?: boolean;
  onDeliver?: () => void;
}

export default function OrderCard({
  order,
  draggable,
  delivered,
  pendingTransfer,
  onDeliver
}: OrderCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: orderDragId(order.id),
    data: { orderId: order.id },
    disabled: !draggable
  });

  return (
    <article
      ref={setNodeRef}
      className={`order-card${isDragging ? " dragging" : ""}${delivered ? " delivered" : ""}${
        !draggable ? " locked-card" : ""
      }`}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...(draggable ? { ...attributes, ...listeners } : {})}
    >
      <div className="oc-head">
        <span className="oc-code">{order.code}</span>
        {pendingTransfer && <span className="chip chip-transfer">改派中</span>}
        <span className={`chip ${order.coldChain ? "chip-cold" : "chip-normal"}`}>
          {order.coldChain ? "❄ 冷链" : "常温"}
        </span>
      </div>
      <div className="oc-dest">{order.destination}</div>
      <div className="oc-meta">
        <span>送达 {windowLabel(order.startMin, order.endMin)}</span>
        <span>{order.weightKg}kg</span>
      </div>
      {delivered !== undefined && (
        <div className="oc-foot">
          <span className={`deliver-state ${delivered ? "is-done" : "is-wait"}`}>
            {delivered ? "✓ 已送达" : "未送达"}
          </span>
          {!delivered && onDeliver && (
            <button
              type="button"
              className="mini"
              onClick={onDeliver}
              onPointerDown={(e) => e.stopPropagation()}
            >
              登记送达
            </button>
          )}
        </div>
      )}
    </article>
  );
}

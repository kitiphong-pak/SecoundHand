"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ORDER_STATUS_LABEL } from "@/lib/orderStatus";
import { URGENCY_LABEL, URGENCY_ORDER, type UrgencyTier } from "@/lib/orderUrgency";
import type { OrderStatus } from "@/types";

export interface OrderRow {
  id: string;
  productTitle: string;
  isBuyer: boolean;
  amount: number;
  status: OrderStatus;
  lastActivityAt: string;
  urgency: UrgencyTier;
}

const STORAGE_KEY = "secoundhand.orderSeenAt";

function loadSeenMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function markSeen(order: OrderRow) {
  try {
    const map = loadSeenMap();
    map[order.id] = order.lastActivityAt;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage อาจใช้ไม่ได้ (private mode ฯลฯ) — ปล่อยผ่าน ไม่ใช่ฟีเจอร์จำเป็นต่อการใช้งานหลัก
  }
}

export function OrderList({ orders }: { orders: OrderRow[] }) {
  // เริ่มจาก map ว่างให้ตรงกับ server render ก่อน (กัน hydration mismatch เพราะ server
  // ไม่มี localStorage ให้อ่าน) แล้วค่อยโหลดค่าจริงมาแก้ไขหลัง mount — จุดนี้จะเห็นจุดแดง
  // วาบขึ้นทุกแถวแวบเดียวตอนโหลดหน้าแรกสุด เป็น trade-off ที่ยอมรับได้
  const [seenMap, setSeenMap] = useState<Record<string, string>>({});

  useEffect(() => {
    // อ่านค่าจาก localStorage ได้เฉพาะฝั่ง client เท่านั้น ต้องทำใน effect หลัง mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeenMap(loadSeenMap());
  }, []);

  // จัดกลุ่มตามความเร่งด่วน (orders ที่ส่งเข้ามาเรียงมาแล้วจาก server) ให้รายการที่ต้อง
  // รีบทำแยกออกจากรายการที่ปิดไปแล้วอย่างชัดเจน แทนที่จะไล่เรียงเป็นเส้นเดียวกันหมด
  const groups = URGENCY_ORDER.map((tier) => ({
    tier,
    rows: orders.filter((o) => o.urgency === tier),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="mt-5 flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.tier}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {URGENCY_LABEL[group.tier]} ({group.rows.length})
          </h2>
          <div className="flex flex-col gap-3">
            {group.rows.map((order) => {
              const badge = ORDER_STATUS_LABEL[order.status];
              const seenAt = seenMap[order.id];
              const isNew = !seenAt || seenAt < order.lastActivityAt;
              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  onClick={() => markSeen(order)}
                  className="relative flex items-center justify-between rounded-[var(--radius-lg)] border border-neutral-200 bg-white p-4 hover:shadow-sm"
                >
                  {isNew && (
                    <span
                      className="absolute -left-1.5 -top-1.5 h-3.5 w-3.5 rounded-full bg-error-500 ring-2 ring-neutral-50"
                      aria-label="มีการเปลี่ยนแปลงใหม่"
                      title="มีการเปลี่ยนแปลงใหม่"
                    />
                  )}
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{order.productTitle}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {order.isBuyer ? "คุณเป็นผู้ซื้อ" : "คุณเป็นผู้ขาย"} · ฿
                      {order.amount.toLocaleString("th-TH")}
                    </p>
                  </div>
                  {badge && <Badge status={badge.status}>{badge.label}</Badge>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

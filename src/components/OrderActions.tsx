"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Countdown } from "@/components/Countdown";
import type { Order } from "@/types";
import { BUYER_CONFIRM_WINDOW_MS } from "@/lib/orderTiming";
import { callApi, messageOf } from "@/lib/apiResponse";

function call(url: string, body?: object) {
  return callApi(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function OrderActions({ order, role }: { order: Order; role: "buyer" | "seller" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setLoading(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  };

  // ออเดอร์รอฝั่งตรงข้ามทำอะไรบางอย่างอยู่ (นัดเจอ/ส่งมอบ/ยืนยันรับของ)
  // ต้อง refresh หน้าเป็นระยะเพื่อดึงสถานะล่าสุด ไม่งั้นต้องกด reload เองถึงจะเห็นการเปลี่ยนแปลง
  const isTerminal =
    order.status === "completed" || order.status === "cancelled";

  // อีกฝ่ายอาจกดทำอะไรระหว่างที่เราเปิดหน้านี้ค้างไว้ (ผู้ขายแจ้งส่งมอบ, cron ปิดออเดอร์) เลยต้อง
  // คอยเช็คสถานะ แต่ถามผ่าน endpoint ที่อ่านคอลัมน์เดียวแทนการสั่ง router.refresh() รัวๆ ซึ่งสั่ง
  // ให้ทั้งหน้า render ใหม่ทุกรอบทั้งที่ส่วนใหญ่ไม่มีอะไรเปลี่ยน — refresh เฉพาะตอนที่สถานะต่างจริง
  //
  // และหยุดถามเมื่อผู้ใช้สลับแท็บไปทำอย่างอื่น เพราะไม่มีใครดูอยู่ พอกลับมาค่อยเช็คทันที 1 รอบ
  useEffect(() => {
    if (isTerminal) return;

    let stopped = false;
    const check = async () => {
      if (document.hidden || stopped) return;
      try {
        const res = await fetch(`/api/orders/${order.id}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (!stopped && data.status !== order.status) router.refresh();
      } catch {
        // เน็ตหลุดชั่วคราวไม่ต้องทำอะไร รอบหน้าค่อยลองใหม่
      }
    };

    const interval = setInterval(check, 4000);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, [isTerminal, router, order.id, order.status]);

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-error-500">{error}</p>}

      {/* จองแล้ว รอเจอกัน */}
      {(order.status === "reserved" || order.status === "meetup_scheduled") && (
        <>
          <p className="text-sm text-neutral-600">
            {role === "seller"
              ? "นัดวันเวลากับผู้ซื้อในแชท เจอกันแล้วรับเงินสด/PromptPay ได้เลย แล้วกดปุ่มด้านล่าง"
              : "นัดวันเวลากับผู้ขายในแชท เจอกันแล้วดูของก่อนจ่ายเงินได้เลย"}
          </p>
          {role === "seller" && (
            <Button
              disabled={loading}
              onClick={() => run(() => call(`/api/orders/${order.id}/mark-delivered`))}
            >
              {loading ? "กำลังดำเนินการ..." : "ส่งมอบสินค้าแล้ว"}
            </Button>
          )}
          {role === "buyer" && (
            <button
              type="button"
              className="text-xs text-neutral-400 underline hover:text-error-500"
              onClick={() => setShowCancelConfirm((v) => !v)}
            >
              ยกเลิกการจอง
            </button>
          )}
        </>
      )}

      {/* รอผู้ซื้อยืนยันรับของ */}
      {order.status === "awaiting_buyer_confirmation" && order.sellerMarkedDeliveredAt && (
        <>
          <p className="text-sm text-neutral-600">
            รอผู้ซื้อยืนยันการรับสินค้า —{" "}
            <Countdown
              targetIso={new Date(
                new Date(order.sellerMarkedDeliveredAt).getTime() + BUYER_CONFIRM_WINDOW_MS
              ).toISOString()}
            />
          </p>
          {role === "buyer" && (
            <>
              <Button
                disabled={loading}
                onClick={() => run(() => call(`/api/orders/${order.id}/confirm-receipt`))}
              >
                {loading ? "กำลังดำเนินการ..." : "ยืนยันได้รับสินค้าแล้ว"}
              </Button>
              <p className="text-xs text-neutral-400">
                ของไม่ตรงปกหรือมีปัญหา? คุยกับผู้ขายในแชทก่อน ถ้าไม่จบให้แจ้งทีมผู้ดูแลที่หน้าติดต่อ
              </p>
            </>
          )}
          {role === "seller" && (
            <button
              type="button"
              disabled={loading}
              className="text-xs text-neutral-400 underline"
              onClick={() => run(() => call(`/api/orders/${order.id}/simulate-timeout`))}
            >
              (เดโม) จำลองว่าเวลาหมดแล้ว — ระบบยืนยันแทน
            </button>
          )}
        </>
      )}

      {/* ปิดการซื้อขายแล้ว */}
      {order.status === "completed" && (
        <>
          <p className="text-sm text-success-500">✓ ซื้อขายสำเร็จเรียบร้อย</p>
        </>
      )}

      {order.status === "cancelled" && (
        <p className="text-sm text-neutral-500">ออเดอร์นี้ถูกยกเลิกแล้ว สินค้ากลับไปขายต่อตามปกติ</p>
      )}

      {/* ยืนยันยกเลิกคำสั่งซื้อ — แยกขั้นตอนกันกดพลาด */}
      {showCancelConfirm && (
        <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-md)] border border-error-500/30 bg-error-50 p-3">
          <p className="text-sm text-neutral-700">
            ยืนยันยกเลิกการจองนี้? สินค้าจะกลับไปขายต่อให้คนอื่นทันที
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={loading}
              onClick={() =>
                run(async () => {
                  await call(`/api/orders/${order.id}/cancel`);
                  setShowCancelConfirm(false);
                })
              }
            >
              ยืนยันยกเลิก
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowCancelConfirm(false)}>
              ไม่ยกเลิก
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

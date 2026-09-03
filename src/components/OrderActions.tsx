"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Countdown } from "@/components/Countdown";
import type { Order } from "@/types";
import { BUYER_CONFIRM_WINDOW_MS } from "@/lib/orderTiming";

async function call(url: string, body?: object) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "เกิดข้อผิดพลาด");
  return data;
}

export function OrderActions({ order, role }: { order: Order; role: "buyer" | "seller" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setLoading(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  };

  // เช็คฝั่ง client เท่านั้น (ต้องพึ่ง Date.now() ซึ่งไม่ pure สำหรับ render โดยตรง)
  // เริ่มที่ false กัน hydration mismatch แล้วค่อยอัปเดตจริงหลัง mount
  const [canDisputeAfterComplete, setCanDisputeAfterComplete] = useState(false);
  useEffect(() => {
    if (order.status === "completed" && order.completedAt) {
      const elapsed = Date.now() - new Date(order.completedAt).getTime();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanDisputeAfterComplete(elapsed < 2 * 24 * 60 * 60 * 1000);
    }
  }, [order.status, order.completedAt]);

  // ออเดอร์รอฝั่งตรงข้ามทำอะไรบางอย่างอยู่ (ชำระเงิน/ส่งมอบ/ยืนยัน/กรอก OTP)
  // ต้อง refresh หน้าเป็นระยะเพื่อดึงสถานะล่าสุด ไม่งั้นต้องกด reload เองถึงจะเห็นการเปลี่ยนแปลง
  const isTerminal =
    order.status === "completed" || order.status === "disputed" || order.status === "cancelled";

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

      {/* รอชำระเงิน */}
      {order.status === "pending_payment" && role === "buyer" && (
        <>
          <p className="text-sm text-neutral-600">
            กรุณาชำระเงินเพื่อยืนยันคำสั่งซื้อ (เดโม — ไม่ตัดเงินจริง)
          </p>
          <Button disabled={loading} onClick={() => run(() => call(`/api/orders/${order.id}/pay`))}>
            {loading ? "กำลังดำเนินการ..." : "ชำระเงิน (เดโม)"}
          </Button>
          <button
            type="button"
            className="text-xs text-neutral-400 underline hover:text-error-500"
            onClick={() => setShowCancelConfirm((v) => !v)}
          >
            ยกเลิกคำสั่งซื้อ
          </button>
        </>
      )}
      {order.status === "pending_payment" && role === "seller" && (
        <p className="text-sm text-neutral-500">รอผู้ซื้อชำระเงิน</p>
      )}

      {/* ชำระแล้ว รอส่งมอบ */}
      {order.status === "paid" && role === "seller" && (
        <>
          <p className="text-sm text-neutral-600">เมื่อจัดส่ง/นัดส่งมอบสินค้าแล้ว ให้กดยืนยันด้านล่าง</p>
          <Button
            disabled={loading}
            onClick={() => run(() => call(`/api/orders/${order.id}/mark-delivered`))}
          >
            {loading ? "กำลังดำเนินการ..." : "แจ้งส่งมอบสินค้าแล้ว"}
          </Button>
        </>
      )}
      {order.status === "paid" && role === "buyer" && (
        <>
          <p className="text-sm text-neutral-500">รอผู้ขายส่งมอบสินค้า</p>
          <button
            type="button"
            className="text-xs text-neutral-400 underline hover:text-error-500"
            onClick={() => setShowCancelConfirm((v) => !v)}
          >
            ยกเลิกคำสั่งซื้อ
          </button>
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
              <button
                type="button"
                className="text-xs text-neutral-400 underline hover:text-error-500"
                onClick={() => setShowDisputeForm((v) => !v)}
              >
                มีปัญหากับสินค้า? เปิดข้อพิพาท
              </button>
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

      {/* รอผู้ขายกรอก OTP */}
      {order.status === "awaiting_otp_entry" && order.otpExpiresAt && (
        <>
          {role === "buyer" && (
            <div className="rounded-[var(--radius-md)] bg-primary-50 p-4 text-center">
              <p className="text-xs text-neutral-500">แจ้งรหัสนี้ให้ผู้ขายเพื่อปิดการขาย</p>
              <p className="mt-1 font-[var(--font-display)] text-3xl font-semibold tracking-widest text-primary-600">
                {order.otpCode}
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                <Countdown targetIso={order.otpExpiresAt} />
              </p>
            </div>
          )}
          {role === "seller" && (
            <>
              <p className="text-sm text-neutral-600">
                ขอรหัส OTP จากผู้ซื้อ แล้วกรอกด้านล่างเพื่อปิดการขาย —{" "}
                <Countdown targetIso={order.otpExpiresAt} />
              </p>
              <div className="flex gap-2">
                <input
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  placeholder="รหัส 6 หลัก"
                  maxLength={6}
                  className="flex-1 rounded-[var(--radius-md)] border border-neutral-300 px-3.5 py-2.5 text-center text-lg tracking-widest outline-none focus:border-primary-500"
                />
                <Button
                  disabled={loading || otpInput.length !== 6}
                  onClick={() =>
                    run(() => call(`/api/orders/${order.id}/verify-otp`, { code: otpInput }))
                  }
                >
                  ยืนยัน
                </Button>
              </div>
              <button
                type="button"
                disabled={loading}
                className="text-xs text-neutral-400 underline"
                onClick={() => run(() => call(`/api/orders/${order.id}/simulate-timeout`))}
              >
                (เดโม) จำลองว่าเวลาหมดแล้ว — ระบบปิดอัตโนมัติ
              </button>
            </>
          )}
        </>
      )}

      {/* ปิดการซื้อขายแล้ว */}
      {order.status === "completed" && (
        <>
          <p className="text-sm text-success-500">✓ ปิดการซื้อขายเรียบร้อย เงินถูกโอนให้ผู้ขายแล้ว (เดโม)</p>
          {role === "buyer" && canDisputeAfterComplete && (
            <button
              type="button"
              className="text-xs text-neutral-400 underline hover:text-error-500"
              onClick={() => setShowDisputeForm((v) => !v)}
            >
              มีปัญหาหลังปิดออเดอร์? เปิดข้อพิพาทได้ภายใน 2 วัน
            </button>
          )}
        </>
      )}

      {/* มีข้อพิพาท */}
      {order.status === "disputed" && (
        <p className="text-sm text-error-500">
          อยู่ระหว่างการตรวจสอบโดยแอดมิน กรุณารอการติดต่อกลับ
        </p>
      )}

      {/* ยกเลิกแล้ว — อาจมาจากผู้ซื้อกดยกเลิกเอง หรือแอดมินตัดสินข้อพิพาทให้ผู้ซื้อก็ได้ ไม่รู้จาก
          Order object ตรงนี้ว่าเคยชำระเงินไปก่อนยกเลิกหรือเปล่า (ไม่ได้เก็บ paidAt แยก) เลยใช้
          ข้อความกลางๆ ไม่ยืนยันว่ามีเงินคืนเสมอไป */}
      {order.status === "cancelled" && (
        <p className="text-sm text-neutral-500">
          ออเดอร์นี้ถูกยกเลิกแล้ว ถ้าเคยชำระเงินไปแล้วจะได้รับเงินคืน (เดโม)
        </p>
      )}

      {/* ฟอร์มเปิดข้อพิพาท */}
      {showDisputeForm && (
        <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-md)] border border-error-500/30 bg-error-50 p-3">
          <Textarea
            label="เหตุผลที่เปิดข้อพิพาท"
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            rows={3}
            placeholder="อธิบายปัญหาที่พบ..."
          />
          <Button
            variant="primary"
            disabled={loading || !disputeReason.trim()}
            onClick={() =>
              run(async () => {
                await call(`/api/orders/${order.id}/dispute`, { reason: disputeReason });
                setShowDisputeForm(false);
              })
            }
          >
            ส่งเรื่องข้อพิพาท
          </Button>
        </div>
      )}

      {/* ยืนยันยกเลิกคำสั่งซื้อ — แยกขั้นตอนกันกดพลาด */}
      {showCancelConfirm && (
        <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-md)] border border-error-500/30 bg-error-50 p-3">
          <p className="text-sm text-neutral-700">
            ยืนยันยกเลิกคำสั่งซื้อนี้?{" "}
            {order.status === "paid" &&
              (order.paidAt
                ? `เงินที่ชำระเมื่อ ${new Date(order.paidAt).toLocaleString("th-TH", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })} จะคืนให้ (เดโม)`
                : "เงินที่ชำระไปแล้วจะคืนให้ (เดโม)")}
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

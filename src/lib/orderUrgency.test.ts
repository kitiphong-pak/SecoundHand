import { describe, it, expect } from "vitest";
import { getOrderUrgency } from "./orderUrgency";
import type { OrderStatus } from "@/types";

// จุดที่สำคัญที่สุดของไฟล์นี้: แต่ละสถานะต้องขึ้น "action" ให้ฝั่งที่ต้องทำอะไรต่อเท่านั้น
// ฝั่งตรงข้ามต้องเห็นเป็น "waiting" เสมอ ไม่งั้นหน้าออเดอร์จะเรียงผิด ให้คนที่ไม่ต้องทำอะไร
// เข้าใจผิดว่าต้องรีบทำ หรือคนที่ต้องรีบทำไม่เห็นว่าต้องรีบ
describe("getOrderUrgency", () => {
  it("pending_payment: action สำหรับผู้ซื้อ (ต้องจ่ายเงิน), waiting สำหรับผู้ขาย", () => {
    expect(getOrderUrgency("pending_payment", "buyer", false)).toBe("action");
    expect(getOrderUrgency("pending_payment", "seller", false)).toBe("waiting");
  });

  it("paid: action สำหรับผู้ขาย (ต้องส่งมอบ), waiting สำหรับผู้ซื้อ", () => {
    expect(getOrderUrgency("paid", "seller", false)).toBe("action");
    expect(getOrderUrgency("paid", "buyer", false)).toBe("waiting");
  });

  it("awaiting_buyer_confirmation: action สำหรับผู้ซื้อ (ต้องยืนยันรับของ), waiting สำหรับผู้ขาย", () => {
    expect(getOrderUrgency("awaiting_buyer_confirmation", "buyer", false)).toBe("action");
    expect(getOrderUrgency("awaiting_buyer_confirmation", "seller", false)).toBe("waiting");
  });

  it("awaiting_otp_entry: action สำหรับผู้ขาย (ต้องกรอก OTP), waiting สำหรับผู้ซื้อ", () => {
    expect(getOrderUrgency("awaiting_otp_entry", "seller", false)).toBe("action");
    expect(getOrderUrgency("awaiting_otp_entry", "buyer", false)).toBe("waiting");
  });

  it("completed: review ถ้ายังไม่รีวิว, done ถ้ารีวิวแล้ว — ไม่ขึ้นกับ role", () => {
    expect(getOrderUrgency("completed", "buyer", false)).toBe("review");
    expect(getOrderUrgency("completed", "seller", false)).toBe("review");
    expect(getOrderUrgency("completed", "buyer", true)).toBe("done");
    expect(getOrderUrgency("completed", "seller", true)).toBe("done");
  });

  it("cancelled: done เสมอไม่ว่า role หรือ hasReviewed จะเป็นอะไร (ไม่มีอะไรให้ทำต่อแล้ว)", () => {
    expect(getOrderUrgency("cancelled", "buyer", false)).toBe("done");
    expect(getOrderUrgency("cancelled", "seller", true)).toBe("done");
  });

  it("disputed: waiting เสมอทั้งสองฝั่ง (รอแอดมินตัดสิน ไม่มีอะไรให้คู่ค้าทำเอง)", () => {
    expect(getOrderUrgency("disputed", "buyer", false)).toBe("waiting");
    expect(getOrderUrgency("disputed", "seller", false)).toBe("waiting");
  });

  it("ครบทุกสถานะใน OrderStatus ไม่มีสถานะไหนตกหล่นไม่ได้ถูกจัดอันดับ", () => {
    const allStatuses: OrderStatus[] = [
      "pending_payment",
      "paid",
      "awaiting_buyer_confirmation",
      "awaiting_otp_entry",
      "completed",
      "disputed",
      "cancelled",
    ];
    for (const status of allStatuses) {
      const tier = getOrderUrgency(status, "buyer", false);
      expect(["action", "waiting", "review", "done"]).toContain(tier);
    }
  });
});

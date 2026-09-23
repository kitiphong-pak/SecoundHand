import { describe, it, expect } from "vitest";
import { getOrderUrgency } from "./orderUrgency";
import { ORDER_STATUS_LABEL } from "./orderStatus";
import type { OrderStatus } from "@/types";

// จุดที่สำคัญที่สุดของไฟล์นี้: แต่ละสถานะต้องขึ้น "action" ให้ฝั่งที่ต้องทำอะไรต่อเท่านั้น
// ฝั่งตรงข้ามต้องเห็นเป็น "waiting" เสมอ ไม่งั้นหน้าออเดอร์จะเรียงผิด ให้คนที่ไม่ต้องทำอะไร
// เข้าใจผิดว่าต้องรีบทำ หรือคนที่ต้องรีบทำไม่เห็นว่าต้องรีบ
describe("getOrderUrgency", () => {
  // จองแล้วแต่ยังไม่ได้นัด ไม่มีใครเป็นฝ่ายต้องกดปุ่มชัดๆ — ต้องทักไปนัดกันเอง จึงเร่งทั้งคู่
  it("reserved: action ทั้งสองฝ่าย เพราะต้องนัดกันเองก่อน", () => {
    expect(getOrderUrgency("reserved", "buyer", false)).toBe("action");
    expect(getOrderUrgency("reserved", "seller", false)).toBe("action");
  });

  it("meetup_scheduled: action ทั้งสองฝ่าย (ต้องไปตามนัด)", () => {
    expect(getOrderUrgency("meetup_scheduled", "buyer", false)).toBe("action");
    expect(getOrderUrgency("meetup_scheduled", "seller", false)).toBe("action");
  });

  it("awaiting_buyer_confirmation: action สำหรับผู้ซื้อ (ต้องยืนยันรับของ), waiting สำหรับผู้ขาย", () => {
    expect(getOrderUrgency("awaiting_buyer_confirmation", "buyer", false)).toBe("action");
    expect(getOrderUrgency("awaiting_buyer_confirmation", "seller", false)).toBe("waiting");
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

  // ดึงรายชื่อสถานะจาก ORDER_STATUS_LABEL แทนการพิมพ์เองซ้ำ — เพิ่มสถานะใหม่เมื่อไหร่เทสนี้จะ
  // ครอบให้อัตโนมัติ ไม่ต้องหวังว่าจะมีคนจำได้ว่าต้องมาแก้เทสตรงนี้ด้วย
  it("ครบทุกสถานะใน OrderStatus ไม่มีสถานะไหนตกหล่นไม่ได้ถูกจัดอันดับ", () => {
    for (const status of Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]) {
      for (const role of ["buyer", "seller"] as const) {
        expect(["action", "waiting", "review", "done"]).toContain(
          getOrderUrgency(status, role, false)
        );
      }
    }
  });
});

import { describe, it, expect } from "vitest";
import { ORDER_STATUS_LABEL, orderStatusBadge } from "./orderStatus";
import type { OrderStatus } from "@/types";

const ALL = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

describe("ป้ายสถานะออเดอร์", () => {
  it("ทุกสถานะมีป้ายเสมอ ไม่ว่าคนอ่านจะเป็นใคร", () => {
    for (const status of ALL) {
      for (const party of [undefined, "buyer", "seller"] as const) {
        expect(orderStatusBadge(status, party).label).toBeTruthy();
      }
    }
  });

  it("ไม่ใส่ฝ่ายผู้อ่าน = ได้ป้ายกลาง (หน้าผู้ดูแลใช้อันนี้)", () => {
    for (const status of ALL) {
      expect(orderStatusBadge(status)).toEqual(ORDER_STATUS_LABEL[status]);
    }
  });

  // ป้ายกลางบอกว่า "ระบบกำลังรออะไร" ซึ่งอ่านแล้วไม่รู้ว่าตัวเองต้องทำอะไรต่อ
  it("ขั้นที่ยังมีคนต้องลงมือ ป้ายของสองฝ่ายต้องไม่เหมือนกัน", () => {
    for (const status of ["reserved", "meetup_scheduled", "awaiting_buyer_confirmation"] as const) {
      expect(orderStatusBadge(status, "buyer").label).not.toEqual(
        orderStatusBadge(status, "seller").label
      );
    }
  });

  it("สถานะที่จบแล้วใช้ป้ายเดียวกันทุกฝ่าย เพราะไม่มีใครต้องทำอะไรต่อ", () => {
    for (const status of ["completed", "cancelled"] as const) {
      expect(orderStatusBadge(status, "buyer")).toEqual(ORDER_STATUS_LABEL[status]);
      expect(orderStatusBadge(status, "seller")).toEqual(ORDER_STATUS_LABEL[status]);
    }
  });

  // สีคือสัญญาณที่คนเห็นก่อนอ่านตัวหนังสือ ถ้าใส่ผิดจะบอกผิดว่าใครต้องขยับ
  it("สีเหลือง (pending) ใช้เฉพาะตอนที่ถึงตาคนอ่านต้องลงมือ", () => {
    // จองแล้วแต่ยังไม่ได้นัด — ต้องขยับทั้งคู่
    expect(orderStatusBadge("reserved", "buyer").status).toBe("pending");
    expect(orderStatusBadge("reserved", "seller").status).toBe("pending");
    // นัดแล้ว รอถึงวัน ไม่มีใครต้องกดอะไรตอนนี้
    expect(orderStatusBadge("meetup_scheduled", "buyer").status).toBe("info");
    expect(orderStatusBadge("meetup_scheduled", "seller").status).toBe("info");
    // รอผู้ซื้อกดยืนยัน — ถึงตาผู้ซื้อฝ่ายเดียว
    expect(orderStatusBadge("awaiting_buyer_confirmation", "buyer").status).toBe("pending");
    expect(orderStatusBadge("awaiting_buyer_confirmation", "seller").status).toBe("info");
  });

  // flow ใหม่ไม่มีเงินไหลผ่านระบบ และไม่มีข้อพิพาทแล้ว ป้ายต้องไม่พูดถึงสองเรื่องนี้
  it("ไม่มีป้ายไหนพูดถึงการชำระเงินหรือข้อพิพาทอีก", () => {
    const allLabels = ALL.flatMap((s) =>
      [undefined, "buyer", "seller"].map((p) => orderStatusBadge(s, p as "buyer" | undefined).label)
    ).join(" ");
    expect(allLabels).not.toMatch(/ชำระเงิน|โอนเงิน|คืนเงิน|ข้อพิพาท|OTP/);
  });
});

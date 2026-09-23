import { describe, it, expect } from "vitest";
import { ORDER_STATUS_LABEL, orderStatusBadge } from "./orderStatus";
import type { OrderStatus } from "@/types";

const ALL = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

describe("ป้ายสถานะออเดอร์", () => {
  it("ทุกสถานะมีป้ายกลางเสมอ ไม่ว่าคนอ่านจะเป็นใคร", () => {
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

  it("ขั้นที่ยังมีคนต้องลงมือ ป้ายของสองฝ่ายต้องไม่เหมือนกัน", () => {
    for (const status of ["pending_payment", "paid", "awaiting_buyer_confirmation"] as const) {
      const buyer = orderStatusBadge(status, "buyer");
      const seller = orderStatusBadge(status, "seller");
      expect(buyer.label).not.toEqual(seller.label);
    }
  });

  it("สถานะที่จบแล้วใช้ป้ายเดียวกันทุกฝ่าย เพราะไม่มีใครต้องทำอะไรต่อ", () => {
    for (const status of ["completed", "disputed", "cancelled"] as const) {
      expect(orderStatusBadge(status, "buyer")).toEqual(ORDER_STATUS_LABEL[status]);
      expect(orderStatusBadge(status, "seller")).toEqual(ORDER_STATUS_LABEL[status]);
    }
  });

  // สีคือสัญญาณที่คนเห็นก่อนอ่านตัวหนังสือ ถ้าใส่ผิดจะบอกผิดว่าใครต้องขยับ
  it("สีเหลือง (pending) ใช้เฉพาะตอนที่ถึงตาคนอ่านต้องลงมือ", () => {
    expect(orderStatusBadge("pending_payment", "buyer").status).toBe("pending");
    expect(orderStatusBadge("pending_payment", "seller").status).toBe("info");
    expect(orderStatusBadge("paid", "seller").status).toBe("pending");
    expect(orderStatusBadge("paid", "buyer").status).toBe("info");
    expect(orderStatusBadge("awaiting_buyer_confirmation", "buyer").status).toBe("pending");
    expect(orderStatusBadge("awaiting_buyer_confirmation", "seller").status).toBe("info");
  });
});

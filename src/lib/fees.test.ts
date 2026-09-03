import { describe, it, expect } from "vitest";
import { calculateFees, PLATFORM_FEE_RATE } from "./fees";

// เรื่องเงินพลาดไม่ได้ สิ่งที่เทสชุดนี้เฝ้าคือ "ผลรวมต้องเท่ากับยอดที่ผู้ซื้อจ่ายเสมอ"
// ไม่ว่ายอดจะเป็นเท่าไหร่ เพราะถ้าเศษสตางค์หายหรืองอก จะไปชนกับ constraint ในฐานข้อมูล
// (orders_fee_split_matches_amount) แล้วสร้างออเดอร์ไม่ได้เลย
describe("แบ่งค่าธรรมเนียมออกจากยอดออเดอร์", () => {
  it("หักตามอัตราที่กำหนด", () => {
    const f = calculateFees(1000);
    expect(f.platformFee).toBe(50);
    expect(f.sellerPayout).toBe(950);
    expect(f.feeRate).toBe(PLATFORM_FEE_RATE);
  });

  it("ผลรวมเท่ากับยอดเดิมเป๊ะ แม้ยอดจะหารไม่ลงตัว", () => {
    for (const amount of [333, 999.99, 1, 7, 12345.67, 0.03, 89.99]) {
      const f = calculateFees(amount);
      // เทียบเป็นสตางค์เพื่อเลี่ยงความคลาดเคลื่อนของเลขทศนิยมในตัวเทสเอง
      expect(Math.round((f.platformFee + f.sellerPayout) * 100)).toBe(Math.round(amount * 100));
    }
  });

  it("ปัดค่าธรรมเนียมลง เศษสตางค์ตกเป็นของผู้ขาย", () => {
    // 333 * 5% = 16.65 พอดี ลองยอดที่ได้เศษเกินสองตำแหน่ง
    const f = calculateFees(999); // 49.95
    expect(f.platformFee).toBe(49.95);

    const g = calculateFees(101); // 5.05
    expect(g.platformFee).toBe(5.05);

    const h = calculateFees(1.11); // 0.0555 -> ปัดลงเหลือ 0.05
    expect(h.platformFee).toBe(0.05);
    expect(h.sellerPayout).toBe(1.06);
  });

  it("ค่าธรรมเนียมไม่มีทางมากกว่ายอดออเดอร์", () => {
    for (const amount of [0, 0.01, 1, 100000]) {
      const f = calculateFees(amount);
      expect(f.platformFee).toBeLessThanOrEqual(amount);
      expect(f.sellerPayout).toBeGreaterThanOrEqual(0);
    }
  });

  it("รับอัตราอื่นได้ เผื่ออนาคตคิดต่างกันตามหมวดสินค้า", () => {
    const f = calculateFees(1000, 0.03);
    expect(f.platformFee).toBe(30);
    expect(f.sellerPayout).toBe(970);
    expect(f.feeRate).toBe(0.03);
  });

  it("อัตรา 0 แปลว่าผู้ขายได้เต็มจำนวน", () => {
    const f = calculateFees(500, 0);
    expect(f.platformFee).toBe(0);
    expect(f.sellerPayout).toBe(500);
  });

  it("ปฏิเสธค่าที่เป็นไปไม่ได้ แทนที่จะคำนวณเงินจากขยะ", () => {
    expect(() => calculateFees(-1)).toThrow();
    expect(() => calculateFees(NaN)).toThrow();
    expect(() => calculateFees(100, 1.5)).toThrow();
    expect(() => calculateFees(100, -0.1)).toThrow();
  });
});

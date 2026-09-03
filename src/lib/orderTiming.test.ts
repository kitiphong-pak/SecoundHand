import { describe, it, expect } from "vitest";
import {
  BUYER_CONFIRM_WINDOW_MS,
  SELLER_OTP_WINDOW_MS,
  DISPUTE_GRACE_MS,
  generateOtp,
} from "./orderTiming";

describe("time window constants", () => {
  it("BUYER_CONFIRM_WINDOW_MS เท่ากับ 3 วันพอดี", () => {
    expect(BUYER_CONFIRM_WINDOW_MS).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it("SELLER_OTP_WINDOW_MS เท่ากับ 24 ชั่วโมงพอดี", () => {
    expect(SELLER_OTP_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("DISPUTE_GRACE_MS เท่ากับ 2 วันพอดี", () => {
    expect(DISPUTE_GRACE_MS).toBe(2 * 24 * 60 * 60 * 1000);
  });
});

describe("generateOtp", () => {
  it("ได้รหัส 6 หลักเสมอ อยู่ในช่วง 100000-999999", () => {
    // สุ่มหลายรอบกันเคส edge case ของขอบเขตบนล่างหลุดโดยบังเอิญ
    for (let i = 0; i < 200; i++) {
      const otp = generateOtp();
      expect(otp).toMatch(/^\d{6}$/);
      const n = Number(otp);
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });

  it("คืนค่าเป็น string เสมอ (เผื่อโค้ดที่เรียกใช้ไปเทียบกับ input จากฟอร์มที่เป็น string)", () => {
    expect(typeof generateOtp()).toBe("string");
  });
});

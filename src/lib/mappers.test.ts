import { describe, it, expect } from "vitest";
import { mapUser, mapProduct, mapOrder, mapReview, mapMessage, UUID_RE } from "./mappers";

describe("mapUser", () => {
  it("แปลง snake_case row เป็น camelCase User ครบทุก field", () => {
    const row = {
      id: "u1",
      name: "พิมพ์ชนก แสงทอง",
      email: "pim@example.com",
      password_hash: "hash",
      province: "เชียงใหม่",
      role: "user",
      avatar_url: "https://example.com/avatar.png",
      is_verified: true,
      is_suspended: false,
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(mapUser(row)).toEqual({
      id: "u1",
      name: "พิมพ์ชนก แสงทอง",
      email: "pim@example.com",
      passwordHash: "hash",
      province: "เชียงใหม่",
      role: "user",
      avatarUrl: "https://example.com/avatar.png",
      isVerified: true,
      isSuspended: false,
      createdAt: "2026-01-01T00:00:00Z",
    });
  });

  it("avatar_url เป็น null ต้องแปลงเป็น undefined ไม่ใช่ null (ให้ตรงกับ type ที่เป็น optional)", () => {
    const row = {
      id: "u1",
      name: "x",
      email: "x@example.com",
      password_hash: "hash",
      province: "เชียงใหม่",
      role: "user",
      avatar_url: null,
      is_verified: false,
      is_suspended: false,
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(mapUser(row).avatarUrl).toBeUndefined();
  });

  it("is_suspended เป็น null/ไม่มี column (ข้อมูลเก่าก่อน migration) ต้องปริยายเป็น false", () => {
    const row = {
      id: "u1",
      name: "x",
      email: "x@example.com",
      password_hash: "hash",
      province: "เชียงใหม่",
      role: "user",
      is_verified: false,
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(mapUser(row).isSuspended).toBe(false);
  });
});

describe("mapProduct", () => {
  it("images เป็น null ต้องแปลงเป็น array ว่าง", () => {
    const row = {
      id: "p1",
      seller_id: "u1",
      title: "x",
      description: "x",
      price: "199.50",
      category: "อื่นๆ",
      condition: "good",
      province: "เชียงใหม่",
      images: null,
      status: "listed",
      created_at: "2026-01-01T00:00:00Z",
    };
    const product = mapProduct(row);
    expect(product.images).toEqual([]);
    // ราคาต้องแปลงจาก string (numeric column ของ Postgres) เป็น number จริง
    expect(product.price).toBe(199.5);
    expect(typeof product.price).toBe("number");
  });
});

describe("mapOrder", () => {
  it("timestamp field ที่ยังไม่เกิดขึ้น (null) ต้องเป็น undefined ทั้งหมด ไม่ใช่ null", () => {
    const row = {
      id: "o1",
      product_id: "p1",
      buyer_id: "u1",
      seller_id: "u2",
      status: "pending_payment",
      amount: "500",
      otp_code: null,
      otp_expires_at: null,
      seller_marked_delivered_at: null,
      buyer_confirmed_at: null,
      completed_at: null,
      dispute_reason: null,
      dispute_opened_at: null,
      cancelled_at: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    const order = mapOrder(row);
    expect(order.otpCode).toBeUndefined();
    expect(order.otpExpiresAt).toBeUndefined();
    expect(order.sellerMarkedDeliveredAt).toBeUndefined();
    expect(order.buyerConfirmedAt).toBeUndefined();
    expect(order.completedAt).toBeUndefined();
    expect(order.disputeReason).toBeUndefined();
    expect(order.disputeOpenedAt).toBeUndefined();
    expect(order.cancelledAt).toBeUndefined();
    expect(order.amount).toBe(500);
  });
});

describe("mapReview", () => {
  it("แปลง rating จาก string เป็น number", () => {
    const review = mapReview({
      id: "r1",
      order_id: "o1",
      from_user_id: "u1",
      to_user_id: "u2",
      rating: "5",
      comment: "ดีมาก",
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(review.rating).toBe(5);
    expect(typeof review.rating).toBe("number");
  });
});

describe("mapMessage", () => {
  it("แปลง field ครบตาม ChatMessage type", () => {
    const message = mapMessage({
      id: "m1",
      product_id: "p1",
      from_user_id: "u1",
      to_user_id: "u2",
      text: "สวัสดีครับ",
      created_at: "2026-01-01T00:00:00Z",
      read: false,
    });
    expect(message).toEqual({
      id: "m1",
      productId: "p1",
      fromUserId: "u1",
      toUserId: "u2",
      text: "สวัสดีครับ",
      createdAt: "2026-01-01T00:00:00Z",
      read: false,
    });
  });
});

describe("UUID_RE", () => {
  it("ยอมรับ UUID ที่ถูกรูปแบบ (v4-style)", () => {
    expect(UUID_RE.test("bec8cb27-cc55-4a42-87cb-93da8f2c5ac3")).toBe(true);
    expect(UUID_RE.test("00000000-0000-0000-0000-000000000001")).toBe(true);
    // ตัวพิมพ์ใหญ่ก็ต้องผ่าน เพราะ regex มี flag i
    expect(UUID_RE.test("BEC8CB27-CC55-4A42-87CB-93DA8F2C5AC3")).toBe(true);
  });

  it("ปฏิเสธค่าที่ไม่ใช่ UUID — โดยเฉพาะค่าที่พยายามหลุดโครงสร้าง PostgREST filter DSL", () => {
    expect(UUID_RE.test("")).toBe(false);
    expect(UUID_RE.test("not-a-uuid")).toBe(false);
    // เคสสำคัญที่สุด: ค่าที่ตั้งใจฉีด filter เพิ่มเข้าไปใน .or() string ต้องถูกปฏิเสธ
    expect(UUID_RE.test("x,to_user_id.eq.someone-else")).toBe(false);
    expect(UUID_RE.test("bec8cb27-cc55-4a42-87cb-93da8f2c5ac3,extra")).toBe(false);
  });
});

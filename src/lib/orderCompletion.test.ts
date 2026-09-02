import { describe, it, expect, vi, beforeEach } from "vitest";

// mock @/lib/supabase ทั้งโมดูล ให้คุมผลลัพธ์ของ UPDATE ...eq...in...select...maybeSingle()
// ได้จากในเทสต์ — นี่คือจุดที่สำคัญที่สุดของ state machine ออเดอร์ทั้งระบบ: ถ้า UPDATE ไม่โดน
// แถวไหนเลย (เพราะสถานะเปลี่ยนไปแล้วโดยคำขออื่นที่แข่งกันมาพอดี) ต้องโยน OrderStateConflictError
// ไม่ใช่ถือว่าสำเร็จเงียบๆ — ดูเหตุผลเต็มๆ ใน orderCompletion.ts และบทสนทนาที่แก้ race condition นี้
const { mockState } = vi.hoisted(() => ({
  mockState: {
    ordersResult: { data: null as Record<string, unknown> | null, error: null as Error | null },
  },
}));

vi.mock("@/lib/supabase", () => {
  const chain = {
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    select: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => mockState.ordersResult),
    insert: vi.fn(async () => ({ data: null, error: null })),
  };
  return {
    supabase: {
      from: vi.fn(() => chain),
    },
  };
});

const { completeOrder, OrderStateConflictError } = await import("./orderCompletion");

const actor = { id: "u1", role: "user", name: "ทดสอบ" };

describe("completeOrder", () => {
  beforeEach(() => {
    mockState.ordersResult = { data: null, error: null };
  });

  it("โยน OrderStateConflictError เมื่อ UPDATE ไม่โดนแถวไหนเลย (แข่งกับคำขออื่นแล้วแพ้)", async () => {
    mockState.ordersResult = { data: null, error: null };
    await expect(completeOrder("order-1", "product-1", actor, "otp")).rejects.toThrow(
      OrderStateConflictError
    );
  });

  it("สำเร็จและคืนออเดอร์ที่แปลงเป็น camelCase แล้ว เมื่อ UPDATE โดนแถวจริง", async () => {
    mockState.ordersResult = {
      data: {
        id: "order-1",
        product_id: "product-1",
        buyer_id: "u1",
        seller_id: "u2",
        status: "completed",
        amount: "500",
        created_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    };
    const result = await completeOrder("order-1", "product-1", actor, "otp");
    expect(result.id).toBe("order-1");
    expect(result.status).toBe("completed");
    expect(result.amount).toBe(500);
  });

  it("โยน error เดิมตรงๆ ถ้าเป็น DB error จริง (ไม่ใช่แค่ 0 แถว) — ต้องไม่ถูกกลืนเป็น conflict เงียบๆ", async () => {
    mockState.ordersResult = { data: null, error: new Error("connection failed") };
    await expect(completeOrder("order-1", "product-1", actor, "timeout")).rejects.toThrow(
      "connection failed"
    );
  });
});

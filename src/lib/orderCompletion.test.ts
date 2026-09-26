import { describe, it, expect, vi, beforeEach } from "vitest";

// mock @/lib/supabase ทั้งโมดูล ให้คุมผลลัพธ์ของ UPDATE ...eq...in...select...maybeSingle()
// ได้จากในเทสต์ — นี่คือจุดที่สำคัญที่สุดของ state machine ออเดอร์ทั้งระบบ: ถ้า UPDATE ไม่โดน
// แถวไหนเลย (เพราะสถานะเปลี่ยนไปแล้วโดยคำขออื่นที่แข่งกันมาพอดี) ต้องโยน OrderStateConflictError
// ไม่ใช่ถือว่าสำเร็จเงียบๆ — ดูเหตุผลเต็มๆ ใน orderCompletion.ts และบทสนทนาที่แก้ race condition นี้
const { mockState } = vi.hoisted(() => ({
  mockState: {
    ordersResult: { data: null as Record<string, unknown> | null, error: null as Error | null },
    // ผลของ SELECT รอบที่สอง ที่ยิงไปดูว่าออเดอร์ยังรอยืนยันอยู่ไหมตอน UPDATE ไม่โดนแถวไหน
    lookupResult: { data: null as Record<string, unknown> | null, error: null as Error | null },
    eqCalls: [] as unknown[][],
    ltCalls: [] as unknown[][],
    updatePayloads: [] as unknown[],
    maybeSingleCount: 0,
  },
}));

vi.mock("@/lib/supabase", () => {
  const chain = {
    update: vi.fn((payload: unknown) => {
      mockState.updatePayloads.push(payload);
      return chain;
    }),
    eq: vi.fn((...args: unknown[]) => {
      mockState.eqCalls.push(args);
      return chain;
    }),
    lt: vi.fn((...args: unknown[]) => {
      mockState.ltCalls.push(args);
      return chain;
    }),
    in: vi.fn(() => chain),
    select: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => {
      mockState.maybeSingleCount += 1;
      return mockState.maybeSingleCount === 1 ? mockState.ordersResult : mockState.lookupResult;
    }),
    insert: vi.fn(async () => ({ data: null, error: null })),
  };
  return {
    supabase: {
      from: vi.fn(() => chain),
    },
  };
});

const { completeOrder, OrderNotDueError, OrderStateConflictError } = await import("./orderCompletion");
const { BUYER_CONFIRM_WINDOW_MS } = await import("./orderTiming");

const actor = { id: "u1", role: "user", name: "ทดสอบ" };

const completedRow = {
  id: "order-1",
  product_id: "product-1",
  buyer_id: "u1",
  seller_id: "u2",
  status: "completed",
  amount: "500",
  created_at: "2026-01-01T00:00:00Z",
};

describe("completeOrder", () => {
  beforeEach(() => {
    mockState.ordersResult = { data: null, error: null };
    mockState.lookupResult = { data: null, error: null };
    mockState.eqCalls = [];
    mockState.ltCalls = [];
    mockState.updatePayloads = [];
    mockState.maybeSingleCount = 0;
  });

  // เงื่อนไขนี้คือ compare-and-swap ที่กันไม่ให้เขียนทับออเดอร์ที่ cron หรืออีกฝ่ายเพิ่งปิดไปพอดี
  // ถ้าหายไป UPDATE จะโดนแถวนั้นเสมอ แล้วออเดอร์ที่ปิดแล้วจะถูกปั๊มเป็น completed ซ้ำได้เรื่อยๆ
  it("UPDATE ต้องล็อกสถานะเดิมไว้ด้วยเสมอ ไม่ใช่ยิงใส่ id อย่างเดียว", async () => {
    mockState.ordersResult = {
      data: { id: "order-1", product_id: "product-1", buyer_id: "u1", seller_id: "u2", status: "completed", amount: "500", created_at: "2026-01-01T00:00:00Z" },
      error: null,
    };
    await completeOrder("order-1", "product-1", actor, "buyer_confirmed");
    expect(mockState.eqCalls).toContainEqual(["status", "awaiting_buyer_confirmation"]);
  });

  it("โยน OrderStateConflictError เมื่อ UPDATE ไม่โดนแถวไหนเลย (แข่งกับคำขออื่นแล้วแพ้)", async () => {
    mockState.ordersResult = { data: null, error: null };
    await expect(completeOrder("order-1", "product-1", actor, "buyer_confirmed")).rejects.toThrow(
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
    const result = await completeOrder("order-1", "product-1", actor, "buyer_confirmed");
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

  // กำหนด 3 วันต้องถูกบังคับที่ UPDATE นี้เอง ไม่ใช่เชื่อว่าผู้เรียกกรองมาแล้ว — ถ้าเงื่อนไขนี้หายไป
  // ใครที่เรียก completeOrder ด้วยเหตุผล timeout ได้ ก็ปิดออเดอร์แทนผู้ซื้อทันทีได้โดยไม่ต้องรอ
  it("ปิดแบบหมดเวลา: UPDATE ต้องกำกับกำหนด 3 วันนับจากที่ผู้ขายกดส่งมอบด้วย", async () => {
    mockState.ordersResult = { data: completedRow, error: null };

    await completeOrder("order-1", "product-1", actor, "timeout");

    const deadlineGuard = mockState.ltCalls.find(([col]) => col === "seller_marked_delivered_at");
    expect(deadlineGuard).toBeDefined();
    const cutoff = new Date(String(deadlineGuard![1])).getTime();
    expect(Date.now() - cutoff).toBeGreaterThanOrEqual(BUYER_CONFIRM_WINDOW_MS);
    expect(Date.now() - cutoff).toBeLessThan(BUYER_CONFIRM_WINDOW_MS + 5000);
  });

  it("ผู้ซื้อกดยืนยันเอง: ไม่ต้องรอกำหนด จึงต้องไม่มีเงื่อนไขเวลากำกับ", async () => {
    mockState.ordersResult = { data: completedRow, error: null };
    await completeOrder("order-1", "product-1", actor, "buyer_confirmed");
    expect(mockState.ltCalls).toHaveLength(0);
  });

  it("สั่งปิดแบบหมดเวลาก่อนครบกำหนด → OrderNotDueError และสินค้าต้องไม่ถูกปั๊มเป็น sold", async () => {
    mockState.ordersResult = { data: null, error: null }; // UPDATE ไม่โดนแถวไหนเพราะยังไม่ถึงกำหนด
    mockState.lookupResult = { data: { status: "awaiting_buyer_confirmation" }, error: null };

    await expect(completeOrder("order-1", "product-1", actor, "timeout")).rejects.toThrow(
      OrderNotDueError
    );
    expect(mockState.updatePayloads).not.toContainEqual({ status: "sold" });
  });

  it("ปิดแบบหมดเวลาแต่ออเดอร์ถูกปิดไปก่อนแล้ว → ยังเป็น conflict ตามเดิม ไม่ใช่ยังไม่ถึงกำหนด", async () => {
    mockState.ordersResult = { data: null, error: null };
    mockState.lookupResult = { data: { status: "completed" }, error: null };

    await expect(completeOrder("order-1", "product-1", actor, "timeout")).rejects.toThrow(
      OrderStateConflictError
    );
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";
import { RESERVATION_HOLD_MS } from "@/lib/orderFlowConfig";

// งานกวาดตามเวลาเป็นโค้ดที่ไม่มีใครเฝ้าดูตอนมันทำงาน (cron ยิงเอง) และมันเขียนฐานข้อมูลแทนผู้ใช้
// ทั้งสองฝั่ง — พลาดตรงนี้แปลว่าออเดอร์ของคนอื่นถูกยกเลิก หรือสินค้าที่ขายไปแล้วถูกปล่อยกลับมาขายใหม่
// โดยไม่มีใครรู้ เทสจึงเน้นสองเรื่อง: กวาดถูกใบไหม และเขียนแบบมีเงื่อนไขสถานะเดิมกำกับครบไหม
const { mock, completeMock } = vi.hoisted(() => ({
  mock: { current: null as ReturnType<typeof import("@/test/supabaseMock").createSupabaseMock> | null },
  completeMock: { calls: [] as unknown[][], impl: null as ((...a: unknown[]) => unknown) | null },
}));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.supabase;
  },
}));
vi.mock("@/lib/auditLog", () => ({ logAction: async () => {} }));
vi.mock("@/lib/orderCompletion", async () => {
  const actual = await vi.importActual<typeof import("@/lib/orderCompletion")>("@/lib/orderCompletion");
  return {
    ...actual,
    completeOrder: async (...args: unknown[]) => {
      completeMock.calls.push(args);
      return completeMock.impl?.(...args);
    },
  };
});

const { processOrderTimeouts } = await import("./orderTimeoutSweep");
const { OrderStateConflictError } = await import("./orderCompletion");

// ผลลัพธ์ที่ query แรก (ออเดอร์รอผู้ซื้อยืนยัน) จะตอบกลับ — เทสส่วนใหญ่ไม่ได้สนใจ เลยให้ว่างไว้
const noOverdueConfirmations = () => mock.current!.queueResult({ data: [], error: null });

beforeEach(() => {
  mock.current = createSupabaseMock();
  completeMock.calls = [];
  completeMock.impl = null;
});

describe("ปิดออเดอร์ที่ผู้ซื้อไม่กดยืนยัน", () => {
  it("ส่งต่อให้ completeOrder ปิดให้ พร้อมระบุว่าปิดเพราะหมดเวลา", async () => {
    mock.current!.queueResult({ data: [{ id: "o1", product_id: "p1" }], error: null });
    mock.current!.queueResult({ data: [], error: null });

    const res = await processOrderTimeouts();
    expect(res.completedOrderIds).toEqual(["o1"]);
    expect(completeMock.calls[0]?.[0]).toBe("o1");
    expect(completeMock.calls[0]?.[3]).toBe("timeout");
  });

  it("กวาดเฉพาะใบที่รอผู้ซื้อยืนยันและเลยกำหนดแล้วเท่านั้น", async () => {
    noOverdueConfirmations();
    mock.current!.queueResult({ data: [], error: null });

    await processOrderTimeouts();
    const read = mock.current!.callsTo("orders")[0];
    expect(hasOp(read, "eq", "status", "awaiting_buyer_confirmation")).toBe(true);
    expect(read.ops.some(([m, col]) => m === "lt" && col === "seller_marked_delivered_at")).toBe(true);
  });

  it("ใบที่มีคนแซงไปปิดก่อนแล้ว ข้ามไปกวาดใบถัดไป ไม่ล้มทั้งงาน", async () => {
    mock.current!.queueResult({ data: [{ id: "o1", product_id: "p1" }, { id: "o2", product_id: "p2" }], error: null });
    mock.current!.queueResult({ data: [], error: null });
    completeMock.impl = (id) => {
      if (id === "o1") throw new OrderStateConflictError();
    };

    const res = await processOrderTimeouts();
    expect(res.completedOrderIds).toEqual(["o2"]);
  });
});

describe("ยกเลิกการจองที่ไม่มีใครขยับ", () => {
  // ให้ query ยกเลิกการจองตอบว่ามีใบ o9 ค้างอยู่ แล้วคืนผลของ UPDATE ตามที่เทสกำหนด
  const staleReservation = (cancelled: Record<string, unknown> | null) => {
    noOverdueConfirmations();
    mock.current!.queueResult({ data: [{ id: "o9", product_id: "p9" }], error: null });
    mock.current!.queueResult({ data: cancelled, error: null });
  };

  it("ยกเลิกใบที่ค้าง พร้อมบันทึกเหตุผลว่าหมดเวลา และปล่อยสินค้ากลับไปขายต่อ", async () => {
    staleReservation({ id: "o9" });

    const res = await processOrderTimeouts();
    expect(res.expiredOrderIds).toEqual(["o9"]);

    const update = mock.current!.callsTo("orders")[2];
    const patch = update.ops.find(([m]) => m === "update")?.[1] as Record<string, unknown>;
    expect(patch.status).toBe("cancelled");
    expect(patch.cancel_reason).toBe("expired");

    const product = mock.current!.callsTo("products")[0];
    expect(hasOp(product, "update", { status: "listed" })).toBe(true);
    expect(hasOp(product, "eq", "id", "p9")).toBe(true);
  });

  // สองเงื่อนไขนี้คือตัวกันไม่ให้ cron ไปทับงานของคนที่กำลังใช้ระบบอยู่จริงๆ ตอนนั้นพอดี
  it("เขียนทั้งสองตารางแบบมีเงื่อนไขสถานะเดิมกำกับ (compare-and-swap)", async () => {
    staleReservation({ id: "o9" });

    await processOrderTimeouts();
    expect(hasOp(mock.current!.callsTo("orders")[2], "eq", "status", "reserved")).toBe(true);
    expect(hasOp(mock.current!.callsTo("products")[0], "eq", "status", "reserved")).toBe(true);
  });

  it("ถ้าออเดอร์ขยับไปสถานะอื่นก่อน (UPDATE ไม่โดนแถวไหน) ต้องไม่ไปแตะสินค้าเลย", async () => {
    staleReservation(null);

    const res = await processOrderTimeouts();
    expect(res.expiredOrderIds).toEqual([]);
    expect(mock.current!.callsTo("products")).toHaveLength(0);
  });

  it("กวาดเฉพาะใบที่ยังไม่ได้นัด และค้างเกินเวลาที่กำหนดไว้เท่านั้น", async () => {
    noOverdueConfirmations();
    mock.current!.queueResult({ data: [], error: null });

    const before = Date.now();
    await processOrderTimeouts();
    const read = mock.current!.callsTo("orders")[1];
    expect(hasOp(read, "eq", "status", "reserved")).toBe(true);

    // ใบที่นัดกันแล้ว (meetup_scheduled) ต้องไม่โดนกวาด เพราะวันนัดอาจอยู่ไกลกว่าเวลาถือจอง
    const [, , deadline] = read.ops.find(([m]) => m === "lt") as [string, string, string];
    const age = before - new Date(deadline).getTime();
    expect(age).toBeGreaterThanOrEqual(RESERVATION_HOLD_MS - 5_000);
    expect(age).toBeLessThanOrEqual(RESERVATION_HOLD_MS + 5_000);
  });
});

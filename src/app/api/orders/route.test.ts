import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// สองจุดเสี่ยงที่สุดของทั้งระบบรวมอยู่ใน route เดียวนี้: การกันขายสินค้าชิ้นเดียวซ้ำสองคน
// และการเช็คสิทธิ์ว่าใครกดซื้อได้บ้าง — พังแล้วเสียเงินจริง ไม่ใช่แค่หน้าจอเพี้ยน
const { mock, mockUser } = vi.hoisted(() => {
  return {
    mock: { current: null as ReturnType<typeof import("@/test/supabaseMock").createSupabaseMock> | null },
    mockUser: { current: null as { id: string; role: string; name: string } | null },
  };
});

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.supabase;
  },
}));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockUser.current,
}));
// audit log ไม่เกี่ยวกับสิ่งที่เทสนี้ตรวจ ปิดไปเลยจะได้ไม่กินคิวผลลัพธ์ของ mock
vi.mock("@/lib/auditLog", () => ({ logAction: async () => {} }));

const { POST } = await import("./route");

const SELLER = "seller-1";
const BUYER = { id: "buyer-1", role: "user", name: "ผู้ซื้อ" };

const productRow = {
  id: "product-1",
  seller_id: SELLER,
  title: "จักรยานมือสอง",
  description: "สภาพดี",
  price: 3500,
  category: "กีฬา",
  condition: "good",
  province: "เชียงใหม่",
  images: [],
  status: "listed",
  created_at: "2026-01-01T00:00:00Z",
};

const orderRow = {
  id: "order-1",
  product_id: "product-1",
  buyer_id: BUYER.id,
  seller_id: SELLER,
  status: "pending_payment",
  amount: 3500,
  created_at: "2026-01-01T00:00:00Z",
};

function request(body: unknown) {
  return new Request("http://localhost/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = BUYER;
});

describe("POST /api/orders — กันขายซ้ำ", () => {
  it("คนแรกที่กดซื้อได้ออเดอร์ และการจองต้องมีเงื่อนไข status=listed กำกับ", async () => {
    mock.current!.queueResult({ data: productRow, error: null }); // อ่านสินค้า
    mock.current!.queueResult({ data: { ...productRow, status: "reserved" }, error: null }); // จองสำเร็จ
    mock.current!.queueResult({ data: orderRow, error: null }); // สร้างออเดอร์

    const res = await POST(request({ productId: "product-1" }));
    expect(res.status).toBe(201);

    // นี่คือหัวใจของการกันขายซ้ำ ถ้าเงื่อนไขนี้หายไปเมื่อไหร่ สองคนจะจองสำเร็จพร้อมกันได้
    // ค่าธรรมเนียมต้องถูกคิดและเก็บตั้งแต่ตอนสร้างออเดอร์ ไม่ใช่ไปคำนวณเอาตอนแสดงผล
    const insert = mock.current!.callsTo("orders")[0];
    const payload = insert.ops.find(([m]) => m === "insert")?.[1] as Record<string, unknown>;
    expect(payload.amount).toBe(3500);
    expect(payload.platform_fee).toBe(175);
    expect(payload.fee_rate).toBe(0.05);
    // ห้ามส่ง seller_payout เข้าไป เพราะเป็นคอลัมน์ generated — ฐานข้อมูลจะปฏิเสธทันที
    // และการที่แอปไม่ส่งคือสิ่งที่ทำให้ยอดผู้ขายมีนิยามเดียวตลอดทั้งระบบ
    expect(payload).not.toHaveProperty("seller_payout");

    const reserve = mock.current!.callsTo("products")[1];
    expect(hasOp(reserve, "update", { status: "reserved" })).toBe(true);
    expect(hasOp(reserve, "eq", "status", "listed")).toBe(true);
  });

  it("คนที่สองที่กดพร้อมกันโดนปฏิเสธ 409 และต้องไม่มีออเดอร์ถูกสร้างเลย", async () => {
    mock.current!.queueResult({ data: productRow, error: null });
    // จองไม่โดนแถวไหน เพราะคนแรกเปลี่ยน status ไปเป็น reserved แล้ว — ไม่ใช่ error แต่ไม่ใช่สำเร็จ
    mock.current!.queueResult({ data: null, error: null });

    const res = await POST(request({ productId: "product-1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("ไม่พร้อมขาย");

    // ข้อนี้สำคัญกว่า status code — ถ้ามีแถวโผล่ในตาราง orders แปลว่าขายซ้ำสำเร็จไปแล้ว
    expect(mock.current!.callsTo("orders")).toHaveLength(0);
  });

  it("ถ้าจองสินค้าได้แต่สร้างออเดอร์พัง ต้องคืนสถานะสินค้ากลับเป็น listed", async () => {
    mock.current!.queueResult({ data: productRow, error: null });
    mock.current!.queueResult({ data: { ...productRow, status: "reserved" }, error: null });
    mock.current!.queueResult({ data: null, error: { message: "insert failed" } });

    const res = await POST(request({ productId: "product-1" }));
    expect(res.status).toBe(500);

    // ไม่คืนสถานะ = สินค้าค้าง reserved ตลอดไปทั้งที่ไม่มีออเดอร์รองรับ ขายต่อไม่ได้อีกเลย
    const rollback = mock.current!.callsTo("products")[2];
    expect(rollback).toBeDefined();
    expect(hasOp(rollback, "update", { status: "listed" })).toBe(true);
  });
});

describe("POST /api/orders — สิทธิ์การเข้าถึง", () => {
  it("ไม่ได้เข้าสู่ระบบ → 401 และไม่แตะฐานข้อมูลเลย", async () => {
    mockUser.current = null;
    const res = await POST(request({ productId: "product-1" }));
    expect(res.status).toBe(401);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("แอดมินซื้อสินค้าไม่ได้ → 403", async () => {
    mockUser.current = { id: "admin-1", role: "admin", name: "แอดมิน" };
    const res = await POST(request({ productId: "product-1" }));
    expect(res.status).toBe(403);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ซื้อสินค้าของตัวเองไม่ได้ → 400 และต้องไม่จองสินค้า", async () => {
    mockUser.current = { id: SELLER, role: "user", name: "เจ้าของสินค้า" };
    mock.current!.queueResult({ data: productRow, error: null });

    const res = await POST(request({ productId: "product-1" }));
    expect(res.status).toBe(400);
    expect(mock.current!.callsTo("products")).toHaveLength(1); // อ่านอย่างเดียว ไม่มีการจอง
  });

  it("สินค้าไม่มีอยู่จริง → 404", async () => {
    mock.current!.queueResult({ data: null, error: null });
    const res = await POST(request({ productId: "ไม่มีอยู่" }));
    expect(res.status).toBe(404);
  });
});

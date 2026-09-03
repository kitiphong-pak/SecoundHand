import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// endpoint นี้ถูกยิงซ้ำๆ ทุก 4 วินาทีจากทุกหน้าออเดอร์ที่เปิดค้างไว้ จึงต้องแน่ใจสองเรื่อง:
// คนนอกต้องไม่รู้แม้แต่สถานะของออเดอร์ที่ไม่ใช่ของตัวเอง และต้องไม่เผลอคืนข้อมูลอื่นติดไปด้วย
const { mock, mockUser } = vi.hoisted(() => ({
  mock: { current: null as ReturnType<typeof import("@/test/supabaseMock").createSupabaseMock> | null },
  mockUser: { current: null as { id: string; role: string; name: string } | null },
}));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.supabase;
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mockUser.current }));

const { GET } = await import("./route");

const BUYER = { id: "buyer-1", role: "user", name: "ผู้ซื้อ" };
const SELLER = { id: "seller-1", role: "user", name: "ผู้ขาย" };
const OUTSIDER = { id: "stranger-1", role: "user", name: "คนนอก" };
const ADMIN = { id: "admin-1", role: "admin", name: "แอดมิน" };

const row = { status: "paid", buyer_id: BUYER.id, seller_id: SELLER.id };
const params = { params: Promise.resolve({ id: "order-1" }) };
const req = () => new Request("http://localhost/api/orders/order-1/status");

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = BUYER;
});

describe("GET /api/orders/[id]/status", () => {
  it("ผู้ซื้อดูสถานะออเดอร์ตัวเองได้", async () => {
    mock.current!.queueResult({ data: row, error: null });
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("paid");
  });

  it("ผู้ขายก็ดูได้", async () => {
    mockUser.current = SELLER;
    mock.current!.queueResult({ data: row, error: null });
    expect((await GET(req(), params)).status).toBe(200);
  });

  it("แอดมินดูได้", async () => {
    mockUser.current = ADMIN;
    mock.current!.queueResult({ data: row, error: null });
    expect((await GET(req(), params)).status).toBe(200);
  });

  it("คนนอกดูไม่ได้ → 403", async () => {
    mockUser.current = OUTSIDER;
    mock.current!.queueResult({ data: row, error: null });
    const res = await GET(req(), params);
    expect(res.status).toBe(403);
    expect(await res.json()).not.toHaveProperty("status");
  });

  it("ไม่ได้เข้าสู่ระบบ → 401 และไม่แตะฐานข้อมูล", async () => {
    mockUser.current = null;
    expect((await GET(req(), params)).status).toBe(401);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ไม่พบออเดอร์ → 404", async () => {
    mock.current!.queueResult({ data: null, error: null });
    expect((await GET(req(), params)).status).toBe(404);
  });

  it("คืนแค่สถานะ ไม่พ่วง id ของคู่กรณีหรือข้อมูลอื่นออกไป", async () => {
    mock.current!.queueResult({ data: row, error: null });
    const body = await (await GET(req(), params)).json();
    expect(Object.keys(body)).toEqual(["status"]);
  });

  it("ดึงเฉพาะคอลัมน์ที่ต้องใช้ ไม่ใช่ select ทั้งแถว", async () => {
    mock.current!.queueResult({ data: row, error: null });
    await GET(req(), params);
    const call = mock.current!.callsTo("orders")[0];
    expect(hasOp(call, "select", "status, buyer_id, seller_id")).toBe(true);
    expect(hasOp(call, "select", "*")).toBe(false);
  });
});

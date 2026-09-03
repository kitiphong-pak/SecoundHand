import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// ลบประกาศขาย — จุดที่เคยพลาดคือเช็คสถานะใน JS แล้วค่อยเขียน โดยไม่ได้ล็อกสถานะไว้บน UPDATE
// ระหว่างสองบรรทัดนั้นมีช่องให้คนกดซื้อแทรกเข้ามาได้ ผลคือสินค้ากลายเป็น removed ทั้งที่มีออเดอร์
// ค้างอยู่ และถ้าผู้ซื้อยกเลิกทีหลัง route ยกเลิกจะตั้งสถานะกลับเป็น listed = ประกาศที่ถูกลบฟื้นคืนมา
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
vi.mock("@/lib/auditLog", () => ({ logAction: async () => {} }));

const { POST: remove } = await import("./route");

const SELLER = { id: "seller-1", role: "user", name: "ผู้ขาย" };
const OTHER = { id: "other-1", role: "user", name: "คนอื่น" };

const product = (status = "listed") => ({
  id: "product-1",
  seller_id: SELLER.id,
  title: "จักรยานมือสอง",
  description: "สภาพดี",
  price: 3500,
  category: "กีฬา",
  condition: "good",
  province: "เชียงใหม่",
  images: [],
  status,
  created_at: "2026-01-01T00:00:00Z",
});

const params = { params: Promise.resolve({ id: "product-1" }) };
const req = () => new Request("http://localhost/api/products/product-1/remove", { method: "POST" });

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = SELLER;
});

describe("ลบประกาศขาย", () => {
  it("เจ้าของลบได้ และ UPDATE ต้องล็อกสถานะ listed ไว้ด้วย", async () => {
    mock.current!.queueResult({ data: product(), error: null });
    mock.current!.queueResult({ data: product("removed"), error: null });

    const res = await remove(req(), params);
    expect(res.status).toBe(200);

    const update = mock.current!.callsTo("products")[1];
    expect(hasOp(update, "update", { status: "removed" })).toBe(true);
    expect(hasOp(update, "eq", "status", "listed")).toBe(true);
  });

  it("มีคนกดซื้อตัดหน้าระหว่างกดลบ → 409 ไม่ใช่ลบสำเร็จทับออเดอร์", async () => {
    mock.current!.queueResult({ data: product(), error: null }); // ตอนอ่านยังว่างอยู่
    mock.current!.queueResult({ data: null, error: null }); // แต่ UPDATE ไม่โดนแถว มีคนจองไปแล้ว

    const res = await remove(req(), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("กดซื้อ");
  });

  it("คนอื่นลบประกาศของเราไม่ได้ → 403 และไม่มีการเขียน", async () => {
    mockUser.current = OTHER;
    mock.current!.queueResult({ data: product(), error: null });

    expect((await remove(req(), params)).status).toBe(403);
    expect(mock.current!.callsTo("products")).toHaveLength(1);
  });

  it("สินค้าที่ถูกจอง/ขายแล้ว ลบไม่ได้ → 409", async () => {
    for (const status of ["reserved", "sold", "removed"]) {
      mock.current = createSupabaseMock();
      mock.current.queueResult({ data: product(status), error: null });
      expect((await remove(req(), params)).status).toBe(409);
      expect(mock.current.callsTo("products")).toHaveLength(1);
    }
  });

  it("ไม่พบประกาศ → 404", async () => {
    mock.current!.queueResult({ data: null, error: null });
    expect((await remove(req(), params)).status).toBe(404);
  });

  it("ไม่ได้เข้าสู่ระบบ → 401 และไม่แตะฐานข้อมูล", async () => {
    mockUser.current = null;
    expect((await remove(req(), params)).status).toBe(401);
    expect(mock.current!.calls).toHaveLength(0);
  });
});

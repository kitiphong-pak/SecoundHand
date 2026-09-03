import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// ประกาศขาย แชทซื้อขาย และอัปโหลดรูป — สามเรื่องนี้รับข้อมูลจากผู้ใช้โดยตรงมากที่สุดในระบบ
// สิ่งที่ต้องกันคือรับค่าที่ไม่ควรรับ (ราคาติดลบ, รูปที่ชี้ไปโดเมนอื่น, ไฟล์ที่ไม่ใช่รูป)
// และการอ่านแชทของคนอื่น
const { mock, mockUser, saveImageMock } = vi.hoisted(() => ({
  mock: { current: null as ReturnType<typeof import("@/test/supabaseMock").createSupabaseMock> | null },
  mockUser: { current: null as { id: string; role: string; name: string; province: string } | null },
  saveImageMock: { current: (async () => "https://example.supabase.co/x.png") as (...a: unknown[]) => Promise<string> },
}));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.supabase;
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mockUser.current }));
vi.mock("@/lib/auditLog", () => ({ logAction: async () => {} }));
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return { ...actual, saveImage: (...a: unknown[]) => saveImageMock.current(...a) };
});

const { POST: createProduct } = await import("@/app/api/products/route");
const { GET: readChat, POST: sendChat } = await import("@/app/api/chat/[productId]/route");
const { POST: upload } = await import("@/app/api/upload/route");

const SELLER = { id: "seller-1", role: "user", name: "ผู้ขาย", province: "เชียงใหม่" };
const BUYER_UUID = "3f1a7c2e-9b4d-4a1e-8c55-2d6b7e0f9a13";
const ADMIN = { id: "admin-1", role: "admin", name: "แอดมิน", province: "กรุงเทพมหานคร" };

const goodListing = {
  title: "จักรยานมือสอง",
  description: "สภาพดี ใช้งานน้อย",
  price: 3500,
  category: "กีฬา",
  condition: "good",
};

const productRow = {
  id: "product-1",
  seller_id: SELLER.id,
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

const post = (body: unknown) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const chatParams = { params: Promise.resolve({ productId: "product-1" }) };
const insertOf = (call: { ops: Array<[string, ...unknown[]]> }) =>
  call.ops.find(([m]) => m === "insert")?.[1] as Record<string, unknown>;

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = SELLER;
  saveImageMock.current = async () => "https://example.supabase.co/x.png";
});

describe("ลงประกาศขาย", () => {
  it("ลงขายได้ และผูกกับผู้ขาย/จังหวัดจาก session เสมอ", async () => {
    mock.current!.queueResult({ data: productRow, error: null });

    const res = await createProduct(post({ ...goodListing, sellerId: "victim-9", province: "ภูเก็ต" }));
    expect(res.status).toBe(201);

    const payload = insertOf(mock.current!.callsTo("products")[0]);
    expect(payload.seller_id).toBe(SELLER.id);
    expect(payload.province).toBe("เชียงใหม่"); // จังหวัดของผู้ขาย ไม่ใช่ค่าที่ส่งมา
    expect(payload.status).toBe("listed");
  });

  it("แอดมินลงขายสินค้าไม่ได้ → 403", async () => {
    mockUser.current = ADMIN;
    expect((await createProduct(post(goodListing))).status).toBe(403);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ราคาที่ใช้ไม่ได้ → 400", async () => {
    for (const price of [0, -100, NaN, "ฟรี"]) {
      expect((await createProduct(post({ ...goodListing, price }))).status).toBe(400);
    }
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("สภาพสินค้าที่ไม่มีในรายการ → 400", async () => {
    expect((await createProduct(post({ ...goodListing, condition: "พังแล้ว" }))).status).toBe(400);
  });

  it("รูปที่ชี้ไปโดเมนอื่นถูกกรองทิ้ง ไม่ถูกบันทึก", async () => {
    mock.current!.queueResult({ data: productRow, error: null });

    await createProduct(post({ ...goodListing, images: ["https://evil.example.com/x.png", 123, null] }));
    const payload = insertOf(mock.current!.callsTo("products")[0]);
    expect(payload.images).toEqual([]);
  });
});

describe("อ่านแชทซื้อขาย", () => {
  it("ดึงเฉพาะข้อความระหว่างเรากับคู่สนทนา ในสินค้าชิ้นนั้น", async () => {
    mock.current!.queueResult({ data: [], error: null });

    const res = await readChat(
      new Request(`http://localhost/api/chat/product-1?with=${BUYER_UUID}`),
      chatParams
    );
    expect(res.status).toBe(200);

    const call = mock.current!.callsTo("chat_messages")[0];
    expect(hasOp(call, "eq", "product_id", "product-1")).toBe(true);
    // เงื่อนไขคู่สนทนาต้องอ้างอิง id จาก session ไม่ใช่รับมาลอยๆ ทั้งคู่
    const orFilter = String(call.ops.find(([m]) => m === "or")?.[1] ?? "");
    expect(orFilter).toContain(SELLER.id);
    expect(orFilter).toContain(BUYER_UUID);
  });

  it("ไม่ระบุคู่สนทนา หรือระบุมาไม่ใช่ UUID → 400 ก่อนแตะฐานข้อมูล", async () => {
    for (const q of ["", "?with=", "?with=ไม่ใช่uuid", "?with=1 or 1=1"]) {
      const res = await readChat(new Request(`http://localhost/api/chat/product-1${q}`), chatParams);
      expect(res.status).toBe(400);
    }
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ไม่ได้เข้าสู่ระบบ → 401", async () => {
    mockUser.current = null;
    const res = await readChat(
      new Request(`http://localhost/api/chat/product-1?with=${BUYER_UUID}`),
      chatParams
    );
    expect(res.status).toBe(401);
    expect(mock.current!.calls).toHaveLength(0);
  });
});

describe("ส่งข้อความแชท", () => {
  it("ส่งได้ และผู้ส่งมาจาก session ไม่ใช่จาก body", async () => {
    mock.current!.queueResult({ data: { id: "product-1" }, error: null });
    mock.current!.queueResult({ data: null, error: null });

    await sendChat(post({ toUserId: BUYER_UUID, text: "สนใจครับ", fromUserId: "victim-9" }), chatParams);

    const rpc = mock.current!.rpcCalls.find((r) => r.fn === "send_chat_message");
    expect(rpc).toBeDefined();
    expect((rpc!.args as Record<string, unknown>).p_from_user_id).toBe(SELLER.id);
  });

  it("แอดมินแชทซื้อขายไม่ได้ → 403", async () => {
    mockUser.current = ADMIN;
    const res = await sendChat(post({ toUserId: BUYER_UUID, text: "สวัสดี" }), chatParams);
    expect(res.status).toBe(403);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ข้อความว่าง หรือคู่สนทนาไม่ใช่ UUID → 400", async () => {
    for (const body of [
      { toUserId: BUYER_UUID, text: "   " },
      { toUserId: "ไม่ใช่uuid", text: "สวัสดี" },
      { text: "สวัสดี" },
    ]) {
      expect((await sendChat(post(body), chatParams)).status).toBe(400);
    }
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ส่งหาสินค้าที่ไม่มีอยู่ → 404 และไม่บันทึกข้อความ", async () => {
    mock.current!.queueResult({ data: null, error: null });
    const res = await sendChat(post({ toUserId: BUYER_UUID, text: "สวัสดี" }), chatParams);
    expect(res.status).toBe(404);
    expect(mock.current!.rpcCalls).toHaveLength(0);
  });
});

describe("อัปโหลดรูป", () => {
  it("อัปโหลดรูปได้ → 201 พร้อม url", async () => {
    const res = await upload(post({ image: "data:image/png;base64,iVBORw0KGgo=" }));
    expect(res.status).toBe(201);
    expect((await res.json()).url).toContain("http");
  });

  it("ไม่ได้เข้าสู่ระบบ → 401 และไม่เรียกตัวเก็บไฟล์เลย", async () => {
    mockUser.current = null;
    let called = false;
    saveImageMock.current = async () => {
      called = true;
      return "x";
    };
    expect((await upload(post({ image: "data:image/png;base64,iVBORw0KGgo=" }))).status).toBe(401);
    expect(called).toBe(false);
  });

  it("ของที่ไม่ใช่รูปภาพ → 400", async () => {
    for (const image of [
      "data:text/html;base64,PHNjcmlwdD4=",
      "https://evil.example.com/x.png",
      "javascript:alert(1)",
      "",
    ]) {
      expect((await upload(post({ image }))).status).toBe(400);
    }
  });

  it("ไฟล์ใหญ่เกินกำหนด → 400 โดยไม่ต้องพยายามเก็บไฟล์", async () => {
    let called = false;
    saveImageMock.current = async () => {
      called = true;
      return "x";
    };
    const huge = "data:image/png;base64," + "A".repeat(3_000_001);
    expect((await upload(post({ image: huge }))).status).toBe(400);
    expect(called).toBe(false);
  });
});

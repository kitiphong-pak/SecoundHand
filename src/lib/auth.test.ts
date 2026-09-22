import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";
import { SYSTEM_USER_ID } from "@/lib/systemUser";

// getCurrentUser() คือประตูเดียวที่ทุกหน้าและทุก route ใช้ตัดสินว่าใครล็อกอินอยู่ (47 ไฟล์)
// เทส route อื่นทั้งหมด mock ฟังก์ชันนี้ทิ้ง ตัวมันเองจึงต้องมีเทสของตัวเอง
const { mock, auth } = vi.hoisted(() => ({
  mock: { current: null as ReturnType<typeof import("@/test/supabaseMock").createSupabaseMock> | null },
  auth: { sessionUserId: null as string | null, signOutCalls: 0 },
}));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.supabase;
  },
}));
vi.mock("@/lib/supabaseAuth", () => ({
  getSessionUserId: async () => auth.sessionUserId,
  signOut: async () => {
    auth.signOutCalls++;
  },
}));

const { getCurrentUser } = await import("./auth");

const userRow = (over: Record<string, unknown> = {}) => ({
  id: "user-1",
  name: "ผู้ใช้",
  email: "user@example.com",
  password_hash: null,
  province: "เชียงใหม่",
  role: "user",
  avatar_url: null,
  is_verified: false,
  is_suspended: false,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

beforeEach(() => {
  mock.current = createSupabaseMock();
  auth.sessionUserId = "user-1";
  auth.signOutCalls = 0;
});

describe("getCurrentUser", () => {
  it("ไม่มี session → null และไม่แตะฐานข้อมูล", async () => {
    auth.sessionUserId = null;
    expect(await getCurrentUser()).toBeNull();
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("มี session → คืนผู้ใช้จาก public.users ด้วย id เดียวกับใน Supabase Auth", async () => {
    mock.current!.queueResult({ data: userRow(), error: null });
    const user = await getCurrentUser();
    expect(user?.id).toBe("user-1");
    expect(hasOp(mock.current!.callsTo("users")[0], "eq", "id", "user-1")).toBe(true);
  });

  it("ไม่พา password_hash ที่ค้างอยู่ในตารางติดออกมา", async () => {
    mock.current!.queueResult({ data: userRow({ password_hash: "$2b$10$leftover" }), error: null });
    expect(JSON.stringify(await getCurrentUser())).not.toContain("$2b$10$");
  });

  // ข้อนี้คือเหตุผลที่แอดมินกดระงับแล้วมีผลทันที — ไม่ต้องรอ token หมดอายุ
  it("บัญชีถูกระงับ → null ทันทีแม้ session ยังใช้ได้ และล็อกเอาต์ทิ้ง", async () => {
    mock.current!.queueResult({ data: userRow({ is_suspended: true }), error: null });
    expect(await getCurrentUser()).toBeNull();
    expect(auth.signOutCalls).toBe(1);
  });

  it("มี session แต่ไม่มีโปรไฟล์ในแอป → null", async () => {
    mock.current!.queueResult({ data: null, error: null });
    expect(await getCurrentUser()).toBeNull();
  });

  it("id ของบัญชีระบบ → null โดยไม่ไปอ่านโปรไฟล์ (บัญชีนี้มี role admin)", async () => {
    auth.sessionUserId = SYSTEM_USER_ID;
    expect(await getCurrentUser()).toBeNull();
    expect(mock.current!.calls).toHaveLength(0);
  });
});

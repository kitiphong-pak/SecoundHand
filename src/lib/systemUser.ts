// บัญชี "ระบบอัตโนมัติ" — มีตัวตนอยู่ในตาราง users จริง เพราะ audit_logs.actor_id เป็น not null
// + FK ไปที่ users(id) เสมอ แต่ action ที่เกิดจาก cron ไม่มีคนกดจริง เลยต้องมีผู้ใช้ไว้อ้างอิง
// (สร้างโดย supabase/migrations/007_system_actor.sql ด้วย id คงที่ตัวนี้)
//
// แยกออกมาเป็นโมดูลของตัวเองเพื่อให้ทั้ง route ล็อกอินและหน้าแอดมิน import ค่านี้ได้โดยไม่ต้อง
// ลาก orderTimeoutSweep (ซึ่งดึง supabase + orderCompletion ตามมาทั้งชุด) เข้ามาด้วย
//
// สำคัญ: บัญชีนี้ "ไม่ใช่คน" ทุกที่ที่นับหรือแสดงรายชื่อผู้ใช้ต้องกรองมันออก และต้องไม่มีใคร
// ล็อกอินเข้ามาด้วยบัญชีนี้ได้ — ดู src/app/api/auth/login/route.ts
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

export const SYSTEM_ACTOR = {
  id: SYSTEM_USER_ID,
  role: "admin",
  name: "ระบบอัตโนมัติ",
};

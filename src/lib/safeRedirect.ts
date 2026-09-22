// ปลายทางหลังล็อกอินมาจาก query string (?next=...) ซึ่งใครจะแต่งมาก็ได้ ถ้าเอาไปใช้ตรงๆ จะกลายเป็น
// open redirect: แปะลิงก์ songtor.app/login?next=https://เว็บปลอม ในกลุ่ม Facebook คนกดล็อกอินเสร็จ
// แล้วถูกส่งไปหน้าเลียนแบบที่ขอรหัสผ่านซ้ำ — ลิงก์ดูน่าเชื่อเพราะโดเมนแรกที่เห็นเป็นของเราจริง
//
// รับเฉพาะ path ภายในเว็บเดียวกัน (ขึ้นต้นด้วย "/" ตัวเดียว) ที่เหลือตกไปหน้าแรกทั้งหมด
// "//evil.com" กับ "/\evil.com" เบราว์เซอร์ตีความเป็น URL ข้ามโดเมน (protocol-relative) ต้องตัดทิ้งด้วย
export function safeNextPath(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  // อักขระควบคุม (เช่นขึ้นบรรทัดใหม่/แท็บ) เบราว์เซอร์บางตัวตัดทิ้งก่อนตีความ ทำให้ "/\t/evil.com"
  // กลายเป็น "//evil.com" ได้ — ปฏิเสธไปเลยดีกว่าพยายามทำความสะอาด
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/";
  return value;
}

/** ลิงก์ไปหน้าล็อกอินที่พากลับมาหน้าเดิมหลังล็อกอินเสร็จ */
export function loginHref(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

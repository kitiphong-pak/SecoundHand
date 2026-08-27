// กรอบเวลาของ flow ยืนยันปิดการซื้อขายแบบ dual-confirmation + OTP
export const BUYER_CONFIRM_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 วัน รอผู้ซื้อยืนยันรับของ
export const SELLER_OTP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 ชม. รอผู้ขายกรอก OTP
export const DISPUTE_GRACE_MS = 2 * 24 * 60 * 60 * 1000; // 2 วันหลังปิดออเดอร์ ยังเปิดข้อพิพาทได้

export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // รหัส 6 หลัก
}

import type { Province } from "@/lib/provinces";

export type Role = "user" | "admin";

// ผู้ใช้ทั่วไปทำหน้าที่ได้ทั้งซื้อและขาย (เหมือน Facebook Marketplace/Mercari)
// มีแค่ admin เท่านั้นที่เป็นบทบาทแยกต่างหากสำหรับเจ้าหน้าที่ดูแลระบบ
export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  province: Province;
  role: Role;
  avatarUrl?: string;
  isVerified: boolean; // ผ่านการยืนยันตัวตน (KYC demo) แล้วหรือยัง — แอดมินกดยืนยันให้จาก /admin/users
  isSuspended: boolean; // ถูกแอดมินระงับบัญชี — ระงับแล้วล็อกอินไม่ได้และ session เดิมถูกเลิกทันที
  createdAt: string;
}

export type ProductCondition = "new" | "like_new" | "good" | "fair";

export type ProductStatus = "listed" | "reserved" | "sold" | "removed";

export interface Product {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: ProductCondition;
  province: Province;
  images: string[];
  status: ProductStatus;
  createdAt: string;
}

// สถานะออเดอร์ตาม flow ยืนยันปิดการซื้อขายแบบ dual-confirmation + OTP
export type OrderStatus =
  | "pending_payment" // รอผู้ซื้อชำระเงิน (demo)
  | "paid" // ชำระเงินแล้ว รอผู้ขายส่งมอบ
  | "awaiting_buyer_confirmation" // ผู้ขายแจ้งส่งมอบแล้ว กำลังนับเวลารอผู้ซื้อยืนยัน
  | "awaiting_otp_entry" // ผู้ซื้อยืนยันรับของแล้ว ระบบออก OTP รอผู้ขายกรอก
  | "completed" // ปิดการซื้อขาย ปล่อยเงินให้ผู้ขายแล้ว (กรอก OTP ถูก หรือ auto-complete)
  | "disputed" // มีข้อพิพาท รอแอดมินตัดสิน
  | "cancelled"; // แอดมินตัดสินข้อพิพาทให้ฝั่งผู้ซื้อ ถือว่ายกเลิก/คืนเงิน (เดโม)

export interface Order {
  id: string;
  productId: string;
  buyerId: string;
  sellerId: string;
  status: OrderStatus;
  amount: number;
  otpCode?: string; // สร้างตอนผู้ซื้อกดยืนยันได้รับของ ใช้ครั้งเดียว
  otpExpiresAt?: string;
  sellerMarkedDeliveredAt?: string; // เริ่มนับ timeout รอบที่ 1 (ผู้ซื้อ)
  buyerConfirmedAt?: string; // เริ่มนับ timeout รอบที่ 2 (ผู้ขายกรอก OTP)
  completedAt?: string;
  disputeReason?: string;
  disputeOpenedAt?: string;
  cancelledAt?: string; // แอดมินตัดสินให้ฝั่งผู้ซื้อ
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  productId: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  createdAt: string;
  read: boolean;
}

// ข้อความติดต่อระหว่างผู้ใช้กับทีมผู้ดูแล — ห้องสนทนาระบุด้วย userId เดียว (คนละเรื่องกับ
// ChatMessage ที่เป็นแชทซื้อขายผูกกับสินค้าและคู่สนทนาสองฝั่ง)
export interface SupportMessage {
  id: string;
  userId: string; // เจ้าของห้องสนทนา (ผู้ใช้ที่ติดต่อเข้ามา)
  senderId: string; // คนที่พิมพ์จริง (ผู้ใช้เอง หรือแอดมินคนใดคนหนึ่ง)
  fromAdmin: boolean;
  text: string;
  read: boolean;
  createdAt: string;
}

export interface Review {
  id: string;
  orderId: string;
  fromUserId: string;
  toUserId: string;
  rating: number; // 1-5
  comment: string;
  createdAt: string;
}

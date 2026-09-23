import type { Province } from "@/lib/provinces";

export type Role = "user" | "admin";

// ผู้ใช้ทั่วไปทำหน้าที่ได้ทั้งซื้อและขาย (เหมือน Facebook Marketplace/Mercari)
// มีแค่ admin เท่านั้นที่เป็นบทบาทแยกต่างหากสำหรับเจ้าหน้าที่ดูแลระบบ
export interface User {
  id: string;
  name: string;
  email: string;
  province: Province;
  role: Role;
  avatarUrl?: string;
  isVerified: boolean; // ผ่านการยืนยันตัวตน (KYC demo) แล้วหรือยัง — แอดมินกดยืนยันให้จาก /admin/users
  isSuspended: boolean; // ถูกแอดมินระงับบัญชี — ระงับแล้วล็อกอินไม่ได้ และ getCurrentUser() ตอบ null ทันทีแม้ session ยังไม่หมดอายุ
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

// สถานะออเดอร์ของ flow นัดเจอ — เงินไม่ผ่านระบบ ผู้ซื้อจ่ายเองตอนเจอกัน
export type OrderStatus =
  | "reserved" // จองไว้แล้ว รอนัดเจอกัน (หมดอายุเองถ้าไม่มีใครขยับ)
  | "meetup_scheduled" // นัดวันเวลากันแล้ว (ใช้เต็มรูปแบบใน 1d)
  | "awaiting_buyer_confirmation" // ผู้ขายกดส่งมอบแล้ว รอผู้ซื้อกดยืนยันปิดดีล
  | "completed" // ซื้อขายจบ
  | "cancelled"; // ยกเลิก — ดูสาเหตุที่ cancelReason

/** เหตุผลที่ออเดอร์ถูกยกเลิก (ต้องตรงกับ check constraint ใน migration 020) */
export type OrderCancelReason =
  | "expired"
  | "buyer_cancelled"
  | "seller_cancelled"
  | "late_cancel"
  | "no_show_buyer"
  | "no_show_seller"
  | "item_mismatch"
  | "admin";

export interface Order {
  id: string;
  productId: string;
  buyerId: string;
  sellerId: string;
  status: OrderStatus;
  amount: number;
  paidAt?: string;
  sellerMarkedDeliveredAt?: string; // เริ่มนับ timeout รอบที่ 1 (ผู้ซื้อ)
  buyerConfirmedAt?: string; // เริ่มนับ timeout รอบที่ 2 (ผู้ขายกรอก OTP)
  completedAt?: string;
  disputeReason?: string;
  disputeOpenedAt?: string;
  cancelReason?: OrderCancelReason;
  cancelledBy?: string;
  cancelledAt?: string; //
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
  offerId?: string; // ถ้าข้อความนี้คือการเสนอราคา ผูกกับแถวใน Offer — ดูสถานะล่าสุดจาก offers ไม่ใช่จากข้อความ
}

// ข้อเสนอราคาต่อรองในแชท — เก็บแยกจากเนื้อข้อความเพราะมีสถานะเปลี่ยนได้หลังส่งไปแล้ว (ผู้รับ
// กดยอมรับ/ปฏิเสธทีหลัง) การ "ยอมรับ" ไม่ได้สร้างออเดอร์ทันที แค่ปลดล็อกให้ฝั่งผู้ซื้อกดซื้อใน
// ราคานี้ได้เอง (ดู POST /api/orders ที่รับ offerId)
export type OfferStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface Offer {
  id: string;
  productId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  status: OfferStatus;
  createdAt: string;
  respondedAt?: string;
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

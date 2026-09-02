import type { User, Product, Order, ChatMessage, Review } from "@/types";

// Supabase/Postgres ใช้ชื่อคอลัมน์แบบ snake_case แต่โค้ดแอปทั้งหมด (components, pages)
// ใช้ camelCase ตาม type ใน @/types — ฟังก์ชันพวกนี้แปลง row จาก Supabase ให้เป็น
// รูปร่างเดียวกับตอนใช้ in-memory db เดิม เพื่อไม่ต้องแก้โค้ดฝั่ง UI เลย

export function mapUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    passwordHash: row.password_hash as string,
    province: row.province as User["province"],
    role: row.role as User["role"],
    avatarUrl: (row.avatar_url as string | null) ?? undefined,
    isVerified: row.is_verified as boolean,
    isSuspended: (row.is_suspended as boolean | null) ?? false,
    createdAt: row.created_at as string,
  };
}

export function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    sellerId: row.seller_id as string,
    title: row.title as string,
    description: row.description as string,
    price: Number(row.price),
    category: row.category as string,
    condition: row.condition as Product["condition"],
    province: row.province as Product["province"],
    images: (row.images as string[] | null) ?? [],
    status: row.status as Product["status"],
    createdAt: row.created_at as string,
  };
}

export function mapOrder(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    buyerId: row.buyer_id as string,
    sellerId: row.seller_id as string,
    status: row.status as Order["status"],
    amount: Number(row.amount),
    otpCode: (row.otp_code as string | null) ?? undefined,
    otpExpiresAt: (row.otp_expires_at as string | null) ?? undefined,
    sellerMarkedDeliveredAt: (row.seller_marked_delivered_at as string | null) ?? undefined,
    buyerConfirmedAt: (row.buyer_confirmed_at as string | null) ?? undefined,
    completedAt: (row.completed_at as string | null) ?? undefined,
    disputeReason: (row.dispute_reason as string | null) ?? undefined,
    disputeOpenedAt: (row.dispute_opened_at as string | null) ?? undefined,
    cancelledAt: (row.cancelled_at as string | null) ?? undefined,
    createdAt: row.created_at as string,
  };
}

export function mapReview(row: Record<string, unknown>): Review {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    fromUserId: row.from_user_id as string,
    toUserId: row.to_user_id as string,
    rating: Number(row.rating),
    comment: row.comment as string,
    createdAt: row.created_at as string,
  };
}

export function mapMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    fromUserId: row.from_user_id as string,
    toUserId: row.to_user_id as string,
    text: row.text as string,
    createdAt: row.created_at as string,
    read: row.read as boolean,
  };
}

// ตรวจว่าเป็น UUID ก่อนเอาไปต่อสตริงในตัวกรอง .or() ของ PostgREST — ค่าพวกนี้มาจาก client
// (query param / body) โดยตรง ถ้าไม่เช็คก่อน ผู้ใช้ที่ตั้งใจร้ายอาจสร้างค่าที่หลุดโครงสร้าง
// filter DSL แล้วดึงข้อความแชทของคู่สนทนาคู่อื่นไปได้ (ไม่ใช่ SQL injection ตรงๆ เพราะ
// PostgREST ทำ query แบบ parameterized แต่ยังเป็นช่องโหว่ authorization bypass ได้)
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

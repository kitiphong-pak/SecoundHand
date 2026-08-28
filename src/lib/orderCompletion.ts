import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import { logAction } from "@/lib/auditLog";
import type { Order } from "@/types";

// ใช้ร่วมกันระหว่าง verify-otp และ simulate-timeout — ทั้งสองจุดปิดออเดอร์แบบเดียวกันทุกอย่าง
// (ปั๊ม completed + completedAt แล้วเปลี่ยนสถานะสินค้าเป็น sold) ต่างกันแค่เงื่อนไขที่นำมาถึงจุดนี้
export async function completeOrder(
  orderId: string,
  productId: string,
  actor: { id: string; role: string; name: string },
  via: "otp" | "timeout"
): Promise<Order> {
  const { data: updated, error } = await supabase
    .from("orders")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", orderId)
    .select()
    .single();
  if (error || !updated) throw error ?? new Error("ปิดออเดอร์ไม่สำเร็จ");

  await supabase.from("products").update({ status: "sold" }).eq("id", productId);

  await logAction({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    action: "order.completed",
    targetType: "order",
    targetId: orderId,
    metadata: { via },
  });

  return mapOrder(updated);
}

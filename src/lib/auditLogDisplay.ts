import { supabase } from "@/lib/supabase";
import { AUDIT_ACTION_LABEL, type AuditAction } from "@/lib/auditLog";

interface AuditLogRow {
  id: string;
  actor_name: string;
  action: string;
  target_type: "order" | "product" | "user";
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DisplayLogEntry {
  id: string;
  actorName: string;
  actionLabel: string;
  productTitle: string | null;
  disputeReason: string | null;
  createdAt: string;
}

export interface LogFilters {
  action?: AuditAction;
  actorQuery?: string;
  productQuery?: string;
  dateFrom?: string; // "YYYY-MM-DD"
  dateTo?: string; // "YYYY-MM-DD" — รวมทั้งวันนี้ (ถึงเที่ยงคืนของวันถัดไป)
  page: number; // 1-indexed
  pageSize: number;
}

export interface LogPage {
  entries: DisplayLogEntry[];
  totalCount: number;
}

function startOfDayIso(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

function startOfNextDayIso(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

// ใช้ร่วมกันระหว่างหน้าภาพรวม (ไม่กรอง ดึงไม่กี่รายการล่าสุด) กับหน้ากิจกรรมระบบเต็ม
// (กรอง + แบ่งหน้า) เพื่อไม่ต้อง resolve สินค้าที่เกี่ยวข้องจาก id ซ้ำโค้ดสองที่
export async function fetchDisplayLogs(filters: LogFilters): Promise<LogPage> {
  const { action, actorQuery, productQuery, dateFrom, dateTo, page, pageSize } = filters;
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (action) query = query.eq("action", action);
  if (actorQuery) query = query.ilike("actor_name", `%${actorQuery}%`);
  if (dateFrom) query = query.gte("created_at", startOfDayIso(dateFrom));
  if (dateTo) query = query.lt("created_at", startOfNextDayIso(dateTo));

  if (productQuery) {
    // ไม่ได้เก็บชื่อสินค้าไว้ตรงๆ ใน audit_logs (ต่างจาก actor_name) เพราะจะต้องเพิ่ม query
    // ดึงชื่อสินค้าในทุก endpoint ที่เขียน log แม้แต่จุดที่ปัจจุบันมีแค่ order ไม่มี product
    // อยู่ในมือ — เพิ่ม latency ให้ทุก request ซื้อขายจริงของผู้ใช้ทั้งที่หน้านี้เป็นแค่
    // หน้าแอดมินที่เข้าไม่บ่อย เลยเลือกมา resolve เอาตอนอ่าน (จุดที่ไม่ hot path) แทน
    const { data: matchedProducts } = await supabase
      .from("products")
      .select("id")
      .ilike("title", `%${productQuery}%`);
    const matchedProductIds = (matchedProducts ?? []).map((p) => p.id);

    let matchedOrderIds: string[] = [];
    if (matchedProductIds.length > 0) {
      const { data: matchedOrders } = await supabase
        .from("orders")
        .select("id")
        .in("product_id", matchedProductIds);
      matchedOrderIds = (matchedOrders ?? []).map((o) => o.id);
    }

    if (matchedProductIds.length === 0 && matchedOrderIds.length === 0) {
      // ไม่มีสินค้าไหนตรงคำค้นเลย ต้องได้ผลลัพธ์ว่างเปล่า ไม่ใช่ query แบบไม่กรอง
      return { entries: [], totalCount: 0 };
    }

    const orConditions: string[] = [];
    if (matchedProductIds.length > 0) {
      orConditions.push(`and(target_type.eq.product,target_id.in.(${matchedProductIds.join(",")}))`);
    }
    if (matchedOrderIds.length > 0) {
      orConditions.push(`and(target_type.eq.order,target_id.in.(${matchedOrderIds.join(",")}))`);
    }
    query = query.or(orConditions.join(","));
  }

  const { data: logRows, count } = await query.range(rangeFrom, rangeTo);
  const logs = (logRows ?? []) as AuditLogRow[];
  if (logs.length === 0) return { entries: [], totalCount: count ?? 0 };

  const orderIds = [...new Set(logs.filter((l) => l.target_type === "order").map((l) => l.target_id))];
  const directProductIds = logs.filter((l) => l.target_type === "product").map((l) => l.target_id);

  const { data: orderRows } =
    orderIds.length > 0
      ? await supabase.from("orders").select("id, product_id").in("id", orderIds)
      : { data: [] as { id: string; product_id: string }[] };
  const productIdByOrder = new Map((orderRows ?? []).map((o) => [o.id, o.product_id]));

  const productIds = [...new Set([...directProductIds, ...(orderRows ?? []).map((o) => o.product_id)])];
  const { data: productRows } =
    productIds.length > 0
      ? await supabase.from("products").select("id, title").in("id", productIds)
      : { data: [] as { id: string; title: string }[] };
  const titleByProduct = new Map((productRows ?? []).map((p) => [p.id, p.title]));

  const entries = logs.map((log) => {
    const productId = log.target_type === "order" ? productIdByOrder.get(log.target_id) : log.target_id;
    const productTitle = log.target_type !== "user" && productId ? (titleByProduct.get(productId) ?? null) : null;
    const disputeReason =
      log.action === "order.disputed" && typeof log.metadata?.reason === "string"
        ? (log.metadata.reason as string)
        : null;

    return {
      id: log.id,
      actorName: log.actor_name,
      actionLabel: AUDIT_ACTION_LABEL[log.action as AuditAction] ?? log.action,
      productTitle,
      disputeReason,
      createdAt: log.created_at,
    };
  });

  return { entries, totalCount: count ?? 0 };
}

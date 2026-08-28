import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import { Header } from "@/components/Header";
import { OrderList, type OrderRow } from "@/components/OrderList";
import { getOrderActivityAt } from "@/lib/orderActivity";
import { getOrderUrgency, URGENCY_ORDER } from "@/lib/orderUrgency";

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");

  const { data: orderRows } = await supabase
    .from("orders")
    .select("*")
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);
  const orders = (orderRows ?? []).map(mapOrder);

  const productIds = [...new Set(orders.map((o) => o.productId))];
  const titleByProduct = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: productRows } = await supabase
      .from("products")
      .select("id, title")
      .in("id", productIds);
    for (const p of productRows ?? []) titleByProduct.set(p.id, p.title);
  }

  // เช็คว่าออเดอร์ที่ปิดการขายแล้วอันไหนที่เรารีวิวไปแล้วบ้าง ใช้จัดลำดับความสำคัญ
  // (ปิดแล้วแต่ยังไม่รีวิว ต่างจากปิดแล้วรีวิวเสร็จเรียบร้อย)
  const completedOrderIds = orders.filter((o) => o.status === "completed").map((o) => o.id);
  const reviewedOrderIds = new Set<string>();
  if (completedOrderIds.length > 0) {
    const { data: reviewRows } = await supabase
      .from("reviews")
      .select("order_id")
      .eq("from_user_id", user.id)
      .in("order_id", completedOrderIds);
    for (const r of reviewRows ?? []) reviewedOrderIds.add(r.order_id);
  }

  const orderRowsForList: OrderRow[] = orders
    .map((o) => {
      const isBuyer = o.buyerId === user.id;
      return {
        id: o.id,
        productTitle: titleByProduct.get(o.productId) ?? "สินค้าไม่พบ",
        isBuyer,
        amount: o.amount,
        status: o.status,
        lastActivityAt: getOrderActivityAt(o),
        urgency: getOrderUrgency(o.status, isBuyer ? "buyer" : "seller", reviewedOrderIds.has(o.id)),
      };
    })
    // เรียงตามความเร่งด่วนก่อน (ต้องดำเนินการ > รอรีวิว > รอดำเนินการ > เสร็จสิ้น) แล้วค่อย
    // เรียงตามเวลาล่าสุดในกลุ่มเดียวกัน — กันรายการที่ต้องรีบทำไปปนกับรายการที่ปิดไปแล้ว
    .sort((a, b) => {
      const tierDiff = URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency);
      if (tierDiff !== 0) return tierDiff;
      return b.lastActivityAt.localeCompare(a.lastActivityAt);
    });

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">
        <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
          ออเดอร์ของฉัน
        </h1>

        {orderRowsForList.length === 0 ? (
          <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
            ยังไม่มีออเดอร์
          </div>
        ) : (
          <OrderList orders={orderRowsForList} />
        )}
      </main>
    </div>
  );
}

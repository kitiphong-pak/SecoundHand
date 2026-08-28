import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder, mapReview } from "@/lib/mappers";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/Badge";
import { OrderActions } from "@/components/OrderActions";
import { ReviewForm } from "@/components/ReviewForm";
import { ORDER_STATUS_LABEL } from "@/lib/orderStatus";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");

  const { id } = await params;
  const { data: orderRow } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!orderRow) notFound();
  const order = mapOrder(orderRow);
  if (order.buyerId !== user.id && order.sellerId !== user.id) notFound();

  const role: "buyer" | "seller" = order.buyerId === user.id ? "buyer" : "seller";

  const [{ data: product }, { data: buyer }, { data: seller }] = await Promise.all([
    supabase.from("products").select("title").eq("id", order.productId).maybeSingle(),
    supabase.from("users").select("name").eq("id", order.buyerId).maybeSingle(),
    supabase.from("users").select("name").eq("id", order.sellerId).maybeSingle(),
  ]);

  const badge = ORDER_STATUS_LABEL[order.status];

  // ห้ามส่งรหัส OTP จริงไปให้ฝั่งผู้ขายเด็ดขาด (ต้องรับจากผู้ซื้อเท่านั้นถึงจะกรอกได้)
  // ต่อให้ UI ไม่แสดง ถ้าไม่ตัดออกตรงนี้ค่าจะรั่วไปกับ RSC payload ที่ส่งลง client อยู่ดี
  const orderForClient = role === "seller" ? { ...order, otpCode: undefined } : order;

  // รีวิวได้เฉพาะออเดอร์ที่ปิดการซื้อขายแล้ว — เช็คว่าฉันรีวิวอีกฝ่ายไปหรือยัง
  // และอีกฝ่ายรีวิวฉันไว้หรือเปล่า (โชว์ให้ดูได้ด้วยถ้ามี)
  let myReview = null;
  let theirReview = null;
  if (order.status === "completed") {
    const { data: reviewRows } = await supabase
      .from("reviews")
      .select("*")
      .eq("order_id", order.id);
    const reviews = (reviewRows ?? []).map(mapReview);
    myReview = reviews.find((r) => r.fromUserId === user.id) ?? null;
    theirReview = reviews.find((r) => r.fromUserId !== user.id) ?? null;
  }
  const otherPartyName = role === "buyer" ? seller?.name : buyer?.name;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-6">
        <Link href="/orders" className="text-sm text-neutral-500 hover:text-primary-600">
          ← ออเดอร์ทั้งหมด
        </Link>

        <div className="mt-3 rounded-[var(--radius-lg)] border border-neutral-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-neutral-400">ออเดอร์ #{order.id}</p>
              <h1 className="mt-1 font-[var(--font-display)] text-lg font-semibold text-neutral-900">
                {product?.title ?? "สินค้าไม่พบ"}
              </h1>
            </div>
            {badge && <Badge status={badge.status}>{badge.label}</Badge>}
          </div>

          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-neutral-500">ยอดชำระ</span>
            <span className="font-[var(--font-display)] font-medium text-primary-600">
              ฿{order.amount.toLocaleString("th-TH")}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-neutral-500">{role === "buyer" ? "ผู้ขาย" : "ผู้ซื้อ"}</span>
            <span className="text-neutral-900">
              {role === "buyer" ? seller?.name : buyer?.name}
            </span>
          </div>

          {order.status === "disputed" && order.disputeReason && (
            <div className="mt-4 rounded-[var(--radius-md)] bg-error-50 p-3 text-sm text-error-500">
              <p className="font-medium">เหตุผลข้อพิพาท</p>
              <p className="mt-1">{order.disputeReason}</p>
            </div>
          )}

          <div className="mt-5 border-t border-neutral-100 pt-5">
            <OrderActions order={orderForClient} role={role} />
          </div>

          {order.status === "completed" && (
            <div className="mt-5 flex flex-col gap-3 border-t border-neutral-100 pt-5">
              {myReview ? (
                <div className="rounded-[var(--radius-md)] bg-neutral-50 p-3 text-sm">
                  <p className="text-neutral-500">
                    รีวิวของคุณ: {"⭐".repeat(myReview.rating)}
                  </p>
                  <p className="mt-1 text-neutral-700">{myReview.comment}</p>
                </div>
              ) : (
                <ReviewForm orderId={order.id} targetLabel={otherPartyName ?? "อีกฝ่าย"} />
              )}

              {theirReview && (
                <div className="rounded-[var(--radius-md)] bg-neutral-50 p-3 text-sm">
                  <p className="text-neutral-500">
                    {otherPartyName ?? "อีกฝ่าย"}รีวิวคุณ: {"⭐".repeat(theirReview.rating)}
                  </p>
                  <p className="mt-1 text-neutral-700">{theirReview.comment}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

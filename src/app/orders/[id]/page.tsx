import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/Badge";
import { OrderActions } from "@/components/OrderActions";
import { ORDER_STATUS_LABEL } from "@/lib/orderStatus";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const db = getDb();
  const order = db.orders.find((o) => o.id === id);
  if (!order) notFound();
  if (order.buyerId !== user.id && order.sellerId !== user.id) notFound();

  const product = db.products.find((p) => p.id === order.productId);
  const buyer = db.users.find((u) => u.id === order.buyerId);
  const seller = db.users.find((u) => u.id === order.sellerId);
  const role: "buyer" | "seller" = order.buyerId === user.id ? "buyer" : "seller";
  const badge = ORDER_STATUS_LABEL[order.status];

  // ห้ามส่งรหัส OTP จริงไปให้ฝั่งผู้ขายเด็ดขาด (ต้องรับจากผู้ซื้อเท่านั้นถึงจะกรอกได้)
  // ต่อให้ UI ไม่แสดง ถ้าไม่ตัดออกตรงนี้ค่าจะรั่วไปกับ RSC payload ที่ส่งลง client อยู่ดี
  const orderForClient = role === "seller" ? { ...order, otpCode: undefined } : order;

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
        </div>
      </main>
    </div>
  );
}

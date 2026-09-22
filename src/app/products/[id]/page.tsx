import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapProduct } from "@/lib/mappers";
import { getUserRating } from "@/lib/rating";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/Badge";
import { BuyButton } from "@/components/BuyButton";
import { ChatButton } from "@/components/ChatButton";
import { ProductGallery } from "@/components/ProductGallery";
import { LocationPinIcon } from "@/components/ui/LocationPinIcon";
import { CONDITION_LABEL } from "@/lib/categories";
import { orderStatusBadge } from "@/lib/orderStatus";
import { loginHref } from "@/lib/safeRedirect";
import type { OrderStatus } from "@/types";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // คนที่ยังไม่ได้เข้าสู่ระบบดูหน้านี้ได้ — นี่คือหน้าที่ผู้ขายเอาลิงก์ไปแปะในกลุ่ม Facebook ถ้าคนกด
  // เข้ามาแล้วเจอหน้าล็อกอินก่อนเห็นของ ส่วนใหญ่ปิดหน้าไปเลย การล็อกอินค่อยบังคับตอนจะแชท/ซื้อ
  const user = await getCurrentUser();
  if (user?.role === "admin") redirect("/admin");

  const { id } = await params;
  const { data: productRow } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (!productRow) notFound();
  const product = mapProduct(productRow);
  const isOwner = user?.id === product.sellerId;

  // สินค้าที่ผู้ขายถอนออกแล้วต้องไม่โผล่ให้คนอื่นเห็น — ตอนที่หน้านี้เปิดให้แค่สมาชิกก็ควรเป็นแบบนี้
  // อยู่แล้ว แต่พอเปิดสาธารณะ ลิงก์เก่าที่ค้างอยู่ในกลุ่ม Facebook จะพาคนนอกมาเจอของที่ถอนไปแล้ว
  if (product.status === "removed" && !isOwner) notFound();

  // เลือกเฉพาะคอลัมน์ที่ต้องใช้แสดงผล ไม่ดึง password_hash ขึ้นมาไว้ในหน่วยความจำเลยตั้งแต่ต้น
  const { data: seller } = await supabase
    .from("users")
    .select("name, is_verified")
    .eq("id", product.sellerId)
    .maybeSingle();

  const rating = await getUserRating(product.sellerId);

  // สถานะ "reserved" อยู่ได้หลายจุดใน order flow — ต้องดูสถานะออเดอร์จริง ไม่งั้นจะค้าง
  // โชว์ "รอชำระเงิน" ทั้งที่จ่ายเงิน/ส่งของไปแล้ว (บั๊กเดียวกับที่เจอในหน้าสินค้าของฉัน)
  let activeOrderBadge = null;
  let activeOrderHref: string | null = null;
  let agreedAmount: number | null = null;
  if (product.status === "reserved") {
    const { data: orderRow } = await supabase
      .from("orders")
      .select("id, status, buyer_id, seller_id, amount")
      .eq("product_id", product.id)
      .neq("status", "completed")
      .maybeSingle();

    // หน้านี้ใครเปิดก็ได้ ไม่ใช่แค่คู่ซื้อขาย — คนนอกเห็นป้ายกลางๆ ส่วนคู่ซื้อขายเห็นป้ายที่
    // บอกว่าตัวเองต้องทำอะไร และต้องมีทางไปหน้าออเดอร์ด้วย ไม่งั้นป้ายบอกให้ลงมือแต่กดไปไหนไม่ได้
    const party = !user
      ? undefined
      : orderRow?.buyer_id === user.id
        ? "buyer"
        : orderRow?.seller_id === user.id
          ? "seller"
          : undefined;
    activeOrderBadge = orderStatusBadge((orderRow?.status as OrderStatus) ?? "pending_payment", party);
    if (orderRow && party) {
      activeOrderHref = `/orders/${orderRow.id}`;

      // ราคาที่ลงขายกับยอดที่ตกลงกันจริงเป็นคนละตัว ถ้าปิดดีลผ่านการต่อรอง (amount มาจากข้อเสนอ
      // ที่ตอบรับ ไม่ใช่ price) — หน้านี้โชว์แต่ป้ายราคาเดิม คู่ซื้อขายเลยเห็นเลขไม่ตรงกับในออเดอร์
      //
      // โชว์เฉพาะคู่ซื้อขายเท่านั้น เพราะหน้านี้คนนอกก็เปิดดูได้ ยอดที่ต่อรองกันเป็นเรื่องของสองคนนี้
      // ไม่ใช่ข้อมูลที่ควรติดไว้หน้าร้านให้คนอื่นเห็นว่ากดราคาลงมาได้เท่าไหร่
      const amount = Number(orderRow.amount);
      if (Number.isFinite(amount) && amount !== product.price) agreedAmount = amount;
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">
        <ProductGallery images={product.images} title={product.title} />

        <div className="mt-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
              {product.title}
            </h1>
            {product.status === "sold" && <Badge status="neutral">ขายแล้ว</Badge>}
            {activeOrderBadge && (
              <Badge status={activeOrderBadge.status}>{activeOrderBadge.label}</Badge>
            )}
          </div>

          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <p className="font-[var(--font-display)] text-2xl font-semibold text-primary-600">
              ฿{(agreedAmount ?? product.price).toLocaleString("th-TH")}
            </p>
            {agreedAmount !== null && (
              <>
                <p className="text-sm text-neutral-400 line-through">
                  ฿{product.price.toLocaleString("th-TH")}
                </p>
                <span className="text-xs text-neutral-500">ราคาที่ตกลงกัน</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1">
              <LocationPinIcon /> {product.province}
            </span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1">
              {CONDITION_LABEL[product.condition]}
            </span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1">{product.category}</span>
          </div>

          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-700">
            {product.description}
          </p>

          {seller && (
            <Link
              href={`/sellers/${product.sellerId}`}
              className="mt-4 flex items-center justify-between rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4 hover:shadow-sm"
            >
              <div>
                <p className="text-sm font-medium text-neutral-900">{seller.name}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {rating.avg !== null ? `⭐ ${rating.avg.toFixed(1)} (${rating.count} รีวิว)` : "ยังไม่มีรีวิว"}
                </p>
                <p className="mt-1.5">
                  {seller.is_verified ? (
                    <Badge status="success">ยืนยันตัวตนแล้ว ✅</Badge>
                  ) : (
                    <Badge status="neutral">ยังไม่ยืนยันตัวตน</Badge>
                  )}
                </p>
              </div>
              <span className="text-xs text-neutral-400">ดูโปรไฟล์ →</span>
            </Link>
          )}

          <div className="mt-4 flex gap-3">
            {!user ? (
              // ปุ่มหน้าตาเหมือนของสมาชิกทุกอย่าง แค่พาไปล็อกอินก่อนแล้วส่งกลับมาที่ที่ตั้งใจจะไป —
              // แชทพากลับไปห้องแชทเลย ส่วนซื้อพากลับมาหน้านี้ ให้เห็นของอีกรอบก่อนกดยืนยันซื้อจริง
              <>
                <Link
                  href={loginHref(`/chat/${product.id}`)}
                  className="flex-1 rounded-[var(--radius-md)] border border-neutral-200 bg-neutral-0 px-5 py-3 text-center text-base font-medium text-primary-600 transition-colors hover:bg-neutral-50"
                >
                  แชทกับผู้ขาย
                </Link>
                {product.status === "listed" && (
                  <Link
                    href={loginHref(`/products/${product.id}`)}
                    className="flex-1 rounded-[var(--radius-md)] bg-primary-500 px-5 py-3 text-center text-base font-medium text-white transition-colors hover:bg-primary-600"
                  >
                    เข้าสู่ระบบเพื่อสั่งซื้อ
                  </Link>
                )}
              </>
            ) : (
              <>
                {!isOwner && <ChatButton productId={product.id} sellerId={product.sellerId} />}
                {activeOrderHref ? (
                  <Link
                    href={activeOrderHref}
                    className="flex-1 rounded-[var(--radius-md)] bg-primary-500 px-5 py-3 text-center text-base font-medium text-white transition-colors hover:bg-primary-600"
                  >
                    ไปที่หน้าออเดอร์ →
                  </Link>
                ) : (
                  <BuyButton
                    productId={product.id}
                    disabled={product.status !== "listed" || isOwner}
                    isOwner={isOwner}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

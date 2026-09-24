import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { orderStatusBadge } from "@/lib/orderStatus";
import { Header } from "@/components/Header";
import { ChatThread } from "@/components/ChatThread";
import { ChatInbox } from "@/components/ChatInbox";
import { Badge } from "@/components/ui/Badge";
import type { OrderStatus } from "@/types";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ with?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");

  const { productId } = await params;
  const { with: withParam } = await searchParams;

  const { data: product } = await supabase
    .from("products")
    .select("id, title, seller_id, price, status, images")
    .eq("id", productId)
    .maybeSingle();
  if (!product) notFound();

  // ถ้าเป็นผู้ขาย ต้องระบุว่าคุยกับผู้ซื้อคนไหน (ผ่าน query) ไม่งั้นหาจากคนล่าสุดที่เคยทักมา
  let withUserId = withParam;
  if (!withUserId) {
    if (product.seller_id !== user.id) {
      withUserId = product.seller_id;
    } else {
      const { data: lastMsg } = await supabase
        .from("chat_messages")
        .select("from_user_id")
        .eq("product_id", productId)
        .eq("to_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      withUserId = lastMsg?.from_user_id;
    }
  }

  if (!withUserId) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
        <Header user={user} />
        <main className="mx-auto w-full max-w-lg flex-1 px-5 py-10 text-center text-sm text-neutral-500">
          ยังไม่มีการสนทนาสำหรับสินค้านี้
        </main>
      </div>
    );
  }

  // เลือกเฉพาะ id/name ที่ ChatThread (client component) ต้องใช้ — ไม่ดึงอีเมลหรือข้อมูลอื่นติดไป
  // ขึ้นมาไว้ในหน่วยความจำเลยตั้งแต่ต้น กัน hash หลุดไปกับ RSC payload ถ้ามีคนแก้โค้ดพลาดอนาคต
  const { data: otherUser } = await supabase
    .from("users")
    .select("id, name, avatar_url")
    .eq("id", withUserId)
    .maybeSingle();
  if (!otherUser) notFound();

  // ออเดอร์ที่ยังเดินอยู่ของคู่นี้ในสินค้านี้ (ถ้ามี) — ใช้โชว์ในแผงขวา ให้เห็นสถานะโดยไม่ต้องออกจากแชท
  const { data: orderRow } = await supabase
    .from("orders")
    .select("id, status, amount")
    .eq("product_id", productId)
    .in("buyer_id", [user.id, withUserId])
    .in("seller_id", [user.id, withUserId])
    .not("status", "in", "(cancelled)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const role: "buyer" | "seller" = product.seller_id === user.id ? "seller" : "buyer";
  const orderBadge = orderRow ? orderStatusBadge(orderRow.status as OrderStatus, role) : null;
  const productImage = (product.images as string[] | null)?.[0] ?? null;

  return (
    // ให้แชทสูงเต็มพื้นที่ที่เหลือของจอ แทนกล่องความสูงตายตัวที่ทำให้มีสกรอลล์ซ้อนสกรอลล์สองชั้น
    // บนมือถือต้องหักความสูงแถบเมนูล่างแบบ fixed ออกก่อน (body มี pb-14 รองรับมันอยู่ — ดู layout.tsx)
    // ไม่งั้นความสูงรวมจะเกินจอไป 56px แล้วทั้งหน้าจะเลื่อนได้ทั้งที่ตั้งใจให้เลื่อนเฉพาะในแชท
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col bg-neutral-50 sm:h-[100dvh]">
      <Header user={user} />
      {/* เดสก์ท็อปวางสามคอลัมน์แบบแอปแชท: รายการห้อง | ห้องที่เปิดอยู่ | รายละเอียดสินค้า/ออเดอร์
          จอเล็กเหลือคอลัมน์กลางคอลัมน์เดียว ส่วนรายการห้องอยู่ที่หน้า /chat เหมือนเดิม */}
      <main className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 gap-4 px-4 pt-4 pb-4">
        <aside className="hidden w-72 min-h-0 flex-none flex-col overflow-hidden rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 md:flex lg:w-80">
          <p className="border-b border-neutral-100 px-4 py-3 font-[var(--font-display)] text-sm font-semibold text-neutral-900">
            แชท
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ChatInbox variant="sidebar" activeProductId={productId} activeUserId={withUserId} />
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="mb-2 md:hidden">
            <p className="text-xs text-neutral-400">แชทเกี่ยวกับ</p>
            <p className="text-sm font-medium text-neutral-900">{product.title}</p>
          </div>
          <ChatThread
            productId={productId}
            currentUserId={user.id}
            otherUser={{
              id: otherUser.id,
              name: otherUser.name,
              avatarUrl: (otherUser.avatar_url as string | null) ?? undefined,
            }}
            productPrice={Number(product.price)}
            isSeller={product.seller_id === user.id}
            canNegotiate={product.status === "listed"}
          />
        </section>

        {/* แผงขวา: ของที่ต้องเหลือบดูระหว่างคุย โดยไม่ต้องออกจากแชทไปเปิดหน้าอื่น */}
        <aside className="hidden w-72 min-h-0 flex-none flex-col gap-3 overflow-y-auto rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4 xl:flex">
          <p className="text-xs text-neutral-400">คุยกันเรื่องสินค้า</p>
          {productImage ? (
            <Image
              src={productImage}
              alt={product.title}
              width={240}
              height={160}
              className="h-32 w-full rounded-[var(--radius-md)] object-cover"
            />
          ) : (
            <div className="flex h-32 w-full items-center justify-center rounded-[var(--radius-md)] bg-neutral-100 text-xs text-neutral-400">
              ไม่มีรูปภาพ
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-neutral-900">{product.title}</p>
            <p className="mt-0.5 font-[var(--font-display)] text-lg font-semibold text-primary-600">
              ฿{Number(product.price).toLocaleString("th-TH")}
            </p>
          </div>

          {orderBadge && orderRow && (
            <div className="rounded-[var(--radius-md)] border border-neutral-200 p-3">
              <p className="text-xs text-neutral-400">ออเดอร์</p>
              <div className="mt-1">
                <Badge status={orderBadge.status}>{orderBadge.label}</Badge>
              </div>
              <p className="mt-2 text-sm text-neutral-700">
                ยอด ฿{Number(orderRow.amount).toLocaleString("th-TH")}
              </p>
              <Link
                href={`/orders/${orderRow.id}`}
                className="mt-2 inline-block text-sm font-medium text-primary-600 hover:underline"
              >
                เปิดหน้าออเดอร์ →
              </Link>
            </div>
          )}

          <Link
            href={`/products/${productId}`}
            className="text-sm font-medium text-primary-600 hover:underline"
          >
            ดูหน้าสินค้า →
          </Link>
        </aside>
      </main>
    </div>
  );
}

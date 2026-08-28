import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Header } from "@/components/Header";
import { ChatThread } from "@/components/ChatThread";

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
    .select("id, title, seller_id")
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

  // เลือกเฉพาะ id/name ที่ ChatThread (client component) ต้องใช้ — ไม่ดึง password_hash
  // ขึ้นมาไว้ในหน่วยความจำเลยตั้งแต่ต้น กัน hash หลุดไปกับ RSC payload ถ้ามีคนแก้โค้ดพลาดอนาคต
  const { data: otherUser } = await supabase
    .from("users")
    .select("id, name")
    .eq("id", withUserId)
    .maybeSingle();
  if (!otherUser) notFound();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-6">
        <div className="mb-3">
          <p className="text-xs text-neutral-400">แชทเกี่ยวกับ</p>
          <p className="text-sm font-medium text-neutral-900">{product.title}</p>
        </div>
        <ChatThread productId={productId} currentUserId={user.id} otherUser={otherUser} />
      </main>
    </div>
  );
}

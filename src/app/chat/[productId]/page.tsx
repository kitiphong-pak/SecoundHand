import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
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

  const { productId } = await params;
  const { with: withParam } = await searchParams;

  const db = getDb();
  const product = db.products.find((p) => p.id === productId);
  if (!product) notFound();

  // ถ้าเป็นผู้ขาย ต้องระบุว่าคุยกับผู้ซื้อคนไหน (ผ่าน query) ไม่งั้นหาจากคนล่าสุดที่เคยทักมา
  let withUserId = withParam;
  if (!withUserId) {
    if (product.sellerId !== user.id) {
      withUserId = product.sellerId;
    } else {
      const lastMsg = db.messages
        .filter((m) => m.productId === productId && m.toUserId === user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      withUserId = lastMsg?.fromUserId;
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

  const otherUser = db.users.find((u) => u.id === withUserId);
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

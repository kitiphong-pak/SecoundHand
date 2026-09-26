import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Header } from "@/components/Header";
import { SupportThread } from "@/components/SupportThread";

export default async function SupportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // แอดมินตอบผู้ใช้จากหน้า /admin/messages ไม่ต้องมีห้องติดต่อของตัวเอง
  if (user.role === "admin") redirect("/admin/messages");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-6">
        <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
          ติดต่อผู้ดูแลระบบ
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          มีปัญหาการใช้งาน แจ้งปัญหาการซื้อขาย หรือสอบถามเรื่องบัญชี ส่งข้อความไว้ได้เลย
          ทีมผู้ดูแลจะตอบกลับที่หน้านี้
        </p>

        <div className="mt-5 flex flex-1 flex-col">
          <SupportThread
            endpoint="/api/support"
            mineIs="user"
            emptyText="ยังไม่มีข้อความ — เริ่มพิมพ์เพื่อติดต่อทีมผู้ดูแลได้เลย"
          />
        </div>
      </main>
    </div>
  );
}

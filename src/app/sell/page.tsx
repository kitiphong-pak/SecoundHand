import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Header } from "@/components/Header";
import { SellForm } from "@/components/SellForm";

export default async function SellPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-6">
        <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
          ลงขายสินค้า
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          สินค้าจะแสดงให้เห็นเฉพาะผู้ซื้อในจังหวัด{user.province}
        </p>
        <SellForm />
      </main>
    </div>
  );
}

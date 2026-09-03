import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Header } from "@/components/Header";
import { ChatInbox } from "@/components/ChatInbox";

export default async function ChatInboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">
        <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">แชท</h1>
        <ChatInbox />
      </main>
    </div>
  );
}

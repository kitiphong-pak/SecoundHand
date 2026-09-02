import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { SupportThread } from "@/components/SupportThread";
import { UUID_RE } from "@/lib/mappers";

// ผลลัพธ์ของ admin_support_threads() — ดู supabase/migrations/013_support_messages.sql
interface SupportThreadRow {
  thread_user_id: string;
  thread_user_name: string;
  thread_user_email: string;
  last_text: string;
  last_at: string;
  unread_for_admin: number;
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hours / 24)} วันที่แล้ว`;
}

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const params = await searchParams;
  const selectedUserId = params.user && UUID_RE.test(params.user) ? params.user : undefined;

  const { data } = (await supabase.rpc("admin_support_threads")) as unknown as {
    data: SupportThreadRow[] | null;
  };
  const threads = data ?? [];
  const selected = threads.find((t) => t.thread_user_id === selectedUserId);

  return (
    <div>
      <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">ข้อความ</h1>
      <p className="mt-1 text-sm text-neutral-500">
        ข้อความที่ผู้ใช้ติดต่อเข้ามาหาทีมผู้ดูแล ({threads.length.toLocaleString("th-TH")} ห้องสนทนา)
      </p>

      {threads.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
          ยังไม่มีผู้ใช้ติดต่อเข้ามา
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <div className="flex flex-col gap-2">
            {threads.map((t) => {
              const active = t.thread_user_id === selectedUserId;
              return (
                <Link
                  key={t.thread_user_id}
                  href={`/admin/messages?user=${t.thread_user_id}`}
                  className={[
                    "rounded-[var(--radius-lg)] border p-3 transition-colors",
                    active
                      ? "border-primary-500 bg-primary-50"
                      : "border-neutral-200 bg-neutral-0 hover:border-neutral-300",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-700">
                        {t.thread_user_name?.trim().charAt(0).toUpperCase() ?? "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-900">{t.thread_user_name}</p>
                        <p className="truncate text-xs text-neutral-500">{t.thread_user_email}</p>
                      </div>
                    </div>
                    {Number(t.unread_for_admin) > 0 && (
                      <span className="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-medium text-white">
                        {Number(t.unread_for_admin) > 9 ? "9+" : t.unread_for_admin}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-xs text-neutral-500">{t.last_text}</p>
                  <p className="mt-0.5 text-[10px] text-neutral-400">{timeAgo(t.last_at)}</p>
                </Link>
              );
            })}
          </div>

          <div className="flex flex-col">
            {selected ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{selected.thread_user_name}</p>
                    <p className="text-xs text-neutral-500">{selected.thread_user_email}</p>
                  </div>
                  <Link
                    href={`/admin/users?q=${encodeURIComponent(selected.thread_user_email)}`}
                    className="text-xs text-primary-600 hover:underline"
                  >
                    ดูข้อมูลผู้ใช้ →
                  </Link>
                </div>
                <SupportThread
                  endpoint={`/api/admin/support/${selected.thread_user_id}`}
                  mineIs="admin"
                  placeholder="พิมพ์ข้อความตอบกลับ..."
                  emptyText="ยังไม่มีข้อความในห้องนี้"
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
                เลือกห้องสนทนาทางซ้ายเพื่อดูและตอบข้อความ
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

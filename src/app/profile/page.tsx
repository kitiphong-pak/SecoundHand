import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Header } from "@/components/Header";
import { AdminShell } from "@/components/AdminShell";
import { ProfileForm } from "@/components/ProfileForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

// หน้าเดียวใช้ได้ทั้งผู้ใช้ทั่วไปและแอดมิน (ต่างจากหน้าอื่นที่ต้องเลือกเช็คสิทธิ์แบบใดแบบหนึ่ง)
// เพราะทั้งสองบทบาทต้องแก้ชื่อ/รูป/รหัสผ่านของตัวเองได้เหมือนกัน แค่สลับ shell รอบนอกตาม role
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const content = (
    <>
      <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
        โปรไฟล์ของฉัน
      </h1>

      <ProfileForm user={user} />

      <div className="mt-8 border-t border-neutral-200 pt-6">
        <h2 className="font-[var(--font-display)] text-lg font-semibold text-neutral-900">
          เปลี่ยนรหัสผ่าน
        </h2>
        <ChangePasswordForm />
      </div>
    </>
  );

  if (user.role === "admin") {
    return (
      <AdminShell user={user}>
        <div className="max-w-xl">{content}</div>
      </AdminShell>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-6">{content}</main>
    </div>
  );
}

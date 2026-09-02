import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Header } from "@/components/Header";
import { AdminHeader } from "@/components/AdminHeader";
import { ProfileForm } from "@/components/ProfileForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

// หน้าเดียวใช้ได้ทั้งผู้ใช้ทั่วไปและแอดมิน (ต่างจากหน้าอื่นที่ต้องเลือกเช็คสิทธิ์แบบใดแบบหนึ่ง)
// เพราะทั้งสองบทบาทต้องแก้ชื่อ/รูป/รหัสผ่านของตัวเองได้เหมือนกัน แค่สลับ Header ตาม role
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      {user.role === "admin" ? <AdminHeader user={user} /> : <Header user={user} />}
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-6">
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
      </main>
    </div>
  );
}

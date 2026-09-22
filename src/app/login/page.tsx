import { LoginForm } from "./LoginForm";
import { safeNextPath } from "@/lib/safeRedirect";

// อ่าน ?next= ฝั่งเซิร์ฟเวอร์แล้วส่งเข้าฟอร์ม แทนการใช้ useSearchParams ในฟอร์มเอง — ได้ผ่าน
// safeNextPath ที่จุดเดียวก่อนถึงมือ client และไม่ต้องห่อ Suspense ให้หน้าล็อกอิน
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={safeNextPath(next)} />;
}

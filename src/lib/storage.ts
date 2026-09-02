import { randomUUID } from "crypto";
import { supabase } from "@/lib/supabase";

export type ImageKind = "product" | "avatar";

const BUCKET: Record<ImageKind, string> = {
  product: "product-images",
  avatar: "avatars",
};

function publicUrlPrefix(kind: ImageKind): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET[kind]}/`;
}

// เก็บรูปใน Supabase Storage (bucket public) แทน disk ของ server เอง เพราะ serverless
// hosting (เช่น Vercel) มี filesystem แบบ ephemeral เขียนไฟล์ไว้แล้วหายเมื่อ instance ถูก recycle
// อินเทอร์เฟซนี้ตั้งใจแยกออกมาต่างหาก เพื่อให้สลับผู้ให้บริการ cloud storage อื่นได้ในอนาคต
// โดยแก้แค่ implementation ในไฟล์นี้ไฟล์เดียว ไม่ต้องแตะ API route หรือ component ที่เรียกใช้เลย
// แยก bucket ตาม kind (รูปสินค้า vs รูปโปรไฟล์) เพื่อจัดการ/ทำความสะอาดแยกกันได้ในอนาคต
export async function saveImage(dataUrl: string, kind: ImageKind = "product"): Promise<string> {
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!match) throw new Error("รูปแบบไฟล์ภาพไม่ถูกต้อง");
  const [, ext, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  const filename = `${randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;

  const { error } = await supabase.storage.from(BUCKET[kind]).upload(filename, buffer, {
    contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
  });
  if (error) throw new Error("อัปโหลดรูปภาพไม่สำเร็จ");

  return `${publicUrlPrefix(kind)}${filename}`;
}

// เช็คตอนสร้างประกาศ/บันทึกโปรไฟล์ว่า URL รูปที่ client ส่งมาเป็น URL ที่อัปโหลดผ่าน /api/upload
// จริง (อยู่ใน bucket ที่ถูกต้องของเราเอง) ไม่ใช่ URL ภายนอกที่ client ยัดเข้ามาเอง
export function isOwnedImageUrl(url: string, kind: ImageKind = "product"): boolean {
  return url.startsWith(publicUrlPrefix(kind));
}

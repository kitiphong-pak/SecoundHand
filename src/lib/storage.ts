import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

// อินเทอร์เฟซนี้ตั้งใจแยกออกมาต่างหาก เพื่อให้ในอนาคตสลับไปใช้ cloud storage จริง
// (S3, Cloudinary, ฯลฯ) ได้โดยแก้แค่ implementation ในไฟล์นี้ไฟล์เดียว
// ไม่ต้องแตะโค้ดฝั่ง API route หรือ component ที่เรียกใช้เลย
export async function saveImage(dataUrl: string): Promise<string> {
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!match) throw new Error("รูปแบบไฟล์ภาพไม่ถูกต้อง");
  const [, ext, base64] = match;
  const buffer = Buffer.from(base64, "base64");

  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return `/uploads/${filename}`;
}

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Header } from "@/components/Header";

export const metadata = {
  title: "นโยบายความเป็นส่วนตัว | songtor",
  description: "songtor เก็บข้อมูลอะไร ใช้ทำอะไร เก็บนานแค่ไหน และผู้ใช้มีสิทธิอะไรบ้าง",
};

// หน้านี้เปิดอ่านได้โดยไม่ต้องล็อกอิน — คนที่ยังไม่สมัครต้องอ่านได้ก่อนตัดสินใจให้ข้อมูล
//
// เนื้อหาร่างตามโครงที่ PDPA กำหนด (เก็บอะไร ใช้ทำอะไร ส่งให้ใคร เก็บนานเท่าไร สิทธิของเจ้าของข้อมูล
// ติดต่อใคร) แต่ยังไม่ผ่านการตรวจจากผู้รู้กฎหมาย — ดู docs/backlog.md ก่อนเปิดใช้กับผู้ใช้จริง
export default async function PrivacyPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
        <h1 className="font-[var(--font-display)] text-2xl font-semibold text-neutral-900">
          นโยบายความเป็นส่วนตัว
        </h1>
        <p className="mt-1 text-sm text-neutral-500">ปรับปรุงล่าสุด 24 กันยายน 2569</p>

        <div className="mt-6 flex flex-col gap-6 text-sm leading-relaxed text-neutral-700">
          <section>
            <h2 className="text-base font-semibold text-neutral-900">เราคือใคร</h2>
            <p className="mt-2">
              songtor (โครงการนักศึกษา) เป็นเว็บประกาศซื้อขายสินค้ามือสองแบบนัดเจอกันเอง
              เราเป็นผู้ควบคุมข้อมูลส่วนบุคคลของผู้ใช้บริการนี้
              ติดต่อเรื่องข้อมูลส่วนบุคคลได้ที่{" "}
              <Link href="/support" className="font-medium text-primary-600 hover:underline">
                หน้าติดต่อผู้ดูแล
              </Link>{" "}
              ในแอป
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900">ข้อมูลที่เราเก็บ</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>ข้อมูลบัญชี — ชื่อที่แสดง อีเมล จังหวัด และรูปโปรไฟล์ถ้าคุณใส่ไว้</li>
              <li>ประกาศขาย — ชื่อสินค้า รายละเอียด ราคา สภาพ จังหวัด และรูปภาพที่คุณอัปโหลด</li>
              <li>การสนทนา — ข้อความแชทระหว่างผู้ซื้อกับผู้ขาย และข้อเสนอราคาที่ส่งถึงกัน</li>
              <li>
                การนัดเจอ — วันเวลา ชื่อสถานที่ <strong>พิกัดของจุดนัด</strong> และหมายเหตุจุดสังเกต
                ที่คุณปักหมุดไว้
              </li>
              <li>ออเดอร์และรีวิว — สถานะการซื้อขาย ยอดที่ตกลงกัน คะแนนและความเห็นที่ให้กัน</li>
              <li>
                บันทึกการใช้งานที่จำเป็นต่อการดูแลระบบ เช่น เวลาที่เกิดเหตุการณ์สำคัญของออเดอร์
                และการกระทำของผู้ดูแลระบบ
              </li>
            </ul>
            <p className="mt-2 text-neutral-500">
              เราไม่เก็บเลขบัตรประชาชน เลขบัญชีธนาคาร หรือข้อมูลบัตรเครดิต
              เพราะเงินไม่ได้ผ่านระบบนี้ — ผู้ซื้อจ่ายผู้ขายโดยตรงตอนเจอกัน
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900">ใช้ข้อมูลทำอะไร</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>ให้บริการตามที่คุณขอ — แสดงประกาศ ส่งข้อความ จองสินค้า และนัดเจอกัน</li>
              <li>ทำให้การนัดเจอปลอดภัยและตรวจสอบย้อนหลังได้เมื่อมีข้อร้องเรียน</li>
              <li>ระงับบัญชีที่ละเมิดเงื่อนไขการใช้งานและป้องกันการหลอกลวง</li>
            </ul>
            <p className="mt-2">
              ฐานทางกฎหมายที่ใช้คือความจำเป็นเพื่อปฏิบัติตามสัญญาการให้บริการกับคุณ
              และประโยชน์โดยชอบด้วยกฎหมายในการดูแลความปลอดภัยของผู้ใช้
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900">ใครเห็นข้อมูลของคุณบ้าง</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>คู่สนทนาของคุณ</strong> — ชื่อที่แสดง จังหวัด รูปโปรไฟล์ ข้อความ
                และจุดนัดที่คุณส่งให้ ฝั่งตรงข้ามเห็นทั้งหมด
              </li>
              <li>
                <strong>ผู้ที่เปิดดูประกาศ</strong> — ชื่อผู้ขาย จังหวัด คะแนนรีวิว และประกาศของคุณ
                เปิดดูได้โดยไม่ต้องล็อกอิน
              </li>
              <li>
                <strong>ผู้ให้บริการที่เราใช้</strong> — Supabase (ฐานข้อมูลและไฟล์รูป),
                Vercel (โฮสต์เว็บไซต์) และ OpenStreetMap เมื่อคุณเปิดแผนที่เลือกจุดนัด
                (คำค้นและพิกัดที่คุณเลือกถูกส่งไปยังเซิร์ฟเวอร์ของ OpenStreetMap เพื่อแสดงแผนที่)
              </li>
            </ul>
            <p className="mt-2">เราไม่ขายข้อมูลของคุณให้ใคร และไม่ใช้เพื่อโฆษณาติดตามตัว</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900">เก็บไว้นานแค่ไหน</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>ข้อมูลบัญชี ประกาศ และข้อความแชท — เก็บไว้ตราบที่บัญชียังใช้งานอยู่</li>
              <li>
                <strong>ข้อมูลการนัดเจอ (วันเวลา สถานที่ พิกัด) — 1 ปีนับจากออเดอร์ปิด</strong>{" "}
                เพื่อใช้อ้างอิงเมื่อมีข้อร้องเรียนย้อนหลัง แล้วจึงลบทิ้ง
              </li>
              <li>ลบบัญชีเมื่อไหร่ เราจะลบหรือทำให้ข้อมูลของคุณระบุตัวตนไม่ได้ภายใน 30 วัน</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900">สิทธิของคุณ</h2>
            <p className="mt-2">
              คุณมีสิทธิขอเข้าถึง ขอสำเนา ขอแก้ไขให้ถูกต้อง ขอลบ ขอให้ระงับการใช้
              คัดค้านการประมวลผล และถอนความยินยอมได้ทุกเมื่อ
              รวมถึงมีสิทธิร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล
              แจ้งเรื่องมาที่{" "}
              <Link href="/support" className="font-medium text-primary-600 hover:underline">
                หน้าติดต่อผู้ดูแล
              </Link>{" "}
              ได้เลย
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900">คุกกี้</h2>
            <p className="mt-2">
              เราใช้คุกกี้เท่าที่จำเป็นเพื่อให้คุณยังล็อกอินอยู่ระหว่างใช้งานเท่านั้น
              ไม่มีคุกกี้เพื่อการโฆษณาหรือติดตามพฤติกรรมข้ามเว็บไซต์
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900">ผู้ใช้ที่เป็นผู้เยาว์</h2>
            <p className="mt-2">
              บริการนี้ตั้งใจให้ผู้ที่บรรลุนิติภาวะใช้งาน หากคุณยังไม่บรรลุนิติภาวะ
              ต้องได้รับความยินยอมจากผู้ปกครองก่อนใช้งานและก่อนนัดเจอกับผู้อื่น
            </p>
          </section>
        </div>

        <p className="mt-8 text-sm text-neutral-500">
          อ่าน{" "}
          <Link href="/terms" className="font-medium text-primary-600 hover:underline">
            เงื่อนไขการใช้งาน
          </Link>{" "}
          ควบคู่กันได้
        </p>
      </main>
    </div>
  );
}

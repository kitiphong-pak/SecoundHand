import bcrypt from "bcryptjs";
import { supabase } from "../src/lib/supabase";

// สคริปต์ seed ข้อมูลตั้งต้นลง Supabase — รันครั้งเดียวหลังสร้างตารางจาก schema.sql เสร็จ
// ใช้: npx tsx scripts/seed.ts

async function main() {
  const passwordHash = bcrypt.hashSync("password123", 10);

  const { data: users, error: userErr } = await supabase
    .from("users")
    .insert([
      { name: "อดิศักดิ์ ใจดี", email: "adisak@example.com", password_hash: passwordHash, province: "เชียงใหม่", role: "user", is_verified: true },
      { name: "พิมพ์ชนก แสงทอง", email: "pimchanok@example.com", password_hash: passwordHash, province: "เชียงใหม่", role: "user", is_verified: true },
      { name: "ธนกร ศรีสุข", email: "thanakorn@example.com", password_hash: passwordHash, province: "กรุงเทพมหานคร", role: "user", is_verified: false },
      { name: "วรรณา ทองคำ", email: "wanna@example.com", password_hash: passwordHash, province: "กรุงเทพมหานคร", role: "user", is_verified: true },
      { name: "ณัฐพล ชัยมงคล", email: "nattapol@example.com", password_hash: passwordHash, province: "ขอนแก่น", role: "user", is_verified: false },
      { name: "สุพัตรา บุญมี", email: "supattra@example.com", password_hash: passwordHash, province: "ภูเก็ต", role: "user", is_verified: true },
      { name: "แอดมิน ระบบ", email: "admin@secoundhand.demo", password_hash: passwordHash, province: "กรุงเทพมหานคร", role: "admin", is_verified: true },
    ])
    .select();

  if (userErr || !users) throw userErr;
  console.log(`inserted ${users.length} users`);

  const [u1, u2, u3, u4, u5, u6] = users;

  const productSeeds = [
    { seller_id: u1.id, title: "จักรยานเสือภูเขา TREK รุ่น Marlin 7", description: "ใช้งานน้อย สภาพดีมาก ล้อ 27.5 เฟรมอลูมิเนียม", price: 8500, category: "กีฬา", condition: "good", province: "เชียงใหม่", images: [], status: "listed" },
    { seller_id: u1.id, title: "โต๊ะทำงานไม้โอ๊ค 120x60", description: "โต๊ะทำงานไม้แท้ ขาเหล็ก แข็งแรง", price: 1800, category: "เฟอร์นิเจอร์", condition: "like_new", province: "เชียงใหม่", images: [], status: "listed" },
    { seller_id: u2.id, title: "กล้อง Canon EOS M50 พร้อมเลนส์คิท", description: "ซื้อมาไม่ถึงปี ใช้งานน้อย ประกันเหลือ 6 เดือน", price: 12500, category: "อิเล็กทรอนิกส์", condition: "like_new", province: "เชียงใหม่", images: [], status: "listed" },
    { seller_id: u2.id, title: "เสื้อหนัง Biker แท้ ไซส์ L", description: "หนังแท้ 100% สภาพดี ไม่มีตำหนิ", price: 2200, category: "เสื้อผ้า", condition: "good", province: "เชียงใหม่", images: [], status: "listed" },
    { seller_id: u3.id, title: "iPhone 13 128GB สีฟ้า", description: "แบต 89% หน้าจอไม่มีรอย มีกล่องครบ", price: 15900, category: "อิเล็กทรอนิกส์", condition: "good", province: "กรุงเทพมหานคร", images: [], status: "listed" },
    { seller_id: u3.id, title: "โซฟา 3 ที่นั่ง สีเทา", description: "ผ้าไม่ขาด ไม่มีคราบ ต้องรถกระบะมารับ", price: 3500, category: "เฟอร์นิเจอร์", condition: "fair", province: "กรุงเทพมหานคร", images: [], status: "sold" },
    { seller_id: u4.id, title: "กระเป๋าเป้ Fjallraven Kanken", description: "สีเหลืองมัสตาร์ด ใช้ไม่ถึง 10 ครั้ง", price: 1200, category: "แฟชั่น", condition: "like_new", province: "กรุงเทพมหานคร", images: [], status: "listed" },
    { seller_id: u4.id, title: "เตียงเหล็ก 5 ฟุต พร้อมที่นอน", description: "แข็งแรง ไม่มีสนิม พร้อมย้ายบ้านด่วน", price: 2500, category: "เฟอร์นิเจอร์", condition: "good", province: "กรุงเทพมหานคร", images: [], status: "listed" },
    { seller_id: u5.id, title: "รองเท้าวิ่ง Nike Pegasus 39 ไซส์ 42", description: "ใส่ 2 ครั้ง ไซส์ไม่พอดีเลยขาย", price: 1900, category: "กีฬา", condition: "like_new", province: "ขอนแก่น", images: [], status: "listed" },
    { seller_id: u5.id, title: "หม้อทอดไร้น้ำมัน Philips 4.1L", description: "ใช้งานปกติดี ทำความสะอาดแล้ว", price: 1400, category: "เครื่องใช้ไฟฟ้า", condition: "good", province: "ขอนแก่น", images: [], status: "listed" },
    { seller_id: u6.id, title: "บอร์ดโต้คลื่น Softboard 8 ฟุต", description: "เหมาะมือใหม่ สภาพดี มีรอยขีดข่วนเล็กน้อย", price: 4200, category: "กีฬา", condition: "fair", province: "ภูเก็ต", images: [], status: "listed" },
    { seller_id: u6.id, title: "แว่นกันแดด Ray-Ban Aviator แท้", description: "ของแท้ มีใบเสร็จ ใช้น้อย", price: 2800, category: "แฟชั่น", condition: "like_new", province: "ภูเก็ต", images: [], status: "listed" },
    { seller_id: u2.id, title: "หนังสือ Harry Potter ครบชุด 7 เล่ม", description: "ปกแข็ง ภาษาอังกฤษ สภาพดี", price: 1500, category: "หนังสือ", condition: "good", province: "เชียงใหม่", images: [], status: "listed" },
    { seller_id: u4.id, title: "จอมอนิเตอร์ Dell 27 นิ้ว 2K", description: "จอสวย ไม่มีจุดเสีย ใช้กับ MacBook", price: 5200, category: "อิเล็กทรอนิกส์", condition: "good", province: "กรุงเทพมหานคร", images: [], status: "reserved" },
    { seller_id: u1.id, title: "เครื่องชงกาแฟ Moka Pot 6 cup", description: "อลูมิเนียม ใช้ไม่กี่ครั้ง", price: 450, category: "เครื่องใช้ไฟฟ้า", condition: "like_new", province: "เชียงใหม่", images: [], status: "listed" },
  ];

  const { data: products, error: productErr } = await supabase
    .from("products")
    .insert(productSeeds)
    .select();

  if (productErr || !products) throw productErr;
  console.log(`inserted ${products.length} products`);
}

main().then(
  () => {
    console.log("seed done");
    process.exit(0);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

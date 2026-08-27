import { NextResponse } from "next/server";
import { getCurrentUser, toPublicUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({ user: toPublicUser(user) });
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ userId: null });
  }
  return NextResponse.json({ userId: session.userId, name: session.name });
}

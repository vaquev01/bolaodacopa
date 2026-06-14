import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

/** Encerra a sessão neste device (a conta continua: dá pra reentrar com nome + senha). */
export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}

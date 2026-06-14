import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

export interface MyPool {
  name: string;
  slug: string;
  role: string;
  members: number;
}

/** Lista os bolões ativos do usuário logado (para a home "seus bolões"). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ pools: [] });

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("my_pools", {
    p_user: session.userId,
    p_secret: session.secret,
  });

  if (error) {
    console.error("[pools/mine] RPC error:", error.message);
    return NextResponse.json({ pools: [] });
  }
  return NextResponse.json({ pools: (data ?? []) as MyPool[] });
}

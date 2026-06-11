import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

/**
 * GET /api/pools/[id]/brackets
 * Retorna via RPC get_pool_brackets:
 *   - Meu bracket (sempre)
 *   - Brackets de todos (apenas após lock = kickoff do 1º jogo)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "unauthorized", message: "Sessão não encontrada." },
        { status: 401 }
      );
    }

    const { id: poolId } = await params;
    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc("get_pool_brackets", {
      p_user: session.userId,
      p_secret: session.secret,
      p_pool: poolId,
    });

    if (error) {
      console.error("[brackets GET] get_pool_brackets error:", error.message);
      if (error.message.includes("unauthorized")) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      if (error.message.includes("not_member")) {
        return NextResponse.json({ error: "not_member" }, { status: 403 });
      }
      return NextResponse.json({ error: "rpc_error", message: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? {});
  } catch (err) {
    console.error("[brackets GET] unexpected error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

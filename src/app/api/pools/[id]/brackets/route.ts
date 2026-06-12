import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { parseRuleset } from "@/lib/scoring";
import { computeLiveBracketPoints } from "@/lib/bracket-live";

/**
 * GET /api/pools/[id]/brackets
 * Retorna via RPC get_pool_brackets:
 *   - Meu bracket (sempre)
 *   - Brackets de todos (apenas após lock = kickoff do 1º jogo)
 * Scores de all_brackets são recalculados live do estado atual dos jogos.
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

    const payload = (data ?? {}) as {
      all_brackets?: { user_id: string; score?: number; breakdown?: unknown }[] | null;
    };

    // Sobrescrever scores persistidos por cálculo live (sempre atual)
    if (payload.all_brackets && payload.all_brackets.length > 0) {
      const { data: poolRow } = await supabase
        .from("pools")
        .select("ruleset")
        .eq("id", poolId)
        .single();
      if (poolRow) {
        const live = await computeLiveBracketPoints(
          supabase,
          poolId,
          parseRuleset(poolRow.ruleset)
        );
        for (const b of payload.all_brackets) {
          const s = live.get(b.user_id);
          if (s) {
            b.score = s.points;
            b.breakdown = s.breakdown;
          }
        }
      }
    }

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[brackets GET] unexpected error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

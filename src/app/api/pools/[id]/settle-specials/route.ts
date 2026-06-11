import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import {
  parseRuleset,
  scoreChampion,
  scoreGroupQualifiers,
  type GroupPicks,
} from "@/lib/scoring";

// POST {bet_type, actual} → admin lança o resultado real e o engine TS pontua.
// champion: actual = nome do campeão. qualifiers: actual = JSON {grupo: [1º, 2º]}.
export async function POST(
  req: NextRequest,
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
    const { bet_type, actual } = (await req.json()) as { bet_type?: string; actual?: string };

    if (!bet_type || !["champion", "qualifiers"].includes(bet_type) || !actual?.trim()) {
      return NextResponse.json(
        { error: "invalid_input", message: "bet_type (champion|qualifiers) e actual são obrigatórios." },
        { status: 422 }
      );
    }

    const supabase = await createServerClient();

    const { data: poolData, error: poolError } = await supabase
      .from("pools")
      .select("ruleset")
      .eq("id", poolId)
      .single();
    if (poolError || !poolData) {
      return NextResponse.json({ error: "not_found", message: "Bolão não encontrado." }, { status: 404 });
    }
    const ruleset = parseRuleset(poolData.ruleset);

    const { data: bets, error: betsError } = await supabase.rpc("special_bets_for_scoring", {
      p_user: session.userId,
      p_secret: session.secret,
      p_pool: poolId,
      p_bet_type: bet_type,
    });
    if (betsError) {
      const status = betsError.message.includes("forbidden") ? 403 : 500;
      return NextResponse.json({ error: "rpc_error", message: betsError.message }, { status });
    }

    const betRows = (bets ?? []) as { user_id: string; value: string }[];
    let actualQualifiers: GroupPicks | null = null;
    if (bet_type === "qualifiers") {
      try {
        actualQualifiers = JSON.parse(actual) as GroupPicks;
      } catch {
        return NextResponse.json(
          { error: "invalid_input", message: "actual de qualifiers deve ser JSON {grupo: [1º, 2º]}." },
          { status: 422 }
        );
      }
    }

    const scores = betRows.map((bet) => {
      if (bet_type === "champion") {
        const points = scoreChampion(ruleset, bet.value, actual);
        return { user_id: bet.user_id, points, breakdown: { champion: points } };
      }
      let picks: GroupPicks = {};
      try {
        picks = JSON.parse(bet.value) as GroupPicks;
      } catch {
        // palpite corrompido → 0 pontos, auditável no breakdown
        return { user_id: bet.user_id, points: 0, breakdown: { invalid_payload: 1 } };
      }
      const { points, breakdown } = scoreGroupQualifiers(ruleset, picks, actualQualifiers!);
      return { user_id: bet.user_id, points, breakdown };
    });

    const { error: saveError } = await supabase.rpc("save_special_scores", {
      p_user: session.userId,
      p_secret: session.secret,
      p_pool: poolId,
      p_bet_type: bet_type,
      p_actual: actual,
      p_scores: scores,
    });
    if (saveError) {
      return NextResponse.json({ error: "rpc_error", message: saveError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, scored: scores.length });
  } catch (err) {
    console.error("[settle-specials] unexpected error:", err);
    return NextResponse.json({ error: "internal_error", message: "Erro interno." }, { status: 500 });
  }
}

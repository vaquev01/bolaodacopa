import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import {
  scorePrediction,
  earlyBirdBonus,
  parseRuleset,
  deriveBracketOutcome,
  scoreBracket,
  type Stage,
  type BracketMatchInput,
} from "@/lib/scoring";

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

    const { id: matchId } = await params;

    const body = await req.json();
    const { pool_id, score_home_90, score_away_90, score_home_ft, score_away_ft, penalty_winner } =
      body as {
        pool_id?: string;
        score_home_90?: number;
        score_away_90?: number;
        score_home_ft?: number | null;
        score_away_ft?: number | null;
        penalty_winner?: string | null;
      };

    if (
      typeof score_home_90 !== "number" ||
      typeof score_away_90 !== "number"
    ) {
      return NextResponse.json(
        { error: "invalid_input", message: "score_home_90 e score_away_90 são obrigatórios." },
        { status: 422 }
      );
    }

    if (!pool_id) {
      return NextResponse.json(
        { error: "invalid_input", message: "pool_id é obrigatório." },
        { status: 422 }
      );
    }

    const supabase = await createServerClient();

    // 1. Salvar resultado via RPC
    const { error: resultError } = await supabase.rpc("set_match_result", {
      p_user: session.userId,
      p_secret: session.secret,
      p_match: matchId,
      p_h90: score_home_90,
      p_a90: score_away_90,
      p_hft: score_home_ft ?? score_home_90,
      p_aft: score_away_ft ?? score_away_90,
      p_pen_winner: penalty_winner ?? null,
    });

    if (resultError) {
      console.error("[matches/result] set_match_result error:", resultError.message);
      if (resultError.message.includes("not_owner") || resultError.message.includes("forbidden")) {
        return NextResponse.json(
          { error: "forbidden", message: "Sem permissão para alterar este resultado." },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: "rpc_error", message: resultError.message },
        { status: 500 }
      );
    }

    // 2. Buscar o jogo atualizado
    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .select("id, stage, kickoff_at, score_home_90, score_away_90, score_home_ft, score_away_ft, penalty_winner, status")
      .eq("id", matchId)
      .single();

    if (matchError || !matchData) {
      console.error("[matches/result] fetch match error:", matchError?.message);
      return NextResponse.json({ ok: true, scored: 0 });
    }

    // 3. Buscar o ruleset do pool
    const { data: poolData, error: poolError } = await supabase
      .from("pools")
      .select("ruleset")
      .eq("id", pool_id)
      .single();

    if (poolError || !poolData) {
      console.error("[matches/result] fetch pool error:", poolError?.message);
      return NextResponse.json({ ok: true, scored: 0 });
    }

    const ruleset = parseRuleset(poolData.ruleset);

    // 4. Buscar todos os palpites deste jogo neste pool.
    // RLS esconde predictions até o kickoff, então usamos RPC security definer
    // que valida que o caller é o owner do pool.
    const { data: predictions, error: predError } = await supabase.rpc(
      "predictions_for_scoring",
      {
        p_user: session.userId,
        p_secret: session.secret,
        p_pool: pool_id,
        p_match: matchId,
      }
    );

    if (predError || !predictions || predictions.length === 0) {
      return NextResponse.json({ ok: true, scored: 0 });
    }

    // 5. Calcular pontos para cada palpite
    const h90 = (matchData.score_home_90 as number | null) ?? score_home_90;
    const a90 = (matchData.score_away_90 as number | null) ?? score_away_90;
    const match = {
      score_home_90: h90,
      score_away_90: a90,
      score_home_ft: (matchData.score_home_ft as number | null) ?? h90,
      score_away_ft: (matchData.score_away_ft as number | null) ?? a90,
      penalty_winner: (matchData.penalty_winner as string | null) ?? undefined,
      stage: matchData.stage as Stage,
      status: "finished" as const,
    };

    const predRows = predictions as {
      id: string;
      payload: unknown;
      first_submitted_at: string;
      edit_count: number;
    }[];
    const kickoffAt = matchData.kickoff_at as string;
    const rows = predRows.map((pred) => {
      const payload = pred.payload as { home: number; away: number };
      const { points, breakdown } = scorePrediction(ruleset, payload, match);
      const bonus = earlyBirdBonus(
        ruleset,
        { first_submitted_at: pred.first_submitted_at, edit_count: pred.edit_count },
        kickoffAt
      );
      if (bonus > 0) {
        breakdown.early_bird = bonus;
        breakdown.total = points + bonus;
      }
      return {
        prediction_id: pred.id,
        points: points + bonus,
        breakdown,
      };
    });

    // 6. Salvar pontuações via RPC
    const { error: scoresError } = await supabase.rpc("save_scores", {
      p_rows: rows,
    });

    if (scoresError) {
      console.error("[matches/result] save_scores error:", scoresError.message);
      // Não falhar a request — resultado foi salvo
      return NextResponse.json({ ok: true, scored: 0, warn: scoresError.message });
    }

    // 7. Se o pool tem advance_predictions habilitado, recalcular bracket scores
    if (ruleset.advance_predictions.enabled) {
      await recalcBracketScores(supabase, pool_id, session.userId, session.secret, ruleset);
    }

    return NextResponse.json({ ok: true, scored: rows.length });
  } catch (err) {
    console.error("[matches/result] unexpected error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Erro interno." },
      { status: 500 }
    );
  }
}

/**
 * Recalcula bracket scores de todos os participantes do pool.
 * Idempotente — pode ser chamada a qualquer momento.
 */
async function recalcBracketScores(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  poolId: string,
  userId: string,
  secret: string,
  ruleset: ReturnType<typeof parseRuleset>
) {
  try {
    // Buscar todos os matches para derivar o outcome atual
    const { data: allMatches, error: matchesError } = await supabase
      .from("matches")
      .select("id, stage, group_label, home_team, away_team, score_home_90, score_away_90, score_home_ft, score_away_ft, penalty_winner, status")
      .order("kickoff_at", { ascending: true });

    if (matchesError || !allMatches) {
      console.error("[brackets/recalc] fetch matches error:", matchesError?.message);
      return;
    }

    // Mapear para BracketMatchInput (group_label → group_code)
    const matchInputs: BracketMatchInput[] = allMatches.map((m) => ({
      id: m.id as string,
      stage: m.stage as BracketMatchInput["stage"],
      home_team: m.home_team as string,
      away_team: m.away_team as string,
      score_home_90: m.score_home_90 as number | null,
      score_away_90: m.score_away_90 as number | null,
      score_home_ft: m.score_home_ft as number | null,
      score_away_ft: m.score_away_ft as number | null,
      penalty_winner: (m.penalty_winner as string | null) ?? null,
      status: m.status as BracketMatchInput["status"],
      group_code: (m.group_label as string | null) ?? undefined,
    }));

    const outcome = deriveBracketOutcome(matchInputs);

    // Buscar todos os brackets do pool
    const { data: brackets, error: bracketsError } = await supabase
      .from("bracket_predictions")
      .select("user_id, payload")
      .eq("pool_id", poolId);

    if (bracketsError || !brackets || brackets.length === 0) {
      return; // Sem brackets = nada a recalcular
    }

    const bracketPoints = ruleset.advance_predictions.points;

    // Calcular pontuação para cada bracket
    const rows = brackets.map((b) => {
      const payload = b.payload as Parameters<typeof scoreBracket>[1];
      const { points, breakdown } = scoreBracket(bracketPoints, payload, outcome);
      return {
        user_id: b.user_id as string,
        points,
        breakdown,
      };
    });

    // Salvar via RPC save_bracket_scores (idempotente)
    const { error: saveError } = await supabase.rpc("save_bracket_scores", {
      p_user: userId,
      p_secret: secret,
      p_pool: poolId,
      p_rows: rows,
    });

    if (saveError) {
      console.error("[brackets/recalc] save_bracket_scores error:", saveError.message);
    }
  } catch (err) {
    // Não propagar erro — o resultado já foi salvo, bracket é complementar
    console.error("[brackets/recalc] unexpected error:", err);
  }
}

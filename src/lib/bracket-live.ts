import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveBracketOutcome,
  scoreBracket,
  type BracketMatchInput,
  type BracketPayload,
  type Ruleset,
} from "@/lib/scoring";

export interface LiveBracketScore {
  points: number;
  breakdown: Record<string, number>;
}

/**
 * Calcula os pontos de bracket de um pool em tempo de leitura, direto do
 * estado atual de `matches` — sem depender da tabela `bracket_scores`
 * (que só era preenchida quando o owner lançava resultado manualmente).
 *
 * RLS: bracket_predictions alheias só são visíveis pós-lock; pré-lock o
 * SELECT volta vazio e o resultado é um Map vazio — não há o que pontuar
 * antes do lock mesmo.
 */
export async function computeLiveBracketPoints(
  supabase: SupabaseClient,
  poolId: string,
  ruleset: Ruleset
): Promise<Map<string, LiveBracketScore>> {
  const result = new Map<string, LiveBracketScore>();
  if (!ruleset.advance_predictions?.enabled) return result;

  const [{ data: matches }, { data: brackets }] = await Promise.all([
    supabase
      .from("matches")
      .select("id, stage, group_label, home_team, away_team, score_home_90, score_away_90, status")
      .order("kickoff_at", { ascending: true }),
    supabase.from("bracket_predictions").select("user_id, payload").eq("pool_id", poolId),
  ]);

  if (!matches || !brackets || brackets.length === 0) return result;

  const inputs: BracketMatchInput[] = matches.map((m) => ({
    id: m.id as string,
    stage: m.stage as BracketMatchInput["stage"],
    home_team: m.home_team as string,
    away_team: m.away_team as string,
    score_home_90: m.score_home_90 as number | null,
    score_away_90: m.score_away_90 as number | null,
    status: m.status as BracketMatchInput["status"],
    group_code: (m.group_label as string | null) ?? undefined,
  }));

  const outcome = deriveBracketOutcome(inputs);
  const points = ruleset.advance_predictions.points;

  for (const b of brackets) {
    const { points: pts, breakdown } = scoreBracket(points, b.payload as BracketPayload, outcome);
    result.set(b.user_id as string, { points: pts, breakdown });
  }

  return result;
}

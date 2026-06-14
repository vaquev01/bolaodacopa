import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  scorePrediction,
  earlyBirdBonus,
  parseRuleset,
  type Stage,
} from "@/lib/scoring";
import { fetchOfficialResults } from "./fd";
import { planUpdates, type DbMatchRow, type MatchUpdate } from "./plan";

export interface SyncConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  fdToken: string;
  /** Perfil de sistema (owner do pool _sistema_sync) — autoriza set_match_result. */
  syncUserId: string;
  syncSecret: string;
}

export interface SyncReport {
  checked: number;
  updated: { label: string; scored: number }[];
  errors: string[];
}

/** Lê a config do ambiente (rota Next / Vercel). Null se incompleta. */
export function syncConfigFromEnv(): SyncConfig | null {
  const {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
    FOOTBALL_DATA_TOKEN: fdToken,
    SYNC_USER_ID: syncUserId,
    SYNC_USER_SECRET: syncSecret,
  } = process.env;
  if (!supabaseUrl || !supabaseAnonKey || !fdToken || !syncUserId || !syncSecret) return null;
  return { supabaseUrl, supabaseAnonKey, fdToken, syncUserId, syncSecret };
}

/**
 * Sincroniza resultados oficiais (football-data) com o banco e repontua
 * os palpites de TODOS os bolões afetados.
 *
 * Idempotente — projetada para rodar em cron (a cada 10 min).
 * Pontos de bracket não são persistidos aqui: são calculados on-read
 * (ver page.tsx / GET brackets), então ficam corretos automaticamente
 * assim que o resultado do jogo entra.
 */
export async function runSync(cfg: SyncConfig): Promise<SyncReport> {
  const supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const report: SyncReport = { checked: 0, updated: [], errors: [] };

  // 1. Resultados oficiais encerrados
  const official = await fetchOfficialResults(cfg.fdToken);
  report.checked = official.length;
  if (official.length === 0) return report;

  // 2. Estado atual no banco (pareamento por ext_id)
  const extIds = official.map((o) => o.extId);
  const { data: dbRows, error: dbError } = await supabase
    .from("matches")
    .select(
      "id, ext_id, home_team, away_team, status, score_home_90, score_away_90, score_home_ft, score_away_ft, penalty_winner"
    )
    .in("ext_id", extIds);

  if (dbError) {
    report.errors.push(`select matches: ${dbError.message}`);
    return report;
  }

  // 3. Diff — só o que mudou
  const updates = planUpdates((dbRows ?? []) as DbMatchRow[], official);

  // 4. Aplicar resultado + repontuar, jogo a jogo
  for (const u of updates) {
    const { error: setError } = await supabase.rpc("set_match_result", {
      p_user: cfg.syncUserId,
      p_secret: cfg.syncSecret,
      p_match: u.matchId,
      p_h90: u.h90,
      p_a90: u.a90,
      p_hft: u.hft,
      p_aft: u.aft,
      p_pen_winner: u.penWinner,
    });
    if (setError) {
      report.errors.push(`set_match_result ${u.label}: ${setError.message}`);
      continue;
    }

    const scored = await rescoreMatch(supabase, u, cfg);
    report.updated.push({ label: u.label, scored });
  }

  return report;
}

/**
 * Repontua todos os palpites de um jogo, em todos os pools.
 * Palpites são SELECT-públicos pós-kickoff (RLS), e um jogo encerrado
 * está sempre pós-kickoff — então o client anon enxerga tudo que precisa.
 */
async function rescoreMatch(
  supabase: SupabaseClient,
  u: MatchUpdate,
  cfg: SyncConfig
): Promise<number> {
  const { data: match } = await supabase
    .from("matches")
    .select("stage, kickoff_at")
    .eq("id", u.matchId)
    .single();
  if (!match) return 0;

  const { data: predictions } = await supabase
    .from("predictions")
    .select("id, pool_id, payload, first_submitted_at, edit_count")
    .eq("match_id", u.matchId);
  if (!predictions || predictions.length === 0) return 0;

  // Rulesets dos pools envolvidos
  const poolIds = Array.from(new Set(predictions.map((p) => p.pool_id as string)));
  const { data: pools } = await supabase
    .from("pools")
    .select("id, ruleset")
    .in("id", poolIds);
  const rulesetByPool = new Map(
    (pools ?? []).map((p) => [p.id as string, parseRuleset(p.ruleset)])
  );

  const matchResult = {
    score_home_90: u.h90,
    score_away_90: u.a90,
    score_home_ft: u.hft,
    score_away_ft: u.aft,
    penalty_winner: u.penWinner ?? undefined,
    stage: match.stage as Stage,
    status: "finished" as const,
  };

  const rows: { prediction_id: string; points: number; breakdown: Record<string, number> }[] = [];
  for (const pred of predictions) {
    const ruleset = rulesetByPool.get(pred.pool_id as string);
    if (!ruleset) continue;
    const payload = pred.payload as { home: number; away: number };
    const { points, breakdown } = scorePrediction(ruleset, payload, matchResult);
    const bonus = earlyBirdBonus(
      ruleset,
      {
        first_submitted_at: pred.first_submitted_at as string,
        edit_count: pred.edit_count as number,
      },
      match.kickoff_at as string
    );
    if (bonus > 0) {
      breakdown.early_bird = bonus;
      breakdown.total = points + bonus;
    }
    rows.push({ prediction_id: pred.id as string, points: points + bonus, breakdown });
  }

  if (rows.length === 0) return 0;
  const { error } = await supabase.rpc("save_scores", {
    p_user: cfg.syncUserId,
    p_secret: cfg.syncSecret,
    p_rows: rows,
  });
  if (error) throw new Error(`save_scores: ${error.message}`);
  return rows.length;
}

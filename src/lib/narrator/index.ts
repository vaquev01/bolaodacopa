/**
 * Narrador — ADM automático que comenta no mural a cada jogo (zoeira raiz).
 * Roda no mesmo cron do sync (a cada 10 min). Lê o estado do banco e posta via
 * RPC narrator_post (dedup atômico por event_key — nunca repete).
 *
 * Gatilhos: bola rolando (kickoff), fim de jogo (zoa quem errou), nova
 * liderança e resumo do dia. Só atua em bolões reais (>= 2 membros).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseRuleset, scorePrediction, type Stage, type Ruleset } from "@/lib/scoring";
import { computeLiveBracketPoints } from "@/lib/bracket-live";
import { kickoffBody, fulltimeBody, leaderBody, dailyBody, type FtPick } from "./templates";

export interface NarratorConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  narratorUserId: string;
  narratorSecret: string;
}

export function narratorConfigFromEnv(): NarratorConfig | null {
  const {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
    NARRATOR_USER_ID: narratorUserId,
    NARRATOR_USER_SECRET: narratorSecret,
  } = process.env;
  if (!supabaseUrl || !supabaseAnonKey || !narratorUserId || !narratorSecret) return null;
  return { supabaseUrl, supabaseAnonKey, narratorUserId, narratorSecret };
}

export interface NarratorReport {
  posted: number;
  events: string[];
  errors: string[];
}

interface MatchRow {
  id: string;
  home_team: string;
  away_team: string;
  status: string;
  score_home_90: number | null;
  score_away_90: number | null;
  score_home_ft: number | null;
  score_away_ft: number | null;
  penalty_winner: string | null;
  stage: string;
  kickoff_at: string;
}

function pickLabel(p: { home?: number | null; away?: number | null; winner?: string }): string {
  if (typeof p.home === "number" && typeof p.away === "number") return `${p.home}x${p.away}`;
  if (p.winner === "home") return "Casa";
  if (p.winner === "away") return "Fora";
  if (p.winner === "draw") return "empate";
  return "?";
}

export async function runNarrator(cfg: NarratorConfig): Promise<NarratorReport> {
  const supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const report: NarratorReport = { posted: 0, events: [], errors: [] };

  const { data: pools, error } = await supabase
    .from("pools")
    .select("id, name, ruleset, status")
    .eq("status", "active");
  if (error) {
    report.errors.push(`select pools: ${error.message}`);
    return report;
  }

  for (const pool of pools ?? []) {
    const name = pool.name as string;
    if (name.startsWith("_sistema")) continue;
    // Só bolões reais (>= 2 membros ativos).
    const { count } = await supabase
      .from("pool_members")
      .select("user_id", { count: "exact", head: true })
      .eq("pool_id", pool.id)
      .eq("status", "active");
    if ((count ?? 0) < 2) continue;

    try {
      await narratePool(supabase, cfg, pool.id as string, parseRuleset(pool.ruleset), report);
    } catch (e) {
      report.errors.push(`pool ${name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return report;
}

async function post(
  supabase: SupabaseClient,
  cfg: NarratorConfig,
  poolId: string,
  body: string,
  eventKey: string,
  report: NarratorReport,
) {
  const { data, error } = await supabase.rpc("narrator_post", {
    p_user: cfg.narratorUserId,
    p_secret: cfg.narratorSecret,
    p_pool: poolId,
    p_scope: "pool",
    p_match: null,
    p_body: body,
    p_event_key: eventKey,
  });
  if (error) {
    report.errors.push(`narrator_post ${eventKey}: ${error.message}`);
    return;
  }
  if (data === true) {
    report.posted++;
    report.events.push(eventKey);
  }
}

async function narratePool(
  supabase: SupabaseClient,
  cfg: NarratorConfig,
  poolId: string,
  ruleset: Ruleset,
  report: NarratorReport,
) {
  // Palpites de placar (RLS já só devolve jogos que começaram).
  const { data: preds } = await supabase
    .from("predictions")
    .select("user_id, match_id, payload, prediction_scores(points)")
    .eq("pool_id", poolId);
  const predList = (preds ?? []) as {
    user_id: string;
    match_id: string;
    payload: { home?: number | null; away?: number | null; winner?: string };
    prediction_scores: unknown;
  }[];

  const matchIds = Array.from(new Set(predList.map((p) => p.match_id)));

  // Nomes dos membros.
  const { data: nameRows } = await supabase.rpc("pool_member_names", { p_pool: poolId });
  const names = new Map<string, string>();
  for (const r of (nameRows ?? []) as { user_id: string; name: string }[]) names.set(r.user_id, r.name ?? "alguém");

  // ── Eventos por jogo (kickoff / fim) ──────────────────────────────────────
  const todayBrt = ymdBrt(new Date());
  let finishedToday = 0;
  if (matchIds.length) {
    const { data: matchesRaw } = await supabase
      .from("matches")
      .select("id, home_team, away_team, status, score_home_90, score_away_90, score_home_ft, score_away_ft, penalty_winner, stage, kickoff_at")
      .in("id", matchIds);
    const matches = ((matchesRaw ?? []) as MatchRow[]).sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));

    for (const m of matches) {
      const predsHere = predList.filter((p) => p.match_id === m.id);
      if (predsHere.length === 0) continue;

      const hft = m.score_home_ft ?? m.score_home_90;
      const aft = m.score_away_ft ?? m.score_away_90;
      const isFinished = m.status === "finished" && typeof hft === "number" && typeof aft === "number";

      if (isFinished) {
        if (ymdBrt(new Date(m.kickoff_at)) === todayBrt) finishedToday++;
        // Quem cravou o placar exato + o erro mais distante.
        const matchResult = {
          score_home_90: m.score_home_90 ?? (hft as number),
          score_away_90: m.score_away_90 ?? (aft as number),
          score_home_ft: hft as number,
          score_away_ft: aft as number,
          penalty_winner: m.penalty_winner ?? undefined,
          stage: m.stage as Stage,
          status: "finished" as const,
        };
        const exacts: string[] = [];
        let worst: FtPick | null = null;
        let worstDist = -1;
        for (const p of predsHere) {
          const nm = names.get(p.user_id) ?? "alguém";
          const { breakdown } = scorePrediction(ruleset, p.payload as { home: number; away: number }, matchResult);
          if ((breakdown.exact_score ?? 0) > 0) exacts.push(nm);
          if (typeof p.payload.home === "number" && typeof p.payload.away === "number") {
            const dist = Math.abs(p.payload.home - (hft as number)) + Math.abs(p.payload.away - (aft as number));
            if (dist > worstDist && dist >= 3) {
              worstDist = dist;
              worst = { name: nm, pick: pickLabel(p.payload) };
            }
          }
        }
        const ek = `ft:${m.id}`;
        await post(supabase, cfg, poolId, fulltimeBody(ek, m.home_team, m.away_team, hft as number, aft as number, exacts, worst), ek, report);
      } else {
        const ek = `kickoff:${m.id}`;
        await post(supabase, cfg, poolId, kickoffBody(ek, m.home_team, m.away_team), ek, report);
      }
    }
  }

  // ── Nova liderança ────────────────────────────────────────────────────────
  const totals = new Map<string, number>();
  for (const p of predList) {
    const sc = p.prediction_scores as unknown;
    const pts = Array.isArray(sc) ? ((sc[0] as { points: number } | undefined)?.points ?? 0) : ((sc as { points: number } | null)?.points ?? 0);
    totals.set(p.user_id, (totals.get(p.user_id) ?? 0) + pts);
  }
  const { data: specials } = await supabase.from("special_bet_scores").select("user_id, points").eq("pool_id", poolId);
  for (const s of (specials ?? []) as { user_id: string; points: number }[]) {
    totals.set(s.user_id, (totals.get(s.user_id) ?? 0) + (s.points ?? 0));
  }
  if (ruleset.advance_predictions?.enabled) {
    try {
      const live = await computeLiveBracketPoints(supabase, poolId, ruleset);
      for (const [uid, { points }] of Array.from(live.entries())) {
        totals.set(uid, (totals.get(uid) ?? 0) + points);
      }
    } catch { /* bracket live é best-effort pro narrador */ }
  }
  let leader: { uid: string; pts: number } | null = null;
  for (const [uid, pts] of Array.from(totals.entries())) {
    if (pts > 0 && (!leader || pts > leader.pts)) leader = { uid, pts };
  }
  if (leader) {
    const ek = `leader:${leader.uid}`;
    await post(supabase, cfg, poolId, leaderBody(ek, names.get(leader.uid) ?? "alguém", Math.round(leader.pts)), ek, report);
  }

  // ── Resumo do dia (após 21h BRT, se algo foi decidido hoje) ────────────────
  const nowBrt = new Date(Date.now() - 3 * 3600_000);
  if (nowBrt.getUTCHours() >= 21 && leader && finishedToday > 0) {
    const ek = `daily:${todayBrt}`;
    await post(supabase, cfg, poolId, dailyBody(ek, names.get(leader.uid) ?? "alguém", Math.round(leader.pts), finishedToday), ek, report);
  }
}

/** Data YYYYMMDD no fuso de Brasília (UTC-3). */
function ymdBrt(d: Date): string {
  const b = new Date(d.getTime() - 3 * 3600_000);
  return `${b.getUTCFullYear()}${String(b.getUTCMonth() + 1).padStart(2, "0")}${String(b.getUTCDate()).padStart(2, "0")}`;
}

import type { Ruleset } from "./ruleset";

// ────────────────────────────────────────────────────────────
// Pontuações especiais: early bird, campeão, classificados.
// Funções puras, sem I/O — mesma filosofia do engine.
// ────────────────────────────────────────────────────────────

export interface PredictionMeta {
  /** Primeiro envio do palpite (imutável no banco). */
  first_submitted_at: string;
  /** Quantas vezes o palpite foi alterado depois do primeiro envio. */
  edit_count: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bônus early bird: palpite enviado >= days_before dias antes do kickoff
 * e nunca editado. Retorna 0 se a regra está desligada ou não cumpriu.
 */
export function earlyBirdBonus(
  ruleset: Ruleset,
  meta: PredictionMeta,
  kickoffAt: string
): number {
  const eb = ruleset.early_bird;
  if (!eb.enabled || eb.points === 0) return 0;
  if (meta.edit_count > 0) return 0;

  const submitted = new Date(meta.first_submitted_at).getTime();
  const kickoff = new Date(kickoffAt).getTime();
  if (Number.isNaN(submitted) || Number.isNaN(kickoff)) return 0;

  return kickoff - submitted >= eb.days_before * DAY_MS ? eb.points : 0;
}

/**
 * Palpite de campeão. Comparação por nome normalizado (trim + casefold).
 */
export function scoreChampion(
  ruleset: Ruleset,
  predicted: string,
  actual: string
): number {
  const cb = ruleset.special_bets.champion;
  if (!cb.enabled || cb.points === 0) return 0;
  return norm(predicted) === norm(actual) ? cb.points : 0;
}

/** Palpite de classificados de um grupo: [1º, 2º]. */
export type GroupPicks = Record<string, [string, string]>;

export interface QualifiersResult {
  points: number;
  /** Por grupo: pontos ganhos naquele grupo. */
  breakdown: Record<string, number>;
}

/**
 * Classificados por grupo: points_per_team por time presente no top-2 real
 * do grupo (independente da ordem) + exact_position_bonus se acertou
 * também a posição. Grupos sem resultado real ainda são ignorados.
 */
export function scoreGroupQualifiers(
  ruleset: Ruleset,
  predicted: GroupPicks,
  actual: GroupPicks
): QualifiersResult {
  const q = ruleset.special_bets.qualifiers;
  const breakdown: Record<string, number> = {};
  if (!q.enabled) return { points: 0, breakdown };

  let total = 0;
  for (const group of Object.keys(predicted)) {
    const pred = predicted[group];
    const act = actual[group];
    if (!pred || !act) continue;

    const actNorm = act.map(norm);
    let pts = 0;
    pred.forEach((team, pos) => {
      const t = norm(team);
      if (actNorm.includes(t)) {
        pts += q.points_per_team;
        if (actNorm[pos] === t) pts += q.exact_position_bonus;
      }
    });
    if (pts > 0) breakdown[group] = pts;
    total += pts;
  }
  return { points: total, breakdown };
}

function norm(s: string): string {
  return s.trim().toLocaleLowerCase("pt-BR");
}

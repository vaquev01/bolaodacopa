/**
 * bracket-tree — resolução PURA do chaveamento de mata-mata da Copa 2026.
 *
 * Reconstrói, a partir do payload de um participante (classificação de grupos +
 * vencedores marcados em cada fase), QUEM ele colocou em cada slot dos confrontos
 * de 16 avos → final. É a fonte única usada tanto pelo editor interativo
 * (KnockoutTreeEditor) quanto pela árvore comparativa read-only (BracketCompare).
 *
 * Semântica do payload (alinhada ao scoreBracket — cada array são os times que o
 * participante coloca avançando NA fase seguinte):
 *   r16_winners = vencem os 16 avos → chegam às oitavas
 *   qf_winners  = vencem as oitavas → chegam às quartas
 *   sf_winners  = vencem as quartas → chegam às semis
 *   finalists   = vencem as semis   → chegam à final
 *   champion    = vence a final
 */

import {
  R32_MATCHES,
  R16_MATCHES,
  QF_MATCHES,
  SF_MATCHES,
  FINAL_MATCH,
  computeThirdAlloc,
  type R32Slot,
} from "@/lib/scoring/wc26-pairings";

/** Subconjunto do payload necessário para resolver a árvore. */
export interface KnockoutTreePayload {
  groups: Record<string, string[]>;
  third_qualifiers: string[];
  r16_winners: string[];
  qf_winners: string[];
  sf_winners: string[];
  finalists: string[];
  champion: string;
  third_place?: string;
}

/** Fase em que o vencedor de um confronto é gravado. */
export type Phase = "r16_winners" | "qf_winners" | "sf_winners" | "finalists";

export type Round = "r16" | "qf" | "sf" | "final";

export const ROUND_DEFS: Record<
  Round,
  {
    matches: readonly { match: number; from: readonly [number, number] }[];
    /** Onde o vencedor desta rodada é gravado. */
    winnerPhase: Phase | "champion";
    /** Rodada que alimenta esta. */
    feeder: Round | "r32";
  }
> = {
  r16: { matches: R16_MATCHES, winnerPhase: "qf_winners", feeder: "r32" },
  qf: { matches: QF_MATCHES, winnerPhase: "sf_winners", feeder: "r16" },
  sf: { matches: SF_MATCHES, winnerPhase: "finalists", feeder: "qf" },
  final: { matches: [FINAL_MATCH], winnerPhase: "champion", feeder: "sf" },
};

/** time → letra do grupo, derivado do mapa grupo → [times]. */
export function teamGroupFromGroups(
  groupTeams: Record<string, string[]>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [g, teams] of Object.entries(groupTeams)) {
    for (const t of teams) out[t] = g;
  }
  return out;
}

/** Resolve o time de um slot dos 16 avos (1º/2º do grupo ou 3º alocado). */
export function resolveSlot(
  slot: R32Slot,
  payload: KnockoutTreePayload,
  thirdAlloc: Record<number, string>,
  matchNum: number
): string | null {
  if (slot.pos === 1) return payload.groups[slot.group]?.[0] || null;
  if (slot.pos === 2) return payload.groups[slot.group]?.[1] || null;
  return thirdAlloc[matchNum] || null;
}

/** Vencedor marcado de um jogo dos 16 avos (gravado em r16_winners). */
export function r32Winner(
  matchNum: number,
  payload: KnockoutTreePayload,
  thirdAlloc: Record<number, string>
): string | null {
  const m = R32_MATCHES.find((x) => x.match === matchNum);
  if (!m) return null;
  const cands = [
    resolveSlot(m.home, payload, thirdAlloc, matchNum),
    resolveSlot(m.away, payload, thirdAlloc, matchNum),
  ].filter((t): t is string => Boolean(t));
  return cands.find((t) => payload.r16_winners.includes(t)) ?? null;
}

/** Participantes de um jogo de qualquer rodada pós-16 avos. */
export function participantsOf(
  round: Round,
  from: readonly [number, number],
  payload: KnockoutTreePayload,
  thirdAlloc: Record<number, string>
): [string | null, string | null] {
  const feeder = ROUND_DEFS[round].feeder;
  const winner = (mn: number): string | null => {
    if (feeder === "r32") return r32Winner(mn, payload, thirdAlloc);
    const def = ROUND_DEFS[feeder];
    const m = def.matches.find((x) => x.match === mn);
    if (!m) return null;
    const [a, b] = participantsOf(feeder, m.from, payload, thirdAlloc);
    const cands = [a, b].filter((t): t is string => Boolean(t));
    if (def.winnerPhase === "champion") {
      return cands.find((t) => payload.champion === t) ?? null;
    }
    return cands.find((t) => payload[def.winnerPhase].includes(t)) ?? null;
  };
  return [winner(from[0]), winner(from[1])];
}

/** Alocação determinística dos melhores 3ºs (sem overrides manuais). */
export function autoThirdAlloc(
  payload: KnockoutTreePayload,
  teamGroup: Record<string, string>
): Record<number, string> {
  return computeThirdAlloc(payload.third_qualifiers, teamGroup);
}

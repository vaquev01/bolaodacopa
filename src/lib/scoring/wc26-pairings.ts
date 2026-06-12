/**
 * Chaveamento oficial da Copa 2026 (FIFA, 48 seleções).
 * Fonte: https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage
 * (estrutura divulgada pela FIFA — Annex C), conferido em 2026-06-12.
 *
 * Notação dos slots dos 16 avos:
 *  - { pos: 1, group: "A" }  → 1º colocado do grupo A
 *  - { pos: 2, group: "B" }  → 2º colocado do grupo B
 *  - { pos: 3, groups: [...] } → um dos melhores 3ºs, vindo de um dos grupos listados
 */

export type R32Slot =
  | { pos: 1 | 2; group: string }
  | { pos: 3; groups: string[] };

export interface R32Match {
  match: number; // numeração oficial FIFA (73–88)
  home: R32Slot;
  away: R32Slot;
}

export const R32_MATCHES: R32Match[] = [
  { match: 73, home: { pos: 2, group: "A" }, away: { pos: 2, group: "B" } },
  { match: 74, home: { pos: 1, group: "E" }, away: { pos: 3, groups: ["A", "B", "C", "D", "F"] } },
  { match: 75, home: { pos: 1, group: "F" }, away: { pos: 2, group: "C" } },
  { match: 76, home: { pos: 1, group: "C" }, away: { pos: 2, group: "F" } },
  { match: 77, home: { pos: 1, group: "I" }, away: { pos: 3, groups: ["C", "D", "F", "G", "H"] } },
  { match: 78, home: { pos: 2, group: "E" }, away: { pos: 2, group: "I" } },
  { match: 79, home: { pos: 1, group: "A" }, away: { pos: 3, groups: ["C", "E", "F", "H", "I"] } },
  { match: 80, home: { pos: 1, group: "L" }, away: { pos: 3, groups: ["E", "H", "I", "J", "K"] } },
  { match: 81, home: { pos: 1, group: "D" }, away: { pos: 3, groups: ["B", "E", "F", "I", "J"] } },
  { match: 82, home: { pos: 1, group: "G" }, away: { pos: 3, groups: ["A", "E", "H", "I", "J"] } },
  { match: 83, home: { pos: 2, group: "K" }, away: { pos: 2, group: "L" } },
  { match: 84, home: { pos: 1, group: "H" }, away: { pos: 2, group: "J" } },
  { match: 85, home: { pos: 1, group: "B" }, away: { pos: 3, groups: ["E", "F", "G", "I", "J"] } },
  { match: 86, home: { pos: 1, group: "J" }, away: { pos: 2, group: "H" } },
  { match: 87, home: { pos: 1, group: "K" }, away: { pos: 3, groups: ["D", "E", "I", "J", "L"] } },
  { match: 88, home: { pos: 2, group: "D" }, away: { pos: 2, group: "G" } },
];

/** Oitavas (89–96): cada jogo recebe os vencedores de dois jogos dos 16 avos. */
export const R16_MATCHES = [
  { match: 89, from: [74, 77] },
  { match: 90, from: [73, 75] },
  { match: 91, from: [76, 78] },
  { match: 92, from: [79, 80] },
  { match: 93, from: [83, 84] },
  { match: 94, from: [81, 82] },
  { match: 95, from: [86, 88] },
  { match: 96, from: [85, 87] },
] as const;

/** Quartas (97–100). */
export const QF_MATCHES = [
  { match: 97, from: [89, 90] },
  { match: 98, from: [93, 94] },
  { match: 99, from: [91, 92] },
  { match: 100, from: [95, 96] },
] as const;

/** Semifinais (101–102). */
export const SF_MATCHES = [
  { match: 101, from: [97, 98] },
  { match: 102, from: [99, 100] },
] as const;

/** Final (104) e disputa de 3º (103, entre os perdedores das semis). */
export const FINAL_MATCH = { match: 104, from: [101, 102] } as const;
export const THIRD_PLACE_MATCH = { match: 103, from: [101, 102] } as const;

/** Rótulo humano de um slot ("1º do A", "3º de C/E/F/H/I"). */
export function slotLabel(slot: R32Slot): string {
  if (slot.pos === 3) return `3º de ${slot.groups.join("/")}`;
  return `${slot.pos}º do ${slot.group}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Alocação dos melhores 3ºs nos slots dos 16 avos
// ────────────────────────────────────────────────────────────────────────────

/** Slots de melhor 3º nos 16 avos: [matchNum, grupos elegíveis]. */
export const THIRD_SLOTS: { match: number; groups: string[] }[] = R32_MATCHES.flatMap(
  (m) =>
    [m.home, m.away]
      .filter((s): s is { pos: 3; groups: string[] } => s.pos === 3)
      .map((s) => ({ match: m.match, groups: s.groups }))
);

/**
 * Aloca os melhores 3ºs escolhidos nos slots de 3º dos 16 avos.
 *
 * - `manual` (matchNum → time) tem precedência, desde que o time siga
 *   qualificado e seja elegível para o slot (grupo na lista do slot).
 * - O restante é resolvido por matching bipartido máximo (algoritmo de Kuhn),
 *   que encaixa o máximo de times possível — o guloso simples falha quando um
 *   time elegível para vários slots ocupa cedo o único slot de outro.
 *
 * Determinístico: mesma entrada → mesma alocação.
 */
export function computeThirdAlloc(
  qualifiers: string[],
  teamGroup: Record<string, string>,
  manual: Record<number, string> = {}
): Record<number, string> {
  const alloc: Record<number, string> = {};
  const used = new Set<string>();

  // 1) Overrides manuais válidos
  for (const slot of THIRD_SLOTS) {
    const team = manual[slot.match];
    if (!team || used.has(team)) continue;
    if (!qualifiers.includes(team)) continue;
    const g = teamGroup[team];
    if (!g || !slot.groups.includes(g)) continue;
    alloc[slot.match] = team;
    used.add(team);
  }

  // 2) Matching bipartido máximo nos slots/times restantes
  const freeSlots = THIRD_SLOTS.filter((s) => !alloc[s.match]);
  const freeTeams = qualifiers.filter((t) => !used.has(t));
  const slotAssign: (string | null)[] = freeSlots.map(() => null);

  function eligible(team: string, slotIdx: number): boolean {
    const g = teamGroup[team];
    return Boolean(g && freeSlots[slotIdx].groups.includes(g));
  }

  function tryAssign(team: string, visited: Set<number>): boolean {
    for (let i = 0; i < freeSlots.length; i++) {
      if (visited.has(i) || !eligible(team, i)) continue;
      visited.add(i);
      const current = slotAssign[i];
      if (current === null || tryAssign(current, visited)) {
        slotAssign[i] = team;
        return true;
      }
    }
    return false;
  }

  for (const t of freeTeams) tryAssign(t, new Set());

  freeSlots.forEach((s, i) => {
    if (slotAssign[i]) alloc[s.match] = slotAssign[i]!;
  });

  return alloc;
}

// ────────────────────────────────────────────────────────────────────────────
// Mapeamento nº FIFA → jogo do banco
// ────────────────────────────────────────────────────────────────────────────

/** Primeiro nº FIFA de cada fase do mata-mata. */
export const KO_STAGE_FIRST_MATCH: Record<string, number> = {
  r32: 73,
  r16: 89,
  qf: 97,
  sf: 101,
  third: 103,
  final: 104,
};

/** Fase de um nº FIFA do mata-mata (73–104). */
export function stageOfFifaNumber(
  n: number
): "r32" | "r16" | "qf" | "sf" | "third" | "final" | null {
  if (n >= 73 && n <= 88) return "r32";
  if (n >= 89 && n <= 96) return "r16";
  if (n >= 97 && n <= 100) return "qf";
  if (n === 101 || n === 102) return "sf";
  if (n === 103) return "third";
  if (n === 104) return "final";
  return null;
}

/**
 * Mapeia jogos do banco para o nº oficial FIFA (73–104).
 * Premissa: a FIFA numera cronologicamente dentro de cada fase (vale para o
 * calendário oficial 2026). Empate de kickoff desempata por id (determinístico).
 */
export function mapKnockoutByFifaNumber<
  M extends { id: string; stage: string; kickoff_at: string }
>(matches: M[]): Record<number, M> {
  const out: Record<number, M> = {};
  for (const [stage, base] of Object.entries(KO_STAGE_FIRST_MATCH)) {
    const ms = matches
      .filter((m) => m.stage === stage)
      .sort((a, b) =>
        a.kickoff_at < b.kickoff_at
          ? -1
          : a.kickoff_at > b.kickoff_at
            ? 1
            : a.id.localeCompare(b.id)
      );
    ms.forEach((m, i) => {
      out[base + i] = m;
    });
  }
  return out;
}

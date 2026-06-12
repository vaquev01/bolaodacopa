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

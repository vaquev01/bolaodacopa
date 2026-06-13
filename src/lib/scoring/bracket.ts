/**
 * bracket.ts — Pontuação de bracket pré-Copa (advance predictions).
 *
 * Funções puras, zero I/O.
 * deriveBracketOutcome: deriva o estado real do torneio a partir dos matches.
 * scoreBracket:         pontua o payload do participante contra o outcome real.
 */

// ────────────────────────────────────────────────────────────────────────────
// Types públicos
// ────────────────────────────────────────────────────────────────────────────

export interface BracketPoints {
  group_qualified: number;   // por seleção corretamente nos 32 classificados
  group_position_exact: number; // bônus por posição exata no grupo (1º/2º)
  r16: number;               // por seleção presente nas oitavas
  qf: number;                // quartas
  sf: number;                // semis
  final: number;             // finalista
  fourth_place: number;      // 4º lugar exato
  third_place: number;       // 3º lugar exato
  runner_up: number;         // vice exato
  champion: number;          // campeão exato
}

export const DEFAULT_BRACKET_POINTS: BracketPoints = {
  group_qualified: 2,
  group_position_exact: 1,
  r16: 2,
  qf: 3,
  sf: 5,
  final: 8,
  fourth_place: 4,
  third_place: 8,
  runner_up: 10,
  champion: 25,
};

/** Estado derivado do torneio real (apenas fases resolvidas — fases em andamento = vazias). */
export interface BracketOutcome {
  /** Mapa de código do grupo → { first, second, third } — só grupos totalmente disputados. */
  groups: Record<string, { first: string; second: string; third?: string }>;
  /** Times classificados (apareceram como 1º ou 2º de grupo, ou como melhores 3ºs). */
  qualified: string[];
  r32_teams: string[];
  r16_teams: string[];
  qf_teams: string[];
  sf_teams: string[];
  finalists: string[];
  champion: string | null;
  runner_up: string | null;
  third_place: string | null;
  fourth_place: string | null;
}

/** Payload enviado pelo participante. */
export interface BracketPayload {
  /** { A: ["BRA", "ARG"], B: [...], ... } — posição [0]=1º, [1]=2º */
  groups: Record<string, string[]>;
  /** 8 melhores 3ºs */
  third_qualifiers: string[];
  /** Vencedores dos 32-avos (r32) */
  r32_winners: string[];
  /** Vencedores dos 16-avos (r16) */
  r16_winners: string[];
  /** Vencedores das quartas */
  qf_winners: string[];
  /** Vencedores das semis */
  sf_winners: string[];
  /** Dois finalistas */
  finalists: string[];
  /** Campeão */
  champion: string;
  /** 3º lugar */
  third_place: string;
}

export interface BracketScoreResult {
  points: number;
  /** Chave por fase/time, ex: group_A_BRA, r16_BRA, champion, runner_up, etc. + total. */
  breakdown: Record<string, number>;
}

// ────────────────────────────────────────────────────────────────────────────
// Match shape esperado
// ────────────────────────────────────────────────────────────────────────────

type Stage = "group" | "r32" | "r16" | "qf" | "sf" | "third" | "final";
type MatchStatus = "scheduled" | "live" | "finished" | "suspended";

export interface BracketMatchInput {
  id: string;
  stage: Stage;
  home_team: string;
  away_team: string;
  score_home_90: number | null;
  score_away_90: number | null;
  /** Placar após prorrogação (full time, sem pênaltis). Decide quem avança no KO. */
  score_home_ft?: number | null;
  score_away_ft?: number | null;
  /** Nome do time vencedor nos pênaltis (quando houve disputa). */
  penalty_winner?: string | null;
  status: MatchStatus;
  /** Só para matches de grupo — código do grupo (A–L). */
  group_code?: string;
}

/**
 * Quem AVANÇA num confronto de mata-mata. Ordem de decisão:
 *   1. pênaltis (penalty_winner) — empate em 90+prorrogação
 *   2. placar após prorrogação (score_ft) — vence quem fez mais gols somando o ET
 *   3. placar de 90min — fallback quando não há ft (jogo decidido no tempo normal)
 * Retorna null se o confronto está empatado sem critério de desempate (dado
 * incompleto) — nesse caso a fase fica "não resolvida" e não pontua, em vez de
 * silenciosamente perder o vencedor.
 */
function knockoutWinner(m: BracketMatchInput): string | null {
  if (m.penalty_winner) return m.penalty_winner;
  const h = m.score_home_ft ?? m.score_home_90;
  const a = m.score_away_ft ?? m.score_away_90;
  if (h == null || a == null) return null;
  if (h > a) return m.home_team;
  if (a > h) return m.away_team;
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// deriveBracketOutcome
// ────────────────────────────────────────────────────────────────────────────

/**
 * Deriva o estado real do torneio a partir dos matches.
 * Apenas matches com status='finished' e scores não-nulos são considerados.
 * Fases não resolvidas retornam arrays vazios.
 */
export function deriveBracketOutcome(
  matches: BracketMatchInput[]
): BracketOutcome {
  const outcome: BracketOutcome = {
    groups: {},
    qualified: [],
    r32_teams: [],
    r16_teams: [],
    qf_teams: [],
    sf_teams: [],
    finalists: [],
    champion: null,
    runner_up: null,
    third_place: null,
    fourth_place: null,
  };

  const finished = matches.filter(
    (m) =>
      m.status === "finished" &&
      m.score_home_90 !== null &&
      m.score_away_90 !== null
  );

  // ── Fase de grupos ────────────────────────────────────────────────────────
  const groupMatches = finished.filter((m) => m.stage === "group" && m.group_code);

  // Agrupar por group_code
  const byGroup = new Map<string, BracketMatchInput[]>();
  for (const m of groupMatches) {
    const g = m.group_code!;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(m);
  }

  for (const [groupCode, gMatches] of byGroup.entries()) {
    // Um grupo com 4 times tem 6 jogos
    const teams = new Set<string>();
    for (const m of gMatches) {
      teams.add(m.home_team);
      teams.add(m.away_team);
    }

    if (teams.size < 2) continue;

    // Calcular pontos de cada time: 3 por vitória, 1 por empate
    const stats = new Map<string, { pts: number; gf: number; ga: number }>();
    for (const t of teams) stats.set(t, { pts: 0, gf: 0, ga: 0 });

    for (const m of gMatches) {
      const h = m.score_home_90!;
      const a = m.score_away_90!;
      const homeStats = stats.get(m.home_team)!;
      const awayStats = stats.get(m.away_team)!;

      homeStats.gf += h;
      homeStats.ga += a;
      awayStats.gf += a;
      awayStats.ga += h;

      if (h > a) {
        homeStats.pts += 3;
      } else if (h < a) {
        awayStats.pts += 3;
      } else {
        homeStats.pts += 1;
        awayStats.pts += 1;
      }
    }

    // Ordenar: pontos desc → saldo desc → gols marcados desc → nome (estável)
    const sorted = Array.from(teams).sort((a, b) => {
      const sa = stats.get(a)!;
      const sb = stats.get(b)!;
      if (sb.pts !== sa.pts) return sb.pts - sa.pts;
      const diffA = sa.gf - sa.ga;
      const diffB = sb.gf - sb.ga;
      if (diffB !== diffA) return diffB - diffA;
      if (sb.gf !== sa.gf) return sb.gf - sa.gf;
      return a.localeCompare(b, "pt-BR");
    });

    // Precisamos de pelo menos 2 classificados
    if (sorted.length < 2) continue;

    const first = sorted[0];
    const second = sorted[1];
    outcome.groups[groupCode] = { first, second, third: sorted[2] };

    // Adicionar aos qualificados
    if (!outcome.qualified.includes(first)) outcome.qualified.push(first);
    if (!outcome.qualified.includes(second)) outcome.qualified.push(second);
  }

  // ── Fases mata-mata ───────────────────────────────────────────────────────

  // Extrai vencedores de uma fase (resolve prorrogação e pênaltis)
  function extractWinners(stage: Stage): string[] {
    const winners: string[] = [];
    const stageMatches = finished.filter((m) => m.stage === stage);
    for (const m of stageMatches) {
      const w = knockoutWinner(m);
      if (w) winners.push(w);
    }
    return winners;
  }

  // r32 — 32-avos (Copa 2026 tem esta fase)
  const r32Winners = extractWinners("r32");
  // Participantes contam assim que o confronto está DEFINIDO (chaveamento
  // divulgado), mesmo antes de ser jogado — "A definir" é placeholder do seed.
  const r32Participants: string[] = [];
  for (const m of matches.filter((m) => m.stage === "r32")) {
    for (const t of [m.home_team, m.away_team]) {
      if (t && t !== "A definir" && !r32Participants.includes(t)) r32Participants.push(t);
    }
  }
  outcome.r32_teams = r32Participants;

  // Melhores 3ºs: quando o chaveamento real dos 16 avos existe, todo time que
  // aparece nele e não era 1º/2º de grupo é um 3º que avançou — fonte oficial,
  // sem reimplementar os critérios de desempate da FIFA.
  for (const team of r32Participants) {
    if (!outcome.qualified.includes(team)) outcome.qualified.push(team);
  }

  // r16 — todos os times que participaram das oitavas (vencedores + perdedores)
  const r16Participants: string[] = [];
  for (const m of finished.filter((m) => m.stage === "r16")) {
    if (!r16Participants.includes(m.home_team)) r16Participants.push(m.home_team);
    if (!r16Participants.includes(m.away_team)) r16Participants.push(m.away_team);
  }
  outcome.r16_teams = r16Participants;

  // qf
  const qfParticipants: string[] = [];
  for (const m of finished.filter((m) => m.stage === "qf")) {
    if (!qfParticipants.includes(m.home_team)) qfParticipants.push(m.home_team);
    if (!qfParticipants.includes(m.away_team)) qfParticipants.push(m.away_team);
  }
  outcome.qf_teams = qfParticipants;

  // sf
  const sfParticipants: string[] = [];
  for (const m of finished.filter((m) => m.stage === "sf")) {
    if (!sfParticipants.includes(m.home_team)) sfParticipants.push(m.home_team);
    if (!sfParticipants.includes(m.away_team)) sfParticipants.push(m.away_team);
  }
  outcome.sf_teams = sfParticipants;

  // Final (resolve prorrogação e pênaltis)
  const finalMatches = finished.filter((m) => m.stage === "final");
  for (const m of finalMatches) {
    const participants = [m.home_team, m.away_team];
    outcome.finalists = [...new Set([...outcome.finalists, ...participants])];
    const champ = knockoutWinner(m);
    if (champ) {
      outcome.champion = champ;
      outcome.runner_up = champ === m.home_team ? m.away_team : m.home_team;
    }
  }

  // 3º lugar (resolve prorrogação e pênaltis)
  const thirdMatches = finished.filter((m) => m.stage === "third");
  for (const m of thirdMatches) {
    const third = knockoutWinner(m);
    if (third) {
      outcome.third_place = third;
      outcome.fourth_place = third === m.home_team ? m.away_team : m.home_team;
    }
  }

  return outcome;
}

// ────────────────────────────────────────────────────────────────────────────
// scoreBracket
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pontua o payload do participante contra o outcome real do torneio.
 *
 * Regras:
 * - Pontua por "seleção presente na fase" (não por confronto exato)
 * - Cumulativo: campeão pontua em todas as fases que atravessou
 * - Fases não resolvidas no outcome (arrays vazios / nulls) = zero pontos nessa fase
 * - Pontos = 0 para aquela linha desliga a pontuação
 * - Bracket parcial (payload com fase vazia) = zero nessa fase
 */
export function scoreBracket(
  points: BracketPoints,
  payload: BracketPayload,
  outcome: BracketOutcome
): BracketScoreResult {
  const breakdown: Record<string, number> = {};
  let total = 0;

  function add(key: string, pts: number) {
    if (pts <= 0) return;
    breakdown[key] = (breakdown[key] ?? 0) + pts;
    total += pts;
  }

  // ── Grupos ────────────────────────────────────────────────────────────────
  // payload.groups: { A: ["BRA", "ARG"], ... } posição [0]=1º, [1]=2º
  for (const [groupCode, picks] of Object.entries(payload.groups)) {
    const actual = outcome.groups[groupCode];
    if (!actual) continue; // grupo não resolvido = sem pontos

    for (let pos = 0; pos < picks.length && pos < 2; pos++) {
      const team = picks[pos];
      if (!team) continue;

      const qualifiedSet = outcome.qualified;
      if (!qualifiedSet.includes(team)) continue;

      // group_qualified: time está entre os 32 classificados
      if (points.group_qualified > 0) {
        add(`group_${groupCode}_${team}`, points.group_qualified);
      }

      // group_position_exact: bônus por posição exata (1º ou 2º)
      if (points.group_position_exact > 0) {
        const actualTeamAtPos = pos === 0 ? actual.first : actual.second;
        if (actualTeamAtPos === team) {
          add(`group_${groupCode}_${team}`, points.group_position_exact);
        }
      }
    }
  }

  // ── Melhores 3ºs ──────────────────────────────────────────────────────────
  // Cada 3º escolhido que realmente avançou vale group_qualified pts.
  // Guard anti-dupla-contagem: se o time também foi marcado como 1º/2º de
  // algum grupo (payload inconsistente), só a marcação de grupo pontua.
  if (points.group_qualified > 0 && payload.third_qualifiers.length > 0) {
    const pickedTop2 = new Set(
      Object.values(payload.groups).flatMap((p) => p.slice(0, 2).filter(Boolean))
    );
    for (const team of payload.third_qualifiers) {
      if (!team || pickedTop2.has(team)) continue;
      if (outcome.qualified.includes(team)) {
        add(`third_q_${team}`, points.group_qualified);
      }
    }
  }

  // ── r32 ───────────────────────────────────────────────────────────────────
  if (outcome.r32_teams.length > 0 && points.r16 > 0) {
    // r32 não tem linha de pontuação própria na spec — não pontuado separadamente
    // (só r16, qf, sf, final são fases com pontuação)
  }

  // ── r16 ───────────────────────────────────────────────────────────────────
  if (outcome.r16_teams.length > 0 && points.r16 > 0) {
    for (const team of payload.r16_winners) {
      if (!team) continue;
      if (outcome.r16_teams.includes(team)) {
        add(`r16_${team}`, points.r16);
      }
    }
  }

  // ── qf ────────────────────────────────────────────────────────────────────
  if (outcome.qf_teams.length > 0 && points.qf > 0) {
    for (const team of payload.qf_winners) {
      if (!team) continue;
      if (outcome.qf_teams.includes(team)) {
        add(`qf_${team}`, points.qf);
      }
    }
  }

  // ── sf ────────────────────────────────────────────────────────────────────
  if (outcome.sf_teams.length > 0 && points.sf > 0) {
    for (const team of payload.sf_winners) {
      if (!team) continue;
      if (outcome.sf_teams.includes(team)) {
        add(`sf_${team}`, points.sf);
      }
    }
  }

  // ── finalists ─────────────────────────────────────────────────────────────
  if (outcome.finalists.length > 0 && points.final > 0) {
    for (const team of payload.finalists) {
      if (!team) continue;
      if (outcome.finalists.includes(team)) {
        add(`final_${team}`, points.final);
      }
    }
  }

  // ── champion ──────────────────────────────────────────────────────────────
  if (outcome.champion !== null && payload.champion && points.champion > 0) {
    if (norm(payload.champion) === norm(outcome.champion)) {
      add("champion", points.champion);
    }
  }

  // ── runner_up ─────────────────────────────────────────────────────────────
  // runner_up: qualquer finalista no payload que bate com outcome.runner_up
  if (outcome.runner_up !== null && payload.finalists.length > 0 && points.runner_up > 0) {
    const acertouRunnerUp = payload.finalists.some(
      (t) => t && norm(t) === norm(outcome.runner_up!)
    );
    if (acertouRunnerUp) {
      add("runner_up", points.runner_up);
    }
  }

  // ── third_place ───────────────────────────────────────────────────────────
  if (outcome.third_place !== null && payload.third_place && points.third_place > 0) {
    if (norm(payload.third_place) === norm(outcome.third_place)) {
      add("third_place", points.third_place);
    }
  }

  // ── fourth_place ──────────────────────────────────────────────────────────
  // Inferido: quem jogou o 3º lugar e não é o third_place
  if (outcome.fourth_place !== null && payload.third_place && points.fourth_place > 0) {
    // Se o participante acertou o jogo do 3º lugar (os dois finalistas perdedores),
    // podemos derivar o 4º. Mas o payload não tem campo fourth_place explícito —
    // na spec, o 3º lugar é palpite separado; 4º é o oponente no mesmo jogo.
    // Para MVP: não pontuamos fourth_place via payload (não há campo explícito).
  }

  breakdown.total = total;
  return { points: total, breakdown };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.trim().toLocaleLowerCase("pt-BR");
}

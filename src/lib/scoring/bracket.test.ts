import { describe, it, expect } from "vitest";
import {
  deriveBracketOutcome,
  scoreBracket,
  type BracketOutcome,
  type BracketPayload,
  type BracketPoints,
} from "./bracket";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const DEFAULT_POINTS: BracketPoints = {
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

const ZERO_POINTS: BracketPoints = {
  group_qualified: 0,
  group_position_exact: 0,
  r16: 0,
  qf: 0,
  sf: 0,
  final: 0,
  fourth_place: 0,
  third_place: 0,
  runner_up: 0,
  champion: 0,
};

type MatchInput = Parameters<typeof deriveBracketOutcome>[0][number];

function makeGroupMatch(home: string, away: string, group: string, homeScore = 1, awayScore = 0): MatchInput {
  return {
    id: `${home}-${away}`,
    stage: "group" as const,
    home_team: home,
    away_team: away,
    score_home_90: homeScore,
    score_away_90: awayScore,
    status: "finished" as const,
    group_code: group,
  };
}

function makeKOMatch(
  stage: "r32" | "r16" | "qf" | "sf",
  home: string,
  away: string,
  winner: string
): MatchInput {
  const homeWins = winner === home;
  return {
    id: `${stage}-${home}-${away}`,
    stage,
    home_team: home,
    away_team: away,
    score_home_90: homeWins ? 2 : 0,
    score_away_90: homeWins ? 0 : 2,
    status: "finished" as const,
  };
}

function makeThirdMatch(home: string, away: string, winner: string): MatchInput {
  const homeWins = winner === home;
  return {
    id: "third-place",
    stage: "third" as const,
    home_team: home,
    away_team: away,
    score_home_90: homeWins ? 1 : 0,
    score_away_90: homeWins ? 0 : 1,
    status: "finished" as const,
  };
}

function makeFinalMatch(home: string, away: string, winner: string): MatchInput {
  const homeWins = winner === home;
  return {
    id: "final",
    stage: "final" as const,
    home_team: home,
    away_team: away,
    score_home_90: homeWins ? 1 : 0,
    score_away_90: homeWins ? 0 : 1,
    status: "finished" as const,
  };
}

// ────────────────────────────────────────────────────────────
// SUITE: deriveBracketOutcome
// ────────────────────────────────────────────────────────────

describe("deriveBracketOutcome — grupos", () => {
  it("deriva classificados de grupos: 1º e 2º por grupo, ordenados por pontos/gols", () => {
    // Grupo A: BRA vence MEX; ARG vence CAN — BRA 3pts, ARG 3pts, MEX 0pts, CAN 0pts
    // desempate pelo total de gols: BRA(1-0) + ARG(1-0) → ordem arbitrária dentro dos empatados
    // mas na nossa implementação: quem jogou mais wins fica 1º
    const matches: MatchInput[] = [
      makeGroupMatch("BRA", "MEX", "A", 1, 0),
      makeGroupMatch("ARG", "CAN", "A", 1, 0),
      // rodada 2
      makeGroupMatch("BRA", "CAN", "A", 2, 0),
      makeGroupMatch("ARG", "MEX", "A", 1, 0),
      // rodada 3
      makeGroupMatch("BRA", "ARG", "A", 0, 0),
      makeGroupMatch("MEX", "CAN", "A", 1, 0),
    ];
    const outcome = deriveBracketOutcome(matches);
    // BRA: 2W+1D=7pts, ARG: 2W+1D=7pts, MEX: 1W+2L=3pts, CAN: 0W=0pts
    // Top-2: BRA e ARG (desempate por gols: BRA 3+2+0=5gols, ARG 1+1+0=2gols → BRA 1º)
    expect(outcome.groups["A"]).toBeDefined();
    expect(outcome.groups["A"]?.first).toBe("BRA");
    expect(outcome.groups["A"]?.second).toBe("ARG");
    expect(outcome.qualified).toContain("BRA");
    expect(outcome.qualified).toContain("ARG");
  });

  it("deriveBracketOutcome retorna grupos vazios para matches que não têm status=finished", () => {
    const matches: MatchInput[] = [
      { id: "1", stage: "group" as const, home_team: "BRA", away_team: "MEX",
        score_home_90: null, score_away_90: null, status: "scheduled" as const, group_code: "A" },
    ];
    const outcome = deriveBracketOutcome(matches);
    expect(outcome.groups["A"]).toBeUndefined();
    expect(outcome.qualified).toHaveLength(0);
  });
});

describe("deriveBracketOutcome — fases mata-mata", () => {
  it("deriva r16_teams, qf_teams, sf_teams, finalists, champion, runner_up, third_place, fourth_place de matches completos", () => {
    const matches: MatchInput[] = [
      // R16
      makeKOMatch("r16", "BRA", "ARG", "BRA"),
      makeKOMatch("r16", "FRA", "ESP", "FRA"),
      makeKOMatch("r16", "POR", "ITA", "POR"),
      makeKOMatch("r16", "ALE", "ING", "ALE"),
      // QF
      makeKOMatch("qf", "BRA", "FRA", "BRA"),
      makeKOMatch("qf", "POR", "ALE", "POR"),
      // SF
      makeKOMatch("sf", "BRA", "POR", "BRA"),
      makeKOMatch("sf", "FRA", "ALE", "FRA"),
      // 3º lugar
      makeThirdMatch("POR", "ALE", "POR"),
      // Final
      makeFinalMatch("BRA", "FRA", "BRA"),
    ];

    const outcome = deriveBracketOutcome(matches);

    expect(outcome.r16_teams).toContain("BRA");
    expect(outcome.r16_teams).toContain("FRA");
    expect(outcome.qf_teams).toContain("BRA");
    expect(outcome.qf_teams).toContain("FRA");
    expect(outcome.sf_teams).toContain("BRA");
    expect(outcome.sf_teams).toContain("FRA");
    expect(outcome.finalists).toContain("BRA");
    expect(outcome.finalists).toContain("FRA");
    expect(outcome.champion).toBe("BRA");
    expect(outcome.runner_up).toBe("FRA");
    expect(outcome.third_place).toBe("POR");
    expect(outcome.fourth_place).toBe("ALE");
  });

  it("r32 presente se existir no schema", () => {
    const matches: MatchInput[] = [
      makeKOMatch("r32", "BRA", "MEX", "BRA"),
    ];
    const outcome = deriveBracketOutcome(matches);
    expect(outcome.r32_teams).toContain("BRA");
  });

  it("fases não resolvidas ficam vazias (Copa em andamento)", () => {
    const matches: MatchInput[] = [
      makeKOMatch("r16", "BRA", "ARG", "BRA"),
      // QF em andamento — sem resultado
      { id: "qf-1", stage: "qf" as const, home_team: "BRA", away_team: "FRA",
        score_home_90: null, score_away_90: null, status: "scheduled" as const },
    ];
    const outcome = deriveBracketOutcome(matches);
    expect(outcome.r16_teams).toContain("BRA");
    expect(outcome.qf_teams).toHaveLength(0); // não resolvida
    expect(outcome.champion).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// SUITE: scoreBracket
// ────────────────────────────────────────────────────────────

describe("scoreBracket — bracket perfeito", () => {
  it("pontua group_qualified + position_exact para cada time correto", () => {
    const outcome: BracketOutcome = {
      groups: { A: { first: "BRA", second: "ARG" }, B: { first: "FRA", second: "ESP" } },
      qualified: ["BRA", "ARG", "FRA", "ESP"],
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

    const payload: BracketPayload = {
      groups: { A: ["BRA", "ARG"], B: ["FRA", "ESP"] }, // perfeito
      third_qualifiers: [],
      r32_winners: [],
      r16_winners: [],
      qf_winners: [],
      sf_winners: [],
      finalists: [],
      champion: "",
      third_place: "",
    };

    const result = scoreBracket(DEFAULT_POINTS, payload, outcome);
    // 4 times × 2 pts + 4 bônus posição × 1 pt = 12 pts
    expect(result.points).toBe(12);
    expect(result.breakdown["group_A_BRA"]).toBe(3); // 2+1
    expect(result.breakdown["group_A_ARG"]).toBe(3); // 2+1
    expect(result.breakdown["group_B_FRA"]).toBe(3); // 2+1
    expect(result.breakdown["group_B_ESP"]).toBe(3); // 2+1
  });

  it("pontua group_qualified sem bônus se posição está errada", () => {
    const outcome: BracketOutcome = {
      groups: { A: { first: "BRA", second: "ARG" } },
      qualified: ["BRA", "ARG"],
      r32_teams: [], r16_teams: [], qf_teams: [], sf_teams: [],
      finalists: [], champion: null, runner_up: null, third_place: null, fourth_place: null,
    };

    // Invertido: ARG como 1º, BRA como 2º — acertou os times mas errou a posição
    const payload: BracketPayload = {
      groups: { A: ["ARG", "BRA"] },
      third_qualifiers: [], r32_winners: [], r16_winners: [],
      qf_winners: [], sf_winners: [], finalists: [], champion: "", third_place: "",
    };

    const result = scoreBracket(DEFAULT_POINTS, payload, outcome);
    // 2 times × 2 pts (group_qualified) + 0 bônus (posição errada) = 4 pts
    expect(result.points).toBe(4);
    expect(result.breakdown["group_A_ARG"]).toBe(2);
    expect(result.breakdown["group_A_BRA"]).toBe(2);
  });

  it("pontua fases mata-mata por seleção presente (não por confronto)", () => {
    const outcome: BracketOutcome = {
      groups: {},
      qualified: [],
      r32_teams: [],
      r16_teams: ["BRA", "FRA"],
      qf_teams: ["BRA"],
      sf_teams: ["BRA"],
      finalists: ["BRA", "FRA"],
      champion: "BRA",
      runner_up: "FRA",
      third_place: "POR",
      fourth_place: "ALE",
    };

    const payload: BracketPayload = {
      groups: {},
      third_qualifiers: [],
      r32_winners: [],
      r16_winners: ["BRA", "FRA"],
      qf_winners: ["BRA"],
      sf_winners: ["BRA"],
      finalists: ["BRA", "FRA"],
      champion: "BRA",
      third_place: "POR",
    };

    const result = scoreBracket(DEFAULT_POINTS, payload, outcome);

    // BRA: r16(2) + qf(3) + sf(5) + final(8) + champion(25) = 43
    // FRA: r16(2) + final(8) + runner_up(10) = 20
    // POR: third_place(8) = 8
    // Total = 71
    expect(result.points).toBe(71);

    expect(result.breakdown["r16_BRA"]).toBe(2);
    expect(result.breakdown["r16_FRA"]).toBe(2);
    expect(result.breakdown["qf_BRA"]).toBe(3);
    expect(result.breakdown["sf_BRA"]).toBe(5);
    expect(result.breakdown["final_BRA"]).toBe(8);
    expect(result.breakdown["final_FRA"]).toBe(8);
    expect(result.breakdown["champion"]).toBe(25);
    expect(result.breakdown["runner_up"]).toBe(10);
    expect(result.breakdown["third_place"]).toBe(8);
  });
});

describe("scoreBracket — cumulatividade do campeão", () => {
  it("campeão correto pontua em todas as fases que atravessou (cumulativo)", () => {
    const outcome: BracketOutcome = {
      groups: { A: { first: "BRA", second: "ARG" } },
      qualified: ["BRA", "ARG"],
      r32_teams: [],
      r16_teams: ["BRA"],
      qf_teams: ["BRA"],
      sf_teams: ["BRA"],
      finalists: ["BRA", "ARG"],
      champion: "BRA",
      runner_up: "ARG",
      third_place: null,
      fourth_place: null,
    };

    const payload: BracketPayload = {
      groups: { A: ["BRA", "ARG"] },
      third_qualifiers: [],
      r32_winners: [],
      r16_winners: ["BRA"],
      qf_winners: ["BRA"],
      sf_winners: ["BRA"],
      finalists: ["BRA", "ARG"],
      champion: "BRA",
      third_place: "",
    };

    const result = scoreBracket(DEFAULT_POINTS, payload, outcome);

    // BRA: group_qual(2)+pos_exact(1)+r16(2)+qf(3)+sf(5)+final(8)+champion(25) = 46
    // ARG: group_qual(2)+pos_exact(1)+final(8)+runner_up(10) = 21
    // Total = 67
    expect(result.points).toBe(67);
    expect(result.breakdown["champion"]).toBe(25);
    expect(result.breakdown["runner_up"]).toBe(10);
  });
});

describe("scoreBracket — bracket parcial e errado", () => {
  it("bracket parcial: fases vazias = zero pontos nessas fases", () => {
    const outcome: BracketOutcome = {
      groups: { A: { first: "BRA", second: "ARG" } },
      qualified: ["BRA", "ARG"],
      r32_teams: [], r16_teams: ["BRA"], qf_teams: [], sf_teams: [],
      finalists: [], champion: null, runner_up: null, third_place: null, fourth_place: null,
    };

    // Payload preencheu apenas grupos — KO vazio
    const payload: BracketPayload = {
      groups: { A: ["BRA", "ARG"] },
      third_qualifiers: [], r32_winners: [], r16_winners: [], // vazio!
      qf_winners: [], sf_winners: [], finalists: [], champion: "", third_place: "",
    };

    const result = scoreBracket(DEFAULT_POINTS, payload, outcome);
    // Só 4 pts de grupos (posição certa)
    // r16 vazio = sem pontos de mata-mata
    expect(result.breakdown["r16_BRA"]).toBeUndefined();
    expect(result.points).toBe(6); // 2*2 + 2*1
  });

  it("bracket errado: time errado não pontua", () => {
    const outcome: BracketOutcome = {
      groups: {},
      qualified: [],
      r32_teams: [], r16_teams: ["BRA", "FRA"], qf_teams: [], sf_teams: [],
      finalists: [], champion: null, runner_up: null, third_place: null, fourth_place: null,
    };

    const payload: BracketPayload = {
      groups: {},
      third_qualifiers: [], r32_winners: [],
      r16_winners: ["ESP", "ITA"], // errou tudo
      qf_winners: [], sf_winners: [], finalists: [], champion: "", third_place: "",
    };

    const result = scoreBracket(DEFAULT_POINTS, payload, outcome);
    expect(result.points).toBe(0);
  });

  it("campeão errado = 0 pontos no champion", () => {
    const outcome: BracketOutcome = {
      groups: {}, qualified: [], r32_teams: [], r16_teams: [], qf_teams: [], sf_teams: [],
      finalists: ["BRA", "FRA"], champion: "BRA", runner_up: "FRA",
      third_place: null, fourth_place: null,
    };

    const payload: BracketPayload = {
      groups: {},
      third_qualifiers: [], r32_winners: [], r16_winners: [], qf_winners: [], sf_winners: [],
      finalists: ["BRA", "FRA"],
      champion: "ARG", // errou
      third_place: "",
    };

    const result = scoreBracket(DEFAULT_POINTS, payload, outcome);
    expect(result.breakdown["champion"]).toBeUndefined();
    // finalistas corretos: final_BRA(8) + final_FRA(8) + runner_up(10) = 26
    expect(result.points).toBe(26);
  });
});

describe("scoreBracket — Copa em andamento (outcome parcial)", () => {
  it("pontua apenas fases resolvidas, ignora fases sem resultado", () => {
    // Apenas grupos resolvidos, mata-mata ainda não começou
    const outcome: BracketOutcome = {
      groups: { A: { first: "BRA", second: "ARG" } },
      qualified: ["BRA", "ARG"],
      r32_teams: [], r16_teams: [], qf_teams: [], sf_teams: [],
      finalists: [], champion: null, runner_up: null, third_place: null, fourth_place: null,
    };

    const payload: BracketPayload = {
      groups: { A: ["BRA", "ARG"] },
      third_qualifiers: [],
      r32_winners: [],
      r16_winners: ["BRA", "ARG"],
      qf_winners: ["BRA"],
      sf_winners: ["BRA"],
      finalists: ["BRA", "ARG"],
      champion: "BRA",
      third_place: "ARG",
    };

    const result = scoreBracket(DEFAULT_POINTS, payload, outcome);
    // Outcome não tem r16 resolvido → não pontua r16 mesmo que payload tenha
    expect(result.breakdown["r16_BRA"]).toBeUndefined();
    expect(result.points).toBe(6); // só grupos: 2*2 + 2*1
  });
});

describe("scoreBracket — pontos zerados desligam linha", () => {
  it("group_qualified=0 não gera pontos por grupos", () => {
    const outcome: BracketOutcome = {
      groups: { A: { first: "BRA", second: "ARG" } },
      qualified: ["BRA", "ARG"],
      r32_teams: [], r16_teams: [], qf_teams: [], sf_teams: [],
      finalists: [], champion: null, runner_up: null, third_place: null, fourth_place: null,
    };

    const payload: BracketPayload = {
      groups: { A: ["BRA", "ARG"] },
      third_qualifiers: [], r32_winners: [], r16_winners: [],
      qf_winners: [], sf_winners: [], finalists: [], champion: "", third_place: "",
    };

    const points = { ...DEFAULT_POINTS, group_qualified: 0, group_position_exact: 0 };
    const result = scoreBracket(points, payload, outcome);
    expect(result.points).toBe(0);
  });

  it("champion=0 não gera pontos pelo campeão mesmo acertando", () => {
    const outcome: BracketOutcome = {
      groups: {}, qualified: [],
      r32_teams: [], r16_teams: [], qf_teams: [], sf_teams: [],
      finalists: [], champion: "BRA", runner_up: null, third_place: null, fourth_place: null,
    };

    const payload: BracketPayload = {
      groups: {},
      third_qualifiers: [], r32_winners: [], r16_winners: [],
      qf_winners: [], sf_winners: [], finalists: [], champion: "BRA", third_place: "",
    };

    const points = { ...DEFAULT_POINTS, champion: 0 };
    const result = scoreBracket(points, payload, outcome);
    expect(result.breakdown["champion"]).toBeUndefined();
    expect(result.points).toBe(0);
  });
});

describe("scoreBracket — breakdown auditável", () => {
  it("breakdown contém chave por fase/time e total", () => {
    const outcome: BracketOutcome = {
      groups: {}, qualified: [],
      r32_teams: [],
      r16_teams: ["BRA"],
      qf_teams: [], sf_teams: [], finalists: [], champion: null,
      runner_up: null, third_place: null, fourth_place: null,
    };

    const payload: BracketPayload = {
      groups: {},
      third_qualifiers: [], r32_winners: [],
      r16_winners: ["BRA"],
      qf_winners: [], sf_winners: [], finalists: [], champion: "", third_place: "",
    };

    const result = scoreBracket(DEFAULT_POINTS, payload, outcome);
    expect(result.breakdown).toHaveProperty("r16_BRA");
    expect(result.breakdown["r16_BRA"]).toBe(2);
    expect(result.breakdown).toHaveProperty("total");
    expect(result.breakdown["total"]).toBe(result.points);
  });
});

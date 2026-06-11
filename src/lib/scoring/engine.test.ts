import { describe, it, expect } from "vitest";
import { scorePrediction } from "./engine";
import { DEFAULT_RULESET } from "./ruleset";

// Helpers
const makeMatch = (overrides: Partial<Parameters<typeof scorePrediction>[2]> = {}) => ({
  stage: "group" as const,
  score_home_90: 2,
  score_away_90: 1,
  score_home_ft: 2,
  score_away_ft: 1,
  penalty_winner: undefined as string | undefined,
  status: "finished" as const,
  ...overrides,
});

describe("scorePrediction — exact score", () => {
  it("returns exact_score points when prediction matches 90min exactly", () => {
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 2, away: 1 },
      makeMatch({ score_home_90: 2, score_away_90: 1, score_home_ft: 2, score_away_ft: 1 })
    );
    expect(result.points).toBe(10); // exact_score=10, group multiplier=1
    expect(result.breakdown.exact_score).toBe(10);
    expect(result.breakdown.stage_multiplier).toBe(1);
    expect(result.breakdown.total).toBe(10);
  });

  it("score_basis=final uses ft score, not 90min", () => {
    const ruleset = { ...DEFAULT_RULESET, score_basis: "final" as const };
    // 90min: 1-1, final: 2-1 (after extra time). Predict 2-1 = exact on final
    const result = scorePrediction(
      ruleset,
      { home: 2, away: 1 },
      makeMatch({ score_home_90: 1, score_away_90: 1, score_home_ft: 2, score_away_ft: 1 })
    );
    expect(result.points).toBe(10);
    expect(result.breakdown.exact_score).toBe(10);
  });

  it("score_basis=90min uses 90min score, not ft", () => {
    const ruleset = { ...DEFAULT_RULESET, score_basis: "90min" as const };
    // 90min: 1-1, final: 2-1. Predict 1-1 = exact on 90min
    const result = scorePrediction(
      ruleset,
      { home: 1, away: 1 },
      makeMatch({ score_home_90: 1, score_away_90: 1, score_home_ft: 2, score_away_ft: 1 })
    );
    expect(result.points).toBe(10);
    expect(result.breakdown.exact_score).toBe(10);
  });

  it("score_basis=90min: predict 2-1 when 90min is 1-1 (NOT exact, just winner hit)", () => {
    const ruleset = { ...DEFAULT_RULESET, score_basis: "90min" as const };
    const result = scorePrediction(
      ruleset,
      { home: 2, away: 1 },
      makeMatch({ score_home_90: 1, score_away_90: 1, score_home_ft: 2, score_away_ft: 1 })
    );
    // 90min is draw, prediction is home win → wrong outcome, but away goals (1) match → consolação
    expect(result.points).toBe(1);
    expect(result.breakdown.goals_one_team).toBe(1);
  });

  it("score_basis=final: predict 1-1 when final is 2-1 (NOT exact on final)", () => {
    const ruleset = { ...DEFAULT_RULESET, score_basis: "final" as const };
    const result = scorePrediction(
      ruleset,
      { home: 1, away: 1 },
      makeMatch({ score_home_90: 1, score_away_90: 1, score_home_ft: 2, score_away_ft: 1 })
    );
    // final is 2-1, predict 1-1 → wrong outcome, but away goals (1) match → consolação
    expect(result.points).toBe(1);
    expect(result.breakdown.goals_one_team).toBe(1);
  });
});

describe("scorePrediction — winner_and_diff", () => {
  it("awards winner_and_diff when correct winner and correct goal diff, wrong exact", () => {
    // Actual: 3-1 (diff=2), Predict: 2-0 (diff=2, same winner) — not exact
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 2, away: 0 },
      makeMatch({ score_home_90: 3, score_away_90: 1 })
    );
    expect(result.points).toBe(7);
    expect(result.breakdown.winner_and_diff).toBe(7);
    expect(result.breakdown.exact_score).toBeUndefined();
  });

  it("does not award winner_and_diff when diff is different", () => {
    // Actual: 3-1 (diff=2), Predict: 2-1 (diff=1) — correct winner, wrong diff
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 2, away: 1 },
      makeMatch({ score_home_90: 3, score_away_90: 1 })
    );
    expect(result.points).toBe(4); // only winner_only
    expect(result.breakdown.winner_only).toBe(4);
    expect(result.breakdown.winner_and_diff).toBeUndefined();
  });

  it("does not award winner_and_diff for draws (no diff concept)", () => {
    // Actual: 2-2, Predict: 1-1 — correct draw, same diff=0
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 1, away: 1 },
      makeMatch({ score_home_90: 2, score_away_90: 2 })
    );
    // draw_only = 4 (not winner_and_diff, since draws use draw_only)
    expect(result.points).toBe(4);
    expect(result.breakdown.draw_only).toBe(4);
    expect(result.breakdown.winner_and_diff).toBeUndefined();
  });
});

describe("scorePrediction — winner_only", () => {
  it("awards winner_only when correct winner but wrong diff", () => {
    // Actual: 3-0, Predict: 1-0 — correct winner (home), different diff
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 1, away: 0 },
      makeMatch({ score_home_90: 3, score_away_90: 0 })
    );
    expect(result.points).toBe(4);
    expect(result.breakdown.winner_only).toBe(4);
  });

  it("awards winner_only for away team win", () => {
    // Actual: 0-2, Predict: 0-1 — correct away win, different diff
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 0, away: 1 },
      makeMatch({ score_home_90: 0, score_away_90: 2 })
    );
    expect(result.points).toBe(4);
    expect(result.breakdown.winner_only).toBe(4);
  });

  it("returns 0 when wrong winner", () => {
    // Actual: 2-0 (home), Predict: 0-2 (away)
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 0, away: 2 },
      makeMatch({ score_home_90: 2, score_away_90: 0 })
    );
    expect(result.points).toBe(0);
    expect(result.breakdown).toMatchObject({ total: 0 });
  });
});

describe("scorePrediction — draw_only", () => {
  it("awards draw_only when both predict draw and actual is draw", () => {
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 0, away: 0 },
      makeMatch({ score_home_90: 1, score_away_90: 1 })
    );
    expect(result.points).toBe(4);
    expect(result.breakdown.draw_only).toBe(4);
  });

  it("returns 0 when predict draw but actual has winner", () => {
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 1, away: 1 },
      makeMatch({ score_home_90: 2, score_away_90: 0 })
    );
    expect(result.points).toBe(0);
  });

  it("predict winner but actual is draw: only consolação if one team's goals match", () => {
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 2, away: 1 },
      makeMatch({ score_home_90: 1, score_away_90: 1 })
    );
    // errou o vencedor; away 1 == 1 → goals_one_team
    expect(result.points).toBe(1);
    expect(result.breakdown.goals_one_team).toBe(1);
  });
});

describe("scorePrediction — goals_one_team (consolação)", () => {
  it("awards goals_one_team when wrong winner but home goals match", () => {
    // Actual: 3-1 (home win), Predict: 3-4 (away win) — home goals 3 batem
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 3, away: 4 },
      makeMatch({ score_home_90: 3, score_away_90: 1 })
    );
    expect(result.points).toBe(1);
    expect(result.breakdown.goals_one_team).toBe(1);
  });

  it("returns 0 when wrong winner and no team goals match", () => {
    // Actual: 3-1, Predict: 0-2 — nada bate
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 0, away: 2 },
      makeMatch({ score_home_90: 3, score_away_90: 1 })
    );
    expect(result.points).toBe(0);
    expect(result.breakdown.goals_one_team).toBeUndefined();
  });

  it("does not fire when winner is correct (winner_only takes priority)", () => {
    // Actual: 3-1, Predict: 3-2 — vencedor certo + home goals batem → winner_only, não consolação
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 3, away: 2 },
      makeMatch({ score_home_90: 3, score_away_90: 1 })
    );
    expect(result.points).toBe(4);
    expect(result.breakdown.winner_only).toBe(4);
    expect(result.breakdown.goals_one_team).toBeUndefined();
  });

  it("goals_one_team = 0 disables the rule", () => {
    const ruleset = {
      ...DEFAULT_RULESET,
      scoring: { ...DEFAULT_RULESET.scoring, goals_one_team: 0 },
    };
    const result = scorePrediction(
      ruleset,
      { home: 3, away: 4 },
      makeMatch({ score_home_90: 3, score_away_90: 1 })
    );
    expect(result.points).toBe(0);
    expect(result.breakdown.goals_one_team).toBeUndefined();
  });

  it("uses custom goals_one_team value with stage multiplier", () => {
    const ruleset = {
      ...DEFAULT_RULESET,
      scoring: { ...DEFAULT_RULESET.scoring, goals_one_team: 2 },
    };
    const result = scorePrediction(
      ruleset,
      { home: 3, away: 4 },
      makeMatch({ stage: "qf", score_home_90: 3, score_away_90: 1 })
    );
    expect(result.points).toBe(4); // 2 * qf(2)
  });
});

describe("scorePrediction — mutually exclusive layers", () => {
  it("exact_score takes priority over winner_and_diff", () => {
    // 2-0 exact match; diff is also correct — should count as exact_score only
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 2, away: 0 },
      makeMatch({ score_home_90: 2, score_away_90: 0 })
    );
    expect(result.points).toBe(10);
    expect(result.breakdown.exact_score).toBe(10);
    expect(result.breakdown.winner_and_diff).toBeUndefined();
  });

  it("winner_and_diff takes priority over winner_only", () => {
    // Actual 2-0, Predict 4-2: same diff (2), same winner → winner_and_diff, not winner_only
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 4, away: 2 },
      makeMatch({ score_home_90: 2, score_away_90: 0 })
    );
    expect(result.points).toBe(7);
    expect(result.breakdown.winner_and_diff).toBe(7);
    expect(result.breakdown.winner_only).toBeUndefined();
  });
});

describe("scorePrediction — stage multipliers", () => {
  it("group stage = 1x multiplier", () => {
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 2, away: 1 },
      makeMatch({ stage: "group", score_home_90: 2, score_away_90: 1 })
    );
    expect(result.points).toBe(10);
    expect(result.breakdown.stage_multiplier).toBe(1);
  });

  it("r32 = 1x multiplier", () => {
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 2, away: 1 },
      makeMatch({ stage: "r32", score_home_90: 2, score_away_90: 1 })
    );
    expect(result.points).toBe(10);
    expect(result.breakdown.stage_multiplier).toBe(1);
  });

  it("r16 = 1.5x multiplier", () => {
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 2, away: 1 },
      makeMatch({ stage: "r16", score_home_90: 2, score_away_90: 1 })
    );
    expect(result.points).toBe(15); // 10 * 1.5
    expect(result.breakdown.stage_multiplier).toBe(1.5);
  });

  it("qf = 2x multiplier", () => {
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 1, away: 0 },
      makeMatch({ stage: "qf", score_home_90: 3, score_away_90: 0 })
    );
    expect(result.points).toBe(8); // winner_only=4 * 2
    expect(result.breakdown.stage_multiplier).toBe(2);
  });

  it("sf = 2.5x multiplier", () => {
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 2, away: 1 },
      makeMatch({ stage: "sf", score_home_90: 2, score_away_90: 1 })
    );
    expect(result.points).toBe(25); // 10 * 2.5
    expect(result.breakdown.stage_multiplier).toBe(2.5);
  });

  it("third place = 1x multiplier", () => {
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 2, away: 1 },
      makeMatch({ stage: "third", score_home_90: 2, score_away_90: 1 })
    );
    expect(result.points).toBe(10); // 10 * 1
    expect(result.breakdown.stage_multiplier).toBe(1);
  });

  it("final = 3x multiplier", () => {
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 2, away: 1 },
      makeMatch({ stage: "final", score_home_90: 2, score_away_90: 1 })
    );
    expect(result.points).toBe(30); // 10 * 3
    expect(result.breakdown.stage_multiplier).toBe(3);
  });

  it("custom multipliers from ruleset override defaults", () => {
    const customRuleset = {
      ...DEFAULT_RULESET,
      stage_multipliers: { ...DEFAULT_RULESET.stage_multipliers, final: 5 },
    };
    const result = scorePrediction(
      customRuleset,
      { home: 2, away: 1 },
      makeMatch({ stage: "final", score_home_90: 2, score_away_90: 1 })
    );
    expect(result.points).toBe(50); // 10 * 5
    expect(result.breakdown.stage_multiplier).toBe(5);
  });
});

describe("scorePrediction — unfinished match", () => {
  it("throws when match status is not finished", () => {
    expect(() =>
      scorePrediction(
        DEFAULT_RULESET,
        { home: 1, away: 0 },
        makeMatch({ status: "scheduled" })
      )
    ).toThrow();
  });

  it("throws when match status is live", () => {
    expect(() =>
      scorePrediction(
        DEFAULT_RULESET,
        { home: 1, away: 0 },
        makeMatch({ status: "live" })
      )
    ).toThrow();
  });
});

describe("scorePrediction — breakdown auditability", () => {
  it("breakdown always contains total field", () => {
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 0, away: 2 },
      makeMatch({ score_home_90: 2, score_away_90: 0 }) // wrong prediction
    );
    expect(result.breakdown).toHaveProperty("total");
    expect(result.breakdown.total).toBe(0);
  });

  it("breakdown.total matches result.points", () => {
    const result = scorePrediction(
      DEFAULT_RULESET,
      { home: 2, away: 1 },
      makeMatch({ stage: "r16", score_home_90: 2, score_away_90: 1 })
    );
    expect(result.breakdown.total).toBe(result.points);
  });
});

describe("scorePrediction — custom ruleset scoring values", () => {
  it("uses custom exact_score value", () => {
    const customRuleset = {
      ...DEFAULT_RULESET,
      scoring: { ...DEFAULT_RULESET.scoring, exact_score: 15 },
    };
    const result = scorePrediction(
      customRuleset,
      { home: 1, away: 0 },
      makeMatch({ score_home_90: 1, score_away_90: 0 })
    );
    expect(result.points).toBe(15);
  });

  it("uses custom winner_only value", () => {
    const customRuleset = {
      ...DEFAULT_RULESET,
      scoring: { ...DEFAULT_RULESET.scoring, winner_only: 5 },
    };
    const result = scorePrediction(
      customRuleset,
      { home: 1, away: 0 },
      makeMatch({ score_home_90: 3, score_away_90: 0 })
    );
    expect(result.points).toBe(5); // custom winner_only=5
  });
});

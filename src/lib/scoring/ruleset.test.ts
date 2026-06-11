import { describe, it, expect } from "vitest";
import { parseRuleset, DEFAULT_RULESET, type Ruleset } from "./ruleset";

describe("DEFAULT_RULESET", () => {
  it("has version 1", () => {
    expect(DEFAULT_RULESET.version).toBe(1);
  });

  it("has correct scoring tiers", () => {
    expect(DEFAULT_RULESET.scoring.exact_score).toBe(10);
    expect(DEFAULT_RULESET.scoring.winner_and_diff).toBe(5);
    expect(DEFAULT_RULESET.scoring.winner_only).toBe(3);
    expect(DEFAULT_RULESET.scoring.draw_only).toBe(3);
  });

  it("has correct stage multipliers", () => {
    expect(DEFAULT_RULESET.stage_multipliers.group).toBe(1);
    expect(DEFAULT_RULESET.stage_multipliers.r32).toBe(1);
    expect(DEFAULT_RULESET.stage_multipliers.r16).toBe(1.5);
    expect(DEFAULT_RULESET.stage_multipliers.qf).toBe(2);
    expect(DEFAULT_RULESET.stage_multipliers.sf).toBe(2.5);
    expect(DEFAULT_RULESET.stage_multipliers.third).toBe(1);
    expect(DEFAULT_RULESET.stage_multipliers.final).toBe(3);
  });

  it("score_basis is 90min by default", () => {
    expect(DEFAULT_RULESET.score_basis).toBe("90min");
  });

  it("deadline is per_match 15min by default", () => {
    expect(DEFAULT_RULESET.deadline.mode).toBe("per_match");
    expect(DEFAULT_RULESET.deadline.minutes_before).toBe(15);
  });

  it("edits are allowed by default", () => {
    expect(DEFAULT_RULESET.edits.allowed).toBe(true);
  });

  it("late predictions are blocked by default", () => {
    expect(DEFAULT_RULESET.late_predictions.policy).toBe("blocked");
  });

  it("missing prediction policy is zero by default", () => {
    expect(DEFAULT_RULESET.missing_prediction.policy).toBe("zero");
  });

  it("champion special bet is enabled with 20 points by default", () => {
    expect(DEFAULT_RULESET.special_bets.champion.enabled).toBe(true);
    expect(DEFAULT_RULESET.special_bets.champion.points).toBe(20);
  });

  it("top_scorer special bet is disabled by default", () => {
    expect(DEFAULT_RULESET.special_bets.top_scorer.enabled).toBe(false);
  });

  it("has correct tiebreakers order", () => {
    expect(DEFAULT_RULESET.tiebreakers).toEqual([
      "exact_scores",
      "winners",
      "knockout_points",
      "champion_bet",
      "lottery",
    ]);
  });

  it("extra_markets is empty array by default", () => {
    expect(DEFAULT_RULESET.extra_markets).toEqual([]);
  });
});

describe("parseRuleset", () => {
  it("parses a complete valid ruleset", () => {
    const json = {
      version: 1,
      scoring: { exact_score: 15, winner_and_diff: 8, winner_only: 4, draw_only: 4 },
      stage_multipliers: { group: 1, r32: 1, r16: 1.5, qf: 2, sf: 2.5, third: 1, final: 3 },
      score_basis: "final",
      deadline: { mode: "per_match", minutes_before: 30 },
      visibility: "hidden_until_kickoff",
      edits: { allowed: false },
      late_predictions: { policy: "blocked" },
      missing_prediction: { policy: "zero" },
      special_bets: {
        champion: { enabled: true, points: 25 },
        top_scorer: { enabled: false },
      },
      extra_markets: [],
      tiebreakers: ["exact_scores", "winners", "knockout_points", "champion_bet", "lottery"],
    };
    const ruleset = parseRuleset(json);
    expect(ruleset.scoring.exact_score).toBe(15);
    expect(ruleset.score_basis).toBe("final");
    expect(ruleset.deadline.minutes_before).toBe(30);
    expect(ruleset.edits.allowed).toBe(false);
    expect(ruleset.special_bets.champion.points).toBe(25);
  });

  it("falls back to default for missing scoring fields", () => {
    const json = { version: 1 };
    const ruleset = parseRuleset(json);
    expect(ruleset.scoring.exact_score).toBe(10);
    expect(ruleset.scoring.winner_and_diff).toBe(5);
    expect(ruleset.scoring.winner_only).toBe(3);
    expect(ruleset.scoring.draw_only).toBe(3);
  });

  it("falls back to default stage_multipliers when missing", () => {
    const json = {};
    const ruleset = parseRuleset(json);
    expect(ruleset.stage_multipliers.group).toBe(1);
    expect(ruleset.stage_multipliers.final).toBe(3);
  });

  it("falls back to 90min for invalid score_basis", () => {
    const json = { score_basis: "invalid_value" };
    const ruleset = parseRuleset(json);
    expect(ruleset.score_basis).toBe("90min");
  });

  it("falls back to 90min when score_basis is absent", () => {
    const json = {};
    const ruleset = parseRuleset(json);
    expect(ruleset.score_basis).toBe("90min");
  });

  it("accepts 'final' as score_basis", () => {
    const json = { score_basis: "final" };
    const ruleset = parseRuleset(json);
    expect(ruleset.score_basis).toBe("final");
  });

  it("falls back to default deadline when missing", () => {
    const json = {};
    const ruleset = parseRuleset(json);
    expect(ruleset.deadline.mode).toBe("per_match");
    expect(ruleset.deadline.minutes_before).toBe(15);
  });

  it("falls back to default edits when missing", () => {
    const json = {};
    const ruleset = parseRuleset(json);
    expect(ruleset.edits.allowed).toBe(true);
  });

  it("falls back to default tiebreakers when missing", () => {
    const json = {};
    const ruleset = parseRuleset(json);
    expect(ruleset.tiebreakers).toEqual([
      "exact_scores",
      "winners",
      "knockout_points",
      "champion_bet",
      "lottery",
    ]);
  });

  it("merges partial scoring fields with defaults", () => {
    const json = { scoring: { exact_score: 20 } };
    const ruleset = parseRuleset(json);
    expect(ruleset.scoring.exact_score).toBe(20);
    expect(ruleset.scoring.winner_and_diff).toBe(5);
    expect(ruleset.scoring.winner_only).toBe(3);
  });

  it("handles null input gracefully", () => {
    const ruleset = parseRuleset(null);
    expect(ruleset.scoring.exact_score).toBe(10);
  });

  it("handles non-object input gracefully", () => {
    const ruleset = parseRuleset("invalid");
    expect(ruleset.scoring.exact_score).toBe(10);
  });
});

import { describe, it, expect } from "vitest";
import { parseRuleset, DEFAULT_RULESET } from "./ruleset";
import { earlyBirdBonus, scoreChampion, scoreGroupQualifiers } from "./specials";

const EB_ON = parseRuleset({ early_bird: { enabled: true } });

describe("earlyBirdBonus", () => {
  const kickoff = "2026-06-15T19:00:00Z";

  it("awards bonus when submitted >= 4 days before and never edited", () => {
    const pts = earlyBirdBonus(
      EB_ON,
      { first_submitted_at: "2026-06-11T18:00:00Z", edit_count: 0 },
      kickoff
    );
    expect(pts).toBe(2);
  });

  it("no bonus when submitted less than 4 days before", () => {
    const pts = earlyBirdBonus(
      EB_ON,
      { first_submitted_at: "2026-06-13T19:00:00Z", edit_count: 0 },
      kickoff
    );
    expect(pts).toBe(0);
  });

  it("no bonus when prediction was edited", () => {
    const pts = earlyBirdBonus(
      EB_ON,
      { first_submitted_at: "2026-06-01T00:00:00Z", edit_count: 1 },
      kickoff
    );
    expect(pts).toBe(0);
  });

  it("disabled by default", () => {
    const pts = earlyBirdBonus(
      DEFAULT_RULESET,
      { first_submitted_at: "2026-06-01T00:00:00Z", edit_count: 0 },
      kickoff
    );
    expect(pts).toBe(0);
  });

  it("respects custom days_before and points", () => {
    const rs = parseRuleset({ early_bird: { enabled: true, days_before: 1, points: 5 } });
    const pts = earlyBirdBonus(
      rs,
      { first_submitted_at: "2026-06-14T18:00:00Z", edit_count: 0 },
      kickoff
    );
    expect(pts).toBe(5);
  });
});

describe("scoreChampion", () => {
  it("awards 50 by default on correct champion (case/space insensitive)", () => {
    expect(scoreChampion(DEFAULT_RULESET, " brasil ", "Brasil")).toBe(50);
  });

  it("zero on wrong champion", () => {
    expect(scoreChampion(DEFAULT_RULESET, "Argentina", "Brasil")).toBe(0);
  });

  it("zero when disabled", () => {
    const rs = parseRuleset({ special_bets: { champion: { enabled: false } } });
    expect(scoreChampion(rs, "Brasil", "Brasil")).toBe(0);
  });

  it("custom points", () => {
    const rs = parseRuleset({ special_bets: { champion: { enabled: true, points: 100 } } });
    expect(scoreChampion(rs, "Brasil", "Brasil")).toBe(100);
  });
});

describe("scoreGroupQualifiers", () => {
  const Q_ON = parseRuleset({ special_bets: { qualifiers: { enabled: true } } });

  it("disabled by default", () => {
    const r = scoreGroupQualifiers(
      DEFAULT_RULESET,
      { A: ["México", "Canadá"] },
      { A: ["México", "Canadá"] }
    );
    expect(r.points).toBe(0);
  });

  it("both teams in exact positions: 2*(2+1) = 6 per group", () => {
    const r = scoreGroupQualifiers(
      Q_ON,
      { A: ["México", "Canadá"] },
      { A: ["México", "Canadá"] }
    );
    expect(r.points).toBe(6);
    expect(r.breakdown.A).toBe(6);
  });

  it("both teams but swapped positions: 2*2 = 4", () => {
    const r = scoreGroupQualifiers(
      Q_ON,
      { A: ["Canadá", "México"] },
      { A: ["México", "Canadá"] }
    );
    expect(r.points).toBe(4);
  });

  it("one team right (wrong position), one wrong: 2", () => {
    const r = scoreGroupQualifiers(
      Q_ON,
      { A: ["Canadá", "Suriname"] },
      { A: ["México", "Canadá"] }
    );
    expect(r.points).toBe(2);
  });

  it("ignores groups without actual result yet, sums across groups", () => {
    const r = scoreGroupQualifiers(
      Q_ON,
      { A: ["México", "Canadá"], B: ["Brasil", "Marrocos"] },
      { A: ["México", "Canadá"] }
    );
    expect(r.points).toBe(6);
    expect(r.breakdown).toEqual({ A: 6 });
  });

  it("custom points_per_team and bonus", () => {
    const rs = parseRuleset({
      special_bets: {
        qualifiers: { enabled: true, points_per_team: 5, exact_position_bonus: 0 },
      },
    });
    const r = scoreGroupQualifiers(rs, { A: ["México", "Canadá"] }, { A: ["México", "Canadá"] });
    expect(r.points).toBe(10);
  });
});

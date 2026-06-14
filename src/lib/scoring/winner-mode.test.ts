import { describe, it, expect } from "vitest";
import { scorePrediction, type Match } from "./engine";
import { parseRuleset } from "./ruleset";

const winnerRuleset = parseRuleset({
  prediction_mode: "winner",
  scoring: { winner_pick: 3, winner_exact_bonus: 5 },
});

const match = (h: number, a: number, stage: Match["stage"] = "group"): Match => ({
  stage,
  score_home_90: h,
  score_away_90: a,
  score_home_ft: h,
  score_away_ft: a,
  status: "finished",
});

describe("modo só vencedor (winner pick)", () => {
  it("acertou o vencedor sem placar → winner_pick", () => {
    const r = scorePrediction(winnerRuleset, { winner: "home" }, match(2, 0));
    expect(r.points).toBe(3);
    expect(r.breakdown.winner_pick).toBe(3);
    expect(r.breakdown.winner_exact_bonus).toBeUndefined();
  });

  it("acertou empate", () => {
    const r = scorePrediction(winnerRuleset, { winner: "draw" }, match(1, 1));
    expect(r.points).toBe(3);
  });

  it("errou o vencedor → 0, mesmo com placar exato preenchido errado-coerente", () => {
    // chutou fora 0x1, deu casa 2x0 — nada
    const r = scorePrediction(
      winnerRuleset,
      { winner: "away", home: 0, away: 1 },
      match(2, 0)
    );
    expect(r.points).toBe(0);
  });

  it("acertou vencedor + cravou placar → winner_pick + bônus", () => {
    const r = scorePrediction(
      winnerRuleset,
      { winner: "home", home: 2, away: 0 },
      match(2, 0)
    );
    expect(r.points).toBe(8);
    expect(r.breakdown.winner_pick).toBe(3);
    expect(r.breakdown.winner_exact_bonus).toBe(5);
  });

  it("acertou vencedor, placar preenchido mas errado → só winner_pick", () => {
    const r = scorePrediction(
      winnerRuleset,
      { winner: "home", home: 1, away: 0 },
      match(2, 0)
    );
    expect(r.points).toBe(3);
  });

  it("bônus desligado (0) não soma mesmo com placar cravado", () => {
    const rs = parseRuleset({
      prediction_mode: "winner",
      scoring: { winner_pick: 3, winner_exact_bonus: 0 },
    });
    const r = scorePrediction(rs, { winner: "home", home: 2, away: 0 }, match(2, 0));
    expect(r.points).toBe(3);
    expect(r.breakdown.winner_exact_bonus).toBeUndefined();
  });

  it("multiplicador de fase aplica sobre pick + bônus", () => {
    // final ×3 (default): (3 + 5) × 3 = 24
    const r = scorePrediction(
      winnerRuleset,
      { winner: "home", home: 2, away: 0 },
      match(2, 0, "final")
    );
    expect(r.points).toBe(24);
  });

  it("retrocompat: ruleset modo score continua pontuando payload {home, away}", () => {
    const scoreRuleset = parseRuleset({});
    expect(scoreRuleset.prediction_mode).toBe("score");
    const r = scorePrediction(scoreRuleset, { home: 2, away: 0 }, match(2, 0));
    expect(r.points).toBe(8); // exact_score default
  });

  it("pool modo score: payload de placar com chave winner espúria pontua como PLACAR", () => {
    // payload sujo/migrado {home, away, winner} num pool de placar — o modo do
    // bolão manda: deve pontuar como placar (exato=8), não como winner pick.
    const scoreRuleset = parseRuleset({});
    const r = scorePrediction(
      scoreRuleset,
      { winner: "home", home: 2, away: 0 } as never,
      match(2, 0)
    );
    expect(r.points).toBe(8);
    expect(r.breakdown.exact_score).toBe(8);
    expect(r.breakdown.winner_pick).toBeUndefined();
  });
});

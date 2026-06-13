import type { Ruleset } from "./ruleset";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type Stage = "group" | "r32" | "r16" | "qf" | "sf" | "third" | "final";
export type MatchStatus = "scheduled" | "live" | "finished" | "suspended";

export interface Prediction {
  home: number;
  away: number;
}

/** Palpite do modo "só vencedor": 1X2 + placar opcional (bônus). */
export interface WinnerPrediction {
  winner: "home" | "draw" | "away";
  home?: number | null;
  away?: number | null;
}

export type PredictionPayload = Prediction | WinnerPrediction;

export interface Match {
  stage: Stage;
  score_home_90: number;
  score_away_90: number;
  score_home_ft: number;
  score_away_ft: number;
  penalty_winner?: string;
  status: MatchStatus;
}

export interface ScoreResult {
  points: number;
  breakdown: Record<string, number>;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function getOutcome(home: number, away: number): "home" | "away" | "draw" {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

// ────────────────────────────────────────────────────────────
// scorePrediction — pure function, no I/O
// ────────────────────────────────────────────────────────────

export function scorePrediction(
  ruleset: Ruleset,
  prediction: PredictionPayload,
  match: Match
): ScoreResult {
  if (match.status !== "finished") {
    throw new Error(
      `Cannot score prediction for match with status '${match.status}'. Match must be 'finished'.`
    );
  }

  // Choose score basis
  const actualHome =
    ruleset.score_basis === "final" ? match.score_home_ft : match.score_home_90;
  const actualAway =
    ruleset.score_basis === "final" ? match.score_away_ft : match.score_away_90;

  // O modo do BOLÃO é a fonte de verdade — não a forma do payload. Um palpite
  // de placar que por acaso carregue uma chave `winner` (payload migrado/sujo)
  // num pool de placar deve continuar sendo pontuado como placar.
  if (ruleset.prediction_mode === "winner") {
    return scoreWinnerPick(ruleset, prediction as WinnerPrediction, match, actualHome, actualAway);
  }

  const predHome = (prediction as Prediction).home;
  const predAway = (prediction as Prediction).away;

  // Get stage multiplier
  const multiplier: number =
    ruleset.stage_multipliers[match.stage as keyof typeof ruleset.stage_multipliers] ?? 1;

  // Mutually exclusive scoring layers (highest to lowest)
  let basePoints = 0;
  const breakdown: Record<string, number> = {};

  const isExact = predHome === actualHome && predAway === actualAway;
  const actualOutcome = getOutcome(actualHome, actualAway);
  const predOutcome = getOutcome(predHome, predAway);
  const correctOutcome = actualOutcome === predOutcome;

  if (isExact) {
    // Layer 1: exact score
    basePoints = ruleset.scoring.exact_score;
    breakdown.exact_score = basePoints;
  } else if (
    correctOutcome &&
    actualOutcome !== "draw" &&
    predHome - predAway === actualHome - actualAway
  ) {
    // Layer 2: correct winner AND correct goal difference (non-draw only)
    basePoints = ruleset.scoring.winner_and_diff;
    breakdown.winner_and_diff = basePoints;
  } else if (correctOutcome && actualOutcome !== "draw") {
    // Layer 3: correct winner (not a draw)
    basePoints = ruleset.scoring.winner_only;
    breakdown.winner_only = basePoints;
  } else if (correctOutcome && actualOutcome === "draw") {
    // Layer 3 (draw variant): both predicted draw, actual is draw
    basePoints = ruleset.scoring.draw_only;
    breakdown.draw_only = basePoints;
  } else if (
    !correctOutcome &&
    (predHome === actualHome || predAway === actualAway)
  ) {
    // Layer 4 (consolação): errou o vencedor mas acertou os gols de um time.
    // goals_one_team = 0 desliga a regra.
    basePoints = ruleset.scoring.goals_one_team;
    if (basePoints !== 0) breakdown.goals_one_team = basePoints;
  } else {
    // Layer 5: zero
    basePoints = 0;
  }

  // Apply stage multiplier
  breakdown.stage_multiplier = multiplier;
  const total = basePoints * multiplier;
  breakdown.total = total;

  return { points: total, breakdown };
}

/**
 * Modo "só vencedor": acertou o 1X2 → winner_pick pts.
 * Se também preencheu o placar e cravou → + winner_exact_bonus (0 desliga).
 * Multiplicador de fase aplica sobre a soma.
 */
function scoreWinnerPick(
  ruleset: Ruleset,
  prediction: WinnerPrediction,
  match: Match,
  actualHome: number,
  actualAway: number
): ScoreResult {
  const multiplier: number =
    ruleset.stage_multipliers[match.stage as keyof typeof ruleset.stage_multipliers] ?? 1;

  let basePoints = 0;
  const breakdown: Record<string, number> = {};
  const actualOutcome = getOutcome(actualHome, actualAway);

  if (prediction.winner === actualOutcome) {
    basePoints = ruleset.scoring.winner_pick;
    breakdown.winner_pick = basePoints;

    const bonus = ruleset.scoring.winner_exact_bonus;
    if (
      bonus > 0 &&
      prediction.home != null &&
      prediction.away != null &&
      prediction.home === actualHome &&
      prediction.away === actualAway
    ) {
      basePoints += bonus;
      breakdown.winner_exact_bonus = bonus;
    }
  }

  breakdown.stage_multiplier = multiplier;
  const total = basePoints * multiplier;
  breakdown.total = total;

  return { points: total, breakdown };
}

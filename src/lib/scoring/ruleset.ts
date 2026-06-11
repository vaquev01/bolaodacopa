import { z } from "zod";

// ────────────────────────────────────────────────────────────
// Schema Zod — Ruleset v1
// ────────────────────────────────────────────────────────────

const ScoringSchema = z.object({
  exact_score: z.number().default(10),
  winner_and_diff: z.number().default(7),
  winner_only: z.number().default(4),
  draw_only: z.number().default(4),
  // Consolação: errou o vencedor mas acertou os gols de um dos times. 0 = desligada.
  goals_one_team: z.number().default(1),
});

const StageMultipliersSchema = z.object({
  group: z.number().default(1),
  r32: z.number().default(1),
  r16: z.number().default(1.5),
  qf: z.number().default(2),
  sf: z.number().default(2.5),
  third: z.number().default(1),
  final: z.number().default(3),
});

const DeadlineSchema = z.object({
  mode: z.enum(["per_match", "per_round", "tournament"]).default("per_match"),
  minutes_before: z.number().default(15),
});

const EditsSchema = z.object({
  allowed: z.boolean().default(true),
});

const LatePredictionsSchema = z.object({
  policy: z.enum(["blocked", "no_points", "penalty"]).default("blocked"),
  penalty_pct: z.number().optional(),
});

const MissingPredictionSchema = z.object({
  policy: z.enum(["zero", "default_0x0"]).default("zero"),
});

const ChampionBetSchema = z.object({
  enabled: z.boolean().default(true),
  // Campeão vale mais que qualquer jogo (final com placar exato = 30).
  points: z.number().default(50),
});

const TopScorerBetSchema = z.object({
  enabled: z.boolean().default(false),
  points: z.number().default(0),
});

// Classificados por grupo: palpite = 1º e 2º de cada grupo, feito antes da copa.
const QualifiersBetSchema = z.object({
  enabled: z.boolean().default(false),
  points_per_team: z.number().default(2),
  // Bônus extra se acertou também a posição (1º como 1º, 2º como 2º).
  exact_position_bonus: z.number().default(1),
});

const SpecialBetsSchema = z.object({
  champion: ChampionBetSchema.default({}),
  top_scorer: TopScorerBetSchema.default({}),
  qualifiers: QualifiersBetSchema.default({}),
});

// v1.1 — Bracket pré-Copa (advance predictions)
const BracketPointsSchema = z.object({
  group_qualified: z.number().default(2),
  group_position_exact: z.number().default(1),
  r16: z.number().default(2),
  qf: z.number().default(3),
  sf: z.number().default(5),
  final: z.number().default(8),
  fourth_place: z.number().default(4),
  third_place: z.number().default(8),
  runner_up: z.number().default(10),
  champion: z.number().default(25),
});

const AdvancePredictionsSchema = z.object({
  /** Liga/desliga o bracket pré-Copa. Default: false (retrocompatível). */
  enabled: z.boolean().default(false),
  /** Trava no kickoff do 1º jogo da Copa (tournament_start). */
  lock: z.enum(["tournament_start"]).default("tournament_start"),
  points: BracketPointsSchema.default({}),
});

// Bônus por palpite antecipado: feito >= days_before dias antes do jogo e nunca editado.
const EarlyBirdSchema = z.object({
  enabled: z.boolean().default(false),
  days_before: z.number().default(4),
  points: z.number().default(2),
});

const ExtraMarketSchema = z.object({
  type: z.string(),
  line: z.number().optional(),
  points: z.number(),
});

const TiebreakerSchema = z.enum([
  "exact_scores",
  "winners",
  "knockout_points",
  "champion_bet",
  "lottery",
]);

export const RulesetSchema = z.object({
  version: z.number().default(1),
  scoring: ScoringSchema.default({}),
  stage_multipliers: StageMultipliersSchema.default({}),
  score_basis: z.enum(["90min", "final"]).default("90min"),
  deadline: DeadlineSchema.default({}),
  visibility: z.string().default("hidden_until_kickoff"),
  edits: EditsSchema.default({}),
  late_predictions: LatePredictionsSchema.default({}),
  missing_prediction: MissingPredictionSchema.default({}),
  special_bets: SpecialBetsSchema.default({}),
  early_bird: EarlyBirdSchema.default({}),
  advance_predictions: AdvancePredictionsSchema.default({}),
  extra_markets: z.array(ExtraMarketSchema).default([]),
  tiebreakers: z.array(TiebreakerSchema).default([
    "exact_scores",
    "winners",
    "knockout_points",
    "champion_bet",
    "lottery",
  ]),
});

export type Ruleset = z.infer<typeof RulesetSchema>;

// ────────────────────────────────────────────────────────────
// DEFAULT_RULESET
// ────────────────────────────────────────────────────────────

export const DEFAULT_RULESET: Ruleset = RulesetSchema.parse({});

// ────────────────────────────────────────────────────────────
// parseRuleset — parse com fallback campo a campo para defaults
// ────────────────────────────────────────────────────────────

export function parseRuleset(json: unknown): Ruleset {
  // Guard: ensure we have a plain object to work with
  if (json === null || json === undefined || typeof json !== "object" || Array.isArray(json)) {
    return DEFAULT_RULESET;
  }

  const raw = json as Record<string, unknown>;

  // Merge top-level object with empty defaults, then parse field-by-field
  // This allows partial scoring/stage_multipliers/etc to merge with defaults
  const merged: Record<string, unknown> = {};

  // Merge scoring sub-object
  if (raw.scoring && typeof raw.scoring === "object" && !Array.isArray(raw.scoring)) {
    merged.scoring = { ...raw.scoring };
  }

  // Merge stage_multipliers sub-object
  if (
    raw.stage_multipliers &&
    typeof raw.stage_multipliers === "object" &&
    !Array.isArray(raw.stage_multipliers)
  ) {
    merged.stage_multipliers = { ...raw.stage_multipliers };
  }

  // Pass through all other top-level fields
  for (const key of Object.keys(raw)) {
    if (key !== "scoring" && key !== "stage_multipliers") {
      merged[key] = raw[key];
    }
  }

  const result = RulesetSchema.safeParse(merged);
  if (result.success) {
    return result.data;
  }

  // Partial fallback: parse field-by-field, falling back to defaults on error
  return DEFAULT_RULESET;
}

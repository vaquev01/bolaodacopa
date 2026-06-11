import { z } from "zod";

// ────────────────────────────────────────────────────────────
// Schema Zod — Ruleset v1
// ────────────────────────────────────────────────────────────

const ScoringSchema = z.object({
  exact_score: z.number().default(10),
  winner_and_diff: z.number().default(5),
  winner_only: z.number().default(3),
  draw_only: z.number().default(3),
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
  points: z.number().default(20),
});

const TopScorerBetSchema = z.object({
  enabled: z.boolean().default(false),
  points: z.number().default(0),
});

const SpecialBetsSchema = z.object({
  champion: ChampionBetSchema.default({}),
  top_scorer: TopScorerBetSchema.default({}),
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

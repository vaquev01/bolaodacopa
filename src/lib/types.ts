/**
 * Tipos compartilhados para o app bolão.
 * Espelha as tabelas do Supabase.
 */

export interface Match {
  id: string;
  ext_id?: string | null;
  stage: string;
  group_label: string | null;
  home_team: string;
  away_team: string;
  kickoff_at: string; // ISO UTC
  status: "scheduled" | "live" | "finished" | "suspended";
  score_home_90: number | null;
  score_away_90: number | null;
  score_home_ft: number | null;
  score_away_ft: number | null;
  penalty_winner: string | null;
}

export interface Pool {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  ruleset: Record<string, unknown>;
  scope: PoolScope;
  visibility: string;
  status: string;
  created_at: string;
}

export interface PoolScope {
  type: "full" | "groups" | "knockout" | "team" | "single" | "custom";
  match_ids?: string[];
}

export interface PoolMember {
  pool_id: string;
  user_id: string;
  role: "owner" | "admin" | "player";
  status: "pending" | "active" | "removed";
  joined_at: string;
  profiles?: { name: string };
}

export interface Prediction {
  id: string;
  pool_id: string;
  user_id: string;
  match_id: string;
  payload: { home: number; away: number };
  submitted_at: string;
}

export interface PredictionScore {
  prediction_id: string;
  points: number;
  breakdown: Record<string, number>;
  computed_at?: string;
}

export interface StandingRow {
  user_id: string;
  name: string;
  points: number;
  position: number;
}

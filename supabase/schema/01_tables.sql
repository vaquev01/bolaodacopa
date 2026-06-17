-- Estrutura das tabelas public do bolao-copa (referencia, via Management API 2026-06-14)

-- audit_log
CREATE TABLE audit_log (
  id bigint NOT NULL DEFAULT nextval('audit_log_id_seq'::regclass),
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  before jsonb,
  after jsonb,
  at timestamp with time zone NOT NULL DEFAULT now());

-- bracket_predictions
CREATE TABLE bracket_predictions (
  pool_id uuid NOT NULL,
  user_id uuid NOT NULL,
  payload jsonb NOT NULL,
  submitted_at timestamp with time zone NOT NULL DEFAULT now());

-- bracket_scores
CREATE TABLE bracket_scores (
  pool_id uuid NOT NULL,
  user_id uuid NOT NULL,
  points numeric NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamp with time zone DEFAULT now());

-- comments (migration 20260616_comments.sql) — resenha: mural ('pool') + jogo a jogo ('match')
CREATE TABLE comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL,
  user_id uuid NOT NULL,
  scope text NOT NULL,            -- 'match' | 'pool'
  match_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
-- comments_scope_chk: scope IN ('match','pool'); comments_match_chk: (scope='match') = (match_id IS NOT NULL)

-- narrator_events (migration 20260616_narrator.sql) — ledger de idempotência do ADM Narrador
CREATE TABLE narrator_events (
  pool_id uuid NOT NULL,
  event_key text NOT NULL,         -- kickoff:<match> | ft:<match> | leader:<user> | daily:<YYYYMMDD>
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_id, event_key));

-- matches
CREATE TABLE matches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ext_id text,
  stage text NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  kickoff_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'::text,
  score_home_90 integer,
  score_away_90 integer,
  score_home_ft integer,
  score_away_ft integer,
  penalty_winner text,
  manual_override boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  group_label text);

-- pool_members
CREATE TABLE pool_members (
  pool_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'player'::text,
  status text NOT NULL DEFAULT 'active'::text,
  joined_at timestamp with time zone NOT NULL DEFAULT now());

-- pool_special_bets
CREATE TABLE pool_special_bets (
  pool_id uuid NOT NULL,
  user_id uuid NOT NULL,
  bet_type text NOT NULL,
  value text NOT NULL,
  submitted_at timestamp with time zone NOT NULL DEFAULT now());

-- pool_special_results
CREATE TABLE pool_special_results (
  pool_id uuid NOT NULL,
  bet_type text NOT NULL,
  value text NOT NULL,
  settled_at timestamp with time zone NOT NULL DEFAULT now());

-- pools
CREATE TABLE pools (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  owner_id uuid NOT NULL,
  ruleset jsonb NOT NULL,
  ruleset_locked_at timestamp with time zone,
  scope jsonb NOT NULL,
  visibility text NOT NULL DEFAULT 'private'::text,
  join_policy text NOT NULL DEFAULT 'open_link'::text,
  max_members integer,
  prize_note text,
  prize_split jsonb,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now());

-- prediction_scores
CREATE TABLE prediction_scores (
  prediction_id uuid NOT NULL,
  points numeric NOT NULL,
  breakdown jsonb NOT NULL,
  computed_at timestamp with time zone NOT NULL DEFAULT now());

-- predictions
CREATE TABLE predictions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL,
  user_id uuid NOT NULL,
  match_id uuid NOT NULL,
  payload jsonb NOT NULL,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  first_submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  edit_count integer NOT NULL DEFAULT 0);

-- profiles
CREATE TABLE profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  secret_hash text NOT NULL,
  login_name text,
  password_hash text,
  created_at timestamp with time zone NOT NULL DEFAULT now());
-- profiles_login_name_unique: UNIQUE (lower(login_name)) WHERE login_name IS NOT NULL

-- special_bet_scores
CREATE TABLE special_bet_scores (
  pool_id uuid NOT NULL,
  user_id uuid NOT NULL,
  bet_type text NOT NULL,
  points numeric NOT NULL,
  breakdown jsonb,
  computed_at timestamp with time zone NOT NULL DEFAULT now());

-- system_config
CREATE TABLE system_config (
  key text NOT NULL,
  value text NOT NULL);

-- teams
CREATE TABLE teams (
  name text NOT NULL,
  group_code text,
  created_at timestamp with time zone DEFAULT now());

-- Migration: bracket_predictions (v1.1 — Bracket pré-Copa)
-- Padrões seguidos (iguais ao schema existente):
--   * Identidade leve: sem Supabase Auth — toda escrita via RPC security definer (_auth p_user+p_secret)
--   * Lock = _pool_first_kickoff(pool_id) (helper existente, respeita escopo custom)
--   * Scores legíveis publicamente (qual true), palpites alheios só pós-lock

-- ─────────────────────────────────────────────────────────────
-- 0. Tabela teams (grupo A–L por seleção, derivado de matches.group_label)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teams (
  name        TEXT PRIMARY KEY,
  group_code  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS teams_group_code_idx ON teams (group_code);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams_read" ON teams FOR SELECT USING (true);

INSERT INTO teams (name, group_code)
SELECT DISTINCT home_team, group_label FROM matches WHERE stage = 'group' AND group_label IS NOT NULL
ON CONFLICT (name) DO UPDATE SET group_code = EXCLUDED.group_code;

INSERT INTO teams (name, group_code)
SELECT DISTINCT away_team, group_label FROM matches WHERE stage = 'group' AND group_label IS NOT NULL
ON CONFLICT (name) DO UPDATE SET group_code = EXCLUDED.group_code;

-- ─────────────────────────────────────────────────────────────
-- 1. bracket_predictions
-- ─────────────────────────────────────────────────────────────
-- payload: { groups: {A:["BRA","MEX"],...}, third_qualifiers:[...8],
--            r32_winners:[...16], r16_winners:[...8], qf_winners:[...4],
--            sf_winners:[...2], finalists:[...2], champion:"BRA", third_place:"FRA" }

CREATE TABLE IF NOT EXISTS bracket_predictions (
  pool_id      UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  payload      JSONB NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pool_id, user_id)
);

CREATE INDEX IF NOT EXISTS bracket_predictions_pool_idx ON bracket_predictions (pool_id);

ALTER TABLE bracket_predictions ENABLE ROW LEVEL SECURITY;

-- Palpite alheio legível só após o lock (mesmo padrão de pool_special_bets);
-- o próprio bracket pré-lock chega via RPC get_pool_brackets (security definer).
CREATE POLICY "bracket_predictions_read"
  ON bracket_predictions FOR SELECT
  USING (now() >= _pool_first_kickoff(pool_id));
-- Escrita: nenhuma policy — só via RPC submit_bracket.

-- ─────────────────────────────────────────────────────────────
-- 2. bracket_scores (idempotente, recalculável a cada fase)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bracket_scores (
  pool_id     UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  points      NUMERIC NOT NULL DEFAULT 0,
  breakdown   JSONB NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (pool_id, user_id)
);

CREATE INDEX IF NOT EXISTS bracket_scores_pool_idx ON bracket_scores (pool_id);

ALTER TABLE bracket_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bracket_scores_read" ON bracket_scores FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────
-- 3. RPC submit_bracket — valida lock server-side
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_bracket(
  p_user    UUID,
  p_secret  TEXT,
  p_pool    UUID,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_lock_at TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_user_id FROM profiles
  WHERE id = p_user AND secret_hash = crypt(p_secret, secret_hash);
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pool_members
    WHERE pool_id = p_pool AND user_id = v_user_id AND status = 'active'
  ) THEN RAISE EXCEPTION 'not_member'; END IF;

  v_lock_at := _pool_first_kickoff(p_pool);
  IF v_lock_at IS NOT NULL AND NOW() >= v_lock_at THEN
    RETURN jsonb_build_object('error', 'bracket_locked', 'lock_at', v_lock_at);
  END IF;

  INSERT INTO bracket_predictions (pool_id, user_id, payload, submitted_at)
  VALUES (p_pool, v_user_id, p_payload, NOW())
  ON CONFLICT (pool_id, user_id)
  DO UPDATE SET payload = EXCLUDED.payload, submitted_at = NOW();

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. RPC get_pool_brackets — meu bracket sempre; dos outros pós-lock
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_pool_brackets(
  p_user   UUID,
  p_secret TEXT,
  p_pool   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_lock_at TIMESTAMPTZ;
  v_locked  BOOLEAN;
BEGIN
  SELECT id INTO v_user_id FROM profiles
  WHERE id = p_user AND secret_hash = crypt(p_secret, secret_hash);
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pool_members
    WHERE pool_id = p_pool AND user_id = v_user_id AND status = 'active'
  ) THEN RAISE EXCEPTION 'not_member'; END IF;

  v_lock_at := _pool_first_kickoff(p_pool);
  v_locked  := (v_lock_at IS NOT NULL AND NOW() >= v_lock_at);

  RETURN jsonb_build_object(
    'my_bracket', (
      SELECT jsonb_build_object('user_id', bp.user_id, 'payload', bp.payload, 'submitted_at', bp.submitted_at)
      FROM bracket_predictions bp
      WHERE bp.pool_id = p_pool AND bp.user_id = v_user_id
    ),
    'locked', v_locked,
    'lock_at', v_lock_at,
    'all_brackets', CASE WHEN v_locked THEN (
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', bp.user_id,
        'payload', bp.payload,
        'submitted_at', bp.submitted_at,
        'score', bs.points,
        'breakdown', bs.breakdown
      ))
      FROM bracket_predictions bp
      LEFT JOIN bracket_scores bs ON bs.pool_id = bp.pool_id AND bs.user_id = bp.user_id
      WHERE bp.pool_id = p_pool
    ) ELSE NULL END
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. RPC save_bracket_scores — upsert idempotente (owner only)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION save_bracket_scores(
  p_user   UUID,
  p_secret TEXT,
  p_pool   UUID,
  p_rows   JSONB  -- [{ user_id, points, breakdown }, ...]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_row     JSONB;
BEGIN
  SELECT id INTO v_user_id FROM profiles
  WHERE id = p_user AND secret_hash = crypt(p_secret, secret_hash);
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pools WHERE id = p_pool AND owner_id = v_user_id) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO bracket_scores (pool_id, user_id, points, breakdown, computed_at)
    VALUES (p_pool, (v_row->>'user_id')::UUID, (v_row->>'points')::NUMERIC, v_row->'breakdown', NOW())
    ON CONFLICT (pool_id, user_id)
    DO UPDATE SET points = EXCLUDED.points, breakdown = EXCLUDED.breakdown, computed_at = NOW();
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'updated', jsonb_array_length(p_rows));
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. Grants
-- ─────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION submit_bracket TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_pool_brackets TO anon, authenticated;
GRANT EXECUTE ON FUNCTION save_bracket_scores TO anon, authenticated;

GRANT SELECT ON teams TO anon, authenticated;
GRANT SELECT ON bracket_predictions TO anon, authenticated;
GRANT SELECT ON bracket_scores TO anon, authenticated;

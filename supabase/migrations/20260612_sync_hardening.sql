-- Migration: sync hardening — APLICADA 2026-06-14 via Management API (keli-vault/supabase)
--
-- Problema (auditoria 2026-06-11):
--   1. set_match_result aceitava QUALQUER owner/admin de pool → qualquer usuário
--      que criasse um bolão alterava o resultado GLOBAL de qualquer jogo.
--   2. save_scores não exigia credencial → qualquer um com a anon key
--      sobrescrevia pontuações.
--   Mitigação que existia: o cron de sync (10 min) revertia o vandalismo.
--   Esta migration fecha as duas brechas: resultado e pontuação só pelo
--   perfil de SISTEMA (Keli Sync, profiles.id = sync_user_id).
--
-- Estratégia sem-downtime aplicada:
--   a) cria fundação (_is_sync_user) — aditivo;
--   b) set_match_result: CREATE OR REPLACE (assinatura igual) trocando o check;
--   c) save_scores: cria OVERLOAD com auth, mantém a antiga viva até o redeploy
--      do app usar a nova; depois DROP da antiga (passo 4, no fim).

-- ─────────────────────────────────────────────────────────────
-- 1. Fundação: registro do perfil de sistema + verificador
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
-- sem policies: ilegível/inescrevível fora de security definer

INSERT INTO system_config (key, value)
VALUES ('sync_user_id', '02328798-05b8-4658-9699-972ebacc13da')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION _is_sync_user(p_user UUID, p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM system_config sc
    JOIN profiles p ON p.id = sc.value::UUID
    WHERE sc.key = 'sync_user_id'
      AND p.id = p_user
      AND p.secret_hash = crypt(p_secret, p.secret_hash)
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. set_match_result: só o perfil de sistema (resultado é global/oficial)
--    Owners de pool deixam de poder editar resultado. A rota de admin manual
--    (result/route.ts, user logado) passa a receber 'forbidden' → 403 gracioso.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_match_result(
  p_user uuid, p_secret text, p_match uuid,
  p_h90 integer, p_a90 integer, p_hft integer, p_aft integer, p_pen_winner text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_before jsonb;
begin
  if not _is_sync_user(p_user, p_secret) then raise exception 'forbidden'; end if;
  select to_jsonb(m) into v_before from matches m where m.id = p_match;
  update matches set
    score_home_90 = p_h90, score_away_90 = p_a90,
    score_home_ft = coalesce(p_hft, p_h90), score_away_ft = coalesce(p_aft, p_a90),
    penalty_winner = p_pen_winner, status = 'finished',
    manual_override = true, updated_at = now()
  where id = p_match;
  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (p_user, 'set_result', 'match', p_match, v_before,
          (select to_jsonb(m) from matches m where m.id = p_match));
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 3. save_scores: OVERLOAD com credencial de sistema
--    A antiga save_scores(p_rows) fica viva até o app novo subir (passo 4).
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_scores(p_user uuid, p_secret text, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not _is_sync_user(p_user, p_secret) then raise exception 'forbidden'; end if;
  insert into prediction_scores (prediction_id, points, breakdown, computed_at)
  select (r->>'prediction_id')::uuid, (r->>'points')::numeric, r->'breakdown', now()
  from jsonb_array_elements(p_rows) r
  on conflict (prediction_id) do update
    set points = excluded.points, breakdown = excluded.breakdown, computed_at = now();
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 4. DROP da save_scores insegura — rodar SÓ DEPOIS do app novo (que usa a
--    assinatura de 3 args) estar no ar e o sync confirmado.
-- ─────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.save_scores(jsonb);

-- NOTA save_bracket_scores: NÃO alterada. O sync não a usa (bracket é on-read,
-- bracket-live.ts); ela só é chamada pela rota de admin, que já é barrada no
-- set_match_result acima. Continua owner-only — sem brecha.

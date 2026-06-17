-- ADM "Narrador": comenta sozinho no mural a cada jogo (zoeira automática).
-- Espelha o perfil de sistema do sync. O perfil '🎙️ Narrador' + system_config
-- 'narrator_user_id' são SEED DE DADOS (criados via Management API, fora do Git,
-- como o sync_user) — aqui vai só o SCHEMA: ledger de idempotência + RPC.
-- Idempotente.

-- Ledger: cada evento narrado uma única vez (kickoff:<match>, ft:<match>,
-- leader:<user>, daily:<YYYYMMDD>). A unicidade é a trava anti-flood.
CREATE TABLE IF NOT EXISTS narrator_events (
  pool_id uuid NOT NULL,
  event_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_id, event_key)
);
ALTER TABLE narrator_events ENABLE ROW LEVEL SECURITY;

-- _is_narrator_user: valida o perfil de sistema do Narrador (igual _is_sync_user).
CREATE OR REPLACE FUNCTION public._is_narrator_user(p_user uuid, p_secret text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM system_config sc JOIN profiles p ON p.id = sc.value::uuid
    WHERE sc.key = 'narrator_user_id' AND p.id = p_user
      AND p.secret_hash = crypt(p_secret, p.secret_hash));
END; $function$
;

-- narrator_post: posta um comentário do Narrador, COM dedup atômico via ledger.
-- Reserva o event_key primeiro (ON CONFLICT DO NOTHING); se já existia, não posta
-- (retorna false). Assim nunca duplica, mesmo com ticks de cron sobrepostos.
CREATE OR REPLACE FUNCTION public.narrator_post(
  p_user uuid, p_secret text, p_pool uuid, p_scope text, p_match uuid, p_body text, p_event_key text
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_new boolean;
begin
  if not _is_narrator_user(p_user, p_secret) then raise exception 'not_narrator'; end if;
  if p_scope not in ('match', 'pool') then raise exception 'invalid_scope'; end if;

  insert into narrator_events (pool_id, event_key)
  values (p_pool, p_event_key)
  on conflict (pool_id, event_key) do nothing;
  get diagnostics v_new = row_count;
  if v_new = 0 then return false; end if;  -- já narrado: não reposta

  insert into comments (pool_id, user_id, scope, match_id, body)
  values (p_pool, p_user, p_scope, case when p_scope = 'match' then p_match else null end, p_body);
  return true;
end $function$
;

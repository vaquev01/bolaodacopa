-- Fix: em narrator_post, v_new recebia row_count (integer) numa var boolean
-- → "operator does not exist: boolean = integer". Tipo corrigido para integer.
-- Forward-only (a migration anterior já foi aplicada; CREATE OR REPLACE corrige).

CREATE OR REPLACE FUNCTION public.narrator_post(
  p_user uuid, p_secret text, p_pool uuid, p_scope text, p_match uuid, p_body text, p_event_key text
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_new integer;
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

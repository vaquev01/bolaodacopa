-- Dump das RPCs publicas do bolao-copa (via Management API) -- estado POS-hardening 2026-06-14
-- Fonte de verdade do schema. Gerado por dump; nao editar a mao sem re-aplicar no banco.

-- --- _auth ---
CREATE OR REPLACE FUNCTION public._auth(p_user uuid, p_secret text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select exists (select 1 from profiles where id = p_user and secret_hash = crypt(p_secret, secret_hash));
$function$
;

-- --- _is_sync_user ---
CREATE OR REPLACE FUNCTION public._is_sync_user(p_user uuid, p_secret text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM system_config sc JOIN profiles p ON p.id = sc.value::UUID
    WHERE sc.key = 'sync_user_id' AND p.id = p_user
      AND p.secret_hash = crypt(p_secret, p.secret_hash));
END; $function$
;

-- --- _lock_at ---
CREATE OR REPLACE FUNCTION public._lock_at(p_match uuid, p_ruleset jsonb)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.kickoff_at - make_interval(mins => coalesce((p_ruleset->'deadline'->>'minutes_before')::int, 15))
  from matches m where m.id = p_match;
$function$
;

-- --- _pool_first_kickoff ---
CREATE OR REPLACE FUNCTION public._pool_first_kickoff(p_pool uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select case
    when p.scope->>'type' = 'custom' then
      (select min(m.kickoff_at) from matches m
       where m.id in (select (jsonb_array_elements_text(p.scope->'match_ids'))::uuid))
    else (select min(m.kickoff_at) from matches m)
  end
  from pools p where p.id = p_pool;
$function$
;

-- --- create_pool ---
CREATE OR REPLACE FUNCTION public.create_pool(p_user uuid, p_secret text, p_name text, p_slug text, p_ruleset jsonb, p_scope jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_id uuid;
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  insert into pools (slug, name, owner_id, ruleset, scope)
  values (p_slug, p_name, p_user, p_ruleset, p_scope) returning id into v_id;
  insert into pool_members (pool_id, user_id, role) values (v_id, p_user, 'owner');
  return v_id;
end $function$
;

-- --- create_profile ---
CREATE OR REPLACE FUNCTION public.create_profile(p_name text, p_secret text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_id uuid;
begin
  insert into profiles (name, secret_hash) values (p_name, crypt(p_secret, gen_salt('bf')))
  returning id into v_id;
  return v_id;
end $function$
;

-- --- get_pool_brackets ---
CREATE OR REPLACE FUNCTION public.get_pool_brackets(p_user uuid, p_secret text, p_pool uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
$function$
;

-- --- join_pool ---
CREATE OR REPLACE FUNCTION public.join_pool(p_user uuid, p_secret text, p_slug text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_pool pools%rowtype; v_count int;
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  select * into v_pool from pools where slug = p_slug and status = 'active';
  if not found then raise exception 'pool_not_found'; end if;
  select count(*) into v_count from pool_members where pool_id = v_pool.id and status = 'active';
  if v_pool.max_members is not null and v_count >= v_pool.max_members then raise exception 'pool_full'; end if;
  insert into pool_members (pool_id, user_id, role, status)
  values (v_pool.id, p_user, 'player', case when v_pool.join_policy = 'approval' then 'pending' else 'active' end)
  on conflict (pool_id, user_id) do nothing;
  return v_pool.id;
end $function$
;

-- --- my_special_bets ---
CREATE OR REPLACE FUNCTION public.my_special_bets(p_user uuid, p_secret text, p_pool uuid)
 RETURNS TABLE(bet_type text, value text, submitted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  return query
    select sb.bet_type, sb.value, sb.submitted_at
    from pool_special_bets sb where sb.pool_id = p_pool and sb.user_id = p_user;
end $function$
;

-- --- predictions_for_scoring ---
CREATE OR REPLACE FUNCTION public.predictions_for_scoring(p_user uuid, p_secret text, p_pool uuid, p_match uuid)
 RETURNS TABLE(id uuid, payload jsonb, first_submitted_at timestamp with time zone, edit_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  if not exists (
    select 1 from pool_members pm where pm.pool_id = p_pool and pm.user_id = p_user and pm.role in ('owner','admin')
  ) then raise exception 'forbidden'; end if;
  return query
    select pr.id, pr.payload, pr.first_submitted_at, pr.edit_count
    from predictions pr where pr.pool_id = p_pool and pr.match_id = p_match;
end $function$
;

-- --- save_bracket_scores ---
CREATE OR REPLACE FUNCTION public.save_bracket_scores(p_user uuid, p_secret text, p_pool uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
$function$
;

-- --- save_scores ---
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
end $function$
;

-- --- save_special_scores ---
CREATE OR REPLACE FUNCTION public.save_special_scores(p_user uuid, p_secret text, p_pool uuid, p_bet_type text, p_actual text, p_scores jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare r jsonb;
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  if not exists (
    select 1 from pool_members pm where pm.pool_id = p_pool and pm.user_id = p_user and pm.role in ('owner','admin')
  ) then raise exception 'forbidden'; end if;
  insert into pool_special_results (pool_id, bet_type, value)
  values (p_pool, p_bet_type, p_actual)
  on conflict (pool_id, bet_type) do update set value = excluded.value, settled_at = now();
  for r in select * from jsonb_array_elements(p_scores) loop
    insert into special_bet_scores (pool_id, user_id, bet_type, points, breakdown)
    values (p_pool, (r->>'user_id')::uuid, p_bet_type, (r->>'points')::numeric, r->'breakdown')
    on conflict (pool_id, user_id, bet_type)
    do update set points = excluded.points, breakdown = excluded.breakdown, computed_at = now();
  end loop;
  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (p_user, 'settle_special', 'pool', p_pool,
          jsonb_build_object('bet_type', p_bet_type, 'actual', p_actual));
end $function$
;

-- --- set_match_result ---
CREATE OR REPLACE FUNCTION public.set_match_result(p_user uuid, p_secret text, p_match uuid, p_h90 integer, p_a90 integer, p_hft integer, p_aft integer, p_pen_winner text)
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
end $function$
;

-- --- special_bets_for_scoring ---
CREATE OR REPLACE FUNCTION public.special_bets_for_scoring(p_user uuid, p_secret text, p_pool uuid, p_bet_type text)
 RETURNS TABLE(user_id uuid, value text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  if not exists (
    select 1 from pool_members pm where pm.pool_id = p_pool and pm.user_id = p_user and pm.role in ('owner','admin')
  ) then raise exception 'forbidden'; end if;
  return query
    select sb.user_id, sb.value from pool_special_bets sb
    where sb.pool_id = p_pool and sb.bet_type = p_bet_type;
end $function$
;

-- --- submit_bracket ---
CREATE OR REPLACE FUNCTION public.submit_bracket(p_user uuid, p_secret text, p_pool uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
$function$
;

-- --- submit_prediction ---
CREATE OR REPLACE FUNCTION public.submit_prediction(p_user uuid, p_secret text, p_pool uuid, p_match uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_ruleset jsonb; v_id uuid;
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  if not exists (select 1 from pool_members where pool_id = p_pool and user_id = p_user and status = 'active')
    then raise exception 'not_member'; end if;
  select ruleset into v_ruleset from pools where id = p_pool;
  if now() >= _lock_at(p_match, v_ruleset) then raise exception 'deadline_passed'; end if;
  if coalesce((v_ruleset->'edits'->>'allowed')::boolean, true) then
    insert into predictions (pool_id, user_id, match_id, payload)
    values (p_pool, p_user, p_match, p_payload)
    on conflict (pool_id, user_id, match_id)
    do update set payload = excluded.payload, submitted_at = now(),
                  edit_count = predictions.edit_count + 1
    returning id into v_id;
  else
    insert into predictions (pool_id, user_id, match_id, payload)
    values (p_pool, p_user, p_match, p_payload) returning id into v_id;
  end if;
  return v_id;
end $function$
;

-- --- submit_special_bet ---
CREATE OR REPLACE FUNCTION public.submit_special_bet(p_user uuid, p_secret text, p_pool uuid, p_bet_type text, p_value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  if not exists (select 1 from pool_members where pool_id = p_pool and user_id = p_user and status = 'active')
    then raise exception 'not_member'; end if;
  if now() >= _pool_first_kickoff(p_pool) then raise exception 'deadline_passed'; end if;
  insert into pool_special_bets (pool_id, user_id, bet_type, value)
  values (p_pool, p_user, p_bet_type, p_value)
  on conflict (pool_id, user_id, bet_type)
  do update set value = excluded.value, submitted_at = now();
end $function$
;

-- ════════════════════════════════════════════════════════════════════
-- Identidade portável + premiação (migrations 20260614_portable_identity / _pool_ruleset_update)
-- ════════════════════════════════════════════════════════════════════

-- --- register_account ---
CREATE OR REPLACE FUNCTION public.register_account(p_name text, p_secret text, p_password text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare v_id uuid; v_name text := trim(p_name);
begin
  if length(coalesce(v_name, '')) < 2 then raise exception 'invalid_name'; end if;
  if length(coalesce(p_password, '')) < 4 then raise exception 'weak_password'; end if;
  if exists (select 1 from profiles where lower(login_name) = lower(v_name)) then
    raise exception 'login_taken';
  end if;
  insert into profiles (name, login_name, secret_hash, password_hash)
  values (v_name, v_name, crypt(p_secret, gen_salt('bf')), crypt(p_password, gen_salt('bf')))
  returning id into v_id;
  return v_id;
end $function$
;

-- --- login_account (rotaciona o secret de sessão) ---
CREATE OR REPLACE FUNCTION public.login_account(p_name text, p_password text, p_new_secret text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare v_id uuid; v_name text;
begin
  select id, name into v_id, v_name from profiles
  where lower(login_name) = lower(trim(p_name))
    and password_hash is not null
    and password_hash = crypt(p_password, password_hash);
  if v_id is null then raise exception 'invalid_credentials'; end if;
  update profiles set secret_hash = crypt(p_new_secret, gen_salt('bf')) where id = v_id;
  return jsonb_build_object('user_id', v_id, 'name', v_name);
end $function$
;

-- --- set_account_credentials (claim: adiciona login+senha a perfil só-cookie) ---
CREATE OR REPLACE FUNCTION public.set_account_credentials(p_user uuid, p_secret text, p_name text, p_password text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare v_name text := trim(p_name);
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  if length(coalesce(v_name, '')) < 2 then raise exception 'invalid_name'; end if;
  if length(coalesce(p_password, '')) < 4 then raise exception 'weak_password'; end if;
  if exists (select 1 from profiles where lower(login_name) = lower(v_name) and id <> p_user) then
    raise exception 'login_taken';
  end if;
  update profiles set login_name = v_name, name = v_name, password_hash = crypt(p_password, gen_salt('bf'))
   where id = p_user;
  return jsonb_build_object('user_id', p_user, 'name', v_name);
end $function$
;

-- --- my_pools ---
CREATE OR REPLACE FUNCTION public.my_pools(p_user uuid, p_secret text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', p.name, 'slug', p.slug, 'role', pm.role,
      'members', (select count(*) from pool_members x where x.pool_id = p.id and x.status = 'active')
    ) order by p.created_at desc)
    from pool_members pm join pools p on p.id = pm.pool_id
    where pm.user_id = p_user and pm.status = 'active' and p.status = 'active'
      and p.name not like '\_sistema%'
  ), '[]'::jsonb);
end $function$
;

-- --- update_pool_ruleset (dono edita ruleset/premiação) ---
CREATE OR REPLACE FUNCTION public.update_pool_ruleset(p_user uuid, p_secret text, p_pool uuid, p_ruleset jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  if not exists (select 1 from pools where id = p_pool and owner_id = p_user) then
    raise exception 'forbidden';
  end if;
  update pools set ruleset = p_ruleset where id = p_pool;
end $function$
;


-- --- comments: post/list/delete (migration 20260616_comments.sql) ---
CREATE OR REPLACE FUNCTION public.delete_comment(p_user uuid, p_secret text, p_comment uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_pool uuid; v_author uuid; v_owner uuid;
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  select pool_id, user_id into v_pool, v_author from comments where id = p_comment;
  if v_pool is null then raise exception 'not_found'; end if;
  select owner_id into v_owner from pools where id = v_pool;
  if p_user <> v_author and p_user <> v_owner then raise exception 'forbidden'; end if;
  delete from comments where id = p_comment;
  return true;
end $function$


CREATE OR REPLACE FUNCTION public.list_comments(p_user uuid, p_secret text, p_pool uuid, p_scope text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_owner uuid;
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  if not exists (
    select 1 from pool_members
    where pool_id = p_pool and user_id = p_user and status = 'active'
  ) then raise exception 'not_member'; end if;

  select owner_id into v_owner from pools where id = p_pool;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'user_id', c.user_id,
      'name', coalesce(pr.name, '—'),
      'scope', c.scope,
      'match_id', c.match_id,
      'body', c.body,
      'created_at', c.created_at,
      'can_delete', (c.user_id = p_user or v_owner = p_user)
    ) order by c.created_at asc)
    from comments c
    left join profiles pr on pr.id = c.user_id
    where c.pool_id = p_pool
      and (p_scope is null or c.scope = p_scope)
  ), '[]'::jsonb);
end $function$


CREATE OR REPLACE FUNCTION public.post_comment(p_user uuid, p_secret text, p_pool uuid, p_scope text, p_match uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_id uuid; v_body text := trim(p_body);
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  if not exists (
    select 1 from pool_members
    where pool_id = p_pool and user_id = p_user and status = 'active'
  ) then raise exception 'not_member'; end if;
  if p_scope not in ('match', 'pool') then raise exception 'invalid_scope'; end if;
  if (p_scope = 'match') <> (p_match is not null) then raise exception 'invalid_match'; end if;
  if length(coalesce(v_body, '')) < 1 then raise exception 'empty_body'; end if;
  if length(v_body) > 280 then raise exception 'body_too_long'; end if;

  insert into comments (pool_id, user_id, scope, match_id, body)
  values (p_pool, p_user, p_scope, p_match, v_body)
  returning id into v_id;
  return v_id;
end $function$

-- --- narrador: zoeira automática (migration 20260616_narrator + _fix) ---
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


CREATE OR REPLACE FUNCTION public.narrator_post(p_user uuid, p_secret text, p_pool uuid, p_scope text, p_match uuid, p_body text, p_event_key text)
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

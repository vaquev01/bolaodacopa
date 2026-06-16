-- Resenha do bolão: comentários jogo a jogo + mural geral (classificação).
-- Torna o bolão mais interativo/competitivo depois que os palpites travam.
-- Idempotente. Mesmo padrão de auth dos demais writes: _auth(p_user,p_secret) + membership.
-- Leitura/escrita SÓ via RPC SECURITY DEFINER — RLS nega acesso direto da chave anon
-- (identidade é por cookie, não Supabase Auth), então sem RPC a tabela fica fechada.

CREATE TABLE IF NOT EXISTS comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pool_id uuid NOT NULL,
  user_id uuid NOT NULL,
  scope text NOT NULL,            -- 'match' (resenha de um jogo) | 'pool' (mural geral)
  match_id uuid,                  -- preenchido quando scope = 'match'
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comments_scope_chk CHECK (scope IN ('match', 'pool')),
  CONSTRAINT comments_match_chk CHECK ((scope = 'match') = (match_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS comments_pool_scope_idx ON comments (pool_id, scope, created_at);
CREATE INDEX IF NOT EXISTS comments_match_idx ON comments (pool_id, match_id) WHERE match_id IS NOT NULL;

-- RLS ligada SEM policy de SELECT/INSERT/DELETE = nega tudo pela anon.
-- As RPCs abaixo são SECURITY DEFINER e acessam por baixo da RLS, validando
-- membership por dentro (mesma estratégia de profiles/bracket_predictions).
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- post_comment: posta uma resenha. scope 'pool' = mural; 'match' = num jogo.
-- Exige ser membro ativo do pool. body 1..280 (estilo recado curto).
CREATE OR REPLACE FUNCTION public.post_comment(
  p_user uuid, p_secret text, p_pool uuid, p_scope text, p_match uuid, p_body text
)
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
;

-- list_comments: comentários do pool (membro autenticado). scope opcional:
-- 'pool' só o mural, 'match' só resenhas de jogo; NULL = tudo. Inclui nome e
-- can_delete (autor OU dono do pool) p/ a UI mostrar o botão de apagar.
CREATE OR REPLACE FUNCTION public.list_comments(
  p_user uuid, p_secret text, p_pool uuid, p_scope text DEFAULT NULL
)
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
;

-- delete_comment: autor apaga o próprio; dono do pool apaga qualquer um (moderação).
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
;

-- Identidade portável: a pessoa acessa o bolão de QUALQUER aparelho com nome + senha.
-- Antes a identidade vivia só num cookie de um navegador (perdia ao trocar de device/domínio).
-- Idempotente. Espelha a mecânica bcrypt já usada em secret_hash (crypt/gen_salt('bf')).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS login_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash text;

-- login_name é único entre contas-com-senha (perfis antigos só-cookie têm NULL e não contam).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_name_unique
  ON profiles (lower(login_name)) WHERE login_name IS NOT NULL;

-- register_account: cria a conta portável. nome = login = exibição. Erro 'login_taken' se em uso.
CREATE OR REPLACE FUNCTION public.register_account(p_name text, p_secret text, p_password text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
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

-- login_account: valida nome+senha e ROTACIONA o secret de sessão (devolvido p/ o cookie).
-- O secret cru não é guardado (só hash), então cada login emite um secret novo p/ aquele device.
-- Trade-off MVP: o último device logado é o ativo; reabrir em device antigo pede novo login.
CREATE OR REPLACE FUNCTION public.login_account(p_name text, p_password text, p_new_secret text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
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

-- set_account_credentials: adiciona login+senha a um perfil só-cookie existente (claim), preservando palpites.
CREATE OR REPLACE FUNCTION public.set_account_credentials(p_user uuid, p_secret text, p_name text, p_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_name text := trim(p_name);
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  if length(coalesce(v_name, '')) < 2 then raise exception 'invalid_name'; end if;
  if length(coalesce(p_password, '')) < 4 then raise exception 'weak_password'; end if;
  if exists (select 1 from profiles where lower(login_name) = lower(v_name) and id <> p_user) then
    raise exception 'login_taken';
  end if;
  update profiles
     set login_name = v_name, name = v_name, password_hash = crypt(p_password, gen_salt('bf'))
   where id = p_user;
  return jsonb_build_object('user_id', p_user, 'name', v_name);
end $function$
;

-- my_pools: bolões ativos do usuário autenticado (p/ a home "seus bolões"). Esconde pools de sistema.
CREATE OR REPLACE FUNCTION public.my_pools(p_user uuid, p_secret text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', p.name,
      'slug', p.slug,
      'role', pm.role,
      'members', (select count(*) from pool_members x where x.pool_id = p.id and x.status = 'active')
    ) order by p.created_at desc)
    from pool_members pm
    join pools p on p.id = pm.pool_id
    where pm.user_id = p_user and pm.status = 'active' and p.status = 'active'
      and p.name not like '\_sistema%'
  ), '[]'::jsonb);
end $function$
;

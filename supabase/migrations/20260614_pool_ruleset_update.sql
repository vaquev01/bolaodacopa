-- Permite ao DONO editar o ruleset do bolão (ex: ligar/ajustar premiação no admin).
-- Necessário porque pools tem RLS só de SELECT — todo write passa por RPC security definer.
-- Sem isso, um UPDATE direto via anon é bloqueado (0 rows) e o salvar falha em silêncio.
CREATE OR REPLACE FUNCTION public.update_pool_ruleset(p_user uuid, p_secret text, p_pool uuid, p_ruleset jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not _auth(p_user, p_secret) then raise exception 'unauthorized'; end if;
  if not exists (select 1 from pools where id = p_pool and owner_id = p_user) then
    raise exception 'forbidden';
  end if;
  update pools set ruleset = p_ruleset where id = p_pool;
end $function$
;

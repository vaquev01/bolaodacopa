-- Ranking mostrava "—" no lugar do nome de TODO mundo (menos o próprio).
-- Causa: RLS ligada em `profiles` SEM policy de SELECT → a chave anon (que o
-- servidor usa, pois a identidade é por cookie, não Supabase Auth) não lê o
-- nome de ninguém pelo join. O nome próprio só aparecia por vir do cookie.
--
-- Os nomes SEMPRE existiram (profiles.name é NOT NULL) — era só visibilidade.
-- Fix de exposição mínima: RPC SECURITY DEFINER que devolve APENAS (user_id,
-- name) dos membros ativos de um pool. NUNCA expõe secret_hash/password_hash —
-- por isso não se abre uma policy SELECT genérica em profiles (seria row-level
-- e vazaria os hashes). Idempotente.

CREATE OR REPLACE FUNCTION public.pool_member_names(p_pool uuid)
 RETURNS TABLE (user_id uuid, name text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pm.user_id, pr.name
  FROM pool_members pm
  JOIN profiles pr ON pr.id = pm.user_id
  WHERE pm.pool_id = p_pool AND pm.status = 'active';
$function$;

REVOKE ALL ON FUNCTION public.pool_member_names(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pool_member_names(uuid) TO anon, authenticated;

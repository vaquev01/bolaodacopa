-- Migration: sync hardening (PENDENTE DE APLICAÇÃO — requer acesso admin/MCP Supabase)
--
-- Contexto (descoberto na auditoria de 2026-06-11):
--   1. set_match_result aceita QUALQUER owner de pool → qualquer usuário que
--      crie um bolão consegue alterar o resultado GLOBAL de qualquer jogo.
--   2. save_scores não exige credencial nenhuma → qualquer pessoa com a anon
--      key consegue sobrescrever pontuações.
--   Mitigação ativa hoje: o cron de sync (a cada 10 min) reaplica o resultado
--   oficial da football-data e repontua, revertendo vandalismo. Esta migration
--   fecha o buraco de verdade.
--
-- Pré-requisito: perfil de sistema já criado (Keychain keli-vault/bolao-sync).
-- Substituir o UUID abaixo se o perfil de sistema mudar.

-- ─────────────────────────────────────────────────────────────
-- 1. Registro do perfil de sistema
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
-- 2. set_match_result: só o perfil de sistema
--    (owners de pool perdem o poder de editar resultado global;
--     o admin manual da UI continua funcionando apenas para o
--     owner do pool _sistema_sync, i.e. a Keli)
-- ─────────────────────────────────────────────────────────────
-- NOTA: reescrever a função existente trocando a checagem de
-- "owner de algum pool" por:
--   IF NOT _is_sync_user(p_user, p_secret) THEN
--     RAISE EXCEPTION 'forbidden';
--   END IF;
-- O corpo original não está versionado neste repo (init schema foi aplicado
-- via MCP) — ao aplicar esta migration, primeiro fazer dump da função:
--   SELECT pg_get_functiondef('set_match_result'::regproc);
-- e versionar aqui o CREATE OR REPLACE completo.

-- ─────────────────────────────────────────────────────────────
-- 3. save_scores: exigir credencial de sistema
-- ─────────────────────────────────────────────────────────────
-- Mesmo procedimento: dump da função atual, adicionar parâmetros
-- p_user UUID, p_secret TEXT e a checagem _is_sync_user no topo.
-- Atualizar os call sites:
--   - src/lib/sync/index.ts (rescoreMatch)
--   - src/app/api/matches/[id]/result/route.ts

-- ─────────────────────────────────────────────────────────────
-- 4. save_bracket_scores: aceitar também o perfil de sistema
-- ─────────────────────────────────────────────────────────────
-- Trocar o IF NOT EXISTS (owner) por:
--   IF NOT (_is_sync_user(p_user, p_secret) OR EXISTS (
--     SELECT 1 FROM pools WHERE id = p_pool AND owner_id = v_user_id
--   )) THEN RAISE EXCEPTION 'not_owner'; END IF;

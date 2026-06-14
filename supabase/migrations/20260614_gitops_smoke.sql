-- Smoke test do GitOps de schema: prova que o pipeline (preDeployCommand) aplica
-- migrations do repo sozinho. Idempotente. Grava a "versão" do schema aplicada.
INSERT INTO system_config (key, value)
VALUES ('schema_pipeline_check', '20260614-gitops')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

#!/usr/bin/env node
/**
 * migrate.mjs — Migrate runner GitOps (roda no preDeployCommand do Railway).
 *
 * Aplica supabase/migrations/*.sql pendentes via Supabase Management API, então
 * o SCHEMA DERIVA DO GIT, aplicado no pipeline (não à mão). Sem senha do Postgres:
 * usa SUPABASE_ACCESS_TOKEN (PAT) + SUPABASE_PROJECT_REF. Idempotente via tabela
 * schema_migrations (cada arquivo aplicado uma única vez, na ordem do nome).
 *
 * Falha = aborta o deploy (fail-safe): melhor não subir do que subir com drift.
 *
 * Baseline: um banco que já tinha migrations aplicadas à mão deve ter elas
 * pré-registradas em schema_migrations (ver migrate-baseline) pra não reaplicar
 * SQL não-idempotente (ex: CREATE POLICY).
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
if (!TOKEN || !REF) {
  console.error("[migrate] ERRO: faltam SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF");
  process.exit(1);
}
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function runSql(sql) {
  const r = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      // UA explícito — o WAF do Supabase/Cloudflare derruba UAs "robô" default
      "User-Agent": "keli-migrate/1.0",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (data && data.message && /error|failed/i.test(data.message)) {
    throw new Error(data.message.slice(0, 400));
  }
  return data;
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");

async function main() {
  await runSql(
    `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now());`
  );
  const rows = (await runSql(`SELECT name FROM schema_migrations`)) || [];
  const applied = new Set(rows.map((r) => r.name));

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  let n = 0;
  for (const f of files) {
    if (applied.has(f)) {
      console.log(`[migrate] = ${f} (já aplicada)`);
      continue;
    }
    const sql = await readFile(join(migrationsDir, f), "utf8");
    console.log(`[migrate] + aplicando ${f} …`);
    await runSql(sql);
    await runSql(
      `INSERT INTO schema_migrations (name) VALUES ('${f.replace(/'/g, "''")}') ON CONFLICT DO NOTHING;`
    );
    n++;
  }
  console.log(`[migrate] ok — ${n} nova(s) de ${files.length} migration(s)`);
}

main().catch((e) => {
  console.error("[migrate] FALHOU:", e.message);
  process.exit(1);
});

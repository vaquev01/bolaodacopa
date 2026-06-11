---
name: project_scaffold
description: Scaffold Next.js 14 concluído (commit 3863e5a) — porta 3017, vitest passando, Supabase clients implementados, design tokens UX mapeados
metadata:
  type: project
---

Scaffold completo em commit 3863e5a (2026-06-11).

**Why:** Sprint inicial — base técnica para que outros agentes (scoring engine, API routes, UI components) possam construir em paralelo sem bloqueio de setup.

**How to apply:** next.config.ts NÃO funciona no Next.js 14 — usar next.config.mjs. Porta dev fixa 3017 (lsof confirmou livre). vitest.config.ts com `environment: "node"`, include `src/**/*.test.ts`.

Arquivos criados:
- `package.json` — scripts dev/start/build/test/lint com porta 3017
- `next.config.mjs` — config mínima (ts não suportado no Next 14)
- `tsconfig.json` — alias @/* → src/*
- `tailwind.config.ts` — tokens CSS var mapeados
- `postcss.config.mjs`
- `vitest.config.ts` — node env, alias @/*
- `.eslintrc.json` — next/core-web-vitals
- `src/app/globals.css` — CSS vars light/dark (prefers-color-scheme), tokens do ux-guidelines.md
- `src/app/layout.tsx` — RootLayout, lang pt-BR
- `src/app/page.tsx` — placeholder minimalista usando tokens
- `src/lib/supabase/browser.ts` — createBrowserClient via @supabase/ssr
- `src/lib/supabase/server.ts` — createServerClient via @supabase/ssr + cookies()
- `src/lib/supabase/index.ts` — re-exports
- `src/lib/scoring/.gitkeep` — reservado para scoring engine (outro agente)
- `src/app/api/.gitkeep` — reservado para route handlers
- `supabase/migrations/.gitkeep`
- `src/lib/scoring/sanity.test.ts` — 3 testes vitest passando

Build output: ✓ Compiled successfully (exit 0). Tests: 3/3 passed.

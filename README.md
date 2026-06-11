# Bolão Copa 2026

Plataforma onde qualquer pessoa cria e administra seu próprio bolão da Copa do Mundo 2026 — da copa inteira a um único jogo — com todas as regras editáveis (pontuação, tipos de palpite, deadlines, visibilidade). **Não processa dinheiro** (premiação apenas informativa).

## Status

Em implementação (2026-06-11). Ver `SPEC.md` (PRD + Tech Spec) e `STATE.md`.

- ✅ Supabase provisionado: projeto `bolao-copa` (`rsippykwiffybjfgljzj`, sa-east-1, free tier) — schema completo (8 tabelas, RLS, 6 RPCs security definer com deadline server-side) + seed com 24 jogos reais da 1ª semana da Copa
- ✅ Scaffold Next.js 14 App Router + TypeScript + Tailwind + vitest (porta 3017), clients Supabase em `src/lib/supabase/`
- ⏳ Scoring Engine (`src/lib/scoring/`) — em desenvolvimento via TDD (ruleset Zod + engine puro + standings; testes em `src/lib/scoring/*.test.ts`)
- ⏳ API routes + UI das telas core (em desenvolvimento paralelo)
- ⏳ Calendário completo 104 jogos (24 seedados; restante em coleta verificada)

### Rodar local

```bash
cp .env.local.example .env.local   # preencher NEXT_PUBLIC_SUPABASE_URL e ANON_KEY
npm install
npm run dev                        # http://localhost:3017
npm run test                       # vitest
```

## Documentos

| Arquivo | Conteúdo |
|---|---|
| `SPEC.md` | PRD (problema, benchmark, MoSCoW, edge cases) + Tech Spec (stack, data model, ruleset JSON, API) + resumo UX |
| `docs/ux-guidelines.md` | Spec UX/UI completa (fluxos, telas, tokens, anti-patterns) |
| `STATE.md` | Posição atual, decisões, blockers, próximo passo |

## Stack (planejado)

Next.js (App Router) + TypeScript · Supabase (Postgres + Auth + Realtime, RLS multi-tenant) · Tailwind · Vercel · football-data.org (resultados, com fallback manual). Porta dev: **3017**.

## Conceito técnico central

**Regras são dados, não código:** cada bolão tem um `ruleset` JSON versionado; o Scoring Engine é uma função pura `score(ruleset, prediction, result) → points` — qualquer combinação de regras sem deploy.

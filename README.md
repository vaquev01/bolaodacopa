# Bolão Copa 2026

Plataforma onde qualquer pessoa cria e administra seu próprio bolão da Copa do Mundo 2026 — da copa inteira a um único jogo — com todas as regras editáveis (pontuação, tipos de palpite, deadlines, visibilidade). **Não processa dinheiro** (premiação apenas informativa).

## Status

Fase de spec — implementação não iniciada. Ver `SPEC.md` (PRD + Tech Spec) e `STATE.md`.

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

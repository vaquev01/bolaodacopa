# STATE — bolao-copa

**Atualizado:** 2026-06-11

## Posição atual

- Spec completa criada (SPEC.md: PRD + Tech Spec + resumo UX) via pipeline multi-agente (core-brainstormer + core-researcher + cre-ux)
- UX guidelines completas em docs/ux-guidelines.md
- Zero código — implementação não iniciada

## Decisões tomadas

- Zero money: site nunca processa dinheiro; premiação informativa (texto + % split)
- Regras como dados: ruleset JSON versionado por bolão + Scoring Engine puro
- Stack: Next.js + Supabase (RLS multi-tenant) + Vercel; football-data.org free tier com fallback manual de resultados
- Deadline anti-fraude: timestamp e lock sempre server-side (constraint no Postgres)
- Ruleset trava no primeiro jogo do escopo
- Diferencial vs mercado (pesquisa 2026-06-11): bolão de jogo único + editor de regras simples + WhatsApp-first
- UX Apple-simples: wizard 3 telas com defaults, modo avançado opt-in, steppers para placar, porta dev 3017

## Blockers [A DEFINIR]

- Metas numéricas de sucesso (Victor)
- Nome/domínio do produto (Victor)
- Teto de custo infra + tier €12/mês livescores (Victor)
- Prisma vs supabase-js (decidir no write-plan)

## Próximo passo

`/write-plan` sobre SPEC.md → plano TDD (alvo nº1: Scoring Engine). Urgência: Copa começa em junho/2026.

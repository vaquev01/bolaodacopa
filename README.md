# Bolão Copa 2026

Plataforma onde qualquer pessoa cria e administra seu próprio bolão da Copa do Mundo 2026 — da copa inteira a um único jogo — com todas as regras editáveis (pontuação, tipos de palpite, deadlines, visibilidade). **Não processa dinheiro** (premiação apenas informativa).

## Status

**MVP funcional rodando** (2026-06-11). Ver `SPEC.md` (PRD + Tech Spec) e `STATE.md`.

- ✅ Supabase provisionado: projeto `bolao-copa` (`rsippykwiffybjfgljzj`, sa-east-1, free tier) — schema completo (8 tabelas, RLS, 7 RPCs security definer com deadline server-side)
- ✅ Scaffold Next.js 14 App Router + TypeScript + Tailwind + vitest (porta 3017), clients Supabase em `src/lib/supabase/`
- ✅ Scoring Engine (`src/lib/scoring/`) — TDD, 69 testes passando (ruleset Zod + engine puro + standings)
- ✅ API routes + UI das telas core (landing, wizard `/criar`, `/b/[slug]` palpites+ranking, admin, convite WhatsApp)
- ✅ **Calendário oficial completo: 104 jogos** sincronizados da API football-data.org (abertura 11/06 19:00 UTC → final 19/07), nomes pt-BR, mata-mata como "A definir" até classificação
- ✅ Smoke test end-to-end validado contra Supabase real: criar perfil → criar bolão → entrar → palpitar → lançar resultado → pontos calculados (exato=10, vencedor+saldo=5)
- ⏳ Sync automático de placares via cron (token no Keychain `keli-vault/football-data`) — follow-up
- ⏳ Deploy Vercel — follow-up

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
| `scripts/gen_wc26_sql.py` | Re-sync do calendário: dump da football-data.org → VALUES SQL pt-BR para a tabela `matches` (uso no docstring; testes em `scripts/test_gen_wc26_sql.py`, pytest 3/3) |

## Stack (planejado)

Next.js (App Router) + TypeScript · Supabase (Postgres + Auth + Realtime, RLS multi-tenant) · Tailwind · Vercel · football-data.org (resultados, com fallback manual). Porta dev: **3017**.

## Conceito técnico central

**Regras são dados, não código:** cada bolão tem um `ruleset` JSON versionado; o Scoring Engine é uma função pura `score(ruleset, prediction, result) → points` — qualquer combinação de regras sem deploy.

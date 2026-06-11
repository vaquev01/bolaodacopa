# STATE — bolao-copa

**Atualizado:** 2026-06-11 (tarde — execução iniciada)

## Posição atual

- Spec completa (SPEC.md) + UX guidelines (docs/ux-guidelines.md) — pipeline multi-agente
- **Supabase provisionado:** projeto `bolao-copa` id `rsippykwiffybjfgljzj`, região sa-east-1, $0/mês. URL: https://rsippykwiffybjfgljzj.supabase.co
- **Migrations aplicadas:** `init_bolao_schema` (8 tabelas + RLS + RPCs: create_profile, create_pool, join_pool, submit_prediction [valida deadline no banco], set_match_result [com audit_log], save_scores) e `seed_wc2026_fixtures_week1` (24 jogos reais 11–18/06, fontes NBC+ESPN+AlJazeera)
- **Scaffold Next.js** na raiz do repo: App Router + TS + Tailwind + vitest, porta 3017, clients Supabase prontos
- Em andamento: Scoring Engine (TDD) → API/UI → app rodando

## Decisões de implementação (além da spec)

- Identidade leve MVP: tabela `profiles` + secret bcrypt (pgcrypto em schema `extensions`) ao invés de Supabase Auth — toda escrita via RPC security definer; Supabase Auth fica para hardening pós-MVP
- pgcrypto: funções precisam `search_path = public, extensions` no Supabase
- Anon key fica em .env.local (não commitado); escrita direta nas tabelas bloqueada por RLS

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

## MVP implementado (2026-06-11)

Agente UI/API construiu o MVP completo. Build `next build` passando limpo.

### Arquivos criados

**src/lib/**
- `scoring-stub.ts` — contrato do Scoring Engine (stub funcional, substitui quando src/lib/scoring/index.ts existir)
- `session.ts` — identidade leve: {userId, secret, name} em cookie httpOnly
- `types.ts` — tipos Match, Pool, Prediction, PredictionScore, StandingRow
- `utils.ts` — formatKickoff, deadlineLabel, deadlineUrgency, getFlag, stageLabel, slugify

**src/app/api/**
- `profiles/route.ts` — POST: cria perfil via RPC create_profile + seta cookie
- `pools/route.ts` — POST: cria pool via RPC create_pool
- `pools/join/route.ts` — POST: entra no pool via RPC join_pool
- `predictions/route.ts` — POST: submete palpite via RPC submit_prediction; retorna 422 deadline_passed
- `matches/[id]/result/route.ts` — POST: set_match_result + scorePrediction sobre todos os palpites + save_scores
- `session/check/route.ts` — GET: retorna userId+name da sessão atual

**src/app/**
- `page.tsx` — Landing: CTA "Criar meu bolão" + campo "Tenho um convite"
- `criar/page.tsx` — Wizard 3 passos: nome+escopo, regras, revisão
- `b/[slug]/convite/page.tsx` + `ConviteClient.tsx` — link copiável + botão WhatsApp
- `b/[slug]/page.tsx` + `BolaoClient.tsx` — tabs Palpites (steppers, auto-save 1.5s, countdown) e Ranking
- `b/[slug]/entrar/page.tsx` + `EntrarClient.tsx` — preview sem login, form nome, join
- `b/[slug]/admin/page.tsx` + `AdminClient.tsx` — form resultado por jogo (owner only)

## Próximo passo

- Scoring Engine (agente paralelo) implementa src/lib/scoring/index.ts com as mesmas assinaturas — remover scoring-stub.ts
- Testar fluxo end-to-end com Supabase real
- Adicionar `profiles` join no select de predictions para exibir nomes
- Considerar Supabase Realtime no ranking

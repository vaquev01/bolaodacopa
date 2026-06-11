# STATE — bolao-copa

**Atualizado:** 2026-06-11 (MVP rodando, smoke test e2e validado)

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

## Integração final (2026-06-11, mesmo dia)

- ✅ Scoring engine real integrado (`src/lib/scoring/index.ts`), `scoring-stub.ts` removido — 69 testes + build limpos
- ✅ **Calendário oficial 104 jogos** no banco via migration `replace_seed_with_full_official_calendar` (fonte: football-data.org API v4, ext_id `fd-{id}`, nomes pt-BR; mata-mata "A definir"). Token no Keychain `keli-vault/football-data`
- ✅ Migration `rpc_predictions_for_scoring`: RLS esconde palpites até kickoff, então a rota de resultado usa RPC security definer (valida `_auth` + owner) para ler palpites e pontuar
- ✅ Smoke test e2e real (porta 3017, `next start`): perfil → bolão → join 2º jogador → 2 palpites → resultado 2x1 → `scored: 2` (exato=10 pts, vencedor+saldo=5 pts, breakdown correto). Dados de teste limpos do banco depois
- ✅ Todas as rotas respondem 200 (/, /criar, /b/[slug], convite, admin; /entrar 307 quando já membro)
- ✅ Commit `ab9f152` + push (repo keli-products-bolao-copa)
- ⚠️ `.env.local` precisa exatamente `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Pesquisa repos GitHub (2026-06-11)

Top 3 recomendados: **openfootball/worldcup.json** (CC0, fixtures 2026 auto-atualizados — fallback/cross-check do football-data.org), **Bignotto/big-bolao-mobile** (MIT, schema Supabase de bolão como referência), **lipis/flag-icons** (MIT, 12k stars — bandeiras `fi fi-br`). Bracket mata-mata: melhor fazer manual com Tailwind (lib g-loot é LGPL + styled-components). Não existe wrapper TS ativo p/ football-data.org v4 → client fetch próprio. Nenhum repo open-source tem ruleset configurável — nosso diferencial confirmado.

## Próximo passo

- Sync automático de placares: rota/cron (Vercel Cron) usando token `keli-vault/football-data` + cross-check openfootball/worldcup.json
- Adicionar `profiles` join no select de predictions para exibir nomes no ranking
- Deploy Vercel (env vars + domínio — blocker: nome do produto)
- Bandeiras via `flag-icons` (npm) no lugar de emoji
- Considerar Supabase Realtime no ranking

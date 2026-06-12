# STATE — bolao-copa

**Atualizado:** 2026-06-12 10:40 (v1.4 modo "só vencedor" + UX guiada one-page)

## v1.5 — Classificação completa + chaveamento visual (2026-06-12)

Victor: "definir 1º, 2º e melhores 3ºs (influem no chaveamento)", "chaveamento da Copa visível como o PDF", "placar exato como pontuação extra".

- **Bracket pré-ligado no "Só classificação"** (1º/2º + 8 melhores 3ºs + fases já existiam no BracketCard v1.1)
- **Placar extra**: toggle no wizard (default on, 10 pts) → variant `specials_plus` = scope custom (lock pós-amanhã) + ruleset só `exact_score` (demais camadas 0, prediction_mode score). Descoberta chave: `submit_prediction` valida deadline DO JOGO, não escopo → placar funciona em qualquer jogo futuro sem afetar lock do bracket
- **BracketBoard** (agente cre-ux): read-only na tab Bracket — 12 grupos (palpite accent, confirmado verde, erro riscado), grid dos 8 melhores 3ºs, árvore mata-mata com scroll horizontal por fase, pódio campeão/vice. Props: BolaoClient passa matches ao BracketCard
- **page.tsx**: `isClassification` (specials_only|specials_plus) — specials_plus mostra aba de jogos (todos), lock/deadline continua do escopo
- Smoke e2e: pool `sistema-smoke-splus-fwbds` — bracket `{ok:true}` + placar extra aceito em jogo de hoje + página 200. 126/126 testes, build limpo

## v1.4.1 — "Só classificação" liberado com Copa em andamento (2026-06-12)

Victor: "pode liberar o jogo" + "jogos que já ocorreram desconsiderados da pontuação (deixar ali)".

- **Lock contornado sem DDL**: servidor trava pré-Copa no 1º jogo do ESCOPO → bolão "só classificação" criado agora nasce com `scope {type:"custom", match_ids:[jogos após amanhã 23:59], variant:"specials_only"}`. Grupo palpita campeão/classificados até o 1º jogo de depois de amanhã. Smoke real: palpite de campeão aceito `{ok:true}` (antes: `deadline_passed`)
- **UI**: page.tsx trata `variant === "specials_only"` (igual ao nativo; match_ids só definem o lock; deadline dos especiais = 1º jogo do escopo). Wizard mostra prazo real em todos os cards (`effectivePreCopaLock*`)
- **Jogos passados**: ficam visíveis como histórico; card encerrado sem palpite mostra "Sem palpite — fora da pontuação" (ninguém pontua neles por construção — deadline server-side)
- Pools smoke do sistema: `sistema-smoke-winner-cjcnj`, `sistema-smoke-late-specials-su2i5` (+ `sistema-smoke-specials` que confirmou o deadline_passed)

## v1.4 — Modo de palpite + jornada guiada (2026-06-12, manhã)

Feedback do Victor testando local: regras sem contexto de prazo, tela de preenchimento "pobre", faltava opção de palpitar só o vencedor.

- **`prediction_mode` no ruleset** (`"score"` default | `"winner"`): modo winner = payload `{winner: home|draw|away, home?, away?}`, pontua `scoring.winner_pick` (3) + `scoring.winner_exact_bonus` (5, 0 desliga) por cravar placar opcional. Engine: `scoreWinnerPick` em engine.ts; retrocompat total (9 testes novos, 126/126). API predictions valida ambos payloads
- **Wizard**: card de prazos em linguagem humana (deadline por jogo + lock pré-Copa com data/hora REAL), escolha do modo, pré-Copa travado com explicação quando 1º jogo do escopo já passou (forçado off no ruleset criado), "specials_only" desabilitado (Copa em andamento), jogos passados não selecionáveis, labels do bracket sem jargão
- **BolaoClient one-page** (agente cre-ux): progresso, seção "Prazo chegando" (≤48h), chips sticky de navegação (A–L · fases), agrupamento por grupo/fase, estados visuais (aberto/urgente/aguardando/encerrado c/ breakdown), WinnerPicker (3 botões + cravar placar colapsável)
- **AdminClient**: banner "resultados entram sozinhos", subtítulo "Corrigir resultados", pendentes agrupados por data, registrados colapsados
- **Smoke e2e real**: pool `sistema-smoke-winner-cjcnj` (modo winner, escopo custom 2 jogos de 12/06) + palpites `{winner:"home"}` e `{winner:"draw",1x1}` aceitos, payload inválido 422. Quando os jogos terminarem o sync pontua → prova viva do winner scoring (conferir prediction_scores)

## v1.3 — Sync automático de placares (2026-06-12)

A Copa começou (11/06) e os resultados agora entram sozinhos:

- **Pipeline**: `src/lib/sync/` (fd.ts normalizer + plan.ts diff puro + index.ts orquestrador) → rota `POST/GET /api/sync-results` (auth: `x-cron-secret` ou `Bearer CRON_SECRET`). Busca FINISHED da football-data.org, aplica via `set_match_result` (perfil sistema), repontua TODOS os pools via `save_scores`. Idempotente — 10 unit tests (117/117 total)
- **Resultados reais já sincronizados**: México 2×0 África do Sul (abertura) e Coreia do Sul 2×1 Tchéquia — provas no `/tmp/bolao-sync.log`. Teste de correção: placar vandalizado 1×1 → sync reverteu pro oficial sozinho
- **Bracket on-read**: pontos de bracket agora calculados live (`src/lib/bracket-live.ts`) no ranking (page.tsx) e no GET brackets — não dependem mais do owner lançar resultado manual. Smoke contra banco real ok
- **Ops via launchd (não cron!)**: `com.keli.bolao-server` (next start, KeepAlive) + `com.keli.bolao-sync` (a cada 600s). Lição: daemon cron NÃO acessa o login Keychain (`security` falha) — LaunchAgent gui session funciona. Log: `/tmp/bolao-sync.log`
- **Credenciais**: perfil sistema "Keli Sync" (Keychain `keli-vault/bolao-sync`, formato `uid:secret`, owner do pool `_sistema_sync`), `keli-vault/bolao-cron` (CRON_SECRET). Espelhadas em `.env.local` p/ o Next. Vercel: `vercel.json` com cron */10 já pronto (env vars FOOTBALL_DATA_TOKEN, SYNC_USER_ID, SYNC_USER_SECRET, CRON_SECRET)
- **Prediction de teste viva**: pool sistema tem palpite 2×1 em Canadá×Bósnia (12/06 19:00 UTC) — quando terminar, o sync deve pontuar sozinho (conferir `scored:1` no log)
- ⚠️ **Vulnerabilidade descoberta**: `set_match_result` aceita qualquer owner de pool (resultado é GLOBAL) e `save_scores` não exige credencial. Mitigação ativa: sync reverte vandalismo a cada 10 min. Fix real: `supabase/migrations/20260612_sync_hardening.sql` (PENDENTE — precisa acesso admin; instruções no arquivo)
- ⚠️ **Schema init não versionado**: aplicado via MCP em sessão anterior, repo não tem o SQL. Ao reconectar MCP Supabase: dump `pg_get_functiondef` das RPCs + DDL das 8 tabelas → versionar

## v1.2 — Redesign UX/UI + identidade (2026-06-11, tarde/noite)

Pedido do Victor: "experiência muito prática e bonita" + "chamar todos agentes e skills em design". Executado em waves: cre-ux (2 rounds) + cre-designer em paralelo, gates design-dna/apple-design/ux-guidelines.

- **Zero `<select>` no app** — grupos/campeão/bracket viram chips tocáveis com bandeira (tap = 1º sólido / 2º outline), busca por texto no campeão, picks visuais no mata-mata
- **Validação da tabela vs PDF Estadão** (~/Documents/tabelacopa2026estadao.pdf): 104 jogos conferidos um a um (grupos, confrontos, horários Brasília, mata-mata completo) — 100% coerente
- **Bandeiras cross-platform**: emoji não renderiza no Windows → `country-flag-emoji-polyfill` (EmojiFlagPolyfill.tsx + font stack), FLAG map completado com as 48 seleções exatas do banco (antes ~15 caíam no 🏴)
- **Identidade (cre-designer)**: icon.svg (troféu flat 1-cor), public/og.png 1200×630 (preview WhatsApp — principal asset de aquisição), apple-touch-icon, metadata OG/twitter completa, docs/brand.md. metadataBase provisório https://bolao.app — AJUSTAR no deploy
- **Craft global (cre-ux round 2)**: landing redesenhada (headline "Seu bolão, suas regras."), wizard/convite/entrar/admin polidos, AdminClient com steppers + confirmação de resultado, dark mode coerente, focus-visible, motion-safe, empty states humanos
- Ajustes finais (Keli): labels de pontos sem cara de link, tab ativa em acento, landing equilibrada
- 107/107 testes, build limpo, servidor 3017 com build novo

## Acesso externo (atualizado 2026-06-12)

- **Túnel ativo**: https://wins-childrens-using-exercise.trycloudflare.com (quick tunnel, porta 3017 — URL anterior morreu junto com o processo; quick tunnel muda de URL a cada restart, por isso NÃO convidar o grupo por ela)
- ngrok NÃO disponível p/ 3017 (ocupado pelo dashboard Keli na 8100, URL fixa)
- **Deploy Vercel PENDENTE**: bloqueado em credencial — Victor precisa rodar `vercel login` (sem token no vault). ⚠️ Cookies de identidade são presos ao domínio: migrar de túnel→Vercel = participantes perdem conta. Definir domínio definitivo ANTES de convidar o grupo
- ⏰ Lock do bracket (escopo full) PASSOU: 11/06 16:00 Brasília (abertura). Bolões full criados agora já nascem com bracket travado

## v1.1 — Bracket pré-Copa (2026-06-11, tarde)

Pedido do Victor: premiar quem acerta a classificação ANTES da Copa (classificados de grupo → oitavas → ... → campeão), com pontuação por fase, opcional e editável — somando com os bônus de placar exato pra permitir estratégias diferentes.

- **Spec:** SPEC.md v1.1.0 — seção "Bracket pré-Copa", ruleset `advance_predictions` (10 valores editáveis, 0 desliga), pontua por "seleção presente na fase" (não confronto exato), cumulativo, lock server-side no kickoff do 1º jogo
- **Defaults:** group_qualified 2 / position_exact +1 / r16 2 / qf 3 / sf 5 / final 8 / 4º 4 / 3º 8 / vice 10 / campeão 25 (~60-80 pts p/ bracket bom ≈ 6-8 placares exatos — não decide o bolão sozinho)
- **Scoring puro:** `src/lib/scoring/bracket.ts` (deriveBracketOutcome + scoreBracket) — 16 testes; agente também entregou specials (`specials.ts`, 15 testes). **107/107 testes verdes**, `next build` limpo (fix: tsconfig `target: ES2017` — antes ES5 implícito quebrava iteração de Map/Set)
- **Migration aplicada** (`bracket_predictions_v1_1` via MCP): tabelas `teams` (48 seleções, grupos A–L derivados de matches.group_label), `bracket_predictions` (RLS: alheio só pós-lock via `_pool_first_kickoff`), `bracket_scores` (SELECT público) + RPCs `submit_bracket`/`get_pool_brackets`/`save_bracket_scores`. ⚠️ Migration do agente foi corrigida antes de aplicar: policies `auth.uid()` (incompatível com identidade leve — ranking leria vazio) trocadas pelo padrão real do banco; INSERT duplicado/bugado de teams removido; lock unificado na helper `_pool_first_kickoff`
- **UI/API:** tab Bracket (BracketCard.tsx, só se habilitado), toggle + steppers no wizard /criar, POST /api/brackets (422 bracket_locked), GET /api/pools/[id]/brackets, recálculo na rota de resultado, ranking com split Jogos · Bracket
- **Smoke e2e real** (porta 3017): perfil → pool com bracket on → submit bracket → `{ok:true}` → GET retorna my_bracket + lock_at, all_brackets null pré-lock. Dados de teste limpos
- ⏰ **Lock global do bracket: HOJE 16:00 (Londrina)** — kickoff México, jogo de abertura (19:00 UTC)

## Posição atual

- Spec completa (SPEC.md) + UX guidelines (docs/ux-guidelines.md) — pipeline multi-agente
- **Supabase provisionado:** projeto `bolao-copa` id `rsippykwiffybjfgljzj`, região sa-east-1, $0/mês. URL: https://rsippykwiffybjfgljzj.supabase.co
- **Migrations aplicadas:** `init_bolao_schema` (8 tabelas + RLS + RPCs: create_profile, create_pool, join_pool, submit_prediction [valida deadline no banco], set_match_result [com audit_log], save_scores) e `seed_wc2026_fixtures_week1` (24 jogos reais 11–18/06, fontes NBC+ESPN+AlJazeera)
- **Scaffold Next.js** na raiz do repo: App Router + TS + Tailwind + vitest, porta 3017, clients Supabase prontos
- MVP rodando (scoring real + API/UI core + calendário 104 jogos + smoke e2e)
- **Scoring 2026-06-11:** regra de consolação `goals_one_team` (errou vencedor mas acertou os gols de um time; default 1pt, 0 desliga) + defaults rebalanceados para os recomendados (exact 10 / winner_and_diff 7 / winner_only 4 / draw_only 4 / goals_one_team 1). 74/74 testes verdes, build ok, servidor 3017 reiniciado.
- **Wizard /criar 2026-06-11:** labels "(recomendado: X)" guiando o preenchimento; regras avançadas agora expõem winner_and_diff, draw_only e goals_one_team como steppers opcionais (0 desliga); review step mostra as 5 regras; ruleset enviado usa os 5 valores (antes draw_only copiava winner_only).

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

- **Deploy Vercel** (único blocker do Victor: `vercel login` + decidir domínio ANTES de convidar o grupo — cookies presos ao domínio)
- Aplicar `20260612_sync_hardening.sql` quando MCP Supabase reconectar (fecha vuln de resultado global)
- Versionar schema init (dump via MCP)
- Considerar Supabase Realtime no ranking
- Cross-check openfootball/worldcup.json como 2ª fonte do sync (hoje: football-data only)

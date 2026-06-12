# Bolão Copa 2026

Plataforma onde qualquer pessoa cria e administra seu próprio bolão da Copa do Mundo 2026 — da copa inteira a um único jogo — com todas as regras editáveis (pontuação, tipos de palpite, deadlines, visibilidade). **Não processa dinheiro** (premiação apenas informativa).

## Status

**MVP funcional rodando** (2026-06-11). Ver `SPEC.md` (PRD + Tech Spec) e `STATE.md`.

- ✅ Supabase provisionado: projeto `bolao-copa` (`rsippykwiffybjfgljzj`, sa-east-1, free tier) — schema completo (8 tabelas, RLS, 7 RPCs security definer com deadline server-side)
- ✅ Scaffold Next.js 14 App Router + TypeScript + Tailwind + vitest (porta 3017), clients Supabase em `src/lib/supabase/`
- ✅ Scoring Engine (`src/lib/scoring/`) — TDD, 126 testes passando (ruleset Zod + engine puro + standings + bracket + winner mode). Regra de consolação `goals_one_team` (errou vencedor mas acertou gols de um time; default 1pt, 0 desliga) e defaults rebalanceados: exato 10 / vencedor+saldo 7 / vencedor 4 / empate 4 / consolação 1
- ✅ **Modo de palpite por bolão** (`ruleset.prediction_mode`): `"score"` (placar completo, default retrocompatível) ou `"winner"` (só escolhe quem ganha — `winner_pick` pts, default 3 — com bônus opcional por cravar o placar — `winner_exact_bonus`, default 5, 0 desliga). Payload do modo winner: `{winner: "home"|"draw"|"away", home?, away?}`; API `/api/predictions` valida ambos
- ✅ **Wizard guiado com prazos explícitos**: card "Até quando dá pra palpitar?" (deadline por jogo + trava do pré-Copa com data/hora), escolha do modo de palpite, pré-Copa desabilitado com explicação quando o 1º jogo do escopo já passou (Copa em andamento), jogos já iniciados não selecionáveis no escopo custom, bracket sem jargão
- ✅ **v1.5/v1.5.1 — "Só classificação" centrado no chaveamento**: tap cicla 1º→2º→3º por grupo + seção "Melhores terceiros — escolha 8" (pontuam group_qualified quando o 3º avança de verdade — derivado do chaveamento real), bracket pré-ligado (1º/2º por grupo + 8 melhores 3ºs + fases até o campeão), toggle "Cravar placar vale pontos extras" (variant `specials_plus`: aba de jogos visível, só placar em cheio pontua — ruleset com demais camadas 0), e **`BracketBoard`** — chaveamento visual completo estilo tabela de jornal na tab Bracket (12 grupos + melhores 3ºs + árvore do mata-mata, palpite × resultado real: acerto verde, erro riscado). Smoke e2e: bracket e placar extra aceitos pelo servidor com a Copa em andamento
- ✅ **"Só classificação" disponível com a Copa em andamento** (v1.4.1): o lock server-side de palpites pré-Copa é o 1º jogo do escopo, então o bolão nasce com `scope {type:"custom", match_ids:[jogos após amanhã 23:59], variant:"specials_only"}` — o grupo palpita campeão/classificados até lá. Jogos já ocorridos ficam visíveis como histórico, fora da pontuação ("Sem palpite — fora da pontuação")
- ✅ **Tela de palpites one-page** (v1.4): barra de progresso ("você palpitou em X de Y jogos abertos"), seção "Prazo chegando" (jogos ≤48h), navegação sticky por chips (Grupos A–L · Oitavas → Final), jogos agrupados por grupo/fase, breakdown de pontos por jogo encerrado, picker de vencedor com 3 botões + "cravar placar" opcional no modo winner. Admin virou "Corrigir resultados": banner explica que placares entram sozinhos, pendentes agrupados por data, registrados colapsados
- ✅ API routes + UI das telas core (landing, wizard `/criar`, `/b/[slug]` palpites+ranking, admin, convite WhatsApp). Wizard com "(recomendado: X)" guiando o preenchimento; regras avançadas expõem vencedor+saldo, empate e consolação como steppers opcionais
- ✅ **Calendário oficial completo: 104 jogos** sincronizados da API football-data.org (abertura 11/06 19:00 UTC → final 19/07), nomes pt-BR, mata-mata como "A definir" até classificação
- ✅ Smoke test end-to-end validado contra Supabase real: criar perfil → criar bolão → entrar → palpitar → lançar resultado → pontos calculados (exato=10, vencedor+saldo=5)
- ✅ **Sync automático de placares** (`/api/sync-results` + LaunchAgent a cada 10 min): football-data.org → resultado oficial em todos os bolões, idempotente, reverte edição manual errada. Resultados da Copa real já fluindo (México 2×0, Coreia do Sul 2×1). Pontos de bracket calculados on-read (`src/lib/bracket-live.ts`) — sempre atuais
- ✅ Servidor local resiliente: LaunchAgents `com.keli.bolao-server` (KeepAlive) + `com.keli.bolao-sync`
- ⏳ Deploy Vercel — blocker: `vercel login` (Victor) + domínio definitivo; `vercel.json` com cron já pronto

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

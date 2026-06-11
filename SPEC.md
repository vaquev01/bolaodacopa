---
title: "Bolão Copa 2026 — Plataforma de Bolões Configuráveis"
type: prd + tech-spec
version: "1.1.0"
date: "2026-06-11"
author: "Keli (multi-agente: core-brainstormer + core-researcher + cre-ux)"
status: draft
tags: [spec, prd, tech-spec, bolao, copa-2026]
---

# SPEC: Bolão Copa 2026

> Plataforma onde qualquer pessoa cria e administra **seu próprio bolão** da Copa do Mundo 2026 — da copa inteira a um único jogo — com **todas as regras editáveis** (pontuação, palpites, deadlines, visibilidade). O site **não processa dinheiro**.

---

# PARTE 1 — PRD

## O que é

Web app mobile-first onde um organizador cria um bolão privado em menos de 2 minutos (defaults inteligentes + modo avançado opcional), convida amigos por link de WhatsApp, e os participantes palpitam em segundos. Ranking ao vivo, resultados automáticos via API com fallback manual.

## Problema

**Situação atual:** quem quer organizar um bolão com o grupo de amigos/escritório usa planilha (trabalhoso, sem ranking ao vivo, propenso a erro e a "palpite atrasado") ou plataformas existentes que impõem o sistema de pontuação delas.

**Por que o status quo não funciona:**
- Planilhas: o organizador vira escravo de digitar resultado e recalcular pontos; disputas sobre deadline.
- Plataformas existentes (benchmark abaixo): pontuação fixa ou customização escondida em UX técnica; quase nenhuma suporta bolão de **um único jogo**; as brasileiras mais configuráveis são pagas por torneio ou web-only com interface datada.

## Por que agora

A Copa 2026 (EUA/Canadá/México) começa em **junho/2026** — estamos a dias do torneio. 104 jogos (formato expandido de 48 seleções) = mais jogos e mais janelas de engajamento do que qualquer copa anterior. Cada semana de atraso queima a principal janela de aquisição do produto.

## Métricas de sucesso

| Métrica | Valor atual | Meta | Prazo |
|---------|-------------|------|-------|
| Bolões criados | 0 | [A DEFINIR] | fim da Copa |
| Participantes ativos (palpitaram ≥1 rodada) | 0 | [A DEFINIR] | fim da Copa |
| Tempo do clique no convite → 1º palpite | — | < 60s | lançamento |
| Guarda-rail: palpite aceito após deadline | — | zero (timestamp server-side) | sempre |

## Público

**Usuário principal:** participante casual brasileiro, mobile, chega via link de WhatsApp (90% do uso).
**Usuário secundário:** organizador — cria o bolão, define regras, gerencia (10% do uso, desktop ok).
**Não é para:** apostadores buscando odds/dinheiro real; casas de apostas; empresas querendo white-label (futuro talvez).

## Benchmark (pesquisa web 2026-06-11)

| Produto | Customização | Fraqueza explorável |
|---|---|---|
| Kicktipp (DE) | Alta | UX de configuração técnica, pouco familiar no BR |
| Superbru (2,6M+ users WC26) | Baixa — pontuação fixa | Zero edição de regras |
| Predict26 | Alta (presets + custom) | Preço opaco, base pequena |
| dacopa (BR, grátis) | Alta | Sem notificação WhatsApp, base menor |
| Bolão AI (BR, WhatsApp nativo) | Alta | Features travadas no free |
| bolaodacopaonline (BR) | Alta | Pago por torneio (R$35–115) |
| ESPN / FIFA oficial | Nenhuma | Sem grupos privados reais |

**Gaps confirmados pela pesquisa:** (1) bolão de **jogo único** — nicho sem concorrente direto; (2) editor de regras **visual e simples** (os configuráveis são técnicos, os simples não configuram); (3) "zero money" explícito + engajamento completo; (4) WhatsApp-first com mobile decente.

## O que é o produto

### Personas e papéis
- **Organizador**: cria bolão, configura regras, convida, insere/corrige resultados, resolve disputas, transfere ownership.
- **Participante**: entra por link, palpita, acompanha ranking. Pode estar em N bolões.

### Funcionalidades — MoSCoW

**Must (MVP):**
1. Criar bolão: nome + escopo (copa inteira / fase de grupos / mata-mata / seleção específica / **jogo único** / seleção manual de jogos)
2. Wizard de 3 telas com defaults inteligentes; "regras avançadas" opt-in em sheet colapsável
3. Convite por link único (`/b/abc123`), WhatsApp-first, cadastro mínimo (nome + contato), preview do bolão sem login
4. Palpite de placar exato com steppers mobile, auto-save, deadline por jogo (server-side)
5. Pontuação configurável em camadas: placar exato > vencedor+saldo > vencedor/empate > zero (pontos editáveis por camada)
6. Palpites ocultos até o kickoff (default), revelados depois
7. Ranking geral ao vivo + página do jogo (distribuição de palpites, quem pontuou)
8. Resultados: entrada manual pelo organizador (MVP) com log de alterações
9. Bolão privado por default; organizador remove participante; critérios de desempate definidos na criação

**Must (v1.1 — Bracket pré-Copa):**
10. **Bracket pré-Copa (advance predictions)** — modo opcional por bolão: antes do 1º jogo da Copa, cada participante preenche a classificação completa (1º/2º de cada grupo + melhores 3ºs → 32 classificados → oitavas-de-32 → oitavas → quartas → semis → finalistas → 3º/4º → campeão). Pontuação **por fase, editável** (acertar o campeão vale mais que acertar um semifinalista, que vale mais que um classificado de grupo). Trava server-side no kickoff do 1º jogo da Copa. Detalhes na seção "Bracket pré-Copa" abaixo.

**Should:**
- Multiplicadores por fase (oitavas 1.5x … final 3x — fatores editáveis)
- Bônus pré-copa: artilheiro (on/off + pontos editáveis) — campeão agora coberto pelo Bracket
- API automática de resultados com override manual (híbrido)
- Ranking por rodada/fase; edição de palpite até deadline (configurável)
- Premiação informativa: texto livre + divisão percentual (ex 60/30/10) — **sem processar valores**
- Limite de participantes; aprovação manual de entrada

**Could:**
- Tipos extras de palpite: 1X2, over/under (linha editável), ambos marcam, quem passa nos pênaltis — cada um on/off com peso próprio
- Bônus zebra; ranking de forma (últimos N jogos); mata-mata interno entre participantes
- Palpite atrasado com penalidade configurável; co-organizadores; notificação WhatsApp/Telegram de deadline

**Won't (MVP) — non-goals:**
- **Processamento de pagamento/carteira** — *motivo: risco regulatório (Lei 14.790/2023 sobre apostas); o diferencial é ser explicitamente "zero money"*
- **Odds ao vivo / palpite durante o jogo** — *motivo: vira produto de apostas, outro problema, outra regulação*
- **App nativo iOS/Android** — *motivo: PWA responsiva cobre o caso de uso; loja atrasaria o lançamento para depois da Copa*
- **OAuth completo (Google/Facebook) obrigatório** — *motivo: fricção mata conversão via WhatsApp; cadastro leve basta (Google one-tap opcional)*
- **White-label/B2B** — *motivo: fora do apetite; reavaliar pós-Copa se houver tração*

### Fluxo principal

1. Organizador cria bolão (3 telas, <2min) → recebe link curto + botão "Enviar pelo WhatsApp" com texto pré-preenchido
2. Amigo abre link → vê preview (próximos jogos + quem já entrou) → "Entrar e Palpitar" → nome + contato → tela de palpites
3. Palpita a rodada inteira em segundos (steppers, auto-save, contagem "3 de 8 feitos")
4. Jogo acontece → resultado entra (manual ou API) → pontos calculados pelo motor de regras → ranking atualiza
5. Fim do escopo → vencedor declarado pelos critérios de desempate configurados

## Bracket pré-Copa (advance predictions) — v1.1

**Por quê:** não é justo quem acertou o campeão/semifinalistas ANTES da Copa começar valer o mesmo que quem só palpita jogo a jogo. O Bracket premia visão antecipada; o placar exato por jogo (já existente) premia precisão contínua. Dois caminhos estratégicos para buscar o título do bolão — e o balanceamento default mantém o máximo de gente com chance até o fim.

**Como funciona:**
1. Organizador liga o modo Bracket no wizard (opcional, off por default) e ajusta os pontos de cada fase se quiser (defaults recomendados).
2. Antes do 1º jogo da Copa, cada participante preenche o bracket completo: 1º e 2º de cada um dos 12 grupos + 8 melhores 3ºs → 32 classificados → quem passa em cada confronto (32-avos → oitavas → quartas → semis) → finalistas, 3º lugar e campeão.
3. **Trava server-side no kickoff do 1º jogo da Copa** (não no deadline por jogo). Quem entra no bolão depois disso não palpita bracket — só compete pelos jogos.
4. Conforme as fases reais se resolvem, cada seleção corretamente prevista **naquela fase** rende os pontos da fase (independente do confronto exato — chaveamento real pode divergir do previsto). Acertos são cumulativos: quem cravou o campeão pontua em todas as fases que ele atravessou.
5. Posições finais exatas (campeão, vice, 3º, 4º) têm pontuação própria, maior.

**Pontuação por fase (tudo editável, 0 desliga a linha):**

| Acerto | Default | Observação |
|---|---|---|
| Classificado aos 32 (qualquer posição) | 2 | por seleção |
| Posição exata no grupo (1º ou 2º) | +1 | bônus por seleção |
| Presente nas oitavas (R16) | 2 | por seleção |
| Presente nas quartas | 3 | por seleção |
| Presente nas semis | 5 | por seleção |
| Finalista | 8 | por seleção |
| 4º lugar exato | 4 | |
| 3º lugar exato | 8 | |
| Vice exato | 10 | |
| **Campeão exato** | **25** | o acerto mais valioso do bolão |

**Balanceamento (racional dos defaults):** um bracket muito bom (~60% de acerto) rende ~60–80 pts — equivalente a ~6–8 placares exatos. Forte o suficiente para premiar a previsão antecipada, fraco o suficiente para não decidir o bolão sozinho na fase de grupos: quem errou o bracket continua vivo via placares exatos (104 jogos × até 10 pts). Organizador ajusta os pesos para o estilo do grupo dele.

**UI:** tela própria "Bracket" (tab no bolão), preenchimento guiado grupo a grupo → mata-mata montado automaticamente a partir das escolhas, com countdown para o lock. Pós-lock vira visualização comparativa (meu bracket × real × dos outros).

## Edge cases (decisões de produto)

| Caso | Regra |
|---|---|
| Prorrogação/pênaltis | Organizador escolhe na criação: placar válido = 90min (default de bolão) ou resultado final. "Quem passa" é palpite separado |
| Jogo adiado | Palpites mantidos para nova data; deadline recalculado |
| Jogo cancelado/W.O. | Estado "suspenso"; organizador escolhe: anular (ninguém pontua) ou resultado oficial FIFA |
| Empate no ranking | Cadeia de desempate configurada na criação: nº de placares exatos → nº de vencedores → pontos no mata-mata → palpite de campeão → sorteio registrado |
| Participante sem palpite | Zero pontos (default) ou palpite padrão 0x0 com penalidade (configurável) |
| Organizador some | Transferência de ownership ou modo somente-leitura |
| Entrou no bolão após início da Copa (Bracket on) | Não palpita bracket; compete só pelos jogos. Aviso claro na entrada |
| Bracket incompleto no lock | Pontua só o que preencheu; fases vazias = zero |
| Chaveamento real diverge do previsto | Pontua por "seleção presente na fase", não por confronto — palpite continua vivo |
| Resultado errado inserido | Log imutável + janela de correção de 24h + recálculo automático do ranking |
| Fuso horário | Deadlines em UTC no servidor, exibidos no fuso do participante |

## Riscos

| Risco | Sev. | Mitigação |
|---|---|---|
| API de resultados fora do ar / errada | Alta | Híbrido: manual sempre disponível, override do organizador |
| Palpite pós-deadline por bug | Alta | Timestamp server-side, log imutável, teste dedicado |
| Percepção de jogo de azar | Média | Zero money + disclaimer legal fixo no produto |
| LGPD | Média | Coleta mínima (apelido + contato), sem venda de dados, aviso na entrada |
| Bolão viral além da capacidade | Baixa | Limite de participantes como válvula + arquitetura serverless |

**Disclaimer legal (texto no produto):** "Este bolão é uma competição de entretenimento entre conhecidos. O site não processa, armazena ou intermedia valores financeiros. Eventuais prêmios combinados são de responsabilidade exclusiva dos participantes."

---

# PARTE 2 — TECH SPEC

## Overview

Web app multi-tenant (cada bolão = tenant lógico) com motor de pontuação dirigido por configuração (`ruleset` JSON versionado por bolão). O coração técnico é: **regras são dados, não código** — o motor avalia qualquer combinação de regras sem deploy.

**Contexto de negócio:** Parte 1 acima.

## Constraints

- **Prazo:** Copa começa em junho/2026 — MVP em dias, não semanas. Cortar tudo que não for Must.
- **Custo:** infra free-tier/barata até validar tração ([A DEFINIR] teto mensal).
- **Integridade:** deadline e pontuação nunca podem ser contestáveis — timestamps server-side, recálculo determinístico e auditável.
- **Mobile:** P95 de interação < 100ms percebido; bundle enxuto.

## Stack

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| Frontend + API | Next.js (App Router) + TypeScript | Stack canônico products/ do workspace; SSR para preview de convite sem login; API routes p/ motor |
| DB + Auth + Realtime | Supabase (Postgres + Auth + Realtime) | Padrão do workspace p/ apps consumer (reference_supabase_usage); Realtime resolve ranking ao vivo sem WebSocket próprio; RLS para multi-tenancy |
| ORM | Prisma (ou supabase-js direto) | Padrão products/ — decidir no plano |
| UI | Tailwind + tokens da seção Design | Apple-simples, dark/light via prefers-color-scheme |
| Jobs | Vercel Cron / Supabase Edge Functions | Polling da API de resultados + fechamento de deadlines |
| Deploy | Vercel | Zero-ops, preview deploys |
| Dados de jogos | football-data.org (€0 free, WC26 incluída, 10 req/min) → upgrade €12/mês p/ livescores | Mais barato que API-Football Pro €19/mês e Sportmonks €69/mês; fallback manual cobre o gap do free tier |

**Dependências externas:** football-data.org (fallback: entrada manual — sempre funcional); Supabase (fallback: nenhum — core); secrets via Keychain/skill db-provision, nunca .env commitado.

## Arquitetura

```
[PWA Next.js] ──► [API Routes] ──► [Scoring Engine (puro, determinístico)]
      │                │                       │
      │            [Supabase Postgres + RLS] ◄─┘
      │                ▲
[Supabase Realtime] ───┘        [Cron: fixtures/resultados] ──► football-data.org
```

| Componente | Responsabilidade única |
|-----------|----------------------|
| Scoring Engine | Função pura `score(ruleset, prediction, result) → points`. Zero I/O. 100% testável |
| Ruleset Builder | Wizard → JSON de regras validado (Zod schema versionado) |
| Fixtures Sync | Cron 5min (fora de jogo) / 1min (durante jogo) puxa resultados; status `scheduled→live→finished`; flag `manual_override` |
| Deadline Guard | Toda escrita de palpite valida `now() < lock_at` no Postgres (constraint + RLS), nunca no client |
| Realtime Ranking | View materializada `standings` recalculada por trigger ao fechar resultado; broadcast via Supabase Realtime |

### Fluxo de pontuação

1. Resultado entra (API ou manual) → `matches.status = finished`
2. Trigger/job roda Scoring Engine sobre todos os palpites do jogo, por bolão, com o `ruleset` do bolão
3. Grava `prediction_scores` (idempotente — recálculo sempre possível) → refresh `standings` → Realtime push

## Data Model (núcleo)

```sql
-- Jogos: dados globais, compartilhados entre bolões
CREATE TABLE matches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ext_id        TEXT UNIQUE,              -- id na football-data.org
  stage         TEXT NOT NULL,            -- group | r32 | r16 | qf | sf | third | final
  home_team     TEXT NOT NULL,
  away_team     TEXT NOT NULL,
  kickoff_at    TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled|live|finished|suspended
  score_home_90 INT, score_away_90 INT,   -- 90 minutos
  score_home_ft INT, score_away_ft INT,   -- final (prorrog/pênaltis)
  penalty_winner TEXT,
  manual_override BOOLEAN DEFAULT FALSE,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,     -- /b/{slug}
  name          TEXT NOT NULL,
  owner_id      UUID NOT NULL REFERENCES auth.users,
  ruleset       JSONB NOT NULL,           -- regras versionadas (schema Zod)
  ruleset_locked_at TIMESTAMPTZ,          -- regras imutáveis após 1º jogo do escopo
  scope         JSONB NOT NULL,           -- {type: 'full'|'groups'|'knockout'|'team'|'single'|'custom', match_ids?...}
  visibility    TEXT DEFAULT 'private',   -- private|public
  join_policy   TEXT DEFAULT 'open_link', -- open_link|approval
  max_members   INT,
  prize_note    TEXT,                     -- premiação informativa (texto livre)
  prize_split   JSONB,                    -- [{place:1,pct:60},...]
  status        TEXT DEFAULT 'active',    -- active|readonly|finished
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pool_members (
  pool_id    UUID REFERENCES pools,
  user_id    UUID REFERENCES auth.users,
  role       TEXT DEFAULT 'player',       -- owner|admin|player
  status     TEXT DEFAULT 'active',       -- pending|active|removed
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (pool_id, user_id)
);

CREATE TABLE predictions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id     UUID NOT NULL REFERENCES pools,
  user_id     UUID NOT NULL REFERENCES auth.users,
  match_id    UUID NOT NULL REFERENCES matches,
  payload     JSONB NOT NULL,             -- {home:2, away:1, extras:{penalty_winner?...}}
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- server-side, imutável
  UNIQUE (pool_id, user_id, match_id)
);

CREATE TABLE prediction_scores (
  prediction_id UUID PRIMARY KEY REFERENCES predictions,
  points        NUMERIC NOT NULL,
  breakdown     JSONB NOT NULL,           -- auditoria: que regra deu quantos pontos
  computed_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pool_special_bets (        -- artilheiro etc (pré-copa)
  pool_id UUID, user_id UUID, bet_type TEXT, value TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (pool_id, user_id, bet_type)
);

CREATE TABLE bracket_predictions (      -- v1.1: bracket completo pré-Copa
  pool_id      UUID NOT NULL REFERENCES pools,
  user_id      UUID NOT NULL,
  payload      JSONB NOT NULL,          -- {groups:{A:["BRA","MEX"],...}, third_qualifiers:[...8],
                                        --  r32_winners:[...16], r16_winners:[...8], qf_winners:[...4],
                                        --  finalists:[...2], champion:"BRA", third_place:"FRA"}
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- server-side; escrita rejeitada após kickoff do 1º jogo
  PRIMARY KEY (pool_id, user_id)
);

CREATE TABLE bracket_scores (           -- idempotente, recalculável a cada fase resolvida
  pool_id UUID, user_id UUID,
  points NUMERIC NOT NULL,
  breakdown JSONB NOT NULL,             -- auditoria por fase: que seleção rendeu quantos pontos
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (pool_id, user_id)
);

CREATE TABLE audit_log (                -- alterações de resultado/regras/remoções
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID, action TEXT, entity TEXT, entity_id UUID,
  before JSONB, after JSONB, at TIMESTAMPTZ DEFAULT NOW()
);
```

**Índices:** `predictions(pool_id, match_id)`, `pool_members(user_id)`, `matches(kickoff_at)`, `matches(status)`.

**RLS (essência):** palpite legível pelos membros do pool **somente se** `matches.kickoff_at < now()` OU é o próprio autor OU ruleset permite "sempre visível"; escrita de palpite só se `now() < lock_at(match, ruleset)` e membro ativo.

### Ruleset JSON (schema v1, validado com Zod)

```jsonc
{
  "version": 1,
  "scoring": {
    "exact_score": 10,
    "winner_and_diff": 5,
    "winner_only": 3,
    "draw_only": 3
  },
  "stage_multipliers": { "group": 1, "r16": 1.5, "qf": 2, "sf": 2.5, "final": 3 },
  "score_basis": "90min",            // "90min" | "final"
  "deadline": { "mode": "per_match", "minutes_before": 15 },  // per_match|per_round|tournament
  "visibility": "hidden_until_kickoff",
  "edits": { "allowed": true },
  "late_predictions": { "policy": "blocked" },   // blocked|no_points|penalty {pct}
  "missing_prediction": { "policy": "zero" },
  "special_bets": { "top_scorer": {"enabled": false} },   // campeão migrou p/ advance_predictions
  "advance_predictions": {           // v1.1 — Bracket pré-Copa (opcional)
    "enabled": false,
    "lock": "tournament_start",      // trava no kickoff do 1º jogo da Copa, server-side
    "points": {
      "group_qualified": 2,          // por seleção corretamente nos 32
      "group_position_exact": 1,     // bônus por posição exata no grupo (1º/2º)
      "r16": 2,                      // por seleção presente nas oitavas
      "qf": 3,
      "sf": 5,
      "final": 8,                    // finalista correto
      "fourth_place": 4,
      "third_place": 8,
      "runner_up": 10,
      "champion": 25
    }
  },
  "extra_markets": [],               // could-have: [{type:"over_under", line:2.5, points:2}, ...]
  "tiebreakers": ["exact_scores", "winners", "knockout_points", "champion_bet", "lottery"]
}
```

**Regra dura:** `ruleset` trava (`ruleset_locked_at`) quando o primeiro jogo do escopo começa — antes disso, edição livre com aviso aos membros.

## API Contracts (núcleo)

```
POST /api/pools                      → cria bolão {name, scope, ruleset?} → {id, slug, invite_url}
GET  /api/pools/{slug}               → preview público (sem auth): nome, próximos jogos, nº membros
POST /api/pools/{slug}/join          → entra (auth leve) → {member}
PUT  /api/pools/{id}/ruleset         → 409 se ruleset_locked_at
POST /api/predictions                → {pool_id, match_id, payload} → 422 se pós-deadline (validado no DB)
GET  /api/pools/{id}/standings       → ranking com desempates aplicados
POST /api/matches/{id}/result        → owner/admin do sistema; grava + audit_log + recálculo
POST /api/brackets                   → {pool_id, payload} → 422 bracket_locked se Copa já começou
GET  /api/pools/{id}/brackets        → meu bracket (sempre) + dos outros (pós-lock)
Errors padrão: 400 invalid_input | 401 | 403 not_member | 409 locked | 422 deadline_passed
```

## Error Handling

| Situação | Comportamento | Log |
|---|---|---|
| football-data.org down/limite | Retry backoff 3x; status "aguardando resultado"; banner p/ organizador inserir manual | ERROR |
| Palpite pós-deadline | 422 com horário do lock; nunca aceitar | WARN |
| Resultado corrigido | Recálculo idempotente de todo o pool + entrada em audit_log | INFO |
| Jogo suspenso | `status=suspended`, pontuação bloqueada até decisão do organizador | WARN |

## Security

- **Auth:** Supabase Auth — magic link/OTP por e-mail + Google one-tap opcional. Sem senha própria.
- **Autorização:** RLS por pool; papéis owner/admin/player; rotas de resultado manual só p/ owner do pool.
- **Anti-fraude de deadline:** `submitted_at` default NOW() no Postgres; constraint que rejeita insert/update após lock; nenhum timestamp vindo do client.
- **Dados sensíveis:** mínimos (nome + contato). LGPD: aviso de privacidade, exclusão de conta apaga PII (palpites anonimizados).
- **Secrets:** DATABASE_URL no Keychain (skill db-provision); nunca .env commitado.
- **Rate limit:** criação de pools e joins por IP/conta (anti-spam).

## Testing Strategy

- **Unit (vitest):** Scoring Engine é o alvo nº1 — tabela de casos: cada combinação de ruleset × palpite × resultado, incluindo multiplicadores, 90min vs final, pênaltis, penalidades de atraso. TDD obrigatório (skill tdd).
- **Integration:** fluxo criar pool → join → palpitar → resultado → ranking; tentativa de palpite pós-deadline (deve falhar no DB, não só na API); recálculo após correção de resultado.
- **Smoke staging:** criar bolão de 1 jogo, 2 usuários, resultado manual, conferir ranking e breakdown.

## Deploy & Rollout

- Vercel + Supabase; porta dev fixa **3017** (regra dedicated_localhost_ports — confirmar livre com lsof).
- Repo: `keli-products-bolao-copa` (privado, git-bootstrap.sh — git-first).
- Rollout: MVP Must → bolão piloto real (grupo do Victor) na 1ª rodada possível → Should durante a fase de grupos.
- Monitoramento: erros de sync de fixtures, taxa de 422 (deadline), latência de standings.

## Open Questions / Blockers [A DEFINIR]

- [ ] Metas numéricas de sucesso (bolões/participantes) — Victor decide
- [ ] Nome/domínio do produto — Victor decide
- [ ] Teto de custo mensal de infra e se paga o tier €12/mês de livescores da football-data.org — Victor decide
- [ ] Prisma vs supabase-js puro — decidir no write-plan
- [ ] Notificações (WhatsApp via link wa.me é grátis; push/PWA vs Telegram) — pós-MVP

---

# PARTE 3 — UX/UI (resumo executivo; spec completa do agente cre-ux em docs/ux-guidelines.md)

- **Filosofia:** Apple-simples (HIG), "o bolão é o conteúdo". Participante casual nunca vê a complexidade do motor.
- **Wizard de criação:** 3 telas no modo simples (identidade → 3 regras com defaults → revisão); modo avançado = sheet com seções colapsáveis mostrando resumo do estado ("Pontuação — Exato: 10 · Vencedor: 3").
- **Onboarding via convite:** preview sem login → CTA único "Entrar e Palpitar" → nome + contato → palpitando em <60s.
- **Palpites:** cards verticais com steppers ±44px, haptic, auto-save 1.5s, sticky progress ("3 de 8"), fonte tabular nos placares.
- **Ranking:** lista de cards (nunca `<table>`), posição do usuário sempre visível, deltas ▲▼, tap revela palpites alheios (pós-lock).
- **Countdown de deadline:** relativo + absoluto; âmbar <24h, vermelho vivo <1h; `tabular-nums`; sem piscar.
- **Tokens:** acento único `#005BBB` (azul FIFA), dark/light via sistema, spacing base 4px, radius 8/12/20, motion spring `cubic-bezier(0.32,0.72,0,1)`, WCAG AA, touch ≥44px, `prefers-reduced-motion` respeitado.
- **Anti-patterns banidos:** formulário gigante de regras, `<select>` para placar, tabelas no mobile, push permission no cadastro, login-wall antes do preview, verde-amarelo como cor de UI.
- **Bottom nav (4 itens):** Palpites · Ranking · Jogos · Bolão.

---

## Próximo passo

Spec pronta. Próximo passo: `/write-plan`

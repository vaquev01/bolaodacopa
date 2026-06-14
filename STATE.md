# STATE — bolao-copa

**Atualizado:** 2026-06-14 14:46 (v1.12 — **DEPLOY no ar + HARDENING do banco aplicado + schema versionado**)

## 🔒 Hardening do banco APLICADO (2026-06-14 14:45)

Brechas fechadas via Supabase Management API (token `keli-vault/supabase`):
- **`save_scores`**: antes SEM auth (qualquer um com anon key sobrescrevia pontuação). Agora exige `p_user/p_secret` + `_is_sync_user`. A versão insegura de 2 args foi DROPADA. Call sites atualizados (sync/index.ts, result/route.ts) + redeploy SUCCESS
- **`set_match_result`**: antes qualquer owner/admin de pool setava resultado GLOBAL. Agora só o perfil de SISTEMA (`_is_sync_user`). Owners comuns na tela "Corrigir resultados" recebem 403 gracioso — resultado vem só do sync oficial (trade-off intencional)
- Fundação: tabela `system_config` (sync_user_id) + função `_is_sync_user` (valida perfil de sistema por secret_hash). Testado: impostor→forbidden, sync real→ok
- **Estratégia sem-downtime**: overload da save_scores nova → redeploy → drop da antiga. Sync no ar validado (`checked:8, errors:[]`)
- **Schema VERSIONADO** (Task #2 ✅): `supabase/schema/00_functions.sql` (18 RPCs), `01_tables.sql` (14 tabelas), `02_policies.sql` (11 RLS) — dump via Management API. Migration real em `supabase/migrations/20260612_sync_hardening.sql`
- **Padrão Supabase headless** fixado (espelha o Railway): Management API + curl, token no vault. Ver memory/feedback_supabase_headless.md

## 🚀 NO AR — Railway (2026-06-14 14:12)

**URL pública:** https://web-production-7e21b.up.railway.app — build SUCCESS, home 200, `/api/sync-results` 401 (auth ok), cron interno `[sync-cron] ativo` rodando. **Não depende mais do Mac ligado.**

- Projeto Railway `bolao-copa` (id `8303341a-ae85-4390-b534-f7010a8715db`), env production (`dcc78bb7-...`), serviço `web` (`25491f6b-...`) ↔ repo `vaquev01/bolaodacopa` (auto-deploy em push)
- 7 env vars setadas via API (Supabase URL/anon, football-data, sync uid/secret, cron secret, ENABLE_SYNC_CRON=true) — segredos puxados do Keychain
- **Padrão de deploy criado e provado** (Victor: "deixa pronto pra subir qualquer projeto como padrão"): motor `~/keli-workspace/.github-templates/railway-deploy.py` (idempotente, headless, GraphQL+curl) + manifesto `deploy.railway.json` na raiz (sem segredos, refs `@vault:`). Token de workspace em `keli-vault/railway`, anon key em `keli-vault/bolao-anon`. Regra no CLAUDE.md ("Deploy-first") + memory/feedback_deploy_first.md
- ⚠️ Ainda pendente p/ abrir ao público: aplicar `20260612_sync_hardening.sql` (admin Supabase) + decidir domínio definitivo antes de convidar (cookies presos ao domínio). A migration de hardening NÃO bloqueia o site funcionar, só fecha a brecha de adulteração de placar

## v1.12 — Pontuação "acertar quem passa vale mais, placar é bônus" (2026-06-14)

Victor: "quero que a pontuação maior seja para acertar quem passa; o placar deve ser bônus." Escolheu o perfil **Meio-termo** (quem-passa sobe forte, placar continua valendo mas como bônus = metade do que valia).

- **Novos defaults do `ScoringSchema`** (modo placar): exato `10→8` (bônus), vencedor+saldo `7→6`, **vencedor `4→5`** e **empate `4→5`** (acertar quem ganha virou a base forte), consolação `1` (intocada). Modo só-vencedor: `winner_pick 3→8` (acertar o 1X2 é a recompensa principal), `winner_exact_bonus 5` (cravar placar vale MENOS que acertar quem ganha)
- **Novos defaults do `BracketPointsSchema`** (quem passa/avança = coração do bolão): classificou `2→3`, oitavas `2→3`, quartas `3→5`, semis `5→8`, final `8→12`, 3º `8→10`, vice `10→15`, **campeão `25→30`**; 4º `4` e posição-exata `+1` intocados
- `criar/page.tsx`: `specialsExactPoints 10→5` (placar como bônus no modo classificação). Todo o resto do wizard já puxava de `DEFAULT_RULESET.*` → propaga sozinho. `RulesSheet` lê o ruleset real → reflete os números novos sem mudança de código
- **Retrocompatível**: `parseRuleset` só preenche defaults de campos AUSENTES → pools já criados mantêm o ruleset salvo; só pools NOVOS herdam a nova régua
- **Verificação geral pré-deploy**: `next build` limpo (12 rotas), **143/143 testes verdes** (27 asserções de teste que fixavam os números antigos foram realinhadas — não eram bugs), tsc válido, zero número de pontos hardcoded na UI (toda a superfície deriva do ruleset)
- **Repo de deploy**: código publicado em `github.com/vaquev01/bolaodacopa` (remote `deploy`) — repo que o Victor conecta no Railway

## v1.10 — Deploy-ready (Railway) + auditoria anti-roubo (2026-06-13, ~10h30)

Victor: "destravar e deixar tudo pronto pra subir no Railway" + "verificar timing/bloqueios de edição pra priorizar quem fez antes e evitar roubos".

### Railway (pronto pra subir — falta só o Victor conectar o repo)
- **Cron interno de sync** (`src/instrumentation.ts`): substitui os LaunchAgents do Mac. No boot do servidor long-running, liga `setInterval(runSync, 10min)` quando `ENABLE_SYNC_CRON=true`. **Testado local**: `ENABLE_SYNC_CRON=true PORT=3019 npm run start` → log `[sync-cron] ativo` + `Ready`. Mata a dependência do Mac ligado e de cron externo
- `next.config.mjs`: `experimental.instrumentationHook: true` (Next 14.2)
- `package.json`: `start` usa `${PORT:-3017}` (Railway injeta `PORT`)
- `railway.json`: Nixpacks + healthcheck `/` + `numReplicas: 1` (cron não duplica) + restart on-failure
- `DEPLOY.md`: passo-a-passo completo (criar projeto, 7 env vars com origem no Keychain, gerar domínio, checklist pós-deploy, como desligar os LaunchAgents locais). `.env.example` bloqueado pela regra inviolável → envs documentadas no DEPLOY.md
- `vercel.json` mantido (ignorado pelo Railway; cron serverless pra quem preferir Vercel)

### Auditoria de timing / anti-roubo (verificação)
Camadas que EXISTEM e protegem (confirmadas no código/SQL + provas de sessões anteriores):
- **Lock de palpite por jogo**: `submit_prediction` valida deadline server-side (kickoff − minutes_before) → jogo começado retorna `deadline_passed` (route trata). Jogo passado não pontua
- **Lock dos palpites da Copa** (campeão/classificados/bracket): `_pool_first_kickoff(pool)` — fecham no 1º jogo do escopo (`submit_bracket` retorna `bracket_locked`)
- **Sigilo anti-cópia**: RLS esconde palpites alheios até o kickoff (`bracket_predictions_read USING now() >= _pool_first_kickoff`)
- **Anti-fraude do early-bird**: editar (`edit_count > 0`) zera o bônus — só premia quem cravou cedo e não mexeu mais (`specials.ts:earlyBirdBonus`)
- **Resultado só pelo sistema**: após a migration de hardening, `set_match_result`/`save_scores` restritos ao perfil Keli Sync

⚠️ **2 pendências que dependem do Victor (admin Supabase):**
1. **Aplicar `20260612_sync_hardening.sql`** — hoje `set_match_result` aceita qualquer dono de pool. ANTES de abrir ao público é obrigatório, senão um membro esperto adultera placar
2. **Versionar o schema inicial** (Task #2) — `submit_prediction` e a imutabilidade de `first_submitted_at` no edit estão num SQL não versionado; sem o dump não dá pra auditar linha a linha que editar não "reseta" o early-bird

➡️ **"Priorizar quem fez antes"** — IMPLEMENTADO (Victor escolheu desempate por horário): ranking desempata por pontos → mais exatos → **quem fez os palpites primeiro** (`first_submitted_at`, imutável no banco — editar não melhora o desempate, anti-roubo) → nome. `lastPickAt` = hora do último palpite registrado (fechou o cartão antes ganha); quem nunca palpitou vai por último entre empatados. Texto do RulesSheet atualizado. Prova: lock visto ativo no browser — bracket do bolao-uaoo2 aparece "Travado" (prazo do escopo passou), confirmando o deadline server-side

## v1.9 — Didático e auto-explicável (2026-06-13, ~10h15)

## v1.9 — Didático e auto-explicável (2026-06-13, ~10h15)

Victor: "revisa se o bolão está didático e auto-explicável pra quem recebe o link saber usar, entender as regras e acompanhar ao longo da Copa". Auditoria de onboarding (agente) identificou a lacuna #1: **as regras só existiam no wizard do criador** — quem entrava pelo link nunca via quanto vale cada acerto.

- **NOVO `RulesSheet.tsx`** — painel "Como funciona" acessível por botão **Regras** no header (todas as abas), gerado do **ruleset REAL** do pool (nada hardcoded): O jogo · Como você palpita (adapta a score/winner) · **Quanto vale cada acerto** (tabela só com as camadas ativas, com descrição leiga: "Vencedor + saldo = acertou quem ganhou E por quantos gols") · Jogos que valem mais (multiplicadores ≠1 + exemplo "final 5×3=15") · Palpites da Copa (campeão/classificados/bracket, se ativos) · Prazo · Desempate · Como acompanhar. Fecha no ESC/backdrop. Validado no browser contra o ruleset real (placar exato +5, mult ×1.5/×2/×2.5/×3, bracket oitavas+2…campeão+30)
- **Ranking**: atalho "Como os pontos são calculados?" (abre o painel) no rodapé e no estado vazio; estado vazio agora convida a palpitar
- **Tela /entrar**: card "o que é" ("o grupo palpita nos jogos da Copa 2026 e disputa um ranking — de graça, sem cadastro, sem dinheiro") + label do nome explica "é assim que você aparece no ranking"
- **Convite WhatsApp**: mensagem antes vaga ("Entrei no X, você entra? 👊") → didática: "🏆 Bora pro bolão da Copa 2026 'X'? Você palpita nos jogos e a gente disputa o ranking — de graça, sem cadastro e sem dinheiro. Leva 1 minuto: {link}"
- Prova: tsc/build limpos, 143/143 testes, servidor reiniciado, painel renderizado e conferido por DOM no Chrome real
- **Pendente de polish** (não-bloqueante): glossário inline no breakdown por jogo ("saldo"→tooltip); onboarding de 1ª vez (banner dismissível); indicador de scroll no sheet. Bloqueadores reais seguem: **deploy Vercel** (login do Victor) e **migration de hardening do sync**

## v1.8 — Pente fino de QA + chaveamento validado (2026-06-13, ~10h)

## v1.8 — Pente fino de QA + chaveamento validado (2026-06-13, ~10h)

Victor: "passa um pente fino como se fosse usuário; verifica se o chaveamento está correto; o que falta pra 10/10?". Auditoria multi-agente (Explore) + validação do bracket contra a fonte oficial + correções.

- **✅ CHAVEAMENTO FIFA 100% CORRETO**: conferido `wc26-pairings.ts` contra a Wikipedia oficial (Annex C FIFA) — os 16 confrontos dos 16-avos (73–88), oitavas (89–96), quartas (97–100), semis (101–102), 3º lugar (103) e final (104) batem exatamente. Zero cruzamento errado.
- **BUG CRÍTICO — pênaltis/prorrogação no mata-mata**: `deriveBracketOutcome` decidia o vencedor de KO só por `score_home_90` → todo jogo decidido na prorrogação ou pênaltis (empate em 90min) zerava champion/vice/3º/4º de TODOS os participantes silenciosamente. Quando o mata-mata começar (28/jun) isso quebraria a pontuação. Fix: `BracketMatchInput` ganhou `score_home_ft/score_away_ft/penalty_winner` + helper `knockoutWinner()` (pênaltis → prorrogação → 90min). Propagado em `bracket-live.ts`, `BracketCard` realOutcome e `matches/[id]/result`. 4 testes novos
- **BUG CRÍTICO — ranking sumia com quem só fez bracket**: `rankMap` só era semeado por quem tinha `prediction_scores`; quem preencheu só o bracket (modo classificação!) não aparecia. Fix: semear com TODOS os membros ativos (`pool_members`), `ensure()` cria entry para qualquer fonte de pontos, e `session.name` garante o nome do usuário atual (RLS de profiles não expõe nome via join pool_members)
- **BUG ALTO — prediction_mode burlado**: `engine.ts` usava `"winner" in prediction` → um payload de placar com chave `winner` espúria pontuava como winner-pick (3) em vez de placar (10). Agora o modo do BOLÃO é a fonte única
- **BUG ALTO — ranking não-determinístico**: ordenava só por pontos, empates em ordem de array. Agora desempata por placares exatos → nome (estável). Cadeia completa de tiebreakers (`computeStandings`) fica para evolução
- **BUG MÉDIO — 3º lugar = finalista**: guard no `onChange` do bracket remove `third_place` se o time foi promovido a finalista. Migração v1.6→v1.7 tornada conservadora (não adivinha campeão de `finalists[0]`)
- **BUG BAIXO — slug**: entropia 5→8 chars (criar + api/pools)
- Prova: 143/143 testes (+4 de KO), tsc/build limpos, servidor reiniciado, página 200, ranking renderiza com participante presente. Chaveamento validado via WebFetch da fonte oficial
- **Gaps de UX pendentes p/ 10/10** (achados no pente fino do wizard, são copy/feature, não bugs): botão "Continuar" desabilitado sem feedback; falta tabela de pontuação concreta na escolha de modo; "bônus opcional" não quantificado no card; "amanhã à noite" hardcoded no card de classificação. Maior: **deploy Vercel** (login do Victor) e **migration de hardening do sync** (pendente, precisa admin/MCP Supabase)

## v1.7 — 3ºs reativos, OFF-BY-ONE de fases, placar na árvore (2026-06-12, ~15h)

## v1.7 — 3ºs reativos, OFF-BY-ONE de fases, placar na árvore (2026-06-12, ~15h)

Victor (print da árvore): "3ºs parece que não atualizam no mata-mata; incluir placar exato pra bônus; deixar explicada a pontuação esperada e ganha em cada fase/jogo".

- **Bug dos 3ºs**: `thirdAlloc` era `useState` calculado uma vez no mount — marcar os 8 melhores 3ºs depois não preenchia os slots. Agora `computeThirdAlloc` (wc26-pairings.ts) é derivado por `useMemo`: matching bipartido máximo (Kuhn) + overrides manuais válidos. Provado no browser: 8 chips marcados → 8 slots preenchidos na hora, todos elegíveis por grupo
- **BUG GRAVE descoberto no caminho — árvore deslocada 1 fase vs scoring**: a v1.6 gravava vencedores dos 16 avos em `r32_winners`, que o `scoreBracket` IGNORA (não pontua) — todos os picks da 1ª coluna valiam 0. Corrigido: 16 avos→`r16_winners`, oitavas→`qf_winners`, quartas→`sf_winners`, semis→`finalists`, vencedor da final→`champion` (semântica que o scoring sempre usou: cada array = times que CHEGAM à fase seguinte). `parseBracket` migra payloads v1.6 (se `r32_winners` não-vazio, desloca tudo) — bracket salvo do Victor se conserta sozinho ao abrir/salvar
- **Placar exato na árvore**: cada card de jogo do mata-mata ganha "Cravar placar · +N pts" (N = exact_score × multiplicador da fase, do ruleset real) → expande 2 inputs + OK → POST /api/predictions no jogo REAL do banco. Mapeamento nº FIFA→jogo: `mapKnockoutByFifaNumber` (cronológico por fase, desempate por id; banco validado: 16/8/4/2/1/1). Gate: prediction_mode score + exact_score>0 + não-specials_only
- **Pontuação explícita**: legenda "Cada acerto vale: oitavas +2 · ... · campeão +30 + bônus de placar" acima da árvore; hint por coluna ("acerto = +2 pts (oitavas)"); selo no pick: "+X" pendente, "✓ +X" verde quando o resultado real confirma (via deriveBracketOutcome on-read), "✗ 0" quando a fase real fecha sem o time; campeão/3º com selo próprio
- **Higiene**: tap no vencedor remove o adversário do par (antes os dois podiam coexistir no set e pontuar dobrado); trocar grupo/3ºs poda picks downstream não-classificados (pruneKO); removidos mortos (toggleKO, KOPhaseColumn, PhaseConnector, PodiumChip); picker de 3º sem candidato explica o porquê
- Prova: 139/139 testes (9 novos em wc26-pairings.test.ts), tsc limpo, build ok, validação no Chrome real (DOM: slots preenchidos, badge "+2", Coreia propagada pra oitavas, inputs de placar abrem). Nada salvo em nome do Victor — estado local apenas

## v1.6 — Árvore de chaveamento REAL (2026-06-12, ~12h)

Victor: "cadê o caralho da visão em chaveamento" — as listas de chips por fase não eram bracket. Agora é:

- **Pareamento oficial FIFA codificado**: `src/lib/scoring/wc26-pairings.ts` (R32 jogos 73–88 com slots "1A"/"2B"/"3º de C/E/F/H/I", árvore até a final 104; fonte Wikipedia/FIFA conferida 2026-06-12 — zero cruzamento inventado)
- **KnockoutTreeEditor** (novo, substitui as listas): os 16 confrontos dos 16 avos se montam SOZINHOS dos picks de grupo (1ºA cai no jogo certo); slots de melhor 3º abrem picker só com os 3ºs elegíveis pelo grupo; tocar no time = vence e avança pro slot seguinte, com cascata limpa ao trocar; final no fim com campeão + disputa de 3º. Payload schema INTOCADO (r16_winners etc.) — scoring e servidor inalterados
- **Layout**: 1ª versão bilateral (9 col grid) QUEBROU na prova visual (transbordo) → corrigida para árvore unilateral 5 colunas flex (16 avos dita a altura, fases seguintes space-around), conectores removidos por ora. Mobile: tabs por fase
- Prova: 130/130 testes, build limpo; validação visual por screenshot na 1ª rodada (detectou o transbordo) e por medição DOM na 2ª (colunas lado a lado x=59/277/495..., tela do Mac bloqueada p/ pixel)

## v1.5.2 — Densidade desktop + prova visual (2026-06-12, ~11h40)

Victor: "aproveitamento de tela ruim, cadê a skill de design?". Stack completo rodado: cre-ux (gates design-dna/apple-design) → screenshot real via keli-browser → cre-critic (nota 4,5 na 1ª rodada) → fixes → re-screenshot (página caiu de 5928px para 2964px de altura).

- **Modo classificação abre na tab Bracket** (ordem Bracket·Ranking·Placares; label "Placares (bônus)" + banner de bônus). Prop isClassification page→BolaoClient
- **Densidade lg/xl**: tab bracket até 1400px; 12 grupos em grade 4 colunas (uma tela); melhores 3ºs em faixa; oitavas em grade wrap full-width; quartas→campeão em colunas progressivas (árvore); Salvar sticky bottom
- **Board read-only enxuto**: showGroups=false junto do formulário (sem 24 cards duplicados); árvore do mata-mata real escondida até a FIFA definir cruzamentos (antes era ~60% da página de slots "A definir")
- Mobile intocado (progressive enhancement atrás de lg:/xl:)

## v1.5.1 — 3ºs de verdade + consolidação (2026-06-12, ~11h)

Feedback duro do Victor (tela do bolao-mkw8x, criado com bundle pré-v1.5): "cadê o 3º colocado, cadê a tabela completa, cadê os 3ºs no ranking, onde está o placar exato". Gaps reais encontrados e fechados:

- **UI dos 3ºs não existia**: BracketCard agora cicla 1º→2º→3º no tap (3º = borda tracejada), seção nova "Melhores terceiros — escolha 8" (candidatos = 3ºs marcados, cap 8, progresso x/8). Candidatos a oitavas = 1º/2º + os 8 escolhidos
- **Scoring dos 3ºs não existia**: deriveBracketOutcome ganha groups.third + qualified inclui times do chaveamento r32 real ("A definir" ignorado); scoreBracket pontua third_qualifiers com group_qualified (guard anti-dupla-contagem). 4 testes novos — 130/130
- **Consolidação**: no "só classificação" o chaveamento é a fonte ÚNICA (champion/qualifiers specials desligados no ruleset, cards escondidos no wizard, bracket "Sempre ativo") — elimina a tela duplicada de 1º/2º que confundiu o Victor
- **RLS de pools**: UPDATE via anon retorna 204 com 0 rows (RLS ok, sem vuln; PATCH não conserta pools antigos). Bolões criados antes da v1.5 não são editáveis — recriar
- ⚠️ Bolões antigos do Victor (bolao-mkw8x etc.) ficaram na config velha — ele recria no fluxo novo

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

## Pipeline
- Estágio: brainstorm ✅ → spec ✅ → plan ✅ → tdd ⏳ → verify ⬜
- Atualizado: 2026-06-14

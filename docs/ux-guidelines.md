# UX/UI Guidelines — Bolão Copa 2026

> Output completo do agente cre-ux (2026-06-11), filtros apple-design/HIG aplicados. Resumo executivo na PARTE 3 do SPEC.md.

## 0. Princípio Filosófico

> "O bolão é o conteúdo. A UI não compete com ele."

Motor forte por baixo (dezenas de regras configuráveis, scoring em tempo real, multi-formato). Superfície simples por cima. O participante casual nunca deve sentir a complexidade.

| Persona | Frequência | Dispositivo primário | Objetivo |
|---|---|---|---|
| Participante casual | 90% do uso | iPhone, Android | Dar palpite em segundos, ver ranking |
| Organizador | 10% do uso | Mobile + desktop ok | Criar bolão, configurar regras, gerir |

## 1. Mapa de Telas e Fluxos

### 1.1 Onboarding (participante via link de convite)

```
[Link compartilhado]
    → Landing "Você foi convidado para [Nome do Bolão]"
         → Preview: próximos 2 jogos + ranking atual (sem login)
         → CTA único: "Entrar e Palpitar"
              → Cadastro mínimo: nome + WhatsApp (ou Google one-tap)
              → Direto para tela de Palpites — sem tutorial, sem email confirm
```

- Zero campos obrigatórios além de nome e contato
- Preview acessível antes de criar conta (converter pela experiência, não pela obrigação)
- Sem tela de boas-vindas separada — o conteúdo É o onboarding

### 1.2 Criar Bolão — Wizard (3 telas no modo simples)

**Tela 1 — Identidade:** nome (placeholder sugestivo), capa emoji opcional, formato em dois cards grandes: "Copa Inteira" vs "Jogo Específico".

**Tela 2 — Regras (modo padrão):** só 3 opções com defaults marcados — pontos por resultado exato (slider), pontos por placar certo (slider), prazo (segmentado 15min/1h/1 dia). Link discreto "Configurar regras avançadas".

**Tela 3 — Revisão + Criar:** resumo em card, botão "Criar Bolão", imediato → tela de convite.

**Modo Avançado (sheet modal, seções colapsáveis):**

| Seção | Opções |
|---|---|
| Pontuação | camadas de pontos, bônus, multiplicadores |
| Acesso | público / privado por link / aprovação |
| Formato | grupos, mata-mata, jogo único, seleção manual |
| Bonificações | sequência de acertos, multiplicador de fase |
| Administração | edição de palpite, máx participantes |

Cada seção fechada por padrão, título + resumo do estado atual (ex: "Pontuação — Exato: 10 · Vencedor: 3").

### 1.3 Convidar — WhatsApp-First

```
Tela de Convite
├── Card grande: link copiável (tap = copiar + haptic)
├── Primário: "Enviar pelo WhatsApp" (deeplink wa.me com texto pré-preenchido)
├── Secundário: share sheet nativa
└── QR Code colapsado
```

- Link curto `/b/abc123`; preview no WhatsApp mostra nome, próximo jogo, "X pessoas já entraram"
- Texto pré-preenchido: "Entrei no [Nome], você também entra? 👊 [link]"

### 1.4 Dar Palpites — tela mais crítica

```
┌─────────────────────────────────────────────┐
│  SEG 16/06  •  18:00  •  Grupo A            │
│  🇧🇷 Brasil      [2]   x   [1]      🇦🇷 Arg   │
│  ● Palpite salvo                  10:23:44  │
└─────────────────────────────────────────────┘
```

| Contexto | Mecanismo |
|---|---|
| Mobile, palpite rápido | Steppers +/− (placar típico 0–3, dois taps resolvem 95%) |
| Placar alto / acessibilidade | Tap no número abre numpad nativo |
| Desktop | Campo numérico + tab |

- Lista vertical contínua, sticky header com progresso ("3 de 8 palpites feitos")
- "Salvar Todos" fixo no rodapé (só quando há não-salvos); auto-save por jogo após 1.5s
- Rodadas em seções colapsáveis; encerrados fora do foco

### 1.5 Ranking ao Vivo

- Lista de cards (NUNCA `<table>`); posição do usuário sempre visível (fixada se fora da viewport)
- Delta de posição ▲▼ + pontos; indicador ●●○ de forma (últimos 3 jogos)
- Tap em nome → palpites da pessoa para próximos jogos (pós-lock)
- Polling/Realtime 30s durante jogo; badge "ao vivo" pulsante

### 1.6 Página do Jogo

1. Header (data, hora, fase, estádio)
2. Meu palpite (com prazo restante)
3. Resultado atual/ao vivo
4. Distribuição dos palpites (barras, só pós-lock)
5. Quem acertou + pontos

## 2. Padrões de Interação

### Steppers
- Botões −/+ mín 44×44px, haptic light, número central tabular 600/22px, limite 9, − desabilitado em 0 (opacity 0.38)

### Deadline Countdown

| Tempo restante | Tratamento |
|---|---|
| > 1 dia | "Fecha em 2 dias" |
| 1h–24h | âmbar: "Fecha em 4h 32min" |
| < 1h | countdown vivo vermelho "00:43:17" |
| Encerrado | badge "Encerrado", steppers off, opacidade reduzida |

Fonte tabular, sem piscar.

### Estados do Palpite

| Estado | Visual | Cor |
|---|---|---|
| Sem palpite | borda tracejada, "--" | cinza |
| Salvo | "Salvo" + timestamp | verde `#30D158` |
| Bloqueado | overlay, cadeado | neutro 0.6 |
| Em andamento | badge pulsante | âmbar `#FF9F0A` |
| Acertou | destaque dourado + pontos | dourado |
| Errou | sem punição visual | neutro |

**Princípio:** reforçar acertos, não punir erros.

### Live updates
- SSE/WebSocket/Realtime; flash âmbar→transparente 400ms no placar; pulse respeita `prefers-reduced-motion`; nunca interromper entrada de palpite.

## 3. Navegação

**Bottom nav mobile (máx 4):** `[Palpites] [Ranking] [Jogos] [Bolão]`
Participante casual nunca vê configuração/admin — fica na aba Bolão, só para organizador. Nenhuma função desktop-exclusiva.

## 4. Design Tokens

**Tom:** "Festivo Copa, não carnaval. Limpo, não clínico." Nubank-meets-Copa. Sem verde-amarelo como tema.

| Token | Light | Dark |
|---|---|---|
| `--color-bg-primary` | `#FBFBFD` | `#1D1D1F` |
| `--color-bg-secondary` | `#F2F2F7` | `#2C2C2E` |
| `--color-bg-card` | `#FFFFFF` | `#3A3A3C` |
| `--color-text-primary` | `#1D1D1F` | `#F5F5F7` |
| `--color-text-secondary` | `#6E6E73` | `#98989D` |
| `--color-accent` | `#005BBB` | `#0A84FF` |
| `--color-success` | `#30D158` | `#30D158` |
| `--color-warning` | `#FF9F0A` | `#FF9F0A` |
| `--color-danger` | `#FF453A` | `#FF453A` |
| `--color-gold` | `#FFD60A` | `#FFD60A` |
| `--color-live` | `#FF3B30` | `#FF453A` |

- **Tipografia:** `-apple-system, BlinkMacSystemFont, 'Inter'`; escala 11/13/15/17/22/28/34; pesos 400/500/600/700; `tabular-nums` em placares/ranking; line-height 1.2/1.4/1.5
- **Spacing:** base 4px — 4/8/12/16/24/32/48/64
- **Radius:** badge 4 · botão/input 8 · card 12 · sheet 20 · avatar 50%
- **Sombras:** card `0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.06)`; destaque dourado `0 0 0 2px gold, 0 4px 16px rgba(255,214,10,.2)`
- **Motion:** spring `cubic-bezier(0.32,0.72,0,1)`; 200ms feedback / 350ms transição; zero ease-in-out genérico; reduced-motion → fade 150ms
- **Dark/light:** via `prefers-color-scheme`, sem toggle manual na v1

### Acessibilidade
Contraste 4.5:1 (3:1 em 22px+), touch ≥44px, focus ring 2px accent, `aria-label` em placares, estado nunca só por cor, layout ok até 200% zoom, countdown `aria-live="polite"`.

## 5. Anti-Patterns (proibido)

- Formulários gigantes de configuração / acordeões que abrem mais formulários
- `<table>` para ranking; colunas fixas no mobile
- `<select>` para placar
- Prazo só em data absoluta sem contexto relativo
- Push permission no cadastro; push de cada gol por padrão
- Pontos escondidos atrás de clique
- Tour/tutorial de 5 telas antes de agir
- Múltiplas cores de acento (Copa é colorida, UI não)
- Login-wall antes do preview
- Empty state sem CTA

## Checklist Apple Design — validado

Clean ✓ · Menos é mais ✓ · Hierarquia óbvia ✓ · Animação com propósito ✓ · Toque natural ✓ · Deferência ao conteúdo ✓ · Tipografia como estrutura ✓ · Feedback imediato ✓

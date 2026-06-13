# Deploy — Railway

O Bolão roda como um **servidor Next.js long-running** no Railway. Diferente da
Vercel (serverless), o processo fica vivo — então o sync de placares roda como
**cron interno** (`src/instrumentation.ts`), sem depender de cron externo nem do
Mac do Victor ligado.

## Pré-requisitos
- Repo no GitHub (já é: `keli-products-bolao-copa`).
- Conta no Railway (railway.app) — login com o GitHub.

## Passo a passo

### 1. Criar o projeto
1. Railway → **New Project** → **Deploy from GitHub repo** → escolher `keli-products-bolao-copa`.
2. O Railway detecta Next.js via Nixpacks e lê o `railway.json` (build + start + healthcheck já configurados). Não precisa de Dockerfile.

### 2. Configurar as variáveis de ambiente
Em **Variables**, adicionar (valores ficam no macOS Keychain — ver "De onde vêm os valores"):

| Variável | O que é | Exemplo |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase | `https://rsippykwiffybjfgljzj.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (pública por design) | `eyJ...` |
| `FOOTBALL_DATA_TOKEN` | Token football-data.org v4 | — |
| `SYNC_USER_ID` | UUID do perfil de sistema "Keli Sync" | — |
| `SYNC_USER_SECRET` | Secret do perfil de sistema | — |
| `CRON_SECRET` | Segredo do endpoint manual `/api/sync-results` | — |
| `ENABLE_SYNC_CRON` | Liga o cron interno de sync | `true` |

> **Importante:** `ENABLE_SYNC_CRON=true` só aqui no Railway. O cron interno roda
> a cada 10 min dentro do servidor. `numReplicas` está fixado em **1** no
> `railway.json` para o cron não duplicar.

### 3. Deploy
- O Railway faz `npm install` → `npm run build` → `npm run start` (porta vem da env `PORT`, injetada pelo Railway; o start usa `${PORT:-3017}`).
- Em **Settings → Networking → Generate Domain**, gerar o domínio público (ex: `bolao-copa-production.up.railway.app`) ou apontar um domínio próprio.

### 4. Pós-deploy — checklist
- [ ] Abrir o domínio → landing carrega.
- [ ] `/b/<slug>` de um bolão existente carrega (a identidade/cookie é por domínio — quem entrou pelo túnel antigo entra de novo no domínio novo).
- [ ] Logs do Railway mostram `[sync-cron] ativo — sincronizando placares a cada 10 min`.
- [ ] Esperar um placar mudar (ou checar o log do próximo tick) para confirmar o sync.

## De onde vêm os valores (Keychain)
Os segredos estão no macOS Keychain do Victor (skill `api-vault`, namespace `keli-vault/*`):

```bash
# Supabase URL + anon: a anon key também é extraível do bundle .next/static/chunks
security find-generic-password -s keli-vault/football-data -a default -w   # FOOTBALL_DATA_TOKEN
security find-generic-password -s keli-vault/bolao-sync   -a default -w     # formato uid:secret → SYNC_USER_ID:SYNC_USER_SECRET
security find-generic-password -s keli-vault/bolao-cron   -a default -w     # CRON_SECRET
```

`keli-vault/bolao-sync` vem como `uid:secret` — a parte antes do `:` é `SYNC_USER_ID`, depois `SYNC_USER_SECRET`.

## Migração do servidor local
Depois que o Railway estiver no ar e validado, desativar os LaunchAgents locais
(que rodavam no Mac), para não ter dois servidores/syncs concorrentes:

```bash
launchctl bootout gui/$(id -u)/com.keli.bolao-server
launchctl bootout gui/$(id -u)/com.keli.bolao-sync
```

## Notas
- `vercel.json` (cron serverless) fica no repo para quem preferir Vercel — é
  ignorado pelo Railway. No Railway o sync vem do `instrumentation.ts`.
- O endpoint `/api/sync-results` (protegido por `CRON_SECRET`) continua existindo
  para disparo manual/externo, caso queira forçar uma sincronização.

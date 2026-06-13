/**
 * instrumentation.ts — roda UMA vez no boot do servidor Next (Node runtime).
 *
 * Em produção long-running (Railway), liga um cron INTERNO que sincroniza os
 * placares oficiais a cada 10 min, direto no processo do servidor — sem depender
 * de cron externo nem do Mac do Victor ligado.
 *
 * Ativação: só quando ENABLE_SYNC_CRON="true" e a config de sync está completa.
 * Em build/serverless/edge não faz nada. Em Vercel (serverless) o setInterval
 * não persiste — lá o sync continua vindo do cron do vercel.json.
 */

const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos

export async function register() {
  // Só no runtime Node (não no edge, não em build)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.ENABLE_SYNC_CRON !== "true") return;

  const { runSync, syncConfigFromEnv } = await import("@/lib/sync");

  const cfg = syncConfigFromEnv();
  if (!cfg) {
    console.warn(
      "[sync-cron] desativado: faltam envs (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, FOOTBALL_DATA_TOKEN, SYNC_USER_ID, SYNC_USER_SECRET)"
    );
    return;
  }

  const tick = async () => {
    try {
      const r = await runSync(cfg);
      // Log compacto — só quando houve mudança, pra não poluir
      if (r.updated.length > 0 || r.errors.length > 0) {
        console.log(`[sync-cron] ${new Date().toISOString()} ${JSON.stringify(r)}`);
      }
    } catch (e) {
      console.error("[sync-cron] erro:", e instanceof Error ? e.message : e);
    }
  };

  console.log("[sync-cron] ativo — sincronizando placares a cada 10 min");
  // Primeira rodada logo no boot, depois a cada 10 min
  void tick();
  setInterval(tick, SYNC_INTERVAL_MS);
}

import { NextRequest, NextResponse } from "next/server";
import { runSync, syncConfigFromEnv } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sincroniza placares oficiais e repontua os bolões afetados.
 *
 * Auth (qualquer uma das duas formas):
 *   - header `x-cron-secret: <CRON_SECRET>`   (cron local via curl)
 *   - header `Authorization: Bearer <CRON_SECRET>` (Vercel Cron)
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "not_configured", message: "CRON_SECRET ausente no ambiente." },
      { status: 503 }
    );
  }

  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cfg = syncConfigFromEnv();
  if (!cfg) {
    return NextResponse.json(
      {
        error: "not_configured",
        message:
          "Faltam env vars: FOOTBALL_DATA_TOKEN, SYNC_USER_ID, SYNC_USER_SECRET.",
      },
      { status: 503 }
    );
  }

  try {
    const report = await runSync(cfg);
    const status = report.errors.length > 0 ? 207 : 200;
    return NextResponse.json({ ok: report.errors.length === 0, ...report }, { status });
  } catch (err) {
    console.error("[sync-results] error:", err);
    return NextResponse.json(
      { error: "sync_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// Vercel Cron usa GET
export async function GET(req: NextRequest) {
  return handle(req);
}

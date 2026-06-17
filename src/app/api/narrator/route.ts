import { NextRequest, NextResponse } from "next/server";
import { runNarrator, narratorConfigFromEnv } from "@/lib/narrator";

// Dispara o Narrador sob demanda (além do cron interno). Protegido por CRON_SECRET.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cfg = narratorConfigFromEnv();
  if (!cfg) {
    return NextResponse.json({ error: "narrator_not_configured" }, { status: 503 });
  }
  const report = await runNarrator(cfg);
  return NextResponse.json(report);
}

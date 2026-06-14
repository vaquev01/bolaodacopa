import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { parseRuleset } from "@/lib/scoring";

/**
 * PATCH /api/pools/[id]/ruleset
 * Permite ao dono do bolão atualizar campos do ruleset (hoje: prize).
 * Merge parcial: apenas os campos enviados são sobrescritos; o resto é mantido.
 * Validado server-side via parseRuleset (Zod) para garantir integridade.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: poolId } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { prize?: unknown };

    const supabase = await createServerClient();

    // Ler ruleset atual (SELECT é liberado por RLS). Ownership é checado na RPC.
    const { data: pool, error: poolErr } = await supabase
      .from("pools")
      .select("id, owner_id, ruleset")
      .eq("id", poolId)
      .single();

    if (poolErr || !pool) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (pool.owner_id !== session.userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Fazer merge: pega o ruleset atual e sobrescreve apenas os campos enviados
    const current = parseRuleset(pool.ruleset);
    const merged = { ...current } as Record<string, unknown>;

    if ("prize" in body) {
      // Merge parcial dentro de prize (mantém campos não enviados)
      const incomingPrize =
        body.prize && typeof body.prize === "object" && !Array.isArray(body.prize)
          ? (body.prize as Record<string, unknown>)
          : {};
      merged.prize = { ...current.prize, ...incomingPrize };
    }

    // Revalidar com Zod para garantir consistência
    const validated = parseRuleset(merged);

    // Persistir via RPC security definer — pools tem RLS só de SELECT,
    // UPDATE direto via anon é bloqueado (0 rows). A RPC revalida o dono.
    const { error: updateErr } = await supabase.rpc("update_pool_ruleset", {
      p_user: session.userId,
      p_secret: session.secret,
      p_pool: poolId,
      p_ruleset: validated,
    });

    if (updateErr) {
      if (updateErr.message.includes("forbidden")) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      console.error("[pools/ruleset] update error:", updateErr.message);
      return NextResponse.json({ error: "db_error", message: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[pools/ruleset] unexpected:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

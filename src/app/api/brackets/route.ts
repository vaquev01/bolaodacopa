import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

/**
 * POST /api/brackets
 * Submete o bracket pré-Copa via RPC submit_bracket.
 * Retorna 422 { error: "bracket_locked" } se Copa já começou.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "unauthorized", message: "Sessão não encontrada." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { pool_id, payload } = body as {
      pool_id?: string;
      payload?: Record<string, unknown>;
    };

    if (!pool_id || typeof pool_id !== "string") {
      return NextResponse.json(
        { error: "invalid_input", message: "pool_id é obrigatório." },
        { status: 400 }
      );
    }

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { error: "invalid_input", message: "payload é obrigatório." },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();

    // Verificar que o pool tem advance_predictions habilitado
    const { data: poolData, error: poolError } = await supabase
      .from("pools")
      .select("ruleset")
      .eq("id", pool_id)
      .single();

    if (poolError || !poolData) {
      return NextResponse.json(
        { error: "not_found", message: "Bolão não encontrado." },
        { status: 404 }
      );
    }

    const { parseRuleset } = await import("@/lib/scoring");
    const ruleset = parseRuleset(poolData.ruleset);

    if (!ruleset.advance_predictions.enabled) {
      return NextResponse.json(
        { error: "feature_disabled", message: "Bracket pré-Copa não está habilitado neste bolão." },
        { status: 422 }
      );
    }

    // Submeter via RPC (valida lock server-side)
    const { data: rpcResult, error: rpcError } = await supabase.rpc("submit_bracket", {
      p_user: session.userId,
      p_secret: session.secret,
      p_pool: pool_id,
      p_payload: payload,
    });

    if (rpcError) {
      console.error("[brackets] submit_bracket error:", rpcError.message);
      if (rpcError.message.includes("unauthorized")) {
        return NextResponse.json(
          { error: "unauthorized", message: "Sessão inválida." },
          { status: 401 }
        );
      }
      if (rpcError.message.includes("not_member")) {
        return NextResponse.json(
          { error: "not_member", message: "Você não é membro deste bolão." },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: "rpc_error", message: rpcError.message },
        { status: 500 }
      );
    }

    // RPC retorna { error: 'bracket_locked' } se Copa já começou
    const result = rpcResult as { error?: string; ok?: boolean; lock_at?: string };
    if (result?.error === "bracket_locked") {
      return NextResponse.json(
        { error: "bracket_locked", message: "O bracket está travado. A Copa já começou.", lock_at: result.lock_at },
        { status: 422 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[brackets] unexpected error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Erro interno." },
      { status: 500 }
    );
  }
}

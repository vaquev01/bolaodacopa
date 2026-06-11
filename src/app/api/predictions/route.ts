import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

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
    const { pool_id, match_id, payload } = body as {
      pool_id?: string;
      match_id?: string;
      payload?: { home: number; away: number };
    };

    if (!pool_id || !match_id || payload === undefined) {
      return NextResponse.json(
        { error: "invalid_input", message: "pool_id, match_id e payload são obrigatórios." },
        { status: 422 }
      );
    }

    if (
      typeof payload.home !== "number" ||
      typeof payload.away !== "number" ||
      payload.home < 0 ||
      payload.away < 0 ||
      payload.home > 99 ||
      payload.away > 99
    ) {
      return NextResponse.json(
        { error: "invalid_input", message: "Placar inválido." },
        { status: 422 }
      );
    }

    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc("submit_prediction", {
      p_user: session.userId,
      p_secret: session.secret,
      p_pool: pool_id,
      p_match: match_id,
      p_payload: payload,
    });

    if (error) {
      console.error("[predictions] RPC error:", error.message);
      if (error.message.includes("deadline_passed")) {
        return NextResponse.json(
          { error: "deadline_passed", message: "Prazo de palpite encerrado para este jogo." },
          { status: 422 }
        );
      }
      return NextResponse.json(
        { error: "rpc_error", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ predictionId: data }, { status: 201 });
  } catch (err) {
    console.error("[predictions] unexpected error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Erro interno." },
      { status: 500 }
    );
  }
}

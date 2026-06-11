import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

const VALID_TYPES = ["champion", "qualifiers", "top_scorer"];

// GET → meus palpites especiais neste pool (antes do kickoff a RLS esconde de todos)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: poolId } = await params;
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("my_special_bets", {
    p_user: session.userId,
    p_secret: session.secret,
    p_pool: poolId,
  });
  if (error) {
    return NextResponse.json({ error: "rpc_error", message: error.message }, { status: 500 });
  }
  return NextResponse.json({ bets: data ?? [] });
}

// POST {bet_type, value} → envia/edita palpite especial até o 1º jogo do escopo
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "unauthorized", message: "Sessão não encontrada." },
        { status: 401 }
      );
    }
    const { id: poolId } = await params;
    const { bet_type, value } = (await req.json()) as { bet_type?: string; value?: string };

    if (!bet_type || !VALID_TYPES.includes(bet_type) || typeof value !== "string" || !value.trim()) {
      return NextResponse.json(
        { error: "invalid_input", message: "bet_type e value são obrigatórios." },
        { status: 422 }
      );
    }

    const supabase = await createServerClient();
    const { error } = await supabase.rpc("submit_special_bet", {
      p_user: session.userId,
      p_secret: session.secret,
      p_pool: poolId,
      p_bet_type: bet_type,
      p_value: value,
    });

    if (error) {
      if (error.message.includes("deadline_passed")) {
        return NextResponse.json(
          { error: "deadline_passed", message: "Prazo encerrado: a copa já começou para este bolão." },
          { status: 409 }
        );
      }
      if (error.message.includes("not_member")) {
        return NextResponse.json(
          { error: "not_member", message: "Você não é membro deste bolão." },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: "rpc_error", message: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[special-bets] unexpected error:", err);
    return NextResponse.json({ error: "internal_error", message: "Erro interno." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

// POST: posta um comentário (mural do pool ou resenha de um jogo).
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized", message: "Sessão não encontrada." }, { status: 401 });
    }

    const { pool_id, scope, match_id, body } = (await req.json()) as {
      pool_id?: string;
      scope?: "match" | "pool";
      match_id?: string | null;
      body?: string;
    };

    if (!pool_id || (scope !== "match" && scope !== "pool")) {
      return NextResponse.json({ error: "invalid_input", message: "pool_id e scope são obrigatórios." }, { status: 422 });
    }
    if (scope === "match" && !match_id) {
      return NextResponse.json({ error: "invalid_input", message: "match_id obrigatório para resenha de jogo." }, { status: 422 });
    }
    const text = (body ?? "").trim();
    if (text.length < 1 || text.length > 280) {
      return NextResponse.json({ error: "invalid_input", message: "Comentário entre 1 e 280 caracteres." }, { status: 422 });
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc("post_comment", {
      p_user: session.userId,
      p_secret: session.secret,
      p_pool: pool_id,
      p_scope: scope,
      p_match: scope === "match" ? match_id : null,
      p_body: text,
    });

    if (error) {
      console.error("[comments] post RPC error:", error.message);
      if (error.message.includes("not_member")) {
        return NextResponse.json({ error: "not_member", message: "Você não participa deste bolão." }, { status: 403 });
      }
      return NextResponse.json({ error: "rpc_error", message: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data }, { status: 201 });
  } catch (err) {
    console.error("[comments] POST unexpected error:", err);
    return NextResponse.json({ error: "internal_error", message: "Erro interno." }, { status: 500 });
  }
}

// DELETE: apaga um comentário (autor ou dono do pool).
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized", message: "Sessão não encontrada." }, { status: 401 });
    }

    const { comment_id } = (await req.json()) as { comment_id?: string };
    if (!comment_id) {
      return NextResponse.json({ error: "invalid_input", message: "comment_id obrigatório." }, { status: 422 });
    }

    const supabase = await createServerClient();
    const { error } = await supabase.rpc("delete_comment", {
      p_user: session.userId,
      p_secret: session.secret,
      p_comment: comment_id,
    });

    if (error) {
      console.error("[comments] delete RPC error:", error.message);
      if (error.message.includes("forbidden")) {
        return NextResponse.json({ error: "forbidden", message: "Você não pode apagar este comentário." }, { status: 403 });
      }
      return NextResponse.json({ error: "rpc_error", message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[comments] DELETE unexpected error:", err);
    return NextResponse.json({ error: "internal_error", message: "Erro interno." }, { status: 500 });
  }
}

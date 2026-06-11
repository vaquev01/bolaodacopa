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
    const { slug } = body as { slug?: string };

    if (!slug || typeof slug !== "string") {
      return NextResponse.json(
        { error: "invalid_input", message: "Slug do bolão é obrigatório." },
        { status: 422 }
      );
    }

    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc("join_pool", {
      p_user: session.userId,
      p_secret: session.secret,
      p_slug: slug,
    });

    if (error) {
      console.error("[pools/join] RPC error:", error.message);
      if (error.message.includes("not_found")) {
        return NextResponse.json(
          { error: "not_found", message: "Bolão não encontrado." },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "rpc_error", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ memberId: data }, { status: 200 });
  } catch (err) {
    console.error("[pools/join] unexpected error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Erro interno." },
      { status: 500 }
    );
  }
}

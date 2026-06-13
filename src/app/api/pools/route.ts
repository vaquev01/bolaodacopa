import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { DEFAULT_RULESET } from "@/lib/scoring";

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
    const { name, slug, ruleset, scope } = body as {
      name?: string;
      slug?: string;
      ruleset?: object;
      scope?: object;
    };

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "invalid_input", message: "Nome do bolão deve ter pelo menos 2 caracteres." },
        { status: 422 }
      );
    }

    // Generate slug from name if not provided
    const finalSlug =
      slug?.trim() ||
      name
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32) +
        "-" +
        Math.random().toString(36).slice(2, 10);

    const finalRuleset = ruleset ?? DEFAULT_RULESET;
    const finalScope = scope ?? { type: "full" };

    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc("create_pool", {
      p_user: session.userId,
      p_secret: session.secret,
      p_name: name.trim(),
      p_slug: finalSlug,
      p_ruleset: finalRuleset,
      p_scope: finalScope,
    });

    if (error) {
      console.error("[pools] RPC error:", error.message);
      return NextResponse.json(
        { error: "rpc_error", message: error.message },
        { status: 500 }
      );
    }

    const poolId = data as string;
    const inviteUrl = `/b/${finalSlug}`;

    return NextResponse.json(
      { id: poolId, slug: finalSlug, invite_url: inviteUrl },
      { status: 201 }
    );
  } catch (err) {
    console.error("[pools] unexpected error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Erro interno." },
      { status: 500 }
    );
  }
}

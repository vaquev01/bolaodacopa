import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { setSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name } = body as { name?: string };

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "invalid_input", message: "Nome deve ter pelo menos 2 caracteres." },
        { status: 422 }
      );
    }

    const secret = crypto.randomUUID();
    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc("create_profile", {
      p_name: name.trim(),
      p_secret: secret,
    });

    if (error) {
      console.error("[profiles] RPC error:", error.message);
      return NextResponse.json(
        { error: "rpc_error", message: error.message },
        { status: 500 }
      );
    }

    const userId = data as string;

    await setSession({ userId, secret, name: name.trim() });

    return NextResponse.json({ userId, name: name.trim() }, { status: 201 });
  } catch (err) {
    console.error("[profiles] unexpected error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Erro interno." },
      { status: 500 }
    );
  }
}

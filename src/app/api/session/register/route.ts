import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { setSession } from "@/lib/session";

/** Cria uma conta portável (nome + senha) e abre a sessão neste device. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, password } = body as { name?: string; password?: string };

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "invalid_name", message: "Seu nome precisa de pelo menos 2 letras." },
        { status: 422 }
      );
    }
    if (!password || typeof password !== "string" || password.length < 4) {
      return NextResponse.json(
        { error: "weak_password", message: "A senha precisa de pelo menos 4 caracteres." },
        { status: 422 }
      );
    }

    const secret = crypto.randomUUID();
    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc("register_account", {
      p_name: name.trim(),
      p_secret: secret,
      p_password: password,
    });

    if (error) {
      if (error.message.includes("login_taken")) {
        return NextResponse.json(
          { error: "login_taken", message: "Esse nome já está em uso. Escolha outro — ou, se já é seu, entre com sua senha." },
          { status: 409 }
        );
      }
      console.error("[session/register] RPC error:", error.message);
      return NextResponse.json(
        { error: "rpc_error", message: "Não foi possível criar a conta. Tente novamente." },
        { status: 500 }
      );
    }

    const userId = data as string;
    await setSession({ userId, secret, name: name.trim() });
    return NextResponse.json({ userId, name: name.trim() }, { status: 201 });
  } catch (err) {
    console.error("[session/register] unexpected error:", err);
    return NextResponse.json({ error: "internal_error", message: "Erro interno." }, { status: 500 });
  }
}

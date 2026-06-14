import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { setSession } from "@/lib/session";

/** Entra com nome + senha em qualquer device (recupera a identidade; rotaciona o secret de sessão). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, password } = body as { name?: string; password?: string };

    if (!name || typeof name !== "string" || !password || typeof password !== "string") {
      return NextResponse.json(
        { error: "invalid_input", message: "Informe seu nome e sua senha." },
        { status: 422 }
      );
    }

    const newSecret = crypto.randomUUID();
    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc("login_account", {
      p_name: name.trim(),
      p_password: password,
      p_new_secret: newSecret,
    });

    if (error) {
      if (error.message.includes("invalid_credentials")) {
        return NextResponse.json(
          { error: "invalid_credentials", message: "Nome ou senha incorretos." },
          { status: 401 }
        );
      }
      console.error("[session/login] RPC error:", error.message);
      return NextResponse.json(
        { error: "rpc_error", message: "Não foi possível entrar. Tente novamente." },
        { status: 500 }
      );
    }

    const result = data as { user_id: string; name: string };
    await setSession({ userId: result.user_id, secret: newSecret, name: result.name });
    return NextResponse.json({ userId: result.user_id, name: result.name }, { status: 200 });
  } catch (err) {
    console.error("[session/login] unexpected error:", err);
    return NextResponse.json({ error: "internal_error", message: "Erro interno." }, { status: 500 });
  }
}

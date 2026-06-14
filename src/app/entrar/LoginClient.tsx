"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  next: string;
}

export default function LoginClient({ next }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const r = await fetch("/api/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), password }),
      });

      if (r.ok) {
        router.push(next);
      } else {
        const d = await r.json();
        if (d.error === "invalid_credentials") {
          setError("Nome ou senha incorretos.");
        } else {
          setError(d.message ?? "Não foi possível entrar. Tente novamente.");
        }
      }
    } catch {
      setError("Sem conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="min-h-dvh flex flex-col items-center justify-center px-4 py-16"
      style={{ background: "var(--color-bg-primary)" }}
    >
      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* Cabeçalho */}
        <div className="flex flex-col gap-1">
          <h1
            className="text-[32px] font-bold leading-none"
            style={{ color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}
          >
            Entrar
          </h1>
          <p className="text-[15px]" style={{ color: "var(--color-text-secondary)" }}>
            Use o nome e senha que você cadastrou.
          </p>
        </div>

        {/* Formulário */}
        <form
          onSubmit={handleLogin}
          className="rounded-card px-5 py-6 flex flex-col gap-5"
          style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
        >
          <div>
            <label
              htmlFor="login-name"
              className="block text-[13px] font-medium mb-1.5"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Nome
            </label>
            <input
              id="login-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome no bolão"
              autoComplete="username"
              autoFocus
              maxLength={64}
              className="w-full px-4 py-3 rounded-button border text-[17px] outline-none focus-visible:ring-2 focus-visible:ring-[--color-accent]"
              style={{
                background: "var(--color-bg-primary)",
                borderColor: "var(--border-subtle)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-[13px] font-medium mb-1.5"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Senha
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha"
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-button border text-[17px] outline-none focus-visible:ring-2 focus-visible:ring-[--color-accent]"
              style={{
                background: "var(--color-bg-primary)",
                borderColor: "var(--border-subtle)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>

          {error && (
            <p className="text-[13px] font-medium" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-button text-white font-semibold text-[17px] transition-all active:scale-[0.98] disabled:opacity-60"
            style={{
              background: "var(--color-accent)",
              transitionTimingFunction: "var(--ease-spring)",
              transitionDuration: "var(--duration-feedback)",
            }}
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        {/* Rodapé */}
        <p className="text-[13px] text-center" style={{ color: "var(--color-text-secondary)" }}>
          Não tem conta?{" "}
          <a href="/criar" style={{ color: "var(--color-accent)", textDecoration: "none", fontWeight: 600 }}>
            Crie um bolão
          </a>{" "}
          ou entre por um convite.
        </p>
      </div>
    </main>
  );
}

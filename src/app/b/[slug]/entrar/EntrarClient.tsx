"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Pool {
  id: string;
  name: string;
  slug: string;
}

interface PreviewMatch {
  id: string;
  home_team: string;
  away_team: string;
  home_flag: string;
  away_flag: string;
  date: string;
  time: string;
}

interface Props {
  pool: Pool;
  membersCount: number;
  previewMatches: PreviewMatch[];
  alreadyHasSession: boolean;
  existingName?: string;
}

// Modo do formulário quando não tem sessão: cadastro ou login
type FormMode = "register" | "login";

export default function EntrarClient({
  pool,
  membersCount,
  previewMatches,
  alreadyHasSession,
  existingName,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(existingName ?? "");
  const [password, setPassword] = useState("");
  const [formMode, setFormMode] = useState<FormMode>("register");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function joinPool() {
    const r = await fetch("/api/pools/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: pool.slug }),
    });

    if (!r.ok) {
      const d = await r.json();
      setError(d.message ?? "Não foi possível entrar no bolão. Tente novamente.");
      return false;
    }
    return true;
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!alreadyHasSession) {
        if (!name.trim() || name.trim().length < 2) {
          setError("Digite seu nome (mínimo 2 caracteres).");
          setLoading(false);
          return;
        }

        if (formMode === "register") {
          if (password.length < 4) {
            setError("A senha precisa ter pelo menos 4 caracteres.");
            setLoading(false);
            return;
          }

          const r = await fetch("/api/session/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.trim(), password }),
          });

          if (!r.ok) {
            const d = await r.json();
            if (d.error === "login_taken") {
              // Conta com este nome já existe — sugere modo login
              setError(d.message + " Já é sua conta? Use o modo abaixo.");
              setLoading(false);
              return;
            }
            setError(d.message ?? "Não foi possível criar a conta. Tente novamente.");
            setLoading(false);
            return;
          }
        } else {
          // Modo login
          const r = await fetch("/api/session/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.trim(), password }),
          });

          if (!r.ok) {
            setError("Nome ou senha incorretos.");
            setLoading(false);
            return;
          }
        }
      }

      const ok = await joinPool();
      if (!ok) {
        setLoading(false);
        return;
      }

      router.push(`/b/${pool.slug}`);
    } catch {
      setError("Sem conexão. Verifique sua internet e tente novamente.");
      setLoading(false);
    }
  }

  return (
    <main
      className="min-h-dvh flex flex-col"
      style={{ background: "var(--color-bg-primary)" }}
    >
      <div className="flex-1 flex flex-col max-w-sm mx-auto w-full px-4 py-10 gap-6">

        {/* Cabeçalho convite */}
        <div className="flex flex-col gap-2">
          <span
            className="text-[13px] font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Você foi convidado para
          </span>
          <h1
            className="text-[32px] font-bold leading-none"
            style={{ color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}
          >
            {pool.name}
          </h1>
          <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            {membersCount === 0
              ? "Seja o primeiro a entrar"
              : `${membersCount} ${membersCount === 1 ? "participante" : "participantes"} já no bolão`}
          </p>
        </div>

        {/* O que é — para quem nunca usou */}
        <div
          className="rounded-card px-4 py-3"
          style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
        >
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
            Aqui o grupo <strong style={{ color: "var(--color-text-primary)" }}>palpita nos jogos
            da Copa 2026</strong> e disputa um ranking. Acertou, ganha pontos. É de graça, sem
            cadastro e não envolve dinheiro.
          </p>
        </div>

        {/* Preview dos próximos jogos */}
        {previewMatches.length > 0 && (
          <div className="flex flex-col gap-2">
            <p
              className="text-[13px] font-semibold"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Próximos jogos
            </p>
            <div className="flex flex-col gap-2">
              {previewMatches.map((m) => (
                <div
                  key={m.id}
                  className="rounded-card p-3"
                  style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex items-center gap-2">
                    {/* Time casa */}
                    <div className="flex-1 flex items-center gap-1.5 min-w-0">
                      <span aria-hidden="true">{m.home_flag}</span>
                      <span
                        className="text-[13px] font-semibold truncate"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {m.home_team}
                      </span>
                    </div>

                    {/* Horário centralizado */}
                    <div className="flex flex-col items-center flex-shrink-0 px-2">
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {m.date}
                      </span>
                      <span
                        className="tabular-nums text-[13px] font-bold"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {m.time}
                      </span>
                    </div>

                    {/* Time visitante */}
                    <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
                      <span
                        className="text-[13px] font-semibold truncate text-right"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {m.away_team}
                      </span>
                      <span aria-hidden="true">{m.away_flag}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Espaçador flexível */}
        {previewMatches.length === 0 && <div className="flex-1" />}

        {/* Formulário de entrada */}
        <form onSubmit={handleJoin} className="flex flex-col gap-4 mt-auto">
          {!alreadyHasSession && (
            <>
              <div>
                <label
                  className="block text-[13px] font-medium mb-1.5"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Qual é o seu nome? <span style={{ opacity: 0.7 }}>(é assim que você aparece no ranking)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Como você quer ser chamado"
                  maxLength={64}
                  autoFocus
                  className="w-full px-4 py-3 rounded-button border text-[17px] outline-none focus-visible:ring-2 focus-visible:ring-[--color-accent]"
                  style={{
                    background: "var(--color-bg-card)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </div>

              <div>
                <label
                  className="block text-[13px] font-medium mb-1.5"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {formMode === "register" ? "Crie uma senha" : "Senha"}
                  {formMode === "register" && (
                    <span style={{ opacity: 0.7 }}> — pra você acessar de qualquer celular depois</span>
                  )}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={formMode === "register" ? "Mínimo 4 caracteres" : "Sua senha"}
                  autoComplete={formMode === "register" ? "new-password" : "current-password"}
                  className="w-full px-4 py-3 rounded-button border text-[17px] outline-none focus-visible:ring-2 focus-visible:ring-[--color-accent]"
                  style={{
                    background: "var(--color-bg-card)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </div>

              {/* Toggle cadastro ↔ login */}
              <button
                type="button"
                onClick={() => {
                  setFormMode(formMode === "register" ? "login" : "register");
                  setError(null);
                }}
                className="text-[13px] font-medium text-left"
                style={{ color: "var(--color-accent)" }}
              >
                {formMode === "register"
                  ? "Já é seu? Entrar com nome e senha"
                  : "Criar nova conta neste bolão"}
              </button>
            </>
          )}

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
            {loading ? "Entrando…" : "Entrar e palpitar"}
          </button>

          <p
            className="text-[11px] text-center"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Crie nome e senha uma vez — depois é só esse login em qualquer aparelho.
          </p>
        </form>
      </div>
    </main>
  );
}

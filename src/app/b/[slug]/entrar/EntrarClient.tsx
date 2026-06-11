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

export default function EntrarClient({
  pool,
  membersCount,
  previewMatches,
  alreadyHasSession,
  existingName,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(existingName ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        const r = await fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });

        if (!r.ok) {
          const d = await r.json();
          setError(d.message ?? "Não foi possível criar o perfil. Tente novamente.");
          setLoading(false);
          return;
        }
      }

      const r = await fetch("/api/pools/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: pool.slug }),
      });

      if (!r.ok) {
        const d = await r.json();
        setError(d.message ?? "Não foi possível entrar no bolão. Tente novamente.");
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
            <div>
              <label
                className="block text-[13px] font-medium mb-1.5"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Qual é o seu nome?
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
            Sem senha. Em menos de 60 segundos você já está palpitando.
          </p>
        </form>
      </div>
    </main>
  );
}

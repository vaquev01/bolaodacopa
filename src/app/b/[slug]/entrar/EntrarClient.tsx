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
      // 1. Criar perfil se sem sessão
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
          setError(d.message ?? "Erro ao criar perfil.");
          setLoading(false);
          return;
        }
      }

      // 2. Entrar no bolão
      const r = await fetch("/api/pools/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: pool.slug }),
      });

      if (!r.ok) {
        const d = await r.json();
        setError(d.message ?? "Erro ao entrar no bolão.");
        setLoading(false);
        return;
      }

      // 3. Redirecionar para palpites
      router.push(`/b/${pool.slug}`);
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col" style={{ background: "var(--color-bg-primary)" }}>
      <div className="flex-1 flex flex-col max-w-sm mx-auto w-full px-4 py-8 gap-6">
        {/* Header convite */}
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Você foi convidado para
          </span>
          <h1 className="text-[28px] font-bold leading-tight" style={{ color: "var(--color-text-primary)" }}>
            {pool.name}
          </h1>
          <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            {membersCount} {membersCount === 1 ? "participante" : "participantes"} já entraram
          </p>
        </div>

        {/* Preview dos próximos jogos */}
        {previewMatches.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold mb-2" style={{ color: "var(--color-text-secondary)" }}>
              Próximos jogos
            </p>
            <div className="flex flex-col gap-2">
              {previewMatches.map((m) => (
                <div
                  key={m.id}
                  className="rounded-card p-3 flex items-center gap-3"
                  style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex-1 flex items-center gap-1 min-w-0">
                    <span>{m.home_flag}</span>
                    <span className="text-[13px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                      {m.home_team}
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[11px] font-bold" style={{ color: "var(--color-text-secondary)" }}>vs</span>
                    <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>{m.time}</span>
                  </div>
                  <div className="flex-1 flex items-center justify-end gap-1 min-w-0">
                    <span className="text-[13px] font-semibold truncate text-right" style={{ color: "var(--color-text-primary)" }}>
                      {m.away_team}
                    </span>
                    <span>{m.away_flag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Formulário de entrada */}
        <form onSubmit={handleJoin} className="flex flex-col gap-4 mt-auto">
          {!alreadyHasSession && (
            <div>
              <label className="block text-[13px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                Qual é o seu nome?
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como você quer ser chamado"
                maxLength={64}
                autoFocus
                className="w-full px-4 py-3 rounded-button border text-[17px] outline-none"
                style={{
                  background: "var(--color-bg-card)",
                  borderColor: "var(--color-bg-secondary)",
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
            className="w-full py-4 rounded-button text-white font-semibold text-[17px] transition-opacity disabled:opacity-60"
            style={{ background: "var(--color-accent)" }}
          >
            {loading ? "Entrando..." : "Entrar e Palpitar →"}
          </button>

          <p className="text-[11px] text-center" style={{ color: "var(--color-text-secondary)" }}>
            Sem senha. Seus dados ficam neste dispositivo.
          </p>
        </form>
      </div>
    </main>
  );
}

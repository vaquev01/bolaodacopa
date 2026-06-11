"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Match } from "@/lib/types";
import { formatKickoff, getFlag, stageLabel } from "@/lib/utils";

interface Pool {
  id: string;
  name: string;
  slug: string;
}

interface ResultForm {
  score_home_90: string;
  score_away_90: string;
  score_home_ft: string;
  score_away_ft: string;
  penalty_winner: string;
  hasPenalties: boolean;
}

const emptyForm = (): ResultForm => ({
  score_home_90: "",
  score_away_90: "",
  score_home_ft: "",
  score_away_ft: "",
  penalty_winner: "",
  hasPenalties: false,
});

export default function AdminClient({ pool, matches }: { pool: Pool; matches: Match[] }) {
  const router = useRouter();
  const [forms, setForms] = useState<Record<string, ResultForm>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function getForm(matchId: string): ResultForm {
    return forms[matchId] ?? emptyForm();
  }

  function updateForm(matchId: string, field: keyof ResultForm, value: string | boolean) {
    setForms((f) => ({
      ...f,
      [matchId]: { ...getForm(matchId), [field]: value },
    }));
  }

  async function handleSave(match: Match) {
    const form = getForm(match.id);
    const h90 = parseInt(form.score_home_90, 10);
    const a90 = parseInt(form.score_away_90, 10);

    if (isNaN(h90) || isNaN(a90)) {
      setErrors((e) => ({ ...e, [match.id]: "Informe o placar dos 90 minutos." }));
      return;
    }

    const hft = form.hasPenalties ? parseInt(form.score_home_ft, 10) : h90;
    const aft = form.hasPenalties ? parseInt(form.score_away_ft, 10) : a90;

    if (form.hasPenalties && (isNaN(hft) || isNaN(aft))) {
      setErrors((e) => ({ ...e, [match.id]: "Informe o placar final (com prorrogação)." }));
      return;
    }

    setErrors((e) => ({ ...e, [match.id]: "" }));
    setSaving((s) => ({ ...s, [match.id]: true }));

    try {
      const r = await fetch(`/api/matches/${match.id}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool_id: pool.id,
          score_home_90: h90,
          score_away_90: a90,
          score_home_ft: hft,
          score_away_ft: aft,
          penalty_winner: form.hasPenalties && form.penalty_winner ? form.penalty_winner : null,
        }),
      });

      if (r.ok) {
        setSaved((s) => ({ ...s, [match.id]: true }));
        router.refresh();
      } else {
        const d = await r.json();
        setErrors((e) => ({ ...e, [match.id]: d.message ?? "Erro ao salvar." }));
      }
    } catch {
      setErrors((e) => ({ ...e, [match.id]: "Erro de conexão." }));
    } finally {
      setSaving((s) => ({ ...s, [match.id]: false }));
    }
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "var(--color-bg-primary)" }}>
      {/* Header */}
      <header className="flex items-center gap-3 px-4 pt-4 pb-3 border-b"
        style={{ borderColor: "var(--color-bg-secondary)" }}>
        <button
          onClick={() => router.push(`/b/${pool.slug}`)}
          className="w-11 h-11 flex items-center justify-center rounded-full"
          style={{ background: "var(--color-bg-secondary)" }}
          aria-label="Voltar"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 15L7 10L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div>
          <h1 className="text-[17px] font-bold" style={{ color: "var(--color-text-primary)" }}>
            Admin — {pool.name}
          </h1>
          <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            Insira os resultados dos jogos
          </p>
        </div>
      </header>

      <div className="flex-1 px-4 py-4 flex flex-col gap-4 pb-12 max-w-lg mx-auto w-full">
        {matches.map((m) => {
          const { date, time } = formatKickoff(m.kickoff_at);
          const form = getForm(m.id);
          const isSaved = saved[m.id];
          const isSaving = saving[m.id];
          const err = errors[m.id];
          const hasResult = m.score_home_90 !== null && m.score_away_90 !== null;

          return (
            <div
              key={m.id}
              className="rounded-card p-4 flex flex-col gap-3"
              style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
            >
              {/* Cabeçalho */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    {getFlag(m.home_team)} {m.home_team} × {m.away_team} {getFlag(m.away_team)}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                    {date} • {time} • {stageLabel(m.stage)}
                  </p>
                </div>
                {hasResult && (
                  <span className="text-[11px] font-semibold px-2 py-1 rounded-badge"
                    style={{ background: "#E6F9EC", color: "var(--color-success)" }}>
                    {m.score_home_90}×{m.score_away_90}
                  </span>
                )}
              </div>

              {isSaved ? (
                <p className="text-[13px] font-semibold" style={{ color: "var(--color-success)" }}>
                  ✓ Resultado salvo! Pontos calculados.
                </p>
              ) : (
                <>
                  {/* Placar 90 min */}
                  <div>
                    <p className="text-[12px] font-medium mb-2" style={{ color: "var(--color-text-secondary)" }}>
                      Placar aos 90 min
                    </p>
                    <div className="flex items-center gap-3">
                      <ScoreInput
                        value={form.score_home_90}
                        onChange={(v) => updateForm(m.id, "score_home_90", v)}
                        label={m.home_team}
                      />
                      <span className="text-[17px] font-bold" style={{ color: "var(--color-text-secondary)" }}>×</span>
                      <ScoreInput
                        value={form.score_away_90}
                        onChange={(v) => updateForm(m.id, "score_away_90", v)}
                        label={m.away_team}
                      />
                    </div>
                  </div>

                  {/* Prorrogação/pênaltis */}
                  <div className="flex items-center gap-2">
                    <button
                      role="switch"
                      aria-checked={form.hasPenalties}
                      onClick={() => updateForm(m.id, "hasPenalties", !form.hasPenalties)}
                      className="w-10 h-6 rounded-full relative transition-colors"
                      style={{ background: form.hasPenalties ? "var(--color-accent)" : "var(--color-bg-secondary)" }}
                    >
                      <span
                        className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform"
                        style={{ transform: form.hasPenalties ? "translateX(18px)" : "translateX(2px)" }}
                      />
                    </button>
                    <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                      Houve prorrogação/pênaltis
                    </span>
                  </div>

                  {form.hasPenalties && (
                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="text-[12px] font-medium mb-2" style={{ color: "var(--color-text-secondary)" }}>
                          Placar final (prorrogação)
                        </p>
                        <div className="flex items-center gap-3">
                          <ScoreInput
                            value={form.score_home_ft}
                            onChange={(v) => updateForm(m.id, "score_home_ft", v)}
                            label={m.home_team}
                          />
                          <span className="text-[17px] font-bold" style={{ color: "var(--color-text-secondary)" }}>×</span>
                          <ScoreInput
                            value={form.score_away_ft}
                            onChange={(v) => updateForm(m.id, "score_away_ft", v)}
                            label={m.away_team}
                          />
                        </div>
                      </div>

                      <div>
                        <p className="text-[12px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                          Vencedor nos pênaltis (opcional)
                        </p>
                        <div className="flex gap-2">
                          {[m.home_team, m.away_team].map((team) => (
                            <button
                              key={team}
                              onClick={() => updateForm(m.id, "penalty_winner", team === form.penalty_winner ? "" : team)}
                              className="flex-1 py-2 rounded-button text-[13px] font-semibold transition-all"
                              style={{
                                background: form.penalty_winner === team ? "var(--color-accent)" : "var(--color-bg-secondary)",
                                color: form.penalty_winner === team ? "#fff" : "var(--color-text-secondary)",
                              }}
                            >
                              {team}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {err && (
                    <p className="text-[13px]" style={{ color: "var(--color-danger)" }}>{err}</p>
                  )}

                  <button
                    onClick={() => handleSave(m)}
                    disabled={isSaving}
                    className="w-full py-3 rounded-button text-white font-semibold text-[15px] transition-opacity disabled:opacity-60"
                    style={{ background: "var(--color-accent)" }}
                  >
                    {isSaving ? "Salvando..." : hasResult ? "Atualizar resultado" : "Salvar resultado"}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="flex-1">
      <p className="text-[10px] font-medium mb-1 truncate" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </p>
      <input
        type="number"
        min="0"
        max="99"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full py-2 px-3 rounded-button border text-center tabular-nums text-[17px] font-bold outline-none"
        style={{
          background: "var(--color-bg-secondary)",
          borderColor: "var(--color-bg-secondary)",
          color: "var(--color-text-primary)",
        }}
        aria-label={`Gols ${label}`}
      />
    </div>
  );
}

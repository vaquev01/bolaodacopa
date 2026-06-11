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
  score_home_90: number;
  score_away_90: number;
  score_home_ft: number;
  score_away_ft: number;
  penalty_winner: string;
  hasPenalties: boolean;
  confirmed: boolean;
}

const emptyForm = (): ResultForm => ({
  score_home_90: 0,
  score_away_90: 0,
  score_home_ft: 0,
  score_away_ft: 0,
  penalty_winner: "",
  hasPenalties: false,
  confirmed: false,
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

  function updateForm<K extends keyof ResultForm>(matchId: string, field: K, value: ResultForm[K]) {
    setForms((f) => ({
      ...f,
      [matchId]: { ...getForm(matchId), [field]: value },
    }));
  }

  function stepScore(matchId: string, field: "score_home_90" | "score_away_90" | "score_home_ft" | "score_away_ft", delta: number) {
    const current = getForm(matchId)[field] as number;
    const next = Math.max(0, Math.min(20, current + delta));
    updateForm(matchId, field, next);
    // reset confirmação se mudar placar
    updateForm(matchId, "confirmed", false);
  }

  async function handleSave(match: Match) {
    const form = getForm(match.id);

    setErrors((e) => ({ ...e, [match.id]: "" }));
    setSaving((s) => ({ ...s, [match.id]: true }));

    const h90 = form.score_home_90;
    const a90 = form.score_away_90;
    const hft = form.hasPenalties ? form.score_home_ft : h90;
    const aft = form.hasPenalties ? form.score_away_ft : a90;

    if (form.hasPenalties && hft === h90 && aft === a90) {
      setErrors((e) => ({ ...e, [match.id]: "Informe o placar final (com prorrogação) — diferente dos 90 min." }));
      setSaving((s) => ({ ...s, [match.id]: false }));
      return;
    }

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
        setErrors((e) => ({ ...e, [match.id]: d.message ?? "Não foi possível salvar o resultado. Tente novamente." }));
      }
    } catch {
      setErrors((e) => ({ ...e, [match.id]: "Sem conexão. Tente novamente." }));
    } finally {
      setSaving((s) => ({ ...s, [match.id]: false }));
    }
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "var(--color-bg-primary)" }}>
      {/* Header */}
      <header
        className="flex items-center gap-3 px-4 pt-4 pb-3 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <button
          onClick={() => router.push(`/b/${pool.slug}`)}
          className="w-11 h-11 flex items-center justify-center rounded-full transition-opacity active:opacity-60"
          style={{ background: "var(--color-bg-secondary)" }}
          aria-label="Voltar"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M12 15L7 10L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div>
          <h1
            className="text-[17px] font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {pool.name}
          </h1>
          <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            Inserir resultados
          </p>
        </div>
      </header>

      <div className="flex-1 px-4 py-4 flex flex-col gap-4 pb-12 max-w-lg mx-auto w-full">
        {matches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div
              className="w-12 h-12 rounded-card flex items-center justify-center"
              style={{ background: "var(--color-bg-secondary)" }}
              aria-hidden="true"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M8 6h8M8 10h5M6 3h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" stroke="var(--color-text-secondary)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-[17px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Nenhum jogo pendente
            </p>
            <p className="text-[15px]" style={{ color: "var(--color-text-secondary)" }}>
              Todos os resultados já foram inseridos.
            </p>
          </div>
        )}

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
              className="rounded-card p-4 flex flex-col gap-4"
              style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
            >
              {/* Cabeçalho do jogo */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[15px] font-semibold truncate"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {getFlag(m.home_team)} {m.home_team} × {m.away_team} {getFlag(m.away_team)}
                  </p>
                  <p
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {date} · {time} · {stageLabel(m.stage)}
                  </p>
                </div>
                {hasResult && (
                  <span
                    className="text-[11px] font-bold px-2 py-1 rounded-badge tabular-nums flex-shrink-0"
                    style={{ background: "#E6F9EC", color: "var(--color-success)" }}
                  >
                    {m.score_home_90}–{m.score_away_90}
                  </span>
                )}
              </div>

              {isSaved ? (
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--color-success)" }}
                    aria-hidden="true"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 7l3.5 3.5L12 3" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-[13px] font-semibold" style={{ color: "var(--color-success)" }}>
                    Resultado salvo. Pontos recalculados.
                  </p>
                </div>
              ) : (
                <>
                  {/* Placar 90 min com steppers */}
                  <div>
                    <p
                      className="text-[12px] font-semibold mb-3"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      Placar aos 90 min
                    </p>
                    <div className="flex items-center justify-center gap-4">
                      <div className="flex flex-col items-center gap-1.5 flex-1">
                        <p
                          className="text-[11px] font-medium text-center truncate w-full"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {m.home_team}
                        </p>
                        <ScoreStepper
                          value={form.score_home_90}
                          onDecrement={() => stepScore(m.id, "score_home_90", -1)}
                          onIncrement={() => stepScore(m.id, "score_home_90", 1)}
                          label={`Gols ${m.home_team}`}
                        />
                      </div>

                      <span
                        className="text-[24px] font-bold flex-shrink-0 pb-5"
                        style={{ color: "var(--color-text-secondary)" }}
                        aria-hidden="true"
                      >
                        ×
                      </span>

                      <div className="flex flex-col items-center gap-1.5 flex-1">
                        <p
                          className="text-[11px] font-medium text-center truncate w-full"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {m.away_team}
                        </p>
                        <ScoreStepper
                          value={form.score_away_90}
                          onDecrement={() => stepScore(m.id, "score_away_90", -1)}
                          onIncrement={() => stepScore(m.id, "score_away_90", 1)}
                          label={`Gols ${m.away_team}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Toggle prorrogação */}
                  <div className="flex items-center gap-2">
                    <button
                      role="switch"
                      aria-checked={form.hasPenalties}
                      onClick={() => updateForm(m.id, "hasPenalties", !form.hasPenalties)}
                      className="w-10 h-6 rounded-full relative transition-colors"
                      style={{
                        background: form.hasPenalties ? "var(--color-accent)" : "var(--color-bg-secondary)",
                        transitionTimingFunction: "var(--ease-spring)",
                      }}
                    >
                      <span
                        className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform"
                        style={{
                          transform: form.hasPenalties ? "translateX(18px)" : "translateX(2px)",
                          transitionTimingFunction: "var(--ease-spring)",
                        }}
                      />
                    </button>
                    <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                      Houve prorrogação / pênaltis
                    </span>
                  </div>

                  {/* Placar final prorrogação */}
                  {form.hasPenalties && (
                    <div className="flex flex-col gap-3 pt-1">
                      <p
                        className="text-[12px] font-semibold"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Placar final (prorrogação)
                      </p>
                      <div className="flex items-center justify-center gap-4">
                        <div className="flex flex-col items-center gap-1.5 flex-1">
                          <p
                            className="text-[11px] font-medium text-center truncate w-full"
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            {m.home_team}
                          </p>
                          <ScoreStepper
                            value={form.score_home_ft}
                            onDecrement={() => stepScore(m.id, "score_home_ft", -1)}
                            onIncrement={() => stepScore(m.id, "score_home_ft", 1)}
                            label={`Gols totais ${m.home_team}`}
                          />
                        </div>
                        <span
                          className="text-[24px] font-bold flex-shrink-0 pb-5"
                          style={{ color: "var(--color-text-secondary)" }}
                          aria-hidden="true"
                        >
                          ×
                        </span>
                        <div className="flex flex-col items-center gap-1.5 flex-1">
                          <p
                            className="text-[11px] font-medium text-center truncate w-full"
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            {m.away_team}
                          </p>
                          <ScoreStepper
                            value={form.score_away_ft}
                            onDecrement={() => stepScore(m.id, "score_away_ft", -1)}
                            onIncrement={() => stepScore(m.id, "score_away_ft", 1)}
                            label={`Gols totais ${m.away_team}`}
                          />
                        </div>
                      </div>

                      {/* Vencedor nos pênaltis */}
                      <div>
                        <p
                          className="text-[12px] font-medium mb-2"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          Vencedor nos pênaltis (opcional)
                        </p>
                        <div className="flex gap-2">
                          {[m.home_team, m.away_team].map((team) => (
                            <button
                              key={team}
                              onClick={() => updateForm(m.id, "penalty_winner", team === form.penalty_winner ? "" : team)}
                              className="flex-1 py-2 rounded-button text-[13px] font-semibold transition-all active:scale-[0.97]"
                              style={{
                                background: form.penalty_winner === team ? "var(--color-accent)" : "var(--color-bg-secondary)",
                                color: form.penalty_winner === team ? "#fff" : "var(--color-text-secondary)",
                                transitionTimingFunction: "var(--ease-spring)",
                              }}
                            >
                              {getFlag(team)} {team}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Confirmação antes de salvar */}
                  {!form.confirmed ? (
                    <button
                      onClick={() => updateForm(m.id, "confirmed", true)}
                      className="w-full py-3 rounded-button font-semibold text-[15px] transition-all active:scale-[0.98]"
                      style={{
                        background: "var(--color-bg-secondary)",
                        color: "var(--color-text-primary)",
                        transitionTimingFunction: "var(--ease-spring)",
                      }}
                    >
                      {m.home_team} {form.score_home_90} × {form.score_away_90} {m.away_team} — Confirmar
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSave(m)}
                      disabled={isSaving}
                      className="w-full py-3 rounded-button text-white font-semibold text-[15px] transition-all active:scale-[0.98] disabled:opacity-60"
                      style={{
                        background: "var(--color-accent)",
                        transitionTimingFunction: "var(--ease-spring)",
                      }}
                    >
                      {isSaving ? "Salvando…" : hasResult ? "Atualizar resultado" : "Salvar resultado"}
                    </button>
                  )}

                  {err && (
                    <p className="text-[13px] font-medium" style={{ color: "var(--color-danger)" }}>
                      {err}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Stepper de placar (à prova de erro) ─── */

function ScoreStepper({
  value,
  onDecrement,
  onIncrement,
  label,
}: {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  label: string;
}) {
  return (
    <div
      className="flex items-center rounded-card overflow-hidden"
      style={{ background: "var(--color-bg-secondary)" }}
      role="group"
      aria-label={label}
    >
      <button
        onClick={onDecrement}
        disabled={value === 0}
        className="w-12 h-12 flex items-center justify-center text-[20px] font-bold transition-opacity disabled:opacity-30"
        style={{ color: "var(--color-text-primary)" }}
        aria-label={`Diminuir ${label}`}
      >
        −
      </button>
      <span
        className="tabular-nums text-[28px] font-bold w-10 text-center select-none"
        style={{ color: "var(--color-text-primary)" }}
        aria-live="polite"
        aria-label={`${label}: ${value}`}
      >
        {value}
      </span>
      <button
        onClick={onIncrement}
        disabled={value === 20}
        className="w-12 h-12 flex items-center justify-center text-[20px] font-bold transition-opacity disabled:opacity-30"
        style={{ color: "var(--color-text-primary)" }}
        aria-label={`Aumentar ${label}`}
      >
        +
      </button>
    </div>
  );
}

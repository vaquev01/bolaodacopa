"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Match } from "@/lib/types";
import type { Ruleset } from "@/lib/scoring";
import { computePrizePool, formatPrize, splitsSum } from "@/lib/scoring";
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

/* ─── Agrupamento por data ─── */

function groupByDate(matches: Match[]): { dateLabel: string; matches: Match[] }[] {
  const map = new Map<string, Match[]>();
  for (const m of matches) {
    const d = new Date(m.kickoff_at);
    const label = d.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(m);
  }
  return Array.from(map.entries()).map(([dateLabel, matches]) => ({ dateLabel, matches }));
}

export default function AdminClient({
  pool,
  matches,
  ruleset,
  memberCount = 0,
}: {
  pool: Pool;
  matches: Match[];
  ruleset: Ruleset;
  memberCount?: number;
}) {
  const router = useRouter();
  const [forms, setForms] = useState<Record<string, ResultForm>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Controla quais jogos com resultado já preenchido estão expandidos
  const [expandedDone, setExpandedDone] = useState<Record<string, boolean>>({});

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

  // Separa jogos pendentes (sem resultado) e com resultado já preenchido
  const pendingMatches = matches.filter((m) => m.score_home_90 === null || m.score_away_90 === null);
  const doneMatches = matches.filter((m) => m.score_home_90 !== null && m.score_away_90 !== null);

  const pendingByDate = groupByDate(pendingMatches);
  const doneByDate = groupByDate(doneMatches);

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
          <h1 className="text-[17px] font-bold" style={{ color: "var(--color-text-primary)" }}>
            {pool.name}
          </h1>
          <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            Corrigir resultados
          </p>
        </div>
      </header>

      <div className="flex-1 px-4 py-4 flex flex-col gap-5 pb-12 max-w-lg mx-auto w-full">

        {/* Banner informativo */}
        <div
          className="rounded-card px-4 py-3 flex items-start gap-3"
          style={{
            background: "var(--color-bg-secondary)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
            className="flex-shrink-0 mt-0.5"
          >
            <circle cx="9" cy="9" r="7.5" stroke="var(--color-accent)" strokeWidth="1.25" />
            <path d="M9 8v4M9 6h.01" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
            Os resultados entram sozinhos — a fonte oficial é consultada cerca de 10 minutos após o fim de cada jogo.
            Use esta tela apenas para corrigir algum placar que estiver errado.
          </p>
        </div>

        {/* Seção de premiação */}
        <AdminPrizeSection poolId={pool.id} ruleset={ruleset} memberCount={memberCount} />

        {/* Empty state */}
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

        {/* Jogos SEM resultado — agrupados por data */}
        {pendingByDate.map(({ dateLabel, matches: dayMatches }) => (
          <div key={dateLabel} className="flex flex-col gap-3">
            <h2
              className="text-[13px] font-bold uppercase tracking-wide"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {dateLabel}
            </h2>

            {dayMatches.map((m) => {
              const { time } = formatKickoff(m.kickoff_at);
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
                  {/* Cabeçalho */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                        {getFlag(m.home_team)} {m.home_team} × {m.away_team} {getFlag(m.away_team)}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                        {time} · {stageLabel(m.stage)}
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
                      {/* Placar 90 min */}
                      <div>
                        <p className="text-[12px] font-semibold mb-3" style={{ color: "var(--color-text-secondary)" }}>
                          Placar aos 90 min
                        </p>
                        <div className="flex items-center justify-center gap-4">
                          <div className="flex flex-col items-center gap-1.5 flex-1">
                            <p className="text-[11px] font-medium text-center truncate w-full" style={{ color: "var(--color-text-secondary)" }}>
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
                            <p className="text-[11px] font-medium text-center truncate w-full" style={{ color: "var(--color-text-secondary)" }}>
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
                          <p className="text-[12px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                            Placar final (prorrogação)
                          </p>
                          <div className="flex items-center justify-center gap-4">
                            <div className="flex flex-col items-center gap-1.5 flex-1">
                              <p className="text-[11px] font-medium text-center truncate w-full" style={{ color: "var(--color-text-secondary)" }}>
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
                              <p className="text-[11px] font-medium text-center truncate w-full" style={{ color: "var(--color-text-secondary)" }}>
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
                            <p className="text-[12px] font-medium mb-2" style={{ color: "var(--color-text-secondary)" }}>
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

                      {/* Confirmação */}
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
        ))}

        {/* Jogos COM resultado — colapsados por data */}
        {doneMatches.length > 0 && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setExpandedDone((v) => ({ ...v, _all: !v["_all"] }))}
              className="flex items-center gap-2 py-1 transition-opacity active:opacity-70"
              aria-expanded={!!expandedDone["_all"]}
            >
              <h2
                className="text-[13px] font-bold uppercase tracking-wide"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Resultados já registrados ({doneMatches.length})
              </h2>
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
                style={{
                  transform: expandedDone["_all"] ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 200ms var(--ease-spring)",
                  color: "var(--color-text-secondary)",
                }}
              >
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {expandedDone["_all"] && doneByDate.map(({ dateLabel, matches: dayMatches }) => (
              <div key={dateLabel} className="flex flex-col gap-2">
                <p className="text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  {dateLabel}
                </p>
                {dayMatches.map((m) => {
                  const { time } = formatKickoff(m.kickoff_at);
                  const form = getForm(m.id);
                  const isSaved = saved[m.id];
                  const isSaving = saving[m.id];
                  const err = errors[m.id];

                  return (
                    <div
                      key={m.id}
                      className="rounded-card p-4 flex flex-col gap-4"
                      style={{
                        background: "var(--color-bg-card)",
                        boxShadow: "var(--shadow-card)",
                        opacity: 0.8,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                            {getFlag(m.home_team)} {m.home_team} × {m.away_team} {getFlag(m.away_team)}
                          </p>
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                            {time} · {stageLabel(m.stage)}
                          </p>
                        </div>
                        <span
                          className="text-[11px] font-bold px-2 py-1 rounded-badge tabular-nums flex-shrink-0"
                          style={{ background: "#E6F9EC", color: "var(--color-success)" }}
                        >
                          {m.score_home_90}–{m.score_away_90}
                        </span>
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
                            Resultado atualizado.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div>
                            <p className="text-[12px] font-semibold mb-3" style={{ color: "var(--color-text-secondary)" }}>
                              Corrigir placar aos 90 min
                            </p>
                            <div className="flex items-center justify-center gap-4">
                              <div className="flex flex-col items-center gap-1.5 flex-1">
                                <p className="text-[11px] font-medium text-center truncate w-full" style={{ color: "var(--color-text-secondary)" }}>
                                  {m.home_team}
                                </p>
                                <ScoreStepper
                                  value={form.score_home_90 === 0 && m.score_home_90 !== null ? m.score_home_90 : form.score_home_90}
                                  onDecrement={() => stepScore(m.id, "score_home_90", -1)}
                                  onIncrement={() => stepScore(m.id, "score_home_90", 1)}
                                  label={`Gols ${m.home_team}`}
                                />
                              </div>
                              <span className="text-[24px] font-bold flex-shrink-0 pb-5" style={{ color: "var(--color-text-secondary)" }} aria-hidden="true">
                                ×
                              </span>
                              <div className="flex flex-col items-center gap-1.5 flex-1">
                                <p className="text-[11px] font-medium text-center truncate w-full" style={{ color: "var(--color-text-secondary)" }}>
                                  {m.away_team}
                                </p>
                                <ScoreStepper
                                  value={form.score_away_90 === 0 && m.score_away_90 !== null ? m.score_away_90 : form.score_away_90}
                                  onDecrement={() => stepScore(m.id, "score_away_90", -1)}
                                  onIncrement={() => stepScore(m.id, "score_away_90", 1)}
                                  label={`Gols ${m.away_team}`}
                                />
                              </div>
                            </div>
                          </div>

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
                              Confirmar correção
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
                              {isSaving ? "Salvando…" : "Atualizar resultado"}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Admin Prize Section ─── */

function AdminPrizeSection({
  poolId,
  ruleset,
  memberCount,
}: {
  poolId: string;
  ruleset: Ruleset;
  memberCount: number;
}) {
  const router = useRouter();
  const prize = ruleset.prize;

  const [enabled, setEnabled] = useState(prize.enabled);
  const [buyIn, setBuyIn] = useState(prize.buy_in > 0 ? prize.buy_in : 100);
  const [split1, setSplit1] = useState(prize.splits[0] ?? 60);
  const [split2, setSplit2] = useState(prize.splits[1] ?? 25);
  const [split3, setSplit3] = useState(prize.splits[2] ?? 15);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sum = splitsSum([split1, split2, split3]);
  const preview = enabled && sum === 100
    ? computePrizePool({ enabled: true, currency: "BRL", buy_in: buyIn, splits: [split1, split2, split3] }, memberCount)
    : null;

  async function handleSave() {
    if (enabled && sum !== 100) {
      setErr("A divisão precisa somar 100%.");
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      const r = await fetch(`/api/pools/${poolId}/ruleset`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prize: {
            enabled,
            currency: "BRL",
            buy_in: enabled ? buyIn : 0,
            splits: [split1, split2, split3],
          },
        }),
      });
      if (r.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        router.refresh();
      } else {
        const d = await r.json();
        setErr(d.message ?? "Erro ao salvar. Tente novamente.");
      }
    } catch {
      setErr("Sem conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const PLACE_EMOJI = ["🥇", "🥈", "🥉"];

  return (
    <div
      className="rounded-card p-4 flex flex-col gap-3"
      style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
    >
      {/* Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Premiação em dinheiro
          </p>
          <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            Informativa — o site só calcula; o grupo acerta por fora.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => { setEnabled((v) => !v); setSaved(false); }}
          className="w-12 h-7 rounded-full relative transition-colors flex-shrink-0"
          style={{ background: enabled ? "var(--color-accent)" : "var(--color-bg-secondary)" }}
        >
          <span
            className="absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform"
            style={{
              transform: enabled ? "translateX(22px)" : "translateX(2px)",
              transitionTimingFunction: "var(--ease-spring)",
            }}
          />
        </button>
      </div>

      {enabled && (
        <div className="flex flex-col gap-3 pt-2 border-t" style={{ borderColor: "var(--color-bg-secondary)" }}>
          {/* Entrada */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              Entrada por pessoa (R$)
            </p>
            <input
              type="number"
              min="1"
              max="99999"
              value={buyIn}
              onChange={(e) => { setBuyIn(Math.max(1, Number(e.target.value) || 1)); setSaved(false); }}
              className="w-24 px-3 py-2 rounded-button border text-[15px] text-right outline-none focus-visible:ring-2 focus-visible:ring-[--color-accent] tabular-nums"
              style={{
                background: "var(--color-bg-secondary)",
                borderColor: "var(--border-subtle)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>

          {/* Splits */}
          {(
            [
              { label: "1º lugar", emoji: PLACE_EMOJI[0], value: split1, set: setSplit1 },
              { label: "2º lugar", emoji: PLACE_EMOJI[1], value: split2, set: setSplit2 },
              { label: "3º lugar", emoji: PLACE_EMOJI[2], value: split3, set: setSplit3 },
            ] as const
          ).map(({ label, emoji, value, set }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                {emoji} {label}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { set(Math.max(0, value - 1)); setSaved(false); }}
                  className="w-9 h-9 rounded-button flex items-center justify-center font-semibold text-lg transition-opacity active:opacity-60"
                  style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-primary)" }}
                  aria-label="Diminuir"
                >−</button>
                <span className="tabular-nums text-[15px] font-semibold w-10 text-center" style={{ color: "var(--color-text-primary)" }}>
                  {value}%
                </span>
                <button
                  onClick={() => { set(Math.min(100, value + 1)); setSaved(false); }}
                  className="w-9 h-9 rounded-button flex items-center justify-center font-semibold text-lg transition-opacity active:opacity-60"
                  style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-primary)" }}
                  aria-label="Aumentar"
                >+</button>
              </div>
            </div>
          ))}

          {/* Soma + preview */}
          <p
            className="text-[13px] font-semibold"
            style={{ color: sum === 100 ? "var(--color-success)" : "var(--color-danger)" }}
          >
            Soma: {sum}% {sum !== 100 ? "— precisa fechar em 100%" : ""}
          </p>
          {preview && (
            <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              Com {memberCount} participante{memberCount !== 1 ? "s" : ""}: pote {formatPrize(preview.total)} →{" "}
              {preview.shares.map((s) => `${s.label} ${formatPrize(s.amount)}`).join(", ")}
            </p>
          )}

          <p className="text-[11px] leading-relaxed" style={{ color: "var(--color-text-secondary)", opacity: 0.8 }}>
            O site não cobra nem paga nada. Só exibe quanto cada um leva — o grupo acerta o dinheiro por fora.
          </p>
        </div>
      )}

      {/* Botão salvar */}
      {saved ? (
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--color-success)" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l2.5 2.5L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-[13px] font-semibold" style={{ color: "var(--color-success)" }}>Premiação salva.</p>
        </div>
      ) : (
        <button
          onClick={handleSave}
          disabled={saving || (enabled && sum !== 100)}
          className="w-full py-3 rounded-button text-white font-semibold text-[15px] transition-all active:scale-[0.98] disabled:opacity-40"
          style={{ background: "var(--color-accent)", transitionTimingFunction: "var(--ease-spring)" }}
        >
          {saving ? "Salvando…" : "Salvar premiação"}
        </button>
      )}

      {err && (
        <p className="text-[13px] font-medium" style={{ color: "var(--color-danger)" }}>{err}</p>
      )}
    </div>
  );
}

/* ─── Stepper de placar ─── */

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

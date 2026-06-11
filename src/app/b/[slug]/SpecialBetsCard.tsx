"use client";

import { useState, useEffect } from "react";
import type { Ruleset } from "@/lib/scoring";
import type { GroupPicks } from "@/lib/scoring";

// ─── Types ───────────────────────────────────────────────────

interface SpecialBet {
  bet_type: string;
  value: string;
  submitted_at: string;
}

interface SpecialResult {
  bet_type: string;
  value: string; // nome do campeão ou JSON de classificados
  settled_at: string;
}

interface SpecialScore {
  bet_type: string;
  points: number;
  breakdown: Record<string, number>;
}

interface Props {
  poolId: string;
  ruleset: Ruleset;
  /** Times únicos do calendário (excluindo "A definir") */
  teams: string[];
  /** Grupos e seus times: { A: ["Time1", "Time2", "Time3", "Time4"] } */
  groupTeams: Record<string, string[]>;
  /** Deadline dos palpites especiais = min kickoff dos jogos do escopo (ISO UTC) */
  deadlineAt: string | null;
  /** Palpites já existentes do usuário (GET /api/pools/[id]/special-bets) */
  initialBets: SpecialBet[];
  /** Resultado já lançado (pool_special_results) */
  specialResults: SpecialResult[];
  /** Pontuação do usuário (special_bet_scores) */
  specialScores: SpecialScore[];
}

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

// ─── Helpers ─────────────────────────────────────────────────

function isDeadlinePassed(deadlineAt: string | null): boolean {
  if (!deadlineAt) return false;
  return Date.now() >= new Date(deadlineAt).getTime();
}

// ─── Main Component ──────────────────────────────────────────

export default function SpecialBetsCard({
  poolId,
  ruleset,
  teams,
  groupTeams,
  deadlineAt,
  initialBets,
  specialResults,
  specialScores,
}: Props) {
  const championEnabled = ruleset.special_bets.champion.enabled;
  const qualifiersEnabled = ruleset.special_bets.qualifiers.enabled;

  if (!championEnabled && !qualifiersEnabled) return null;

  const closed = isDeadlinePassed(deadlineAt);
  const championResult = specialResults.find((r) => r.bet_type === "champion");
  const qualifiersResult = specialResults.find((r) => r.bet_type === "qualifiers");
  const championScore = specialScores.find((s) => s.bet_type === "champion");
  const qualifiersScore = specialScores.find((s) => s.bet_type === "qualifiers");

  return (
    <div
      className="rounded-card p-4 flex flex-col gap-4"
      style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold" style={{ color: "var(--color-text-primary)" }}>
          Palpites especiais
        </h2>
        {closed && !championResult && !qualifiersResult && (
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-badge"
            style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}
          >
            Prazo encerrado
          </span>
        )}
      </div>

      {championEnabled && (
        <ChampionSection
          poolId={poolId}
          ruleset={ruleset}
          teams={teams}
          closed={closed}
          initialBet={initialBets.find((b) => b.bet_type === "champion")?.value ?? null}
          result={championResult ?? null}
          score={championScore ?? null}
        />
      )}

      {qualifiersEnabled && (
        <QualifiersSection
          poolId={poolId}
          ruleset={ruleset}
          groupTeams={groupTeams}
          closed={closed}
          initialBet={initialBets.find((b) => b.bet_type === "qualifiers")?.value ?? null}
          result={qualifiersResult ?? null}
          score={qualifiersScore ?? null}
        />
      )}
    </div>
  );
}

// ─── Champion Section ─────────────────────────────────────────

function ChampionSection({
  poolId,
  ruleset,
  teams,
  closed,
  initialBet,
  result,
  score,
}: {
  poolId: string;
  ruleset: Ruleset;
  teams: string[];
  closed: boolean;
  initialBet: string | null;
  result: SpecialResult | null;
  score: SpecialScore | null;
}) {
  const [selected, setSelected] = useState<string>(initialBet ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // sync se o bet mudou externamente
  useEffect(() => {
    if (initialBet !== null) setSelected(initialBet);
  }, [initialBet]);

  async function handleSave() {
    if (!selected) return;
    setStatus("saving");
    setErrorMsg("");
    try {
      const r = await fetch(`/api/pools/${poolId}/special-bets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet_type: "champion", value: selected }),
      });
      if (r.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        const d = await r.json();
        if (d.error === "deadline_passed") {
          setErrorMsg("Prazo encerrado.");
        } else {
          setErrorMsg(d.message ?? "Erro ao salvar.");
        }
        setStatus("error");
      }
    } catch {
      setErrorMsg("Erro de conexão.");
      setStatus("error");
    }
  }

  const pts = ruleset.special_bets.champion.points;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
          Campeão da Copa
        </p>
        <span className="text-[11px] font-medium" style={{ color: "var(--color-accent)" }}>
          {pts} pts
        </span>
      </div>

      {result ? (
        /* Resultado lançado */
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              Resultado: <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{result.value}</span>
            </p>
            {initialBet && (
              <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                Seu palpite: <span style={{ color: "var(--color-text-primary)" }}>{initialBet}</span>
              </p>
            )}
          </div>
          {score !== null && (
            <span
              className="tabular-nums text-[17px] font-bold"
              style={{ color: score.points > 0 ? "var(--color-gold)" : "var(--color-text-secondary)" }}
            >
              {score.points > 0 ? `+${score.points} pts` : "0 pts"}
            </span>
          )}
        </div>
      ) : closed ? (
        /* Prazo encerrado sem resultado ainda */
        <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          {initialBet
            ? <>Seu palpite: <strong style={{ color: "var(--color-text-primary)" }}>{initialBet}</strong></>
            : "Sem palpite registrado."}
        </p>
      ) : (
        /* Formulário ativo */
        <div className="flex gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex-1 py-2 px-3 rounded-button text-[13px] outline-none"
            style={{
              background: "var(--color-bg-secondary)",
              color: selected ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              border: "none",
            }}
            aria-label="Selecione o campeão"
          >
            <option value="">Selecione um time…</option>
            {teams.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button
            onClick={handleSave}
            disabled={!selected || status === "saving"}
            className="px-4 py-2 rounded-button text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: "var(--color-accent)" }}
          >
            {status === "saving" ? "Salvando…" : status === "saved" ? "Salvo!" : "Salvar"}
          </button>
        </div>
      )}

      {errorMsg && (
        <p className="text-[12px]" style={{ color: "var(--color-danger)" }}>{errorMsg}</p>
      )}
    </div>
  );
}

// ─── Qualifiers Section ───────────────────────────────────────

function QualifiersSection({
  poolId,
  ruleset,
  groupTeams,
  closed,
  initialBet,
  result,
  score,
}: {
  poolId: string;
  ruleset: Ruleset;
  groupTeams: Record<string, string[]>;
  closed: boolean;
  initialBet: string | null;
  result: SpecialResult | null;
  score: SpecialScore | null;
}) {
  // Estado local: picks por grupo { A: ["", ""], ... }
  const activeGroups = GROUPS.filter((g) => groupTeams[g]?.length > 0);

  const parsedInitial: GroupPicks = (() => {
    if (!initialBet) return {};
    try { return JSON.parse(initialBet) as GroupPicks; } catch { return {}; }
  })();

  const parsedResult: GroupPicks = (() => {
    if (!result) return {};
    try { return JSON.parse(result.value) as GroupPicks; } catch { return {}; }
  })();

  const [picks, setPicks] = useState<Record<string, [string, string]>>(() => {
    const init: Record<string, [string, string]> = {};
    for (const g of activeGroups) {
      init[g] = [parsedInitial[g]?.[0] ?? "", parsedInitial[g]?.[1] ?? ""];
    }
    return init;
  });

  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  function setPick(group: string, pos: 0 | 1, team: string) {
    setPicks((prev) => {
      const cur = prev[group] ?? ["", ""];
      const updated: [string, string] = [...cur] as [string, string];
      updated[pos] = team;
      // Evitar o mesmo time nos dois selects
      if (pos === 0 && updated[1] === team) updated[1] = "";
      if (pos === 1 && updated[0] === team) updated[0] = "";
      return { ...prev, [group]: updated };
    });
  }

  async function handleSave() {
    // Montar objeto só com grupos completos
    const value: Record<string, [string, string]> = {};
    for (const g of activeGroups) {
      const p = picks[g];
      if (p?.[0] && p?.[1]) value[g] = p;
    }

    if (Object.keys(value).length === 0) {
      setErrorMsg("Preencha ao menos um grupo completo.");
      setStatus("error");
      return;
    }

    setStatus("saving");
    setErrorMsg("");
    try {
      const r = await fetch(`/api/pools/${poolId}/special-bets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet_type: "qualifiers", value: JSON.stringify(value) }),
      });
      if (r.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        const d = await r.json();
        if (d.error === "deadline_passed") {
          setErrorMsg("Prazo encerrado.");
        } else {
          setErrorMsg(d.message ?? "Erro ao salvar.");
        }
        setStatus("error");
      }
    } catch {
      setErrorMsg("Erro de conexão.");
      setStatus("error");
    }
  }

  const ptsPerTeam = ruleset.special_bets.qualifiers.points_per_team;
  const bonus = ruleset.special_bets.qualifiers.exact_position_bonus;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
          Classificados por grupo
        </p>
        <span className="text-[11px] font-medium" style={{ color: "var(--color-accent)" }}>
          {ptsPerTeam} pts/time{bonus > 0 ? ` +${bonus} posição exata` : ""}
        </span>
      </div>

      {result ? (
        /* Resultado lançado */
        <div className="flex flex-col gap-2">
          {score !== null && (
            <div className="flex items-center justify-between mb-1">
              <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Total classificados</p>
              <span
                className="tabular-nums text-[17px] font-bold"
                style={{ color: score.points > 0 ? "var(--color-gold)" : "var(--color-text-secondary)" }}
              >
                {score.points > 0 ? `+${score.points} pts` : "0 pts"}
              </span>
            </div>
          )}
          {activeGroups.map((g) => {
            const actual = parsedResult[g];
            const myPick = parsedInitial[g];
            const groupPts = score?.breakdown?.[g] ?? 0;
            if (!actual) return null;
            return (
              <div
                key={g}
                className="flex items-start justify-between py-2 border-t"
                style={{ borderColor: "var(--color-bg-secondary)" }}
              >
                <div>
                  <p className="text-[12px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                    Grupo {g}
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                    1º {actual[0]} · 2º {actual[1]}
                  </p>
                  {myPick && (
                    <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                      Palpite: {myPick[0]} / {myPick[1]}
                    </p>
                  )}
                </div>
                {groupPts > 0 && (
                  <span className="text-[13px] font-semibold" style={{ color: "var(--color-gold)" }}>
                    +{groupPts}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : closed ? (
        /* Prazo encerrado sem resultado */
        <div className="flex flex-col gap-2">
          {activeGroups.map((g) => {
            const myPick = parsedInitial[g];
            if (!myPick) return null;
            return (
              <div
                key={g}
                className="flex items-center justify-between py-1 border-t"
                style={{ borderColor: "var(--color-bg-secondary)" }}
              >
                <p className="text-[12px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                  Grupo {g}
                </p>
                <p className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                  {myPick[0]} / {myPick[1]}
                </p>
              </div>
            );
          })}
          {Object.values(parsedInitial).length === 0 && (
            <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              Sem palpites de classificados registrados.
            </p>
          )}
        </div>
      ) : (
        /* Formulário ativo */
        <div className="flex flex-col gap-3">
          {activeGroups.map((g) => {
            const teamList = groupTeams[g] ?? [];
            const [p1, p2] = picks[g] ?? ["", ""];
            return (
              <div key={g} className="flex flex-col gap-1">
                <p className="text-[12px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                  Grupo {g}
                </p>
                <div className="flex gap-2">
                  <select
                    value={p1}
                    onChange={(e) => setPick(g, 0, e.target.value)}
                    className="flex-1 py-2 px-2 rounded-button text-[12px] outline-none"
                    style={{ background: "var(--color-bg-secondary)", color: p1 ? "var(--color-text-primary)" : "var(--color-text-secondary)", border: "none" }}
                    aria-label={`1º do grupo ${g}`}
                  >
                    <option value="">1º…</option>
                    {teamList.map((t) => (
                      <option key={t} value={t} disabled={t === p2}>{t}</option>
                    ))}
                  </select>
                  <select
                    value={p2}
                    onChange={(e) => setPick(g, 1, e.target.value)}
                    className="flex-1 py-2 px-2 rounded-button text-[12px] outline-none"
                    style={{ background: "var(--color-bg-secondary)", color: p2 ? "var(--color-text-primary)" : "var(--color-text-secondary)", border: "none" }}
                    aria-label={`2º do grupo ${g}`}
                  >
                    <option value="">2º…</option>
                    {teamList.map((t) => (
                      <option key={t} value={t} disabled={t === p1}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}

          {errorMsg && (
            <p className="text-[12px]" style={{ color: "var(--color-danger)" }}>{errorMsg}</p>
          )}

          <button
            onClick={handleSave}
            disabled={status === "saving"}
            className="w-full py-3 rounded-button text-white font-semibold text-[14px] transition-opacity disabled:opacity-40"
            style={{ background: "var(--color-accent)" }}
          >
            {status === "saving" ? "Salvando…" : status === "saved" ? "Salvo!" : "Salvar classificados"}
          </button>
        </div>
      )}
    </div>
  );
}

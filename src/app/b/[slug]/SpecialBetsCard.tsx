"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Ruleset } from "@/lib/scoring";
import type { GroupPicks } from "@/lib/scoring";
import { getFlag } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

interface SpecialBet {
  bet_type: string;
  value: string;
  submitted_at: string;
}

interface SpecialResult {
  bet_type: string;
  value: string;
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
  teams: string[];
  groupTeams: Record<string, string[]>;
  deadlineAt: string | null;
  initialBets: SpecialBet[];
  specialResults: SpecialResult[];
  specialScores: SpecialScore[];
}

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

function isDeadlinePassed(deadlineAt: string | null): boolean {
  if (!deadlineAt) return false;
  return Date.now() >= new Date(deadlineAt).getTime();
}

// ─── TeamChip (chip tocável com bandeira) ─────────────────────

function TeamChip({
  team,
  state,
  onClick,
  disabled,
}: {
  team: string;
  state: "none" | "first" | "second" | "selected";
  onClick: () => void;
  disabled?: boolean;
}) {
  const flag = getFlag(team);

  const bg =
    state === "selected" || state === "first"
      ? "var(--color-accent)"
      : state === "second"
        ? "transparent"
        : "var(--color-bg-secondary)";

  const border =
    state === "second"
      ? "1.5px solid var(--color-accent)"
      : "1.5px solid transparent";

  const color =
    state === "selected" || state === "first"
      ? "#fff"
      : state === "second"
        ? "var(--color-accent)"
        : "var(--color-text-secondary)";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="relative flex items-center gap-1.5 px-3 py-2 rounded-button text-[13px] font-semibold transition-all active:scale-95 disabled:opacity-40"
      style={{
        background: bg,
        border,
        color,
        transitionTimingFunction: "var(--ease-spring)",
        transitionDuration: "var(--duration-feedback)",
        minHeight: "44px",
      }}
      aria-pressed={state !== "none"}
    >
      <span aria-hidden="true">{flag}</span>
      <span>{team}</span>
      {(state === "first" || state === "second") && (
        <span
          className="ml-0.5 text-[10px] font-bold px-1 py-0.5 rounded"
          style={{
            background: state === "first" ? "rgba(255,255,255,0.25)" : "var(--color-accent)",
            color: state === "first" ? "#fff" : "#fff",
            lineHeight: 1,
          }}
        >
          {state === "first" ? "1º" : "2º"}
        </span>
      )}
    </button>
  );
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
      className="rounded-card p-4 flex flex-col gap-5"
      style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold" style={{ color: "var(--color-text-primary)" }}>
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

// ─── Champion Section — chips com busca rápida ────────────────

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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialBet !== null) setSelected(initialBet);
  }, [initialBet]);

  const filteredTeams = query.trim()
    ? teams.filter((t) => t.toLowerCase().includes(query.toLowerCase()))
    : teams;

  const doSave = useCallback(async (team: string) => {
    if (!team) return;
    setStatus("saving");
    setErrorMsg("");
    try {
      const r = await fetch(`/api/pools/${poolId}/special-bets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet_type: "champion", value: team }),
      });
      if (r.ok) {
        setStatus("saved");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => setStatus("idle"), 3000);
      } else {
        const d = await r.json();
        setErrorMsg(d.error === "deadline_passed" ? "Prazo encerrado." : (d.message ?? "Erro ao salvar."));
        setStatus("error");
      }
    } catch {
      setErrorMsg("Erro de conexão.");
      setStatus("error");
    }
  }, [poolId]);

  function handlePick(team: string) {
    const next = selected === team ? "" : team;
    setSelected(next);
    if (next) doSave(next);
  }

  const pts = ruleset.special_bets.champion.points;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
          Campeão da Copa
        </p>
        <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
          {pts} pts
        </span>
      </div>

      {result ? (
        /* Resultado lançado */
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              Resultado: <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
                {getFlag(result.value)} {result.value}
              </span>
            </p>
            {initialBet && (
              <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                Seu palpite: <span style={{ color: "var(--color-text-primary)" }}>
                  {getFlag(initialBet)} {initialBet}
                </span>
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
        /* Prazo encerrado sem resultado */
        <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          {initialBet
            ? <>{getFlag(initialBet)} <strong style={{ color: "var(--color-text-primary)" }}>{initialBet}</strong></>
            : "Sem palpite registrado."}
        </p>
      ) : (
        /* Chips com busca */
        <div className="flex flex-col gap-3">
          {selected && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-button"
              style={{ background: "var(--color-bg-secondary)" }}
            >
              <span className="text-xl">{getFlag(selected)}</span>
              <span className="flex-1 text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {selected}
              </span>
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-badge text-white"
                style={{ background: "var(--color-accent)" }}
              >
                {status === "saving" ? "Salvando…" : status === "saved" ? "Salvo" : "Campeão"}
              </span>
            </div>
          )}

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar seleção…"
            className="w-full px-3 py-2 rounded-button text-[13px] outline-none"
            style={{
              background: "var(--color-bg-secondary)",
              color: "var(--color-text-primary)",
              border: "none",
            }}
            aria-label="Buscar seleção para campeão"
          />

          <div className="flex flex-wrap gap-2">
            {filteredTeams.slice(0, 48).map((team) => (
              <TeamChip
                key={team}
                team={team}
                state={selected === team ? "selected" : "none"}
                onClick={() => handlePick(team)}
              />
            ))}
          </div>

          {errorMsg && (
            <p className="text-[12px]" style={{ color: "var(--color-danger)" }}>{errorMsg}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Qualifiers Section — chips 1º/2º por grupo ───────────────

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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Progresso: quantos grupos têm 1º e 2º definidos
  const completedGroups = activeGroups.filter((g) => picks[g]?.[0] && picks[g]?.[1]).length;

  function handleChipTap(group: string, team: string) {
    setPicks((prev) => {
      const cur = prev[group] ?? ["", ""];
      const [p1, p2] = cur;

      let next: [string, string];
      if (p1 === team) {
        // Desseleciona o 1º
        next = [p2, ""];
      } else if (p2 === team) {
        // Desseleciona o 2º
        next = [p1, ""];
      } else if (!p1) {
        // Seta como 1º
        next = [team, p2 === team ? "" : p2];
      } else if (!p2) {
        // Seta como 2º
        next = [p1, team];
      } else {
        // Ambos preenchidos: substitui o 2º pelo tap
        next = [p1, team];
      }

      return { ...prev, [group]: next };
    });
    // Reset status ao editar
    setStatus("idle");
  }

  async function handleSave() {
    const value: Record<string, [string, string]> = {};
    for (const g of activeGroups) {
      const p = picks[g];
      if (p?.[0] && p?.[1]) value[g] = p;
    }
    if (Object.keys(value).length === 0) {
      setErrorMsg("Preencha ao menos um grupo completo (1º e 2º).");
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
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => setStatus("idle"), 3000);
      } else {
        const d = await r.json();
        setErrorMsg(d.error === "deadline_passed" ? "Prazo encerrado." : (d.message ?? "Erro ao salvar."));
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
          Classificados por grupo
        </p>
        <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
          {ptsPerTeam} pts/time{bonus > 0 ? ` +${bonus} posição` : ""}
        </span>
      </div>

      {result ? (
        /* Resultado lançado */
        <div className="flex flex-col gap-2">
          {score !== null && (
            <div className="flex items-center justify-between mb-1">
              <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>Total classificados</p>
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
                  <p className="text-[12px] font-semibold mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
                    Grupo {g}
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                    1º {getFlag(actual[0])} {actual[0]}  ·  2º {getFlag(actual[1])} {actual[1]}
                  </p>
                  {myPick && (
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                      Seu palpite: {getFlag(myPick[0])} {myPick[0]} / {getFlag(myPick[1])} {myPick[1]}
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
                <p className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                  {getFlag(myPick[0])} {myPick[0]} / {getFlag(myPick[1])} {myPick[1]}
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
        /* Formulário ativo — chips por grupo */
        <div className="flex flex-col gap-5">
          {/* Progresso */}
          <div className="flex items-center gap-3">
            <div
              className="flex-1 h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--color-bg-secondary)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: activeGroups.length > 0 ? `${(completedGroups / activeGroups.length) * 100}%` : "0%",
                  background: "var(--color-accent)",
                  transitionTimingFunction: "var(--ease-spring)",
                }}
              />
            </div>
            <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
              {completedGroups}/{activeGroups.length} grupos
            </span>
          </div>

          {activeGroups.map((g) => {
            const teamList = groupTeams[g] ?? [];
            const [p1, p2] = picks[g] ?? ["", ""];
            return (
              <div key={g} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-[12px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                    Grupo {g}
                  </p>
                  {p1 && p2 && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-badge"
                      style={{ background: "var(--color-success)", color: "#fff" }}
                    >
                      OK
                    </span>
                  )}
                  {(p1 || p2) && !(p1 && p2) && (
                    <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
                      falta {!p1 ? "1º" : "2º"}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {teamList.map((team) => {
                    const chipState: "none" | "first" | "second" =
                      p1 === team ? "first"
                      : p2 === team ? "second"
                      : "none";
                    return (
                      <TeamChip
                        key={team}
                        team={team}
                        state={chipState}
                        onClick={() => handleChipTap(g, team)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {errorMsg && (
            <p className="text-[12px]" style={{ color: "var(--color-danger)" }}>{errorMsg}</p>
          )}

          <button
            onClick={handleSave}
            disabled={status === "saving" || completedGroups === 0}
            className="w-full py-3 rounded-button text-white font-semibold text-[15px] transition-opacity disabled:opacity-40"
            style={{ background: "var(--color-accent)" }}
          >
            {status === "saving" ? "Salvando…" : status === "saved" ? "Salvo!" : "Salvar classificados"}
          </button>
        </div>
      )}
    </div>
  );
}

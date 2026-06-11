"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Match, Prediction, PredictionScore, StandingRow } from "@/lib/types";
import type { Ruleset } from "@/lib/scoring";
import { formatKickoff, deadlineLabel, deadlineUrgency, getFlag } from "@/lib/utils";
import SpecialBetsCard from "./SpecialBetsCard";
import BracketCard from "./BracketCard";

interface Pool {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  status: string;
}

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
  pool: Pool;
  ruleset: Ruleset;
  matches: Match[];
  predictions: Omit<Prediction, "pool_id" | "user_id">[];
  scores: PredictionScore[];
  ranking: StandingRow[];
  currentUserId: string;
  isOwner: boolean;
  deadlineMinutes: number;
  isSpecialsOnly: boolean;
  teams: string[];
  groupTeams: Record<string, string[]>;
  deadlineAt: string | null;
  initialSpecialBets: SpecialBet[];
  specialResults: SpecialResult[];
  specialScores: SpecialScore[];
  // Bracket pré-Copa (v1.1)
  bracketEnabled?: boolean;
  myBracket?: Record<string, unknown> | null;
  bracketLockAt?: string | null;
  bracketLocked?: boolean;
}

type Tab = "palpites" | "ranking" | "bracket";

export default function BolaoClient({
  pool,
  ruleset,
  matches,
  predictions,
  scores,
  ranking,
  currentUserId,
  isOwner,
  deadlineMinutes,
  isSpecialsOnly,
  teams,
  groupTeams,
  deadlineAt,
  initialSpecialBets,
  specialResults,
  specialScores,
  bracketEnabled = false,
  myBracket = null,
  bracketLockAt = null,
  bracketLocked = false,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("palpites");

  const hasSpecials = ruleset.special_bets.champion.enabled || ruleset.special_bets.qualifiers.enabled;

  // Mapa match_id → prediction payload local (para edição otimista)
  const [localPreds, setLocalPreds] = useState<Record<string, { home: number; away: number }>>(() => {
    const map: Record<string, { home: number; away: number }> = {};
    for (const p of predictions) {
      map[p.match_id] = p.payload;
    }
    return map;
  });

  // Estado de save por match: idle | saving | saved | error
  const [saveState, setSaveState] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});

  // Mapa prediction_id → score
  const scoreByPredId = new Map(scores.map((s) => [s.prediction_id, s]));
  // Mapa match_id → prediction.id
  const predIdByMatch = new Map(predictions.map((p) => [p.match_id, p.id]));

  const doneCount = matches.filter((m) => localPreds[m.id] !== undefined).length;

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "var(--color-bg-primary)" }}>
      {/* Header */}
      <header className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold" style={{ color: "var(--color-text-primary)" }}>
              {pool.name}
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push(`/b/${pool.slug}/convite`)}
              className="px-3 py-2 rounded-button text-[13px] font-semibold"
              style={{ background: "var(--color-bg-secondary)", color: "var(--color-accent)" }}
            >
              Convidar
            </button>
            {isOwner && (
              <button
                onClick={() => router.push(`/b/${pool.slug}/admin`)}
                className="px-3 py-2 rounded-button text-[13px] font-semibold"
                style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}
              >
                Admin
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-4 flex gap-1 border-b" style={{ borderColor: "var(--color-bg-secondary)" }}>
        {(["palpites", "ranking", ...(bracketEnabled ? ["bracket" as Tab] : [])] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="py-3 px-4 text-[15px] font-semibold capitalize border-b-2 transition-colors"
            style={{
              borderColor: tab === t ? "var(--color-accent)" : "transparent",
              color: tab === t ? "var(--color-accent)" : "var(--color-text-secondary)",
            }}
          >
            {t === "palpites" ? "Palpites" : t === "ranking" ? "Ranking" : "Bracket"}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto pb-24">
        {tab === "palpites" && (
          <div className="flex flex-col">
            {/* Card de palpites especiais (sempre no topo da aba palpites) */}
            {hasSpecials && (
              <div className="px-4 pt-4">
                <SpecialBetsCard
                  poolId={pool.id}
                  ruleset={ruleset}
                  teams={teams}
                  groupTeams={groupTeams}
                  deadlineAt={deadlineAt}
                  initialBets={initialSpecialBets}
                  specialResults={specialResults}
                  specialScores={specialScores}
                />
              </div>
            )}

            {/* Palpites de placar — escondidos se specials_only */}
            {!isSpecialsOnly && (
              <PalpitesTab
                matches={matches}
                localPreds={localPreds}
                setLocalPreds={setLocalPreds}
                saveState={saveState}
                setSaveState={setSaveState}
                scoreByPredId={scoreByPredId}
                predIdByMatch={predIdByMatch}
                poolId={pool.id}
                deadlineMinutes={deadlineMinutes}
                doneCount={doneCount}
                total={matches.length}
              />
            )}

            {/* Specials only: sem jogos para palpitar */}
            {isSpecialsOnly && !hasSpecials && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <p className="text-[15px]" style={{ color: "var(--color-text-secondary)" }}>
                  Este bolão é apenas de classificação.
                </p>
              </div>
            )}
          </div>
        )}
        {tab === "ranking" && (
          <RankingTab ranking={ranking} currentUserId={currentUserId} bracketEnabled={bracketEnabled} />
        )}
        {tab === "bracket" && bracketEnabled && (
          <div className="px-4 py-3">
            <BracketCard
              poolId={pool.id}
              ruleset={ruleset}
              teams={teams}
              groupTeams={groupTeams}
              myBracket={myBracket}
              lockAt={bracketLockAt}
              locked={bracketLocked}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Palpites Tab ─── */

function PalpitesTab({
  matches,
  localPreds,
  setLocalPreds,
  saveState,
  setSaveState,
  scoreByPredId,
  predIdByMatch,
  poolId,
  deadlineMinutes,
  doneCount,
  total,
}: {
  matches: Match[];
  localPreds: Record<string, { home: number; away: number }>;
  setLocalPreds: React.Dispatch<React.SetStateAction<Record<string, { home: number; away: number }>>>;
  saveState: Record<string, "idle" | "saving" | "saved" | "error">;
  setSaveState: React.Dispatch<React.SetStateAction<Record<string, "idle" | "saving" | "saved" | "error">>>;
  scoreByPredId: Map<string, PredictionScore>;
  predIdByMatch: Map<string, string>;
  poolId: string;
  deadlineMinutes: number;
  doneCount: number;
  total: number;
}) {
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const savePrediction = useCallback(async (matchId: string, payload: { home: number; away: number }) => {
    setSaveState((s) => ({ ...s, [matchId]: "saving" }));
    try {
      const r = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool_id: poolId, match_id: matchId, payload }),
      });
      if (r.ok) {
        setSaveState((s) => ({ ...s, [matchId]: "saved" }));
        setTimeout(() => setSaveState((s) => ({ ...s, [matchId]: "idle" })), 3000);
      } else {
        const d = await r.json();
        if (d.error === "deadline_passed") {
          setSaveState((s) => ({ ...s, [matchId]: "error" }));
        } else {
          setSaveState((s) => ({ ...s, [matchId]: "error" }));
        }
      }
    } catch {
      setSaveState((s) => ({ ...s, [matchId]: "error" }));
    }
  }, [poolId, setSaveState]);

  function handleChange(matchId: string, home: number, away: number) {
    setLocalPreds((p) => ({ ...p, [matchId]: { home, away } }));
    setSaveState((s) => ({ ...s, [matchId]: "idle" }));

    // debounce 1.5s
    if (debounceRef.current[matchId]) clearTimeout(debounceRef.current[matchId]);
    debounceRef.current[matchId] = setTimeout(() => {
      savePrediction(matchId, { home, away });
    }, 1500);
  }

  return (
    <div className="flex flex-col">
      {/* Sticky progress */}
      <div className="sticky top-0 z-10 px-4 py-2 flex items-center justify-between"
        style={{ background: "var(--color-bg-primary)", borderBottom: "1px solid var(--color-bg-secondary)" }}>
        <span className="text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
          {doneCount} de {total} palpites feitos
        </span>
        <div className="flex-1 mx-3 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-bg-secondary)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: total > 0 ? `${(doneCount / total) * 100}%` : "0%",
              background: "var(--color-accent)",
              transitionTimingFunction: "var(--ease-spring)",
            }}
          />
        </div>
        <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
          {total > 0 ? Math.round((doneCount / total) * 100) : 0}%
        </span>
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">
        {matches.map((m) => {
          const urgency = deadlineUrgency(m.kickoff_at, deadlineMinutes);
          const isBlocked = urgency === "closed" || m.status === "live" || m.status === "finished";
          const pred = localPreds[m.id];
          const predId = predIdByMatch.get(m.id);
          const score = predId ? scoreByPredId.get(predId) : undefined;
          const state = saveState[m.id] ?? "idle";

          return (
            <MatchCard
              key={m.id}
              match={m}
              pred={pred}
              score={score}
              saveState={state}
              isBlocked={isBlocked}
              urgency={urgency}
              deadlineMinutes={deadlineMinutes}
              onChange={(home, away) => handleChange(m.id, home, away)}
            />
          );
        })}
      </div>
    </div>
  );
}

function MatchCard({
  match,
  pred,
  score,
  saveState,
  isBlocked,
  urgency,
  deadlineMinutes,
  onChange,
}: {
  match: Match;
  pred?: { home: number; away: number };
  score?: PredictionScore;
  saveState: "idle" | "saving" | "saved" | "error";
  isBlocked: boolean;
  urgency: "ok" | "warning" | "danger" | "closed";
  deadlineMinutes: number;
  onChange: (home: number, away: number) => void;
}) {
  const { date, time } = formatKickoff(match.kickoff_at);
  const [countdown, setCountdown] = useState(() => deadlineLabel(match.kickoff_at, deadlineMinutes));

  useEffect(() => {
    if (isBlocked) return;
    const id = setInterval(() => {
      setCountdown(deadlineLabel(match.kickoff_at, deadlineMinutes));
    }, 1000);
    return () => clearInterval(id);
  }, [match.kickoff_at, deadlineMinutes, isBlocked]);

  const home = pred?.home ?? 0;
  const away = pred?.away ?? 0;

  const deadlineColor =
    urgency === "danger" ? "var(--color-danger)"
    : urgency === "warning" ? "var(--color-warning)"
    : "var(--color-text-secondary)";

  return (
    <div
      className="rounded-card p-4 flex flex-col gap-3 transition-opacity"
      style={{
        background: "var(--color-bg-card)",
        boxShadow: score ? "var(--shadow-gold)" : "var(--shadow-card)",
        opacity: isBlocked && !match.score_home_90 && match.status !== "finished" ? 0.6 : 1,
      }}
    >
      {/* Meta linha */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-text-secondary)" }}>
          {date} • {time}
        </span>
        {/* Estado do palpite */}
        <span className="text-[11px] font-semibold" style={{ color: saveStateColor(saveState) }}>
          {saveStateLabelStr(saveState, isBlocked, !!pred)}
        </span>
      </div>

      {/* Times + steppers */}
      <div className="flex items-center gap-2">
        {/* Time casa */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-xl">{getFlag(match.home_team)}</span>
          <span className="text-[13px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
            {match.home_team}
          </span>
        </div>

        {/* Placar */}
        {match.status === "finished" ? (
          /* Placar real */
          <div className="flex items-center gap-2">
            <span className="tabular-nums text-[22px] font-bold" style={{ color: "var(--color-text-primary)" }}>
              {match.score_home_90}
            </span>
            <span className="text-[15px]" style={{ color: "var(--color-text-secondary)" }}>×</span>
            <span className="tabular-nums text-[22px] font-bold" style={{ color: "var(--color-text-primary)" }}>
              {match.score_away_90}
            </span>
          </div>
        ) : isBlocked ? (
          /* Bloqueado — mostrar palpite ou traços */
          <div className="flex items-center gap-2">
            <span className="tabular-nums text-[22px] font-bold" style={{ color: "var(--color-text-secondary)" }}>
              {pred ? pred.home : "—"}
            </span>
            <span className="text-[15px]" style={{ color: "var(--color-text-secondary)" }}>×</span>
            <span className="tabular-nums text-[22px] font-bold" style={{ color: "var(--color-text-secondary)" }}>
              {pred ? pred.away : "—"}
            </span>
          </div>
        ) : (
          /* Steppers */
          <div className="flex items-center gap-1">
            <MiniStepper
              value={home}
              onChange={(v) => onChange(v, away)}
              disabled={isBlocked}
              aria={`Gols ${match.home_team}`}
            />
            <span className="tabular-nums text-[22px] font-bold mx-1" style={{ color: "var(--color-text-primary)" }}>
              ×
            </span>
            <MiniStepper
              value={away}
              onChange={(v) => onChange(home, v)}
              disabled={isBlocked}
              aria={`Gols ${match.away_team}`}
            />
          </div>
        )}

        {/* Time visitante */}
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <span className="text-[13px] font-semibold truncate text-right" style={{ color: "var(--color-text-primary)" }}>
            {match.away_team}
          </span>
          <span className="text-xl">{getFlag(match.away_team)}</span>
        </div>
      </div>

      {/* Footer: deadline ou pontos */}
      <div className="flex items-center justify-between">
        {match.status === "finished" && score ? (
          <span className="text-[13px] font-semibold" style={{ color: "var(--color-gold)" }}>
            +{score.points} pts
          </span>
        ) : match.status === "finished" ? (
          <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            {pred ? "0 pts" : "Sem palpite"}
          </span>
        ) : !isBlocked && countdown ? (
          <span
            className="text-[11px] font-semibold tabular-nums"
            aria-live="polite"
            style={{ color: deadlineColor }}
          >
            🔒 {countdown}
          </span>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
            🔒 Encerrado
          </span>
        )}

        {match.status === "live" && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-badge text-white animate-pulse"
            style={{ background: "var(--color-live)" }}>
            AO VIVO
          </span>
        )}
      </div>
    </div>
  );
}

function MiniStepper({ value, onChange, disabled, aria }: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  aria: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={disabled || value === 0}
        className="w-11 h-11 rounded-button flex items-center justify-center text-xl font-bold transition-opacity disabled:opacity-30"
        style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-primary)" }}
        aria-label={`Diminuir ${aria}`}
      >
        −
      </button>
      <span
        className="tabular-nums text-[22px] font-bold w-8 text-center"
        style={{ color: "var(--color-text-primary)" }}
        aria-label={`${aria}: ${value}`}
      >
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(9, value + 1))}
        disabled={disabled || value === 9}
        className="w-11 h-11 rounded-button flex items-center justify-center text-xl font-bold transition-opacity disabled:opacity-30"
        style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-primary)" }}
        aria-label={`Aumentar ${aria}`}
      >
        +
      </button>
    </div>
  );
}

function saveStateColor(state: "idle" | "saving" | "saved" | "error"): string {
  if (state === "saved") return "var(--color-success)";
  if (state === "saving") return "var(--color-warning)";
  if (state === "error") return "var(--color-danger)";
  return "transparent";
}

function saveStateLabelStr(
  state: "idle" | "saving" | "saved" | "error",
  isBlocked: boolean,
  hasPred: boolean
): string {
  if (isBlocked) return hasPred ? "🔒 Salvo" : "🔒 Encerrado";
  if (state === "saved") return "✓ Salvo";
  if (state === "saving") return "Salvando…";
  if (state === "error") return "Prazo encerrado";
  if (hasPred) return "✓";
  return "";
}

/* ─── Ranking Tab ─── */

function RankingTab({
  ranking,
  currentUserId,
  bracketEnabled,
}: {
  ranking: StandingRow[];
  currentUserId: string;
  bracketEnabled?: boolean;
}) {
  if (ranking.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <span className="text-4xl">🏆</span>
        <p className="text-[15px]" style={{ color: "var(--color-text-secondary)" }}>
          Nenhum ponto ainda. Os jogos ainda não começaram.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 flex flex-col gap-2">
      {ranking.map((row) => {
        const isMe = row.user_id === currentUserId;
        const medal =
          row.position === 1 ? "🥇"
          : row.position === 2 ? "🥈"
          : row.position === 3 ? "🥉"
          : null;

        return (
          <div
            key={row.user_id}
            className="rounded-card p-4 flex items-center gap-3"
            style={{
              background: "var(--color-bg-card)",
              boxShadow: isMe ? "var(--shadow-gold)" : "var(--shadow-card)",
              border: isMe ? "1.5px solid var(--color-gold)" : "1.5px solid transparent",
            }}
          >
            {/* Posição */}
            <div className="w-8 text-center">
              {medal ? (
                <span className="text-xl">{medal}</span>
              ) : (
                <span className="tabular-nums text-[15px] font-semibold"
                  style={{ color: "var(--color-text-secondary)" }}>
                  {row.position}
                </span>
              )}
            </div>

            {/* Avatar */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-[15px] font-bold text-white flex-shrink-0"
              style={{ background: isMe ? "var(--color-accent)" : "var(--color-text-secondary)" }}
            >
              {row.name.charAt(0).toUpperCase()}
            </div>

            {/* Nome */}
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                {row.name}
                {isMe && (
                  <span className="ml-1 text-[11px] font-medium" style={{ color: "var(--color-accent)" }}>
                    (você)
                  </span>
                )}
              </p>
            </div>

            {/* Pontos */}
            <div className="flex flex-col items-end">
              <span className="tabular-nums text-[17px] font-bold" style={{ color: "var(--color-accent)" }}>
                {row.points} pts
              </span>
              {bracketEnabled && (row.bracket_points ?? 0) > 0 && (
                <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                  Jogos {row.game_points ?? 0} · Bracket {row.bracket_points}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

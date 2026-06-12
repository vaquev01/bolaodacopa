"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Match, Prediction, PredictionScore, StandingRow } from "@/lib/types";
import type { Ruleset } from "@/lib/scoring";
import { formatKickoff, deadlineLabel, deadlineUrgency, getFlag, stageLabel } from "@/lib/utils";
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

// Payload unificado para score e winner mode
type ScorePayload = { home: number; away: number };
type WinnerPayload = { winner: "home" | "draw" | "away"; home?: number | null; away?: number | null };
type PredPayload = ScorePayload | WinnerPayload;

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

  const [localPreds, setLocalPreds] = useState<Record<string, PredPayload>>(() => {
    const map: Record<string, PredPayload> = {};
    for (const p of predictions) {
      map[p.match_id] = p.payload as PredPayload;
    }
    return map;
  });

  const [saveState, setSaveState] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});

  const scoreByPredId = new Map(scores.map((s) => [s.prediction_id, s]));
  const predIdByMatch = new Map(predictions.map((p) => [p.match_id, p.id]));

  // Jogos abertos para palpite
  const openMatches = matches.filter((m) => {
    const urgency = deadlineUrgency(m.kickoff_at, deadlineMinutes);
    return urgency !== "closed" && m.status !== "live" && m.status !== "finished";
  });
  const doneCount = openMatches.filter((m) => localPreds[m.id] !== undefined).length;
  const totalOpen = openMatches.length;

  const tabs: Tab[] = ["palpites", "ranking", ...(bracketEnabled ? ["bracket" as Tab] : [])];
  const tabLabels: Record<Tab, string> = { palpites: "Palpites", ranking: "Ranking", bracket: "Bracket" };

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "var(--color-bg-primary)" }}>
      {/* Header */}
      <header className="px-4 pt-safe pt-4 pb-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <h1 className="text-[22px] font-bold truncate" style={{ color: "var(--color-text-primary)" }}>
            {pool.name}
          </h1>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => router.push(`/b/${pool.slug}/convite`)}
              className="px-3 py-2 rounded-button text-[13px] font-semibold"
              style={{ background: "var(--color-bg-secondary)", color: "var(--color-accent)" }}
              aria-label="Convidar participantes"
            >
              Convidar
            </button>
            {isOwner && (
              <button
                onClick={() => router.push(`/b/${pool.slug}/admin`)}
                className="px-3 py-2 rounded-button text-[13px] font-semibold"
                style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}
                aria-label="Administrar bolão"
              >
                Admin
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-4 pb-3">
        <div className="max-w-lg mx-auto">
          <div
            className="flex p-1 rounded-button"
            style={{ background: "var(--color-bg-secondary)" }}
            role="tablist"
            aria-label="Navegação do bolão"
          >
            {tabs.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className="flex-1 py-1.5 rounded text-[13px] font-semibold transition-all"
                style={{
                  background: tab === t ? "var(--color-bg-card)" : "transparent",
                  color: tab === t ? "var(--color-accent)" : "var(--color-text-secondary)",
                  boxShadow: tab === t ? "var(--shadow-card)" : "none",
                  transitionTimingFunction: "var(--ease-spring)",
                  transitionDuration: "var(--duration-feedback)",
                  borderRadius: "6px",
                }}
              >
                {tabLabels[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto pb-24">
        {tab === "palpites" && (
          <div className="flex flex-col">
            {hasSpecials && (
              <div className="px-4 pt-1 pb-1">
                <div className="max-w-lg mx-auto">
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
              </div>
            )}

            {!isSpecialsOnly && (
              <PalpitesTab
                matches={matches}
                ruleset={ruleset}
                localPreds={localPreds}
                setLocalPreds={setLocalPreds}
                saveState={saveState}
                setSaveState={setSaveState}
                scoreByPredId={scoreByPredId}
                predIdByMatch={predIdByMatch}
                poolId={pool.id}
                deadlineMinutes={deadlineMinutes}
                doneCount={doneCount}
                totalOpen={totalOpen}
              />
            )}

            {isSpecialsOnly && !hasSpecials && (
              <div className="max-w-lg mx-auto flex flex-col items-center justify-center py-16 gap-3 px-4">
                <p className="text-[34px]" aria-hidden="true">🏟️</p>
                <p className="text-[15px] text-center" style={{ color: "var(--color-text-secondary)" }}>
                  Este bolão é apenas de classificação. Nenhum jogo para palpitar.
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
            <div className="max-w-lg mx-auto">
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
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers de agrupamento ─── */

interface MatchSection {
  id: string;
  label: string;
  matches: Match[];
  isKnockout: boolean;
}

const STAGE_ORDER = ["group", "r32", "r16", "qf", "sf", "third", "final"] as const;

function groupMatches(matches: Match[]): MatchSection[] {
  // Separa por stage+group_label
  const groupMap = new Map<string, Match[]>();

  for (const m of matches) {
    let key: string;
    if (m.stage === "group" && m.group_label) {
      key = `group_${m.group_label}`;
    } else {
      key = m.stage;
    }
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(m);
  }

  // Ordena os grupos e fases
  const sections: MatchSection[] = [];

  // Fases de grupos ordenadas A-L
  const groupKeys = Array.from(groupMap.keys())
    .filter((k) => k.startsWith("group_"))
    .sort((a, b) => a.localeCompare(b));

  for (const key of groupKeys) {
    const label = key.replace("group_", "");
    sections.push({
      id: key,
      label: `Grupo ${label}`,
      matches: groupMap.get(key)!,
      isKnockout: false,
    });
  }

  // Fases de mata-mata em ordem definida
  for (const stage of STAGE_ORDER) {
    if (stage === "group") continue;
    if (groupMap.has(stage)) {
      sections.push({
        id: stage,
        label: stageLabel(stage),
        matches: groupMap.get(stage)!,
        isKnockout: true,
      });
    }
  }

  return sections;
}

function getSectionNavLabel(section: MatchSection): string {
  if (!section.isKnockout && section.label.startsWith("Grupo ")) {
    return section.label.replace("Grupo ", "");
  }
  const shortMap: Record<string, string> = {
    "Rodada de 32": "32 avos",
    "Oitavas de Final": "Oitavas",
    "Quartas de Final": "Quartas",
    Semifinal: "Semis",
    "3º Lugar": "3º lugar",
    Final: "Final",
  };
  return shortMap[section.label] ?? section.label;
}

/* ─── Palpites Tab ─── */

function PalpitesTab({
  matches,
  ruleset,
  localPreds,
  setLocalPreds,
  saveState,
  setSaveState,
  scoreByPredId,
  predIdByMatch,
  poolId,
  deadlineMinutes,
  doneCount,
  totalOpen,
}: {
  matches: Match[];
  ruleset: Ruleset;
  localPreds: Record<string, PredPayload>;
  setLocalPreds: React.Dispatch<React.SetStateAction<Record<string, PredPayload>>>;
  saveState: Record<string, "idle" | "saving" | "saved" | "error">;
  setSaveState: React.Dispatch<React.SetStateAction<Record<string, "idle" | "saving" | "saved" | "error">>>;
  scoreByPredId: Map<string, PredictionScore>;
  predIdByMatch: Map<string, string>;
  poolId: string;
  deadlineMinutes: number;
  doneCount: number;
  totalOpen: number;
}) {
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const navRef = useRef<HTMLDivElement>(null);

  const savePrediction = useCallback(async (matchId: string, payload: PredPayload) => {
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
        setSaveState((s) => ({ ...s, [matchId]: "error" }));
      }
    } catch {
      setSaveState((s) => ({ ...s, [matchId]: "error" }));
    }
  }, [poolId, setSaveState]);

  function handleChange(matchId: string, payload: PredPayload) {
    setLocalPreds((p) => ({ ...p, [matchId]: payload }));
    setSaveState((s) => ({ ...s, [matchId]: "idle" }));
    if (debounceRef.current[matchId]) clearTimeout(debounceRef.current[matchId]);
    debounceRef.current[matchId] = setTimeout(() => {
      savePrediction(matchId, payload);
    }, 1500);
  }

  // Próximos 48h com palpite aberto
  const now = Date.now();
  const h48 = now + 48 * 60 * 60 * 1000;
  const urgentMatches = matches.filter((m) => {
    const urgency = deadlineUrgency(m.kickoff_at, deadlineMinutes);
    const kickoff = new Date(m.kickoff_at).getTime();
    return urgency !== "closed" && m.status !== "live" && m.status !== "finished" && kickoff <= h48;
  });

  const sections = groupMatches(matches);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Scroll navigation
  function scrollToSection(id: string) {
    const el = document.getElementById(`section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(id);
    }
  }

  // Scroll chip ativo na nav bar quando click
  function scrollChipIntoView(id: string) {
    const chip = document.getElementById(`chip-${id}`);
    if (chip && navRef.current) {
      chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }

  const progressPct = totalOpen > 0 ? Math.round((doneCount / totalOpen) * 100) : 0;

  return (
    <div className="flex flex-col">
      {/* Sticky: progress + nav chips */}
      <div
        className="sticky top-0 z-10"
        style={{ background: "var(--color-bg-primary)", borderBottom: "1px solid var(--border-subtle)" }}
      >
        {/* Barra de progresso */}
        <div className="px-4 pt-3 pb-2">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                {totalOpen === 0
                  ? "Todos os jogos encerrados"
                  : doneCount === totalOpen
                  ? "Você palpitou em todos os jogos abertos"
                  : `Você palpitou em ${doneCount} de ${totalOpen} jogos abertos`}
              </span>
              {totalOpen > 0 && (
                <span
                  className="text-[13px] font-bold tabular-nums"
                  style={{ color: progressPct === 100 ? "var(--color-success)" : "var(--color-accent)" }}
                >
                  {progressPct}%
                </span>
              )}
            </div>
            <div
              className="h-1 rounded-full overflow-hidden"
              style={{ background: "var(--color-bg-secondary)" }}
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${doneCount} de ${totalOpen} palpites feitos`}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPct}%`,
                  background: progressPct === 100 ? "var(--color-success)" : "var(--color-accent)",
                  transitionTimingFunction: "var(--ease-spring)",
                  transitionDuration: "var(--duration-transition)",
                }}
              />
            </div>
          </div>
        </div>

        {/* Chips de navegação */}
        {sections.length > 1 && (
          <div
            ref={navRef}
            className="flex gap-2 px-4 pb-3 overflow-x-auto"
            style={{ scrollbarWidth: "none" }}
            role="navigation"
            aria-label="Navegar por fase"
          >
            <div className="max-w-lg mx-auto flex gap-2 w-full">
              {sections.map((sec) => {
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    id={`chip-${sec.id}`}
                    onClick={() => {
                      scrollToSection(sec.id);
                      scrollChipIntoView(sec.id);
                    }}
                    className="flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-semibold transition-all"
                    style={{
                      background: isActive ? "var(--color-accent)" : "var(--color-bg-secondary)",
                      color: isActive ? "#fff" : "var(--color-text-secondary)",
                      transitionTimingFunction: "var(--ease-spring)",
                      transitionDuration: "var(--duration-feedback)",
                    }}
                  >
                    {getSectionNavLabel(sec)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-4 flex flex-col gap-6">
        <div className="max-w-lg mx-auto w-full flex flex-col gap-6">

          {/* Seção urgente — próximos 48h */}
          {urgentMatches.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full motion-safe:animate-pulse flex-shrink-0"
                  style={{ background: "var(--color-warning)" }}
                  aria-hidden="true"
                />
                <h2 className="text-[13px] font-bold uppercase tracking-wide" style={{ color: "var(--color-warning)" }}>
                  Prazo chegando — palpite agora
                </h2>
              </div>
              <div className="flex flex-col gap-3">
                {urgentMatches.map((m) => {
                  const urgency = deadlineUrgency(m.kickoff_at, deadlineMinutes);
                  const pred = localPreds[m.id];
                  const predId = predIdByMatch.get(m.id);
                  const score = predId ? scoreByPredId.get(predId) : undefined;
                  const state = saveState[m.id] ?? "idle";

                  return (
                    <MatchCard
                      key={`urgent-${m.id}`}
                      match={m}
                      pred={pred}
                      score={score}
                      saveState={state}
                      isBlocked={false}
                      urgency={urgency}
                      deadlineMinutes={deadlineMinutes}
                      ruleset={ruleset}
                      onChange={(payload) => handleChange(m.id, payload)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Seções por grupo/fase */}
          {sections.map((sec) => (
            <div
              key={sec.id}
              id={`section-${sec.id}`}
              className="flex flex-col gap-3"
            >
              {/* Cabeçalho da seção */}
              <div
                className="flex items-center gap-3"
                style={{ scrollMarginTop: "120px" }}
              >
                <h2
                  className="text-[15px] font-bold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {sec.label}
                </h2>
                <div
                  className="flex-1 h-px"
                  style={{ background: "var(--border-subtle)" }}
                  aria-hidden="true"
                />
                <span className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  {sec.matches.length} {sec.matches.length === 1 ? "jogo" : "jogos"}
                </span>
              </div>

              {/* Cards dos jogos */}
              {sec.matches.map((m) => {
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
                    ruleset={ruleset}
                    onChange={(payload) => handleChange(m.id, payload)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Match Card ─── */

function MatchCard({
  match,
  pred,
  score,
  saveState,
  isBlocked,
  urgency,
  deadlineMinutes,
  ruleset,
  onChange,
}: {
  match: Match;
  pred?: PredPayload;
  score?: PredictionScore;
  saveState: "idle" | "saving" | "saved" | "error";
  isBlocked: boolean;
  urgency: "ok" | "warning" | "danger" | "closed";
  deadlineMinutes: number;
  ruleset: Ruleset;
  onChange: (payload: PredPayload) => void;
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

  const isWinnerMode = ruleset.prediction_mode === "winner";
  const hasExactBonus = isWinnerMode && ruleset.scoring.winner_exact_bonus > 0;

  // Extrai valores para o estado do card
  const winnerPred = isWinnerMode ? (pred as WinnerPayload | undefined) : undefined;
  const scorePred = !isWinnerMode ? (pred as ScorePayload | undefined) : undefined;

  // Score points breakdown: monta label resumido
  function breakdownLabel(breakdown: Record<string, number>): string {
    const parts: string[] = [];
    if (breakdown.exact_score) parts.push(`+${breakdown.exact_score} exato`);
    if (breakdown.winner_and_diff) parts.push(`+${breakdown.winner_and_diff} saldo`);
    if (breakdown.winner_only) parts.push(`+${breakdown.winner_only} vencedor`);
    if (breakdown.draw_only) parts.push(`+${breakdown.draw_only} empate`);
    if (breakdown.winner_pick) parts.push(`+${breakdown.winner_pick} vencedor`);
    if (breakdown.winner_exact_bonus) parts.push(`+${breakdown.winner_exact_bonus} placar`);
    if (breakdown.goals_one_team) parts.push(`+${breakdown.goals_one_team} consolação`);
    return parts.join(" · ");
  }

  const isFinished = match.status === "finished";
  const isLive = match.status === "live";

  // Urgência visual
  const borderStyle =
    urgency === "danger" && !isBlocked
      ? `1.5px solid var(--color-danger)`
      : urgency === "warning" && !isBlocked
      ? `1.5px solid var(--color-warning)`
      : score && isFinished
      ? "var(--shadow-gold)"
      : "1.5px solid transparent";

  const cardOpacity = isBlocked && !isFinished && !isLive ? 0.62 : 1;

  return (
    <div
      className="rounded-card p-4 flex flex-col gap-3 transition-opacity"
      style={{
        background: "var(--color-bg-card)",
        boxShadow: score && isFinished ? "var(--shadow-gold)" : "var(--shadow-card)",
        border: borderStyle.includes("transparent") || borderStyle.includes("solid") ? borderStyle : undefined,
        opacity: cardOpacity,
      }}
    >
      {/* Linha de meta: data/hora + estado */}
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {date} · {time}
        </span>

        <div className="flex items-center gap-2">
          {isLive && (
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-badge text-white motion-safe:animate-pulse"
              style={{ background: "var(--color-live)" }}
              aria-label="Ao vivo"
            >
              AO VIVO
            </span>
          )}
          <span
            className="text-[11px] font-semibold"
            style={{ color: saveStateColor(saveState, isBlocked) }}
          >
            {saveStateLabelStr(saveState, isBlocked, !!pred)}
          </span>
        </div>
      </div>

      {/* Times */}
      <div className="flex items-center gap-2">
        {/* Time da casa */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-xl flex-shrink-0" aria-hidden="true">{getFlag(match.home_team)}</span>
          <span
            className="text-[13px] font-semibold truncate"
            style={{ color: "var(--color-text-primary)" }}
          >
            {match.home_team}
          </span>
        </div>

        {/* Centro: placar real, bloqueado ou interativo */}
        {isFinished ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className="tabular-nums text-[22px] font-bold"
              style={{ color: "var(--color-text-primary)" }}
              aria-label={`Placar final: ${match.score_home_90} a ${match.score_away_90}`}
            >
              {match.score_home_90}
            </span>
            <span className="text-[15px]" style={{ color: "var(--color-text-secondary)" }}>×</span>
            <span
              className="tabular-nums text-[22px] font-bold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {match.score_away_90}
            </span>
          </div>
        ) : isBlocked ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            {isWinnerMode ? (
              <span
                className="text-[13px] font-semibold px-2 py-1 rounded-button"
                style={{
                  background: "var(--color-bg-secondary)",
                  color: "var(--color-text-secondary)",
                }}
              >
                {winnerPred
                  ? winnerPred.winner === "home"
                    ? match.home_team
                    : winnerPred.winner === "away"
                    ? match.away_team
                    : "Empate"
                  : "—"}
              </span>
            ) : (
              <>
                <span
                  className="tabular-nums text-[22px] font-bold"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {scorePred ? scorePred.home : "—"}
                </span>
                <span className="text-[15px]" style={{ color: "var(--color-text-secondary)" }}>×</span>
                <span
                  className="tabular-nums text-[22px] font-bold"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {scorePred ? scorePred.away : "—"}
                </span>
              </>
            )}
          </div>
        ) : isWinnerMode ? null : (
          /* Modo score: steppers */
          <div className="flex items-center gap-1 flex-shrink-0">
            <MiniStepper
              value={scorePred?.home ?? 0}
              onChange={(v) => onChange({ home: v, away: scorePred?.away ?? 0 })}
              disabled={false}
              aria={`Gols ${match.home_team}`}
            />
            <span
              className="tabular-nums text-[22px] font-bold mx-1"
              style={{ color: "var(--color-text-primary)" }}
              aria-hidden="true"
            >
              ×
            </span>
            <MiniStepper
              value={scorePred?.away ?? 0}
              onChange={(v) => onChange({ home: scorePred?.home ?? 0, away: v })}
              disabled={false}
              aria={`Gols ${match.away_team}`}
            />
          </div>
        )}

        {/* Time visitante */}
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <span
            className="text-[13px] font-semibold truncate text-right"
            style={{ color: "var(--color-text-primary)" }}
          >
            {match.away_team}
          </span>
          <span className="text-xl flex-shrink-0" aria-hidden="true">{getFlag(match.away_team)}</span>
        </div>
      </div>

      {/* Winner mode: 3 botões segmentados */}
      {isWinnerMode && !isBlocked && !isFinished && (
        <WinnerPicker
          match={match}
          pred={winnerPred}
          hasExactBonus={hasExactBonus}
          bonusPoints={ruleset.scoring.winner_exact_bonus}
          onChange={onChange}
        />
      )}

      {/* Footer: deadline, pontos ou "encerrado" */}
      <div className="flex items-center justify-between min-h-[20px]">
        {isFinished && score ? (
          <div className="flex flex-col gap-0.5">
            <span
              className="text-[13px] font-bold tabular-nums"
              style={{ color: "var(--color-gold)" }}
            >
              +{score.points} pts
            </span>
            {score.breakdown && (
              <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                {breakdownLabel(score.breakdown)}
              </span>
            )}
          </div>
        ) : isFinished ? (
          <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            {pred ? "0 pts" : "Sem palpite — fora da pontuação"}
          </span>
        ) : !isBlocked && countdown ? (
          <span
            className="text-[11px] font-semibold tabular-nums"
            aria-live="polite"
            style={{
              color:
                urgency === "danger"
                  ? "var(--color-danger)"
                  : urgency === "warning"
                  ? "var(--color-warning)"
                  : "var(--color-text-secondary)",
            }}
          >
            Fecha {countdown}
          </span>
        ) : isBlocked && !isFinished && !isLive ? (
          <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
            Aguardando jogo
          </span>
        ) : (
          <span />
        )}

        {/* Palpite do visitante (se winnerMode e bloqueado, mostra placar opcional) */}
        {isWinnerMode && winnerPred && isBlocked && !isFinished && (
          winnerPred.home != null && winnerPred.away != null ? (
            <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
              Placar: {winnerPred.home}×{winnerPred.away}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}

/* ─── Winner Picker (modo vencedor) ─── */

function WinnerPicker({
  match,
  pred,
  hasExactBonus,
  bonusPoints,
  onChange,
}: {
  match: Match;
  pred?: WinnerPayload;
  hasExactBonus: boolean;
  bonusPoints: number;
  onChange: (payload: WinnerPayload) => void;
}) {
  const [showScore, setShowScore] = useState(false);
  const selected = pred?.winner ?? null;

  const options: { value: "home" | "draw" | "away"; label: string }[] = [
    { value: "home", label: match.home_team },
    { value: "draw", label: "Empate" },
    { value: "away", label: match.away_team },
  ];

  function selectWinner(winner: "home" | "draw" | "away") {
    // Se mudar o winner, limpar placar incoerente
    const currentPred: WinnerPayload = { winner, home: null, away: null };
    onChange(currentPred);
  }

  function handleScoreChange(side: "home" | "away", value: number) {
    if (!selected) return;
    const newPred: WinnerPayload = {
      winner: selected,
      home: side === "home" ? value : pred?.home ?? 0,
      away: side === "away" ? value : pred?.away ?? 0,
    };
    onChange(newPred);
  }

  // Fechar expansão de placar se não há winner selecionado
  useEffect(() => {
    if (!selected) setShowScore(false);
  }, [selected]);

  return (
    <div className="flex flex-col gap-2">
      {/* 3 botões segmentados */}
      <div
        className="flex rounded-button overflow-hidden"
        style={{ background: "var(--color-bg-secondary)" }}
        role="group"
        aria-label="Escolha o resultado"
      >
        {options.map((opt, i) => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => selectWinner(opt.value)}
              aria-pressed={isSelected}
              className={[
                "flex-1 py-3 px-2 text-[13px] font-semibold transition-all",
                "flex flex-col items-center gap-0.5",
                i < options.length - 1 ? "border-r" : "",
              ].join(" ")}
              style={{
                background: isSelected ? "var(--color-accent)" : "transparent",
                color: isSelected ? "#fff" : "var(--color-text-secondary)",
                borderColor: "var(--border-subtle)",
                transitionTimingFunction: "var(--ease-spring)",
                transitionDuration: "var(--duration-feedback)",
              }}
            >
              {opt.value !== "draw" && (
                <span className="text-base" aria-hidden="true">
                  {getFlag(opt.value === "home" ? match.home_team : match.away_team)}
                </span>
              )}
              <span className={opt.value === "draw" ? "text-[12px]" : "text-[11px]"}>
                {opt.value === "draw"
                  ? "Empate"
                  : opt.label.length > 10
                  ? opt.label.slice(0, 10) + "."
                  : opt.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Linha opcional de cravar placar */}
      {hasExactBonus && selected && (
        <div>
          <button
            onClick={() => setShowScore((v) => !v)}
            className="w-full flex items-center justify-between py-2 px-1 rounded transition-opacity active:opacity-70"
            style={{ color: "var(--color-text-secondary)" }}
            aria-expanded={showScore}
          >
            <span className="text-[12px]">
              Cravar placar{" "}
              <span className="font-semibold" style={{ color: "var(--color-accent)" }}>
                (+{bonusPoints} pts)
              </span>
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
              style={{
                transform: showScore ? "rotate(180deg)" : "rotate(0deg)",
                transition: `transform ${200}ms var(--ease-spring)`,
              }}
            >
              <path
                d="M3 5l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {showScore && (
            <div className="flex items-center gap-3 pt-1 pb-1">
              <div className="flex-1 flex items-center gap-2">
                <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                  {match.home_team}
                </span>
                <div className="flex-1" />
                <MiniStepper
                  value={pred?.home ?? 0}
                  onChange={(v) => handleScoreChange("home", v)}
                  disabled={false}
                  aria={`Gols ${match.home_team}`}
                />
              </div>
              <span
                className="text-[15px] font-bold flex-shrink-0"
                style={{ color: "var(--color-text-secondary)" }}
                aria-hidden="true"
              >
                ×
              </span>
              <div className="flex-1 flex items-center gap-2">
                <MiniStepper
                  value={pred?.away ?? 0}
                  onChange={(v) => handleScoreChange("away", v)}
                  disabled={false}
                  aria={`Gols ${match.away_team}`}
                />
                <div className="flex-1" />
                <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                  {match.away_team}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── MiniStepper ─── */

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

/* ─── Helpers de estado ─── */

function saveStateColor(state: "idle" | "saving" | "saved" | "error", isBlocked: boolean): string {
  if (isBlocked) return "transparent";
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
  if (isBlocked) return hasPred ? "Salvo" : "";
  if (state === "saved") return "Salvo";
  if (state === "saving") return "Salvando…";
  if (state === "error") return "Prazo encerrado";
  if (hasPred) return "Salvo";
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
  const myRow = ranking.find((r) => r.user_id === currentUserId);
  const myIndex = ranking.findIndex((r) => r.user_id === currentUserId);

  if (ranking.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-[34px]" aria-hidden="true" style={{ fontVariantEmoji: "text" }}>—</p>
        <p className="text-[17px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Nenhum ponto ainda
        </p>
        <p className="text-[15px] text-center" style={{ color: "var(--color-text-secondary)" }}>
          O ranking aparece assim que os jogos terminarem.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="max-w-lg mx-auto flex flex-col gap-2">
        {myRow && myIndex > 4 && (
          <div
            className="rounded-card p-3 flex items-center gap-3 mb-1"
            style={{
              background: "var(--color-bg-card)",
              boxShadow: "var(--shadow-gold)",
              border: "1.5px solid var(--color-gold)",
            }}
          >
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-badge"
              style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}>
              Você
            </span>
            <span className="tabular-nums text-[15px] font-bold flex-shrink-0"
              style={{ color: "var(--color-text-secondary)" }}>
              #{myRow.position}
            </span>
            <span className="flex-1 text-[15px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
              {myRow.name}
            </span>
            <span className="tabular-nums text-[15px] font-bold" style={{ color: "var(--color-accent)" }}>
              {myRow.points} pts
            </span>
          </div>
        )}

        {ranking.map((row) => {
          const isMe = row.user_id === currentUserId;
          const pos = row.position;
          const medalBg =
            pos === 1 ? "#FFD60A"
            : pos === 2 ? "#C0C0C0"
            : pos === 3 ? "#CD7F32"
            : "var(--color-bg-secondary)";
          const medalColor = pos <= 3 ? "#1D1D1F" : "var(--color-text-secondary)";

          return (
            <div
              key={row.user_id}
              className="rounded-card p-4 flex items-center gap-3 transition-all"
              style={{
                background: "var(--color-bg-card)",
                boxShadow: isMe ? "var(--shadow-gold)" : "var(--shadow-card)",
                border: isMe ? "1.5px solid var(--color-gold)" : "1.5px solid transparent",
              }}
            >
              <div
                className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
                style={{ background: medalBg }}
              >
                <span className="tabular-nums text-[12px] font-bold" style={{ color: medalColor }}>
                  {pos}
                </span>
              </div>

              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-[15px] font-bold text-white flex-shrink-0"
                style={{ background: isMe ? "var(--color-accent)" : "var(--color-bg-secondary)" }}
                aria-hidden="true"
              >
                <span style={{ color: isMe ? "#fff" : "var(--color-text-secondary)" }}>
                  {row.name.charAt(0).toUpperCase()}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                  {row.name}
                  {isMe && (
                    <span className="ml-1 text-[11px] font-medium" style={{ color: "var(--color-accent)" }}>
                      você
                    </span>
                  )}
                </p>
                {bracketEnabled && (row.bracket_points ?? 0) > 0 && (
                  <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                    Jogos {row.game_points ?? 0} · Bracket {row.bracket_points}
                  </p>
                )}
              </div>

              <span className="tabular-nums text-[17px] font-bold flex-shrink-0" style={{ color: "var(--color-accent)" }}>
                {row.points} pts
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

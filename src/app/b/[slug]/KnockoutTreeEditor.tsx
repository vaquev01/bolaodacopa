"use client";

/**
 * KnockoutTreeEditor — árvore de chaveamento interativa (16 avos → Final).
 *
 * Layout "tabela de jornal": colunas lado a lado em desktop, tabs por fase em
 * mobile.
 *
 * Semântica do payload (alinhada ao scoreBracket — cada array são os times que
 * o participante coloca NA fase seguinte):
 *   - r16_winners  = vencedores dos 16 avos  → chegam às oitavas  (+points.r16)
 *   - qf_winners   = vencedores das oitavas  → chegam às quartas  (+points.qf)
 *   - sf_winners   = vencedores das quartas  → chegam às semis    (+points.sf)
 *   - finalists    = vencedores das semis    → chegam à final     (+points.final)
 *   - champion     = vencedor da final                            (+points.champion)
 *   - third_place  = vence a disputa de 3º                        (+points.third_place)
 *   - r32_winners  = legado, não pontua — não é mais escrito aqui.
 *
 * A alocação dos melhores 3ºs nos slots dos 16 avos é derivada de
 * payload.third_qualifiers (reativa — recalcula a cada mudança), com override
 * manual via picker por slot.
 */

import { useState, useCallback, useMemo } from "react";
import {
  R32_MATCHES,
  R16_MATCHES,
  QF_MATCHES,
  SF_MATCHES,
  FINAL_MATCH,
  slotLabel,
  computeThirdAlloc,
  type R32Slot,
} from "@/lib/scoring/wc26-pairings";
import { getFlag } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────

interface BracketPayload {
  groups: Record<string, string[]>;
  third_qualifiers: string[];
  r32_winners: string[];
  r16_winners: string[];
  qf_winners: string[];
  sf_winners: string[];
  finalists: string[];
  champion: string;
  third_place: string;
}

/** Pontos por fase (ruleset.advance_predictions.points). */
export interface TreePoints {
  r16: number;
  qf: number;
  sf: number;
  final: number;
  champion: number;
  third_place: number;
}

/** Estado real do torneio (deriveBracketOutcome) — liga os selos "✓ +X". */
export interface TreeOutcome {
  r16_teams: string[];
  qf_teams: string[];
  sf_teams: string[];
  finalists: string[];
  champion: string | null;
  third_place: string | null;
}

/** Bônus opcional de placar exato por jogo do mata-mata. */
export interface ScoreBonusConfig {
  /** nº FIFA → jogo real do banco. */
  matchByFifa: Record<number, { id: string; kickoff_at: string; status: string }>;
  /** Meus palpites de placar por match_id. */
  preds: Record<string, { home: number; away: number }>;
  /** Pontos do bônus para o jogo (já com multiplicador da fase). */
  bonusFor: (fifaNum: number) => number;
  onSave: (matchId: string, home: number, away: number) => Promise<boolean>;
}

interface Props {
  payload: BracketPayload;
  groupTeams: Record<string, string[]>;
  /** time → letra do grupo (ex: "Brasil" → "C") */
  teamGroup: Record<string, string>;
  onChange: (payload: BracketPayload) => void;
  locked?: boolean;
  points?: TreePoints | null;
  outcome?: TreeOutcome | null;
  scoreBonus?: ScoreBonusConfig | null;
}

// Fase com seu set de vencedores no payload (semântica nova — ver header)
type Phase = "r16_winners" | "qf_winners" | "sf_winners" | "finalists";

// Ordem hierárquica das fases (para cascata de remoção)
const PHASE_ORDER: Phase[] = ["r16_winners", "qf_winners", "sf_winners", "finalists"];

// Quantos times o outcome real tem quando a fase está 100% resolvida
const PHASE_FULL: Record<Phase, number> = {
  r16_winners: 16,
  qf_winners: 8,
  sf_winners: 4,
  finalists: 2,
};

// ─── Helpers de resolução de slot ─────────────────────────────

/** Resolve o time de um slot dos 16 avos (1º/2º do grupo ou 3º alocado). */
function resolveSlot(
  slot: R32Slot,
  payload: BracketPayload,
  thirdAlloc: Record<number, string>,
  matchNum: number
): string | null {
  if (slot.pos === 1) return payload.groups[slot.group]?.[0] || null;
  if (slot.pos === 2) return payload.groups[slot.group]?.[1] || null;
  return thirdAlloc[matchNum] || null;
}

/** Vencedor marcado de um jogo dos 16 avos (gravado em r16_winners). */
function r32Winner(
  matchNum: number,
  payload: BracketPayload,
  thirdAlloc: Record<number, string>
): string | null {
  const m = R32_MATCHES.find((x) => x.match === matchNum);
  if (!m) return null;
  const cands = [
    resolveSlot(m.home, payload, thirdAlloc, matchNum),
    resolveSlot(m.away, payload, thirdAlloc, matchNum),
  ].filter((t): t is string => Boolean(t));
  return cands.find((t) => payload.r16_winners.includes(t)) ?? null;
}

type Round = "r16" | "qf" | "sf" | "final";

const ROUND_DEFS: Record<
  Round,
  {
    matches: readonly { match: number; from: readonly [number, number] }[];
    /** Onde o vencedor desta rodada é gravado. */
    winnerPhase: Phase | "champion";
    /** Rodada que alimenta esta. */
    feeder: Round | "r32";
  }
> = {
  r16: { matches: R16_MATCHES, winnerPhase: "qf_winners", feeder: "r32" },
  qf: { matches: QF_MATCHES, winnerPhase: "sf_winners", feeder: "r16" },
  sf: { matches: SF_MATCHES, winnerPhase: "finalists", feeder: "qf" },
  final: { matches: [FINAL_MATCH], winnerPhase: "champion", feeder: "sf" },
};

/** Participantes de um jogo de qualquer rodada pós-16 avos. */
function participantsOf(
  round: Round,
  from: readonly [number, number],
  payload: BracketPayload,
  thirdAlloc: Record<number, string>
): [string | null, string | null] {
  const feeder = ROUND_DEFS[round].feeder;
  const winner = (mn: number): string | null => {
    if (feeder === "r32") return r32Winner(mn, payload, thirdAlloc);
    const def = ROUND_DEFS[feeder];
    const m = def.matches.find((x) => x.match === mn);
    if (!m) return null;
    const [a, b] = participantsOf(feeder, m.from, payload, thirdAlloc);
    const cands = [a, b].filter((t): t is string => Boolean(t));
    if (def.winnerPhase === "champion") {
      return cands.find((t) => payload.champion === t) ?? null;
    }
    return cands.find((t) => payload[def.winnerPhase].includes(t)) ?? null;
  };
  return [winner(from[0]), winner(from[1])];
}

// ─── Cascata de remoção ───────────────────────────────────────

/** Remove um time desta fase e de todas as seguintes (+ campeão/3º). */
function cascadeRemove(p: BracketPayload, team: string, fromPhase: Phase): BracketPayload {
  const idx = PHASE_ORDER.indexOf(fromPhase);
  let next = { ...p };
  for (let i = idx; i < PHASE_ORDER.length; i++) {
    const ph = PHASE_ORDER[i];
    next = { ...next, [ph]: next[ph].filter((t: string) => t !== team) };
  }
  if (next.champion === team) next = { ...next, champion: "" };
  if (next.third_place === team) next = { ...next, third_place: "" };
  return next;
}

// ─── Selo de pontos (esperado / confirmado / errado) ──────────

type EarnedState = "pending" | "hit" | "miss";

interface EarnedInfo {
  state: EarnedState;
  pts: number;
}

function earnedForPick(
  team: string,
  phase: Phase,
  points: TreePoints | null | undefined,
  outcome: TreeOutcome | null | undefined
): EarnedInfo | null {
  if (!points) return null;
  const pts =
    phase === "r16_winners"
      ? points.r16
      : phase === "qf_winners"
        ? points.qf
        : phase === "sf_winners"
          ? points.sf
          : points.final;
  if (pts <= 0) return null;
  if (!outcome) return { state: "pending", pts };
  const real =
    phase === "r16_winners"
      ? outcome.r16_teams
      : phase === "qf_winners"
        ? outcome.qf_teams
        : phase === "sf_winners"
          ? outcome.sf_teams
          : outcome.finalists;
  if (real.includes(team)) return { state: "hit", pts };
  if (real.length >= PHASE_FULL[phase]) return { state: "miss", pts };
  return { state: "pending", pts };
}

// ─── Componente principal ─────────────────────────────────────

export default function KnockoutTreeEditor({
  payload,
  groupTeams,
  teamGroup,
  onChange,
  locked = false,
  points = null,
  outcome = null,
  scoreBonus = null,
}: Props) {
  // Overrides manuais de alocação de 3º (matchNum → time). A alocação efetiva
  // é derivada — reage a toda mudança em third_qualifiers.
  const [manualAlloc, setManualAlloc] = useState<Record<number, string>>({});

  const thirdAlloc = useMemo(
    () => computeThirdAlloc(payload.third_qualifiers, teamGroup, manualAlloc),
    [payload.third_qualifiers, teamGroup, manualAlloc]
  );

  // Fase ativa nas tabs mobile
  const [mobilePhase, setMobilePhase] = useState<string>("r32");

  // ── Handler: tocar num time num confronto ─────────────────────

  const handlePickWinner = useCallback(
    (team: string, phase: Phase, opponent: string | null) => {
      if (locked) return;
      const cur = payload[phase];
      // Tocar no vencedor atual desmarca (com cascata)
      if (cur.includes(team)) {
        onChange(cascadeRemove(payload, team, phase));
        return;
      }
      // Marcar: remove o adversário do par (e tudo downstream dele) e adiciona
      let next = payload;
      if (opponent && next[phase].includes(opponent)) {
        next = cascadeRemove(next, opponent, phase);
      }
      onChange({ ...next, [phase]: [...next[phase], team] });
    },
    [payload, onChange, locked]
  );

  const handleSetChampion = useCallback(
    (team: string) => {
      if (locked) return;
      onChange({ ...payload, champion: payload.champion === team ? "" : team });
    },
    [payload, onChange, locked]
  );

  const handleSetThirdPlace = useCallback(
    (team: string) => {
      if (locked) return;
      onChange({ ...payload, third_place: payload.third_place === team ? "" : team });
    },
    [payload, onChange, locked]
  );

  // Override manual da alocação de 3º num jogo específico
  const handleAllocThird = useCallback(
    (matchNum: number, team: string) => {
      if (locked) return;
      setManualAlloc((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(next)) {
          if (v === team) delete next[Number(k)];
        }
        if (next[matchNum] === team) delete next[matchNum];
        else next[matchNum] = team;
        return next;
      });
    },
    [locked]
  );

  // Perdedores das semis (candidatos a 3º lugar)
  const sfLosers = useMemo(
    () => payload.sf_winners.filter((t) => !payload.finalists.includes(t)),
    [payload.sf_winners, payload.finalists]
  );

  const shared: TreeShared = {
    payload,
    thirdAlloc,
    teamGroup,
    groupTeams,
    sfLosers,
    points,
    outcome,
    scoreBonus,
    onPickWinner: handlePickWinner,
    onSetChampion: handleSetChampion,
    onSetThirdPlace: handleSetThirdPlace,
    onAllocThird: handleAllocThird,
    locked,
  };

  return (
    <div className="flex flex-col gap-0">
      {/* Desktop: árvore horizontal com colunas */}
      <div className="hidden lg:block">
        <DesktopBracket {...shared} />
      </div>

      {/* Mobile: tabs por fase */}
      <div className="lg:hidden flex flex-col gap-2">
        <MobileBracket {...shared} activePhase={mobilePhase} onPhaseChange={setMobilePhase} />
      </div>
    </div>
  );
}

// ─── Props compartilhadas das views ───────────────────────────

interface TreeShared {
  payload: BracketPayload;
  thirdAlloc: Record<number, string>;
  teamGroup: Record<string, string>;
  groupTeams: Record<string, string[]>;
  sfLosers: string[];
  points: TreePoints | null;
  outcome: TreeOutcome | null;
  scoreBonus: ScoreBonusConfig | null;
  onPickWinner: (team: string, phase: Phase, opponent: string | null) => void;
  onSetChampion: (team: string) => void;
  onSetThirdPlace: (team: string) => void;
  onAllocThird: (matchNum: number, team: string) => void;
  locked: boolean;
}

// Colunas da árvore: rótulo + o que vale acertar nela
function columnHint(points: TreePoints | null, phase: Phase): string | null {
  if (!points) return null;
  const map: Record<Phase, [number, string]> = {
    r16_winners: [points.r16, "oitavas"],
    qf_winners: [points.qf, "quartas"],
    sf_winners: [points.sf, "semis"],
    finalists: [points.final, "final"],
  };
  const [pts, dest] = map[phase];
  if (pts <= 0) return null;
  return `acerto = +${pts} pts (${dest})`;
}

// ─── Desktop: árvore de bracket ───────────────────────────────

function DesktopBracket(s: TreeShared) {
  const { payload, thirdAlloc, points, outcome } = s;

  return (
    <div
      className="overflow-x-auto pb-2"
      style={{ scrollbarWidth: "thin" }}
      aria-label="Chaveamento — 16 avos à final"
    >
      {/*
        Layout unilateral esquerda→direita: 5 colunas flexbox lado a lado.
        A coluna "16 avos" (16 confrontos) dita a altura total; as seguintes
        usam justify-content: space-around para alinhar com os pares de origem.
      */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "8px",
          minWidth: "1100px",
          alignItems: "stretch",
        }}
      >
        {/* Coluna 1: 16 avos */}
        <div style={{ width: "210px", flexShrink: 0 }}>
          <PhaseLabel label="16 avos" hint={columnHint(points, "r16_winners")} />
          <div className="flex flex-col gap-2 pt-1">
            {R32_MATCHES.map((m) => (
              <MatchCard
                key={m.match}
                matchNum={m.match}
                slotA={resolveSlot(m.home, payload, thirdAlloc, m.match)}
                slotB={resolveSlot(m.away, payload, thirdAlloc, m.match)}
                slotALabel={slotLabel(m.home)}
                slotBLabel={slotLabel(m.away)}
                phase="r16_winners"
                thirdSlotA={m.home.pos === 3 ? m.home : null}
                thirdSlotB={m.away.pos === 3 ? m.away : null}
                shared={s}
              />
            ))}
          </div>
        </div>

        {/* Colunas 2–4: Oitavas, Quartas, Semis */}
        {(
          [
            ["Oitavas", "r16", R16_MATCHES, "qf_winners"],
            ["Quartas", "qf", QF_MATCHES, "sf_winners"],
            ["Semis", "sf", SF_MATCHES, "finalists"],
          ] as const
        ).map(([label, round, matches, phase]) => (
          <div
            key={label}
            style={{ width: "210px", flexShrink: 0, display: "flex", flexDirection: "column" }}
          >
            <PhaseLabel label={label} hint={columnHint(points, phase)} />
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-around",
                paddingTop: "4px",
              }}
            >
              {matches.map((m) => {
                const [a, b] = participantsOf(round, m.from, payload, thirdAlloc);
                return (
                  <MatchCard
                    key={m.match}
                    matchNum={m.match}
                    slotA={a}
                    slotB={b}
                    slotALabel="—"
                    slotBLabel="—"
                    phase={phase}
                    thirdSlotA={null}
                    thirdSlotB={null}
                    shared={s}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* Coluna 5: Final + Campeão + 3º lugar */}
        <div style={{ width: "220px", flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <PhaseLabel
            label="Final"
            hint={points && points.champion > 0 ? `campeão = +${points.champion} pts` : null}
          />
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "12px",
              paddingTop: "4px",
            }}
          >
            <FinalCard shared={s} />

            {payload.champion && (
              <ChampionBanner champion={payload.champion} points={points} outcome={outcome} />
            )}

            {/* 3º lugar */}
            <div className="pt-2" style={{ borderTop: "1px dashed var(--border-subtle)" }}>
              <PhaseLabel
                label="3º lugar"
                hint={
                  points && points.third_place > 0 ? `acerto = +${points.third_place} pts` : null
                }
              />
              <ThirdPlaceSlot shared={s} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FinalCard — vencedor = campeão ───────────────────────────

function FinalCard({ shared }: { shared: TreeShared }) {
  const { payload, thirdAlloc } = shared;
  const [a, b] = participantsOf("final", FINAL_MATCH.from, payload, thirdAlloc);
  return (
    <MatchCard
      matchNum={FINAL_MATCH.match}
      slotA={a}
      slotB={b}
      slotALabel="—"
      slotBLabel="—"
      phase="finalists"
      championMode
      thirdSlotA={null}
      thirdSlotB={null}
      shared={shared}
      centerStyle
    />
  );
}

// ─── PhaseLabel ───────────────────────────────────────────────

function PhaseLabel({ label, hint }: { label: string; hint?: string | null }) {
  return (
    <div className="px-2 py-1.5 mb-1">
      <span
        className="text-[11px] font-bold uppercase tracking-[0.07em] block"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </span>
      {hint && (
        <span className="text-[10px] block" style={{ color: "var(--color-text-secondary)", opacity: 0.75 }}>
          {hint}
        </span>
      )}
    </div>
  );
}

// ─── MatchCard ────────────────────────────────────────────────

interface MatchCardProps {
  matchNum: number;
  slotA: string | null;
  slotB: string | null;
  slotALabel: string;
  slotBLabel: string;
  phase: Phase;
  /** Card da final: o "vencedor" é o campeão (payload.champion). */
  championMode?: boolean;
  thirdSlotA: { pos: 3; groups: string[] } | null;
  thirdSlotB: { pos: 3; groups: string[] } | null;
  shared: TreeShared;
  centerStyle?: boolean;
}

function MatchCard({
  matchNum,
  slotA,
  slotB,
  slotALabel,
  slotBLabel,
  phase,
  championMode = false,
  thirdSlotA,
  thirdSlotB,
  shared,
  centerStyle = false,
}: MatchCardProps) {
  const {
    payload,
    thirdAlloc,
    teamGroup,
    points,
    outcome,
    scoreBonus,
    onPickWinner,
    onSetChampion,
    onAllocThird,
    locked,
  } = shared;

  const [showThirdPicker, setShowThirdPicker] = useState<"home" | "away" | null>(null);

  const isWinner = (team: string | null): boolean => {
    if (!team) return false;
    if (championMode) return payload.champion === team;
    return payload[phase].includes(team);
  };

  // Times disponíveis para alocar num slot de 3º
  function getThirdCandidates(slot: { pos: 3; groups: string[] }): string[] {
    return payload.third_qualifiers.filter((t) => {
      const g = teamGroup[t];
      if (!g) return false;
      if (!slot.groups.includes(g)) return false;
      const allocatedElsewhere = Object.entries(thirdAlloc).some(
        ([k, v]) => v === t && Number(k) !== matchNum
      );
      return !allocatedElsewhere;
    });
  }

  const isWinnerA = isWinner(slotA);
  const isWinnerB = isWinner(slotB);

  function pick(team: string, opponent: string | null) {
    if (championMode) {
      onSetChampion(team);
      return;
    }
    onPickWinner(team, phase, opponent);
  }

  function handleSlotATap() {
    if (locked) return;
    if (thirdSlotA) {
      setShowThirdPicker(showThirdPicker === "home" ? null : "home");
      return;
    }
    if (slotA) pick(slotA, slotB);
  }

  function handleSlotBTap() {
    if (locked) return;
    if (thirdSlotB) {
      setShowThirdPicker(showThirdPicker === "away" ? null : "away");
      return;
    }
    if (slotB) pick(slotB, slotA);
  }

  const thirdCandidatesA = thirdSlotA ? getThirdCandidates(thirdSlotA) : [];
  const thirdCandidatesB = thirdSlotB ? getThirdCandidates(thirdSlotB) : [];

  // Selo de pontos do pick (campeão tem selo próprio no banner)
  const earnedA =
    !championMode && isWinnerA && slotA ? earnedForPick(slotA, phase, points, outcome) : null;
  const earnedB =
    !championMode && isWinnerB && slotB ? earnedForPick(slotB, phase, points, outcome) : null;

  return (
    <div className="flex flex-col gap-0 mb-2" style={{ position: "relative" }}>
      {/* Card do confronto */}
      <div
        className="rounded-card overflow-hidden"
        style={{
          background: "var(--color-bg-card)",
          boxShadow: "var(--shadow-card)",
          border: "1px solid var(--border-subtle)",
          width: centerStyle ? "200px" : "160px",
        }}
      >
        {/* Nº do jogo */}
        <div className="px-2 pt-1.5 pb-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <span
            className="text-[9px] font-bold tabular-nums"
            style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}
          >
            Jogo {matchNum}
          </span>
        </div>

        {/* Slot A (home) */}
        <MatchSlotRow
          team={slotA}
          label={slotALabel}
          isWinner={isWinnerA}
          isLoser={isWinnerB && !isWinnerA && slotA !== null}
          isThird={Boolean(thirdSlotA)}
          allocated={thirdSlotA ? Boolean(slotA) : false}
          earned={earnedA}
          onClick={slotA || thirdSlotA ? handleSlotATap : undefined}
          locked={locked}
        />

        {/* Divisor */}
        <div className="mx-2 h-px" style={{ background: "var(--border-subtle)" }} aria-hidden="true" />

        {/* Slot B (away) */}
        <MatchSlotRow
          team={slotB}
          label={slotBLabel}
          isWinner={isWinnerB}
          isLoser={isWinnerA && !isWinnerB && slotB !== null}
          isThird={Boolean(thirdSlotB)}
          allocated={thirdSlotB ? Boolean(slotB) : false}
          earned={earnedB}
          onClick={slotB || thirdSlotB ? handleSlotBTap : undefined}
          locked={locked}
        />

        {/* Bônus de placar exato do jogo real */}
        {scoreBonus && (
          <ScoreBonusRow matchNum={matchNum} cfg={scoreBonus} locked={locked} />
        )}
      </div>

      {/* Picker de 3º (dropdown inline) */}
      {showThirdPicker === "home" && thirdCandidatesA.length > 0 && (
        <ThirdPicker
          candidates={thirdCandidatesA}
          current={thirdAlloc[matchNum] ?? null}
          onSelect={(t) => {
            onAllocThird(matchNum, t);
            setShowThirdPicker(null);
          }}
          onClose={() => setShowThirdPicker(null)}
        />
      )}
      {showThirdPicker === "away" && thirdCandidatesB.length > 0 && (
        <ThirdPicker
          candidates={thirdCandidatesB}
          current={thirdAlloc[matchNum] ?? null}
          onSelect={(t) => {
            onAllocThird(matchNum, t);
            setShowThirdPicker(null);
          }}
          onClose={() => setShowThirdPicker(null)}
        />
      )}
      {/* Slot de 3º sem candidato: dica de por quê */}
      {showThirdPicker !== null &&
        ((showThirdPicker === "home" && thirdSlotA && thirdCandidatesA.length === 0) ||
          (showThirdPicker === "away" && thirdSlotB && thirdCandidatesB.length === 0)) && (
          <div
            className="absolute left-0 top-full z-20 rounded-card px-2 py-2"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-card)",
              minWidth: "160px",
            }}
          >
            <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
              Nenhum dos seus melhores 3ºs é elegível pra este slot (
              {slotLabel((showThirdPicker === "home" ? thirdSlotA : thirdSlotB)!)}). Marque os 3ºs
              na seção acima.
            </p>
            <button
              onClick={() => setShowThirdPicker(null)}
              className="text-[10px] font-semibold mt-1"
              style={{ color: "var(--color-accent)" }}
            >
              Fechar
            </button>
          </div>
        )}
    </div>
  );
}

// ─── MatchSlotRow ─────────────────────────────────────────────

function MatchSlotRow({
  team,
  label,
  isWinner,
  isLoser,
  isThird,
  allocated,
  earned,
  onClick,
  locked,
}: {
  team: string | null;
  label: string;
  isWinner: boolean;
  isLoser: boolean;
  isThird: boolean;
  allocated: boolean;
  earned: EarnedInfo | null;
  onClick?: () => void;
  locked: boolean;
}) {
  const isEmpty = !team;

  const bg = isWinner ? "var(--color-accent)" : "transparent";

  const textColor = isWinner
    ? "#fff"
    : isEmpty
      ? "var(--color-text-secondary)"
      : isLoser
        ? "var(--color-text-secondary)"
        : "var(--color-text-primary)";

  const opacity = isLoser ? 0.45 : 1;

  return (
    <button
      onClick={onClick}
      disabled={locked || (!team && !isThird)}
      className="w-full flex items-center gap-1.5 px-2 py-2 text-left transition-all"
      style={{
        background: bg,
        color: textColor,
        opacity,
        cursor: locked ? "default" : onClick ? "pointer" : "default",
        minHeight: "44px",
        transitionDuration: "var(--duration-feedback)",
        transitionTimingFunction: "var(--ease-spring)",
      }}
      aria-pressed={isWinner}
      aria-label={team ? `${team}${isWinner ? " — vencedor" : ""}` : label}
    >
      {/* Bandeira */}
      <span className="text-[13px] flex-shrink-0" aria-hidden="true" style={{ opacity: isEmpty ? 0.35 : 1 }}>
        {team ? getFlag(team) : isThird ? "?" : "—"}
      </span>

      {/* Nome */}
      <span
        className="text-[11px] font-medium flex-1 min-w-0 truncate"
        style={{
          fontWeight: isWinner ? 700 : 500,
          textDecoration: isLoser ? "line-through" : "none",
        }}
      >
        {team ?? (
          <span style={{ opacity: 0.5 }}>{isThird && !allocated ? "3º — toque" : label}</span>
        )}
      </span>

      {/* Selo de pontos do pick: pendente "+X", confirmado "✓ +X", errado "✗" */}
      {isWinner && (
        <PointsBadge earned={earned} />
      )}
    </button>
  );
}

function PointsBadge({ earned }: { earned: EarnedInfo | null }) {
  if (!earned) {
    return (
      <span
        className="text-[9px] font-bold flex-shrink-0 ml-0.5 px-1 py-0.5 rounded-badge"
        style={{ background: "rgba(255,255,255,0.25)", color: "#fff" }}
        aria-hidden="true"
      >
        W
      </span>
    );
  }
  const styleByState: Record<EarnedState, { bg: string; fg: string; text: string; title: string }> = {
    pending: {
      bg: "rgba(255,255,255,0.25)",
      fg: "#fff",
      text: `+${earned.pts}`,
      title: `Vale +${earned.pts} pts se acertar`,
    },
    hit: {
      bg: "var(--color-success)",
      fg: "#fff",
      text: `✓ +${earned.pts}`,
      title: `Acertou — +${earned.pts} pts garantidos`,
    },
    miss: {
      bg: "var(--color-danger)",
      fg: "#fff",
      text: "✗ 0",
      title: "Não avançou — 0 pts",
    },
  };
  const s = styleByState[earned.state];
  return (
    <span
      className="text-[9px] font-bold flex-shrink-0 ml-0.5 px-1 py-0.5 rounded-badge tabular-nums"
      style={{ background: s.bg, color: s.fg }}
      title={s.title}
    >
      {s.text}
    </span>
  );
}

// ─── ScoreBonusRow — cravar o placar do jogo real ─────────────

function ScoreBonusRow({
  matchNum,
  cfg,
  locked,
}: {
  matchNum: number;
  cfg: ScoreBonusConfig;
  locked: boolean;
}) {
  const db = cfg.matchByFifa[matchNum];
  const bonus = db ? cfg.bonusFor(matchNum) : 0;
  const pred = db ? cfg.preds[db.id] : undefined;

  const [open, setOpen] = useState(false);
  const [home, setHome] = useState<string>(pred ? String(pred.home) : "");
  const [away, setAway] = useState<string>(pred ? String(pred.away) : "");
  const [st, setSt] = useState<"idle" | "saving" | "saved" | "error">("idle");

  if (!db || bonus <= 0) return null;

  const started =
    db.status !== "scheduled" || new Date(db.kickoff_at).getTime() <= Date.now();

  // Jogo já começou: mostra o palpite registrado (ou nada)
  if (started || locked) {
    if (!pred) return null;
    return (
      <div
        className="px-2 py-1 flex items-center gap-1"
        style={{ borderTop: "1px dashed var(--border-subtle)", background: "var(--color-bg-secondary)" }}
      >
        <span className="text-[10px] tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
          Placar cravado: {pred.home}×{pred.away}
        </span>
      </div>
    );
  }

  async function save() {
    const h = parseInt(home, 10);
    const a = parseInt(away, 10);
    if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) return;
    setSt("saving");
    const ok = await cfg.onSave(db.id, h, a);
    setSt(ok ? "saved" : "error");
    if (ok) setTimeout(() => setOpen(false), 600);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full px-2 py-1 text-left"
        style={{ borderTop: "1px dashed var(--border-subtle)", background: "var(--color-bg-secondary)" }}
      >
        <span
          className="text-[10px] font-medium tabular-nums"
          style={{ color: pred ? "var(--color-success)" : "var(--color-accent)" }}
        >
          {pred ? `Placar: ${pred.home}×${pred.away} ✎` : `Cravar placar · +${bonus} pts`}
        </span>
      </button>
    );
  }

  return (
    <div
      className="px-2 py-1.5 flex items-center gap-1"
      style={{ borderTop: "1px dashed var(--border-subtle)", background: "var(--color-bg-secondary)" }}
    >
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={20}
        value={home}
        onChange={(e) => {
          setHome(e.target.value);
          setSt("idle");
        }}
        className="w-9 text-center text-[12px] font-semibold rounded-button py-1"
        style={{ background: "var(--color-bg-card)", border: "1px solid var(--border-subtle)", color: "var(--color-text-primary)" }}
        aria-label="Gols do mandante"
      />
      <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>×</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={20}
        value={away}
        onChange={(e) => {
          setAway(e.target.value);
          setSt("idle");
        }}
        className="w-9 text-center text-[12px] font-semibold rounded-button py-1"
        style={{ background: "var(--color-bg-card)", border: "1px solid var(--border-subtle)", color: "var(--color-text-primary)" }}
        aria-label="Gols do visitante"
      />
      <button
        onClick={save}
        disabled={st === "saving"}
        className="flex-1 text-[10px] font-bold py-1 rounded-button text-white disabled:opacity-60"
        style={{ background: st === "error" ? "var(--color-danger)" : "var(--color-accent)" }}
      >
        {st === "saving" ? "…" : st === "saved" ? "✓" : st === "error" ? "Erro" : "OK"}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="text-[10px] px-1"
        style={{ color: "var(--color-text-secondary)" }}
        aria-label="Fechar"
      >
        ✕
      </button>
    </div>
  );
}

// ─── ThirdPicker ──────────────────────────────────────────────

function ThirdPicker({
  candidates,
  current,
  onSelect,
  onClose,
}: {
  candidates: string[];
  current: string | null;
  onSelect: (t: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute left-0 top-full z-20 rounded-card overflow-hidden shadow-lg"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-card)",
        minWidth: "160px",
      }}
    >
      <div className="px-2 py-1" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.05em]"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Alocar 3º
        </span>
      </div>
      {candidates.map((t) => (
        <button
          key={t}
          onClick={() => onSelect(t)}
          className="w-full flex items-center gap-2 px-2 py-2 text-left transition-all"
          style={{
            background:
              current === t ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
            color: current === t ? "var(--color-accent)" : "var(--color-text-primary)",
            minHeight: "40px",
          }}
        >
          <span className="text-[13px]" aria-hidden="true">
            {getFlag(t)}
          </span>
          <span className="text-[11px] font-medium">{t}</span>
          {current === t && (
            <span className="ml-auto text-[10px] font-bold" style={{ color: "var(--color-accent)" }}>
              ✓
            </span>
          )}
        </button>
      ))}
      <button
        onClick={onClose}
        className="w-full px-2 py-1.5 text-[10px] font-medium"
        style={{ color: "var(--color-text-secondary)", borderTop: "1px solid var(--border-subtle)" }}
      >
        Cancelar
      </button>
    </div>
  );
}

// ─── ChampionBanner ───────────────────────────────────────────

function ChampionBanner({
  champion,
  points,
  outcome,
}: {
  champion: string;
  points: TreePoints | null;
  outcome: TreeOutcome | null;
}) {
  const state: EarnedState | null = !outcome?.champion
    ? "pending"
    : outcome.champion === champion
      ? "hit"
      : "miss";

  return (
    <div
      className="w-full rounded-card overflow-hidden mt-1"
      style={{ border: "2px solid var(--color-gold)", boxShadow: "var(--shadow-gold)", minWidth: "200px" }}
    >
      <div className="px-2 py-1" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.05em]"
          style={{ color: "var(--color-gold)" }}
        >
          Campeão
        </span>
      </div>
      <div className="w-full flex items-center gap-2 px-2 py-2" style={{ minHeight: "44px" }}>
        <span className="text-[14px]" aria-hidden="true">
          {getFlag(champion)}
        </span>
        <span className="text-[12px] font-bold flex-1" style={{ color: "var(--color-text-primary)" }}>
          {champion}
        </span>
        {points && points.champion > 0 && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-badge tabular-nums"
            style={{
              background:
                state === "hit"
                  ? "var(--color-success)"
                  : state === "miss"
                    ? "var(--color-danger)"
                    : "var(--color-gold)",
              color: state === "pending" ? "#1D1D1F" : "#fff",
            }}
            title={
              state === "hit"
                ? `Acertou o campeão — +${points.champion} pts`
                : state === "miss"
                  ? "Errou o campeão — 0 pts"
                  : `Vale +${points.champion} pts`
            }
          >
            {state === "hit" ? `✓ +${points.champion}` : state === "miss" ? "✗ 0" : `+${points.champion}`}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── ThirdPlaceSlot ───────────────────────────────────────────

function ThirdPlaceSlot({ shared }: { shared: TreeShared }) {
  const { sfLosers, payload, points, outcome, onSetThirdPlace, locked } = shared;
  const thirdPlace = payload.third_place;

  if (sfLosers.length === 0) {
    return (
      <div className="mt-1 px-2 py-2 rounded-button text-center" style={{ background: "var(--color-bg-secondary)" }}>
        <span className="text-[11px]" style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}>
          Aguardando semis
        </span>
      </div>
    );
  }

  const earnedState = (t: string): EarnedState =>
    !outcome?.third_place ? "pending" : outcome.third_place === t ? "hit" : "miss";

  return (
    <div className="w-full rounded-card overflow-hidden mt-1" style={{ border: "1px solid var(--border-subtle)", minWidth: "200px" }}>
      {sfLosers.map((t) => (
        <button
          key={t}
          onClick={() => !locked && onSetThirdPlace(t)}
          disabled={locked}
          className="w-full flex items-center gap-2 px-2 py-2 transition-all"
          style={{
            background:
              thirdPlace === t ? "color-mix(in srgb, var(--color-accent) 10%, transparent)" : "transparent",
            minHeight: "40px",
          }}
          aria-pressed={thirdPlace === t}
        >
          <span className="text-[13px]" aria-hidden="true">
            {getFlag(t)}
          </span>
          <span
            className="text-[11px] font-medium flex-1 text-left"
            style={{
              color: thirdPlace === t ? "var(--color-accent)" : "var(--color-text-secondary)",
              fontWeight: thirdPlace === t ? 700 : 400,
            }}
          >
            {t}
          </span>
          {thirdPlace === t && (
            <span
              className="text-[9px] font-bold px-1 py-0.5 rounded-badge tabular-nums"
              style={{
                background:
                  earnedState(t) === "hit"
                    ? "var(--color-success)"
                    : earnedState(t) === "miss"
                      ? "var(--color-danger)"
                      : "var(--color-accent)",
                color: "#fff",
              }}
            >
              {points && points.third_place > 0
                ? earnedState(t) === "hit"
                  ? `✓ +${points.third_place}`
                  : earnedState(t) === "miss"
                    ? "✗ 0"
                    : `+${points.third_place}`
                : "3º"}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Mobile: tabs por fase ────────────────────────────────────

const MOBILE_PHASES = [
  { id: "r32", label: "16 avos", description: "Quem avança às oitavas?" },
  { id: "r16", label: "Oitavas", description: "Quem vai às quartas?" },
  { id: "qf", label: "Quartas", description: "Quem vai às semis?" },
  { id: "sf", label: "Semis", description: "Quem vai à final?" },
  { id: "final", label: "Final + 3º", description: "Campeão e 3º lugar" },
] as const;

function MobileBracket({
  activePhase,
  onPhaseChange,
  ...s
}: TreeShared & {
  activePhase: string;
  onPhaseChange: (p: string) => void;
}) {
  const { payload, thirdAlloc, points } = s;

  const hintFor: Record<string, string | null> = {
    r32: columnHint(points, "r16_winners"),
    r16: columnHint(points, "qf_winners"),
    qf: columnHint(points, "sf_winners"),
    sf: columnHint(points, "finalists"),
    final: points && points.champion > 0 ? `campeão = +${points.champion} pts` : null,
  };

  const roundFor: Record<string, { round: Round; phase: Phase }> = {
    r16: { round: "r16", phase: "qf_winners" },
    qf: { round: "qf", phase: "sf_winners" },
    sf: { round: "sf", phase: "finalists" },
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Tabs de fase */}
      <div
        className="flex overflow-x-auto gap-1 pb-1"
        style={{ scrollbarWidth: "none" }}
        role="tablist"
        aria-label="Fases do mata-mata"
      >
        {MOBILE_PHASES.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={activePhase === p.id}
            onClick={() => onPhaseChange(p.id)}
            className="flex-shrink-0 px-3 py-2 rounded-button text-[12px] font-semibold transition-all"
            style={{
              background: activePhase === p.id ? "var(--color-accent)" : "var(--color-bg-secondary)",
              color: activePhase === p.id ? "#fff" : "var(--color-text-secondary)",
              minHeight: "36px",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {hintFor[activePhase] && (
        <p className="text-[11px] px-1" style={{ color: "var(--color-text-secondary)" }}>
          Cada {hintFor[activePhase]}
        </p>
      )}

      {/* Conteúdo da fase ativa */}
      <div role="tabpanel" aria-label={`Fase: ${activePhase}`}>
        {activePhase === "r32" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {R32_MATCHES.map((m) => (
              <MatchCard
                key={m.match}
                matchNum={m.match}
                slotA={resolveSlot(m.home, payload, thirdAlloc, m.match)}
                slotB={resolveSlot(m.away, payload, thirdAlloc, m.match)}
                slotALabel={slotLabel(m.home)}
                slotBLabel={slotLabel(m.away)}
                phase="r16_winners"
                thirdSlotA={m.home.pos === 3 ? m.home : null}
                thirdSlotB={m.away.pos === 3 ? m.away : null}
                shared={s}
                centerStyle
              />
            ))}
          </div>
        )}

        {(activePhase === "r16" || activePhase === "qf" || activePhase === "sf") && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(activePhase === "r16" ? R16_MATCHES : activePhase === "qf" ? QF_MATCHES : SF_MATCHES).map(
              (m) => {
                const { round, phase } = roundFor[activePhase];
                const [a, b] = participantsOf(round, m.from, payload, thirdAlloc);
                return (
                  <MatchCard
                    key={m.match}
                    matchNum={m.match}
                    slotA={a}
                    slotB={b}
                    slotALabel="A definir"
                    slotBLabel="A definir"
                    phase={phase}
                    thirdSlotA={null}
                    thirdSlotB={null}
                    shared={s}
                    centerStyle
                  />
                );
              }
            )}
          </div>
        )}

        {activePhase === "final" && (
          <div className="flex flex-col gap-3">
            <FinalCard shared={s} />

            {payload.champion && (
              <ChampionBanner champion={payload.champion} points={s.points} outcome={s.outcome} />
            )}

            <div>
              <span className="text-[12px] font-semibold mb-2 block" style={{ color: "var(--color-text-secondary)" }}>
                3º lugar
                {s.points && s.points.third_place > 0 ? ` — acerto vale +${s.points.third_place} pts` : ""}
              </span>
              <ThirdPlaceSlot shared={s} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

/**
 * KnockoutTreeEditor — árvore de chaveamento interativa (16 avos → Final).
 *
 * Layout "tabela de jornal": colunas lado a lado em desktop, accordion por
 * fase em mobile. Conectores CSS clássicos entre pares convergindo ao confronto
 * seguinte.
 *
 * Não altera o schema do BracketPayload — escreve nos mesmos campos que
 * existiam antes (r32_winners, r16_winners, qf_winners, sf_winners,
 * finalists, champion, third_place).
 */

import { useState, useCallback, useMemo } from "react";
import {
  R32_MATCHES,
  R16_MATCHES,
  QF_MATCHES,
  SF_MATCHES,
  FINAL_MATCH,
  THIRD_PLACE_MATCH,
  slotLabel,
  type R32Match,
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

interface Props {
  payload: BracketPayload;
  groupTeams: Record<string, string[]>;
  /** time → letra do grupo (ex: "Brasil" → "C") */
  teamGroup: Record<string, string>;
  onChange: (payload: BracketPayload) => void;
  locked?: boolean;
}

// Fase com seu set de vencedores no payload
type Phase = "r32_winners" | "r16_winners" | "qf_winners" | "sf_winners" | "finalists";

// Ordem hierárquica das fases (para cascata de remoção)
const PHASE_ORDER: Phase[] = [
  "r32_winners",
  "r16_winners",
  "qf_winners",
  "sf_winners",
  "finalists",
];

// ─── Helpers de resolução de slot ─────────────────────────────

/**
 * Resolve o time de um slot de 16 avos a partir do payload de grupos e da
 * alocação de 3ºs.
 */
function resolveSlot(
  slot: R32Match["home"] | R32Match["away"],
  payload: BracketPayload,
  thirdAlloc: Record<number, string>, // matchNum → team
  matchNum: number,
): string | null {
  if (slot.pos === 1) {
    return payload.groups[slot.group]?.[0] || null;
  }
  if (slot.pos === 2) {
    return payload.groups[slot.group]?.[1] || null;
  }
  // pos === 3: usar alocação local
  return thirdAlloc[matchNum] || null;
}

/**
 * Vencedor selecionado de um confronto de 16 avos.
 * Um time está em r32_winners se foi marcado como vencedor.
 */
function getR32Winner(matchNum: number, payload: BracketPayload, thirdAlloc: Record<number, string>): string | null {
  const m = R32_MATCHES.find((x) => x.match === matchNum);
  if (!m) return null;
  const home = resolveSlot(m.home, payload, thirdAlloc, matchNum);
  const away = resolveSlot(m.away, payload, thirdAlloc, matchNum);
  const candidates = [home, away].filter((t): t is string => Boolean(t));
  return candidates.find((t) => payload.r32_winners.includes(t)) ?? null;
}

/**
 * Times em disputa num confronto de qualquer fase pós-16 avos.
 * Derivado dos vencedores dos confrontos `from`.
 */
function getMatchParticipants(
  from: readonly [number, number],
  sourcePhase: Phase,
  payload: BracketPayload,
  thirdAlloc: Record<number, string>,
  sourceMatches: readonly { match: number; from: readonly [number, number] }[],
): [string | null, string | null] {
  const [a, b] = from;

  // Para R16 (sourcePhase = r16_winners), os participants vêm de r32_winners.
  // Para QF, de r16_winners. etc.
  if (sourcePhase === "r16_winners") {
    // from = dois matchNums de R32 (73–88)
    return [
      getR32Winner(a, payload, thirdAlloc),
      getR32Winner(b, payload, thirdAlloc),
    ];
  }

  // Para fases seguintes, from = matchNums de R16/QF/SF
  const prevPhaseIdx = PHASE_ORDER.indexOf(sourcePhase);
  const prevPhase = PHASE_ORDER[prevPhaseIdx - 1] as Phase; // e.g. r16_winners → r32_winners

  // Encontra o vencedor de cada confronto anterior
  function winnerOfMatch(matchNum: number): string | null {
    const src = sourceMatches.find((x) => x.match === matchNum);
    if (!src) return null;
    const [pa, pb] = getMatchParticipants(src.from, prevPhase, payload, thirdAlloc, sourceMatches);
    const candidates = [pa, pb].filter((t): t is string => Boolean(t));
    return candidates.find((t) => payload[sourcePhase === "qf_winners" ? "r16_winners" : sourcePhase === "sf_winners" ? "qf_winners" : "sf_winners"].includes(t)) ?? null;
  }

  return [winnerOfMatch(a), winnerOfMatch(b)];
}

// Versão simplificada — resolve participants direto das fases
function resolveParticipantsFromPhase(
  fromMatches: readonly [number, number],
  phase: Phase, // fase ATUAL (ex: r16_winners)
  payload: BracketPayload,
  thirdAlloc: Record<number, string>,
): [string | null, string | null] {
  // phase = fase que ALIMENTA este confronto (ou seja, a fase anterior)
  // r32 → r16_winners: de R32_MATCHES
  // r16 → qf_winners:  de R16_MATCHES
  // qf  → sf_winners:  de QF_MATCHES
  // sf  → finalists:   de SF_MATCHES

  if (phase === "r16_winners") {
    // participantes = vencedores de R32_MATCHES[from[0]] e [from[1]]
    return [
      getR32Winner(fromMatches[0], payload, thirdAlloc),
      getR32Winner(fromMatches[1], payload, thirdAlloc),
    ];
  }
  if (phase === "qf_winners") {
    // participantes = vencedores de R16_MATCHES[from[0]] e [from[1]]
    const winR16 = (mn: number): string | null => {
      const m = R16_MATCHES.find((x) => x.match === mn);
      if (!m) return null;
      const [a, b] = resolveParticipantsFromPhase(m.from, "r16_winners", payload, thirdAlloc);
      const candidates = [a, b].filter((t): t is string => Boolean(t));
      return candidates.find((t) => payload.r16_winners.includes(t)) ?? null;
    };
    return [winR16(fromMatches[0]), winR16(fromMatches[1])];
  }
  if (phase === "sf_winners") {
    const winQF = (mn: number): string | null => {
      const m = QF_MATCHES.find((x) => x.match === mn);
      if (!m) return null;
      const [a, b] = resolveParticipantsFromPhase(m.from, "qf_winners", payload, thirdAlloc);
      const candidates = [a, b].filter((t): t is string => Boolean(t));
      return candidates.find((t) => payload.qf_winners.includes(t)) ?? null;
    };
    return [winQF(fromMatches[0]), winQF(fromMatches[1])];
  }
  if (phase === "finalists") {
    const winSF = (mn: number): string | null => {
      const m = SF_MATCHES.find((x) => x.match === mn);
      if (!m) return null;
      const [a, b] = resolveParticipantsFromPhase(m.from, "sf_winners", payload, thirdAlloc);
      const candidates = [a, b].filter((t): t is string => Boolean(t));
      return candidates.find((t) => payload.sf_winners.includes(t)) ?? null;
    };
    return [winSF(fromMatches[0]), winSF(fromMatches[1])];
  }
  return [null, null];
}

/**
 * Retorna o vencedor selecionado de um confronto de qualquer fase.
 * phase = fase RESULTANTE (e.g., r32_winners = quem vence os 16 avos).
 */
function getWinnerForPhaseMatch(
  matchNum: number,
  phase: Phase,
  payload: BracketPayload,
  thirdAlloc: Record<number, string>,
): string | null {
  let participants: [string | null, string | null] = [null, null];

  if (phase === "r32_winners") {
    const m = R32_MATCHES.find((x) => x.match === matchNum);
    if (!m) return null;
    participants = [
      resolveSlot(m.home, payload, thirdAlloc, matchNum),
      resolveSlot(m.away, payload, thirdAlloc, matchNum),
    ];
  } else if (phase === "r16_winners") {
    const m = R16_MATCHES.find((x) => x.match === matchNum);
    if (!m) return null;
    participants = resolveParticipantsFromPhase(m.from, "r16_winners", payload, thirdAlloc);
  } else if (phase === "qf_winners") {
    const m = QF_MATCHES.find((x) => x.match === matchNum);
    if (!m) return null;
    participants = resolveParticipantsFromPhase(m.from, "qf_winners", payload, thirdAlloc);
  } else if (phase === "sf_winners") {
    const m = SF_MATCHES.find((x) => x.match === matchNum);
    if (!m) return null;
    participants = resolveParticipantsFromPhase(m.from, "sf_winners", payload, thirdAlloc);
  } else if (phase === "finalists") {
    participants = resolveParticipantsFromPhase(FINAL_MATCH.from, "finalists", payload, thirdAlloc);
  }

  const [a, b] = participants;
  const candidates = [a, b].filter((t): t is string => Boolean(t));
  return candidates.find((t) => payload[phase].includes(t)) ?? null;
}

// ─── Alocação gulosa de 3ºs ──────────────────────────────────

/**
 * Constrói alocação inicial dos 3ºs a partir de third_qualifiers.
 * Para cada jogo R32 com slot pos:3, tenta alocar um qualificado compatível
 * (grupo na lista groups[] do slot) que ainda não foi alocado.
 */
function buildInitialThirdAlloc(
  payload: BracketPayload,
  teamGroup: Record<string, string>,
): Record<number, string> {
  const alloc: Record<number, string> = {};
  const used = new Set<string>();

  for (const m of R32_MATCHES) {
    for (const slot of [m.home, m.away]) {
      if (slot.pos !== 3) continue;
      // Encontrar um qualificado compatível não usado
      const candidate = payload.third_qualifiers.find((t) => {
        if (used.has(t)) return false;
        const g = teamGroup[t];
        if (!g) return false;
        return (slot as { pos: 3; groups: string[] }).groups.includes(g);
      });
      if (candidate) {
        alloc[m.match] = candidate;
        used.add(candidate);
      }
    }
  }

  return alloc;
}

// ─── Cascata de remoção ───────────────────────────────────────

/**
 * Remove um time de todas as fases downstream (inclusive a própria fase e
 * as seguintes). Necessário ao trocar o vencedor de um confronto.
 */
function cascadeRemove(p: BracketPayload, team: string, fromPhase: Phase): BracketPayload {
  const idx = PHASE_ORDER.indexOf(fromPhase);
  let next = { ...p };
  for (let i = idx; i < PHASE_ORDER.length; i++) {
    const ph = PHASE_ORDER[i];
    next = { ...next, [ph]: next[ph].filter((t: string) => t !== team) };
  }
  // champion e third_place também
  if (next.champion === team) next = { ...next, champion: "" };
  if (next.third_place === team) next = { ...next, third_place: "" };
  return next;
}

// ─── Componente principal ─────────────────────────────────────

export default function KnockoutTreeEditor({
  payload,
  groupTeams,
  teamGroup,
  onChange,
  locked = false,
}: Props) {
  // Estado local: alocação de 3ºs (matchNum → time)
  const [thirdAlloc, setThirdAlloc] = useState<Record<number, string>>(() =>
    buildInitialThirdAlloc(payload, teamGroup)
  );

  // Fase ativa no accordion mobile
  const [mobilePhase, setMobilePhase] = useState<string>("r32");

  // ── Handler: tocar num time num confronto ─────────────────────

  const handlePickWinner = useCallback(
    (
      team: string,
      phase: Phase, // fase resultante
    ) => {
      if (locked) return;
      onChange(
        (() => {
          const cur = payload[phase];
          // Se já é o vencedor, desmarcar (cascata)
          if (cur.includes(team)) {
            return cascadeRemove(payload, team, phase);
          }
          // Caso contrário: adicionar ao set e remover o concorrente do par
          // (não há vínculo confronto-por-confronto no schema — apenas set)
          return { ...payload, [phase]: [...cur, team] };
        })()
      );
    },
    [payload, onChange, locked]
  );

  const handleSetChampion = useCallback(
    (team: string) => {
      if (locked) return;
      onChange({
        ...payload,
        champion: payload.champion === team ? "" : team,
      });
    },
    [payload, onChange, locked]
  );

  const handleSetThirdPlace = useCallback(
    (team: string) => {
      if (locked) return;
      onChange({
        ...payload,
        third_place: payload.third_place === team ? "" : team,
      });
    },
    [payload, onChange, locked]
  );

  // Alocação de 3º num jogo específico
  const handleAllocThird = useCallback(
    (matchNum: number, team: string) => {
      if (locked) return;
      setThirdAlloc((prev) => {
        const next = { ...prev };
        // Remover este time de qualquer outro jogo onde estava alocado
        for (const [k, v] of Object.entries(next)) {
          if (v === team) delete next[Number(k)];
        }
        if (next[matchNum] === team) {
          delete next[matchNum];
        } else {
          next[matchNum] = team;
        }
        return next;
      });
    },
    [locked]
  );

  // Perdedores das semis (para 3º lugar)
  const sfLosers = useMemo(() => {
    return payload.sf_winners.filter((t) => !payload.finalists.includes(t));
  }, [payload.sf_winners, payload.finalists]);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-0">
      {/* Desktop: árvore horizontal com colunas */}
      <div className="hidden lg:block">
        <DesktopBracket
          payload={payload}
          thirdAlloc={thirdAlloc}
          teamGroup={teamGroup}
          groupTeams={groupTeams}
          sfLosers={sfLosers}
          onPickWinner={handlePickWinner}
          onSetChampion={handleSetChampion}
          onSetThirdPlace={handleSetThirdPlace}
          onAllocThird={handleAllocThird}
          locked={locked}
        />
      </div>

      {/* Mobile: accordion por fase */}
      <div className="lg:hidden flex flex-col gap-2">
        <MobileBracket
          payload={payload}
          thirdAlloc={thirdAlloc}
          teamGroup={teamGroup}
          groupTeams={groupTeams}
          sfLosers={sfLosers}
          activePhase={mobilePhase}
          onPhaseChange={setMobilePhase}
          onPickWinner={handlePickWinner}
          onSetChampion={handleSetChampion}
          onSetThirdPlace={handleSetThirdPlace}
          onAllocThird={handleAllocThird}
          locked={locked}
        />
      </div>
    </div>
  );
}

// ─── Desktop: árvore de bracket ───────────────────────────────

interface TreeProps {
  payload: BracketPayload;
  thirdAlloc: Record<number, string>;
  teamGroup: Record<string, string>;
  groupTeams: Record<string, string[]>;
  sfLosers: string[];
  onPickWinner: (team: string, phase: Phase) => void;
  onSetChampion: (team: string) => void;
  onSetThirdPlace: (team: string) => void;
  onAllocThird: (matchNum: number, team: string) => void;
  locked: boolean;
}

function DesktopBracket({
  payload,
  thirdAlloc,
  teamGroup,
  groupTeams,
  sfLosers,
  onPickWinner,
  onSetChampion,
  onSetThirdPlace,
  onAllocThird,
  locked,
}: TreeProps) {
  return (
    <div
      className="overflow-x-auto pb-2"
      style={{ scrollbarWidth: "thin" }}
      aria-label="Chaveamento — 16 avos à final"
    >
      {/*
        Layout unilateral esquerda→direita: 5 colunas flexbox lado a lado.
        A coluna "16 avos" (16 confrontos) dita a altura total.
        Cada coluna seguinte usa justify-content: space-around para que os
        confrontos se alinhem verticalmente com os pares de origem — sem
        alturas fixas mágicas.
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
        {/* Coluna 1: 16 avos — 16 confrontos empilhados, dita a altura */}
        <div style={{ width: "210px", flexShrink: 0 }}>
          <PhaseLabel label="16 avos" />
          <div className="flex flex-col gap-2 pt-1">
            {R32_MATCHES.map((m) => (
              <MatchCard
                key={m.match}
                matchNum={m.match}
                slotA={resolveSlotForDisplay(m.home, payload, thirdAlloc, m.match)}
                slotB={resolveSlotForDisplay(m.away, payload, thirdAlloc, m.match)}
                slotALabel={slotLabel(m.home)}
                slotBLabel={slotLabel(m.away)}
                phase="r32_winners"
                payload={payload}
                thirdAlloc={thirdAlloc}
                thirdSlotA={m.home.pos === 3 ? m.home : null}
                thirdSlotB={m.away.pos === 3 ? m.away : null}
                teamGroup={teamGroup}
                groupTeams={groupTeams}
                onPickWinner={onPickWinner}
                onAllocThird={onAllocThird}
                locked={locked}
              />
            ))}
          </div>
        </div>

        {/* Coluna 2: Oitavas — 8 confrontos com espaçamento automático */}
        <div style={{ width: "210px", flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <PhaseLabel label="Oitavas" />
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-around",
              paddingTop: "4px",
            }}
          >
            {R16_MATCHES.map((m) => {
              const [a, b] = resolveParticipantsFromPhase(m.from, "r16_winners", payload, thirdAlloc);
              return (
                <MatchCard
                  key={m.match}
                  matchNum={m.match}
                  slotA={a}
                  slotB={b}
                  slotALabel="—"
                  slotBLabel="—"
                  phase="r16_winners"
                  payload={payload}
                  thirdAlloc={thirdAlloc}
                  thirdSlotA={null}
                  thirdSlotB={null}
                  teamGroup={teamGroup}
                  groupTeams={groupTeams}
                  onPickWinner={onPickWinner}
                  onAllocThird={onAllocThird}
                  locked={locked}
                />
              );
            })}
          </div>
        </div>

        {/* Coluna 3: Quartas — 4 confrontos com espaçamento automático */}
        <div style={{ width: "210px", flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <PhaseLabel label="Quartas" />
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-around",
              paddingTop: "4px",
            }}
          >
            {QF_MATCHES.map((m) => {
              const [a, b] = resolveParticipantsFromPhase(m.from, "qf_winners", payload, thirdAlloc);
              return (
                <MatchCard
                  key={m.match}
                  matchNum={m.match}
                  slotA={a}
                  slotB={b}
                  slotALabel="—"
                  slotBLabel="—"
                  phase="qf_winners"
                  payload={payload}
                  thirdAlloc={thirdAlloc}
                  thirdSlotA={null}
                  thirdSlotB={null}
                  teamGroup={teamGroup}
                  groupTeams={groupTeams}
                  onPickWinner={onPickWinner}
                  onAllocThird={onAllocThird}
                  locked={locked}
                />
              );
            })}
          </div>
        </div>

        {/* Coluna 4: Semis — 2 confrontos com espaçamento automático */}
        <div style={{ width: "210px", flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <PhaseLabel label="Semis" />
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-around",
              paddingTop: "4px",
            }}
          >
            {SF_MATCHES.map((m) => {
              const [a, b] = resolveParticipantsFromPhase(m.from, "sf_winners", payload, thirdAlloc);
              return (
                <MatchCard
                  key={m.match}
                  matchNum={m.match}
                  slotA={a}
                  slotB={b}
                  slotALabel="—"
                  slotBLabel="—"
                  phase="sf_winners"
                  payload={payload}
                  thirdAlloc={thirdAlloc}
                  thirdSlotA={null}
                  thirdSlotB={null}
                  teamGroup={teamGroup}
                  groupTeams={groupTeams}
                  onPickWinner={onPickWinner}
                  onAllocThird={onAllocThird}
                  locked={locked}
                />
              );
            })}
          </div>
        </div>

        {/* Coluna 5: Final + Campeão + 3º lugar */}
        <div style={{ width: "220px", flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <PhaseLabel label="Final" />
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
            {/* Confronto da final */}
            {(() => {
              const [finalA, finalB] = resolveParticipantsFromPhase(FINAL_MATCH.from, "finalists", payload, thirdAlloc);
              return (
                <MatchCard
                  matchNum={FINAL_MATCH.match}
                  slotA={finalA}
                  slotB={finalB}
                  slotALabel="—"
                  slotBLabel="—"
                  phase="finalists"
                  payload={payload}
                  thirdAlloc={thirdAlloc}
                  thirdSlotA={null}
                  thirdSlotB={null}
                  teamGroup={teamGroup}
                  groupTeams={groupTeams}
                  onPickWinner={onPickWinner}
                  onAllocThird={onAllocThird}
                  locked={locked}
                  centerStyle
                />
              );
            })()}

            {/* Campeão */}
            {payload.finalists.length > 0 && (
              <ChampionSlot
                finalists={payload.finalists}
                champion={payload.champion}
                onSetChampion={onSetChampion}
                locked={locked}
              />
            )}

            {/* 3º lugar */}
            <div
              className="pt-2"
              style={{ borderTop: "1px dashed var(--border-subtle)" }}
            >
              <PhaseLabel label="3º lugar" />
              <ThirdPlaceSlot
                sfLosers={sfLosers}
                thirdPlace={payload.third_place}
                onSetThirdPlace={onSetThirdPlace}
                locked={locked}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PhaseLabel ───────────────────────────────────────────────

function PhaseLabel({ label, mirror = false }: { label: string; mirror?: boolean }) {
  return (
    <div
      className="px-2 py-1.5 mb-1"
      style={{ textAlign: mirror ? "right" : "left" }}
    >
      <span
        className="text-[11px] font-bold uppercase tracking-[0.07em]"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </span>
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
  payload: BracketPayload;
  thirdAlloc: Record<number, string>;
  thirdSlotA: { pos: 3; groups: string[] } | null;
  thirdSlotB: { pos: 3; groups: string[] } | null;
  teamGroup: Record<string, string>;
  groupTeams: Record<string, string[]>;
  onPickWinner: (team: string, phase: Phase) => void;
  onAllocThird: (matchNum: number, team: string) => void;
  locked: boolean;
  centerStyle?: boolean;
}

function MatchCard({
  matchNum,
  slotA,
  slotB,
  slotALabel,
  slotBLabel,
  phase,
  payload,
  thirdAlloc,
  thirdSlotA,
  thirdSlotB,
  teamGroup,
  groupTeams,
  onPickWinner,
  onAllocThird,
  locked,
  centerStyle = false,
}: MatchCardProps) {
  const [showThirdPicker, setShowThirdPicker] = useState<"home" | "away" | null>(null);

  const winnerInPhase = (team: string | null): boolean => {
    if (!team) return false;
    return payload[phase].includes(team);
  };

  // Times disponíveis para alocar num slot de 3º
  function getThirdCandidates(slot: { pos: 3; groups: string[] }): string[] {
    return payload.third_qualifiers.filter((t) => {
      const g = teamGroup[t];
      if (!g) return false;
      if (!slot.groups.includes(g)) return false;
      // Não alocado em outro jogo (exceto este)
      const allocatedElsewhere = Object.entries(thirdAlloc).some(
        ([k, v]) => v === t && Number(k) !== matchNum
      );
      return !allocatedElsewhere;
    });
  }

  const isWinnerA = winnerInPhase(slotA);
  const isWinnerB = winnerInPhase(slotB);

  // Para slot de 3º, tocar abre picker se há candidatos
  function handleSlotATap() {
    if (locked) return;
    if (thirdSlotA) {
      setShowThirdPicker(showThirdPicker === "home" ? null : "home");
      return;
    }
    if (slotA) onPickWinner(slotA, phase);
  }

  function handleSlotBTap() {
    if (locked) return;
    if (thirdSlotB) {
      setShowThirdPicker(showThirdPicker === "away" ? null : "away");
      return;
    }
    if (slotB) onPickWinner(slotB, phase);
  }

  const thirdCandidatesA = thirdSlotA ? getThirdCandidates(thirdSlotA) : [];
  const thirdCandidatesB = thirdSlotB ? getThirdCandidates(thirdSlotB) : [];

  return (
    <div
      className="flex flex-col gap-0 mb-2"
      style={{ position: "relative" }}
    >
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
        <div
          className="px-2 pt-1.5 pb-0"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
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
          onClick={slotA || thirdSlotA ? handleSlotATap : undefined}
          locked={locked}
        />

        {/* Divisor */}
        <div
          className="mx-2 h-px"
          style={{ background: "var(--border-subtle)" }}
          aria-hidden="true"
        />

        {/* Slot B (away) */}
        <MatchSlotRow
          team={slotB}
          label={slotBLabel}
          isWinner={isWinnerB}
          isLoser={isWinnerA && !isWinnerB && slotB !== null}
          isThird={Boolean(thirdSlotB)}
          allocated={thirdSlotB ? Boolean(slotB) : false}
          onClick={slotB || thirdSlotB ? handleSlotBTap : undefined}
          locked={locked}
        />
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
  onClick,
  locked,
}: {
  team: string | null;
  label: string;
  isWinner: boolean;
  isLoser: boolean;
  isThird: boolean;
  allocated: boolean;
  onClick?: () => void;
  locked: boolean;
}) {
  const isEmpty = !team;

  const bg = isWinner
    ? "var(--color-accent)"
    : "transparent";

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
      <span
        className="text-[13px] flex-shrink-0"
        aria-hidden="true"
        style={{ opacity: isEmpty ? 0.35 : 1 }}
      >
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
          <span style={{ opacity: 0.5 }}>
            {isThird && !allocated ? "3º — toque" : label}
          </span>
        )}
      </span>

      {/* Indicador de vencedor */}
      {isWinner && (
        <span
          className="text-[9px] font-bold flex-shrink-0 ml-0.5 px-1 py-0.5 rounded-badge"
          style={{ background: "rgba(255,255,255,0.25)", color: "#fff" }}
          aria-hidden="true"
        >
          W
        </span>
      )}
    </button>
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
      <div
        className="px-2 py-1"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
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
              current === t
                ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                : "transparent",
            color:
              current === t
                ? "var(--color-accent)"
                : "var(--color-text-primary)",
            minHeight: "40px",
          }}
        >
          <span className="text-[13px]" aria-hidden="true">
            {getFlag(t)}
          </span>
          <span className="text-[11px] font-medium">{t}</span>
          {current === t && (
            <span
              className="ml-auto text-[10px] font-bold"
              style={{ color: "var(--color-accent)" }}
            >
              ✓
            </span>
          )}
        </button>
      ))}
      <button
        onClick={onClose}
        className="w-full px-2 py-1.5 text-[10px] font-medium"
        style={{
          color: "var(--color-text-secondary)",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        Cancelar
      </button>
    </div>
  );
}

// ─── ChampionSlot ─────────────────────────────────────────────

function ChampionSlot({
  finalists,
  champion,
  onSetChampion,
  locked,
}: {
  finalists: string[];
  champion: string;
  onSetChampion: (t: string) => void;
  locked: boolean;
}) {
  return (
    <div
      className="w-full rounded-card overflow-hidden mt-1"
      style={{
        border: champion
          ? `2px solid var(--color-gold)`
          : "1.5px dashed var(--border-subtle)",
        boxShadow: champion ? "var(--shadow-gold)" : "none",
        minWidth: "200px",
      }}
    >
      <div
        className="px-2 py-1"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-[0.05em]"
          style={{ color: "var(--color-gold)" }}
        >
          Campeão
        </span>
      </div>
      {finalists.map((t) => (
        <button
          key={t}
          onClick={() => !locked && onSetChampion(t)}
          disabled={locked}
          className="w-full flex items-center gap-2 px-2 py-2 transition-all"
          style={{
            background:
              champion === t
                ? "color-mix(in srgb, var(--color-gold) 15%, transparent)"
                : "transparent",
            minHeight: "44px",
          }}
          aria-pressed={champion === t}
        >
          <span className="text-[14px]" aria-hidden="true">
            {getFlag(t)}
          </span>
          <span
            className="text-[12px] font-semibold flex-1"
            style={{
              color: champion === t ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              fontWeight: champion === t ? 700 : 500,
            }}
          >
            {t}
          </span>
          {champion === t && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-badge"
              style={{ background: "var(--color-gold)", color: "#1D1D1F" }}
              aria-hidden="true"
            >
              Campeão
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── ThirdPlaceSlot ───────────────────────────────────────────

function ThirdPlaceSlot({
  sfLosers,
  thirdPlace,
  onSetThirdPlace,
  locked,
}: {
  sfLosers: string[];
  thirdPlace: string;
  onSetThirdPlace: (t: string) => void;
  locked: boolean;
}) {
  if (sfLosers.length === 0) {
    return (
      <div
        className="mt-1 px-2 py-2 rounded-button text-center"
        style={{ background: "var(--color-bg-secondary)" }}
      >
        <span
          className="text-[11px]"
          style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}
        >
          Aguardando semis
        </span>
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-card overflow-hidden mt-1"
      style={{
        border: "1px solid var(--border-subtle)",
        minWidth: "200px",
      }}
    >
      {sfLosers.map((t) => (
        <button
          key={t}
          onClick={() => !locked && onSetThirdPlace(t)}
          disabled={locked}
          className="w-full flex items-center gap-2 px-2 py-2 transition-all"
          style={{
            background:
              thirdPlace === t
                ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                : "transparent",
            minHeight: "40px",
          }}
          aria-pressed={thirdPlace === t}
        >
          <span className="text-[13px]" aria-hidden="true">
            {getFlag(t)}
          </span>
          <span
            className="text-[11px] font-medium flex-1"
            style={{
              color: thirdPlace === t ? "var(--color-accent)" : "var(--color-text-secondary)",
              fontWeight: thirdPlace === t ? 700 : 400,
            }}
          >
            {t}
          </span>
          {thirdPlace === t && (
            <span
              className="text-[9px] font-bold px-1 py-0.5 rounded-badge"
              style={{ background: "var(--color-accent)", color: "#fff" }}
              aria-hidden="true"
            >
              3º
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Mobile: accordion por fase ───────────────────────────────

const MOBILE_PHASES = [
  { id: "r32", label: "16 avos", description: "Quem avança dos 16 avos?" },
  { id: "r16", label: "Oitavas", description: "Quem vai às quartas?" },
  { id: "qf", label: "Quartas", description: "Quem vai às semis?" },
  { id: "sf", label: "Semis", description: "Quem vai à final?" },
  { id: "final", label: "Final + 3º", description: "Finalistas, campeão e 3º lugar" },
] as const;

function MobileBracket({
  payload,
  thirdAlloc,
  teamGroup,
  groupTeams,
  sfLosers,
  activePhase,
  onPhaseChange,
  onPickWinner,
  onSetChampion,
  onSetThirdPlace,
  onAllocThird,
  locked,
}: TreeProps & {
  activePhase: string;
  onPhaseChange: (p: string) => void;
}) {
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
              background:
                activePhase === p.id
                  ? "var(--color-accent)"
                  : "var(--color-bg-secondary)",
              color:
                activePhase === p.id ? "#fff" : "var(--color-text-secondary)",
              minHeight: "36px",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da fase ativa */}
      <div role="tabpanel" aria-label={`Fase: ${activePhase}`}>
        {activePhase === "r32" && (
          <MobilePhaseGrid
            matches={R32_MATCHES.map((m) => ({
              matchNum: m.match,
              slotA: resolveSlotForDisplay(m.home, payload, thirdAlloc, m.match),
              slotB: resolveSlotForDisplay(m.away, payload, thirdAlloc, m.match),
              slotALabel: slotLabel(m.home),
              slotBLabel: slotLabel(m.away),
              phase: "r32_winners" as Phase,
              thirdSlotA: m.home.pos === 3 ? (m.home as { pos: 3; groups: string[] }) : null,
              thirdSlotB: m.away.pos === 3 ? (m.away as { pos: 3; groups: string[] }) : null,
            }))}
            payload={payload}
            thirdAlloc={thirdAlloc}
            teamGroup={teamGroup}
            groupTeams={groupTeams}
            onPickWinner={onPickWinner}
            onAllocThird={onAllocThird}
            locked={locked}
          />
        )}

        {activePhase === "r16" && (
          <MobilePhaseGrid
            matches={R16_MATCHES.map((m) => {
              const [a, b] = resolveParticipantsFromPhase(m.from, "r16_winners", payload, thirdAlloc);
              return {
                matchNum: m.match,
                slotA: a,
                slotB: b,
                slotALabel: "A definir",
                slotBLabel: "A definir",
                phase: "r16_winners" as Phase,
                thirdSlotA: null,
                thirdSlotB: null,
              };
            })}
            payload={payload}
            thirdAlloc={thirdAlloc}
            teamGroup={teamGroup}
            groupTeams={groupTeams}
            onPickWinner={onPickWinner}
            onAllocThird={onAllocThird}
            locked={locked}
          />
        )}

        {activePhase === "qf" && (
          <MobilePhaseGrid
            matches={QF_MATCHES.map((m) => {
              const [a, b] = resolveParticipantsFromPhase(m.from, "qf_winners", payload, thirdAlloc);
              return {
                matchNum: m.match,
                slotA: a,
                slotB: b,
                slotALabel: "A definir",
                slotBLabel: "A definir",
                phase: "qf_winners" as Phase,
                thirdSlotA: null,
                thirdSlotB: null,
              };
            })}
            payload={payload}
            thirdAlloc={thirdAlloc}
            teamGroup={teamGroup}
            groupTeams={groupTeams}
            onPickWinner={onPickWinner}
            onAllocThird={onAllocThird}
            locked={locked}
          />
        )}

        {activePhase === "sf" && (
          <MobilePhaseGrid
            matches={SF_MATCHES.map((m) => {
              const [a, b] = resolveParticipantsFromPhase(m.from, "sf_winners", payload, thirdAlloc);
              return {
                matchNum: m.match,
                slotA: a,
                slotB: b,
                slotALabel: "A definir",
                slotBLabel: "A definir",
                phase: "sf_winners" as Phase,
                thirdSlotA: null,
                thirdSlotB: null,
              };
            })}
            payload={payload}
            thirdAlloc={thirdAlloc}
            teamGroup={teamGroup}
            groupTeams={groupTeams}
            onPickWinner={onPickWinner}
            onAllocThird={onAllocThird}
            locked={locked}
          />
        )}

        {activePhase === "final" && (
          <MobileFinalPhase
            payload={payload}
            thirdAlloc={thirdAlloc}
            sfLosers={sfLosers}
            teamGroup={teamGroup}
            groupTeams={groupTeams}
            onPickWinner={onPickWinner}
            onSetChampion={onSetChampion}
            onSetThirdPlace={onSetThirdPlace}
            onAllocThird={onAllocThird}
            locked={locked}
          />
        )}
      </div>
    </div>
  );
}

interface MobileMatchItem {
  matchNum: number;
  slotA: string | null;
  slotB: string | null;
  slotALabel: string;
  slotBLabel: string;
  phase: Phase;
  thirdSlotA: { pos: 3; groups: string[] } | null;
  thirdSlotB: { pos: 3; groups: string[] } | null;
}

function MobilePhaseGrid({
  matches,
  payload,
  thirdAlloc,
  teamGroup,
  groupTeams,
  onPickWinner,
  onAllocThird,
  locked,
}: {
  matches: MobileMatchItem[];
  payload: BracketPayload;
  thirdAlloc: Record<number, string>;
  teamGroup: Record<string, string>;
  groupTeams: Record<string, string[]>;
  onPickWinner: (team: string, phase: Phase) => void;
  onAllocThird: (matchNum: number, team: string) => void;
  locked: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {matches.map((m) => (
        <MatchCard
          key={m.matchNum}
          matchNum={m.matchNum}
          slotA={m.slotA}
          slotB={m.slotB}
          slotALabel={m.slotALabel}
          slotBLabel={m.slotBLabel}
          phase={m.phase}
          payload={payload}
          thirdAlloc={thirdAlloc}
          thirdSlotA={m.thirdSlotA}
          thirdSlotB={m.thirdSlotB}
          teamGroup={teamGroup}
          groupTeams={groupTeams}
          onPickWinner={onPickWinner}
          onAllocThird={onAllocThird}
          locked={locked}
          centerStyle
        />
      ))}
    </div>
  );
}

function MobileFinalPhase({
  payload,
  thirdAlloc,
  sfLosers,
  teamGroup,
  groupTeams,
  onPickWinner,
  onSetChampion,
  onSetThirdPlace,
  onAllocThird,
  locked,
}: {
  payload: BracketPayload;
  thirdAlloc: Record<number, string>;
  sfLosers: string[];
  teamGroup: Record<string, string>;
  groupTeams: Record<string, string[]>;
  onPickWinner: (team: string, phase: Phase) => void;
  onSetChampion: (t: string) => void;
  onSetThirdPlace: (t: string) => void;
  onAllocThird: (matchNum: number, team: string) => void;
  locked: boolean;
}) {
  const [finalA, finalB] = resolveParticipantsFromPhase(FINAL_MATCH.from, "finalists", payload, thirdAlloc);

  return (
    <div className="flex flex-col gap-3">
      {/* Final */}
      <MatchCard
        matchNum={FINAL_MATCH.match}
        slotA={finalA}
        slotB={finalB}
        slotALabel="A definir"
        slotBLabel="A definir"
        phase="finalists"
        payload={payload}
        thirdAlloc={thirdAlloc}
        thirdSlotA={null}
        thirdSlotB={null}
        teamGroup={teamGroup}
        groupTeams={groupTeams}
        onPickWinner={onPickWinner}
        onAllocThird={onAllocThird}
        locked={locked}
        centerStyle
      />

      {/* Campeão */}
      {payload.finalists.length > 0 && (
        <ChampionSlot
          finalists={payload.finalists}
          champion={payload.champion}
          onSetChampion={onSetChampion}
          locked={locked}
        />
      )}

      {/* 3º lugar */}
      <div>
        <span
          className="text-[12px] font-semibold mb-2 block"
          style={{ color: "var(--color-text-secondary)" }}
        >
          3º lugar
        </span>
        <ThirdPlaceSlot
          sfLosers={sfLosers}
          thirdPlace={payload.third_place}
          onSetThirdPlace={onSetThirdPlace}
          locked={locked}
        />
      </div>
    </div>
  );
}

// ─── Helper de display ────────────────────────────────────────

function resolveSlotForDisplay(
  slot: R32Match["home"] | R32Match["away"],
  payload: BracketPayload,
  thirdAlloc: Record<number, string>,
  matchNum: number,
): string | null {
  return resolveSlot(slot, payload, thirdAlloc, matchNum);
}

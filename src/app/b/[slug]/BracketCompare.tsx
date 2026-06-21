"use client";

/**
 * BracketCompare — árvore de chaveamento READ-ONLY com comparação.
 *
 * Mostra visualmente o caminho do mata-mata (16 avos → Final) de UM competidor
 * e, opcionalmente, confronta com OUTRO: em cada vaga, marca se o segundo
 * competidor também colocou aquela seleção avançando naquela fase. Filtro de
 * fase foca a coluna (essencial no mobile). Só leitura — a edição é no
 * KnockoutTreeEditor.
 */

import { useMemo, useState } from "react";
import {
  R32_MATCHES,
  R16_MATCHES,
  QF_MATCHES,
  SF_MATCHES,
  FINAL_MATCH,
  slotLabel,
} from "@/lib/scoring/wc26-pairings";
import {
  resolveSlot,
  participantsOf,
  autoThirdAlloc,
  teamGroupFromGroups,
  type KnockoutTreePayload,
  type Phase,
  type Round,
} from "@/lib/scoring/bracket-tree";
import { getFlag } from "@/lib/utils";
import type { BracketOutcome, BracketPoints } from "@/lib/scoring";
import type { BracketEntry } from "./MegaBracket";

interface Props {
  allBrackets: BracketEntry[];
  currentUserId: string;
  groupTeams: Record<string, string[]>;
  /** Resultado real do torneio — se presente, habilita pontuação por acerto. */
  outcome?: BracketOutcome;
  /** Pontos por fase do ruleset. */
  bracketPoints?: BracketPoints;
}

// Colunas da árvore. `phase` = onde o vencedor do confronto é gravado.
type ColKey = "r32" | "r16" | "qf" | "sf" | "final";
const COLUMNS: {
  key: ColKey;
  label: string;
  /** Fase do payload onde fica o vencedor (champion p/ a final). */
  phase: Phase | "champion";
  round: Round | null; // null = 16 avos (resolvidos por slot, não por feeder)
}[] = [
  { key: "r32", label: "16 avos", phase: "r16_winners", round: null },
  { key: "r16", label: "Oitavas", phase: "qf_winners", round: "r16" },
  { key: "qf", label: "Quartas", phase: "sf_winners", round: "qf" },
  { key: "sf", label: "Semis", phase: "finalists", round: "sf" },
  { key: "final", label: "Final", phase: "champion", round: "final" },
];

interface Confronto {
  matchNum: number;
  a: string | null;
  b: string | null;
  labelA: string;
  labelB: string;
}

/** Resolve os confrontos de uma coluna para um payload. */
function confrontosDaColuna(
  col: ColKey,
  payload: KnockoutTreePayload,
  thirdAlloc: Record<number, string>
): Confronto[] {
  if (col === "r32") {
    return R32_MATCHES.map((m) => ({
      matchNum: m.match,
      a: resolveSlot(m.home, payload, thirdAlloc, m.match),
      b: resolveSlot(m.away, payload, thirdAlloc, m.match),
      labelA: slotLabel(m.home),
      labelB: slotLabel(m.away),
    }));
  }
  const matches =
    col === "r16" ? R16_MATCHES : col === "qf" ? QF_MATCHES : col === "sf" ? SF_MATCHES : [FINAL_MATCH];
  const round: Round = col === "r16" ? "r16" : col === "qf" ? "qf" : col === "sf" ? "sf" : "final";
  return matches.map((m) => {
    const [a, b] = participantsOf(round, m.from, payload, thirdAlloc);
    return { matchNum: m.match, a, b, labelA: "—", labelB: "—" };
  });
}

/** O time venceu este confronto (segundo o payload)? */
function venceu(team: string | null, phase: Phase | "champion", p: KnockoutTreePayload): boolean {
  if (!team) return false;
  if (phase === "champion") return p.champion === team;
  return p[phase].includes(team);
}

/** Quem o payload colocou avançando neste confronto (o vencedor da vaga). */
function winnerOf(c: Confronto, phase: Phase | "champion", p: KnockoutTreePayload): string | null {
  if (venceu(c.a, phase, p)) return c.a;
  if (venceu(c.b, phase, p)) return c.b;
  return null;
}

function teamsAdvancing(phase: Phase | "champion", p: KnockoutTreePayload): string[] {
  if (phase === "champion") return p.champion ? [p.champion] : [];
  return p[phase];
}

// ─── Pontuação por acerto ─────────────────────────────────────
// Espelha exatamente o scoreBracket (src/lib/scoring/bracket.ts): cada coluna do
// mata-mata pontua "seleção presente na fase de destino"; grupos pontuam
// classificado + posição exata. Fonte única de valores = bracketPoints (ruleset).

interface CellScore {
  /** Pontos que este palpite rendeu (0 se errou ou fase não resolvida). */
  earned: number;
  /** A fase/grupo já foi decidida no torneio real? */
  resolved: boolean;
  /** Acertou (rendeu > 0)? */
  hit: boolean;
}

/** Por coluna de mata-mata: conjunto do outcome que confirma o pick + quanto vale. */
const KO_SCORE: Record<
  ColKey,
  { teams: (o: BracketOutcome) => string[]; pts: (p: BracketPoints) => number; resolved: (o: BracketOutcome) => boolean }
> = {
  r32: { teams: (o) => o.r16_teams, pts: (p) => p.r16, resolved: (o) => o.r16_teams.length > 0 },
  r16: { teams: (o) => o.qf_teams, pts: (p) => p.qf, resolved: (o) => o.qf_teams.length > 0 },
  qf: { teams: (o) => o.sf_teams, pts: (p) => p.sf, resolved: (o) => o.sf_teams.length > 0 },
  sf: { teams: (o) => o.finalists, pts: (p) => p.final, resolved: (o) => o.finalists.length > 0 },
  final: { teams: (o) => (o.champion ? [o.champion] : []), pts: (p) => p.champion, resolved: (o) => o.champion !== null },
};

function koCellScore(
  col: ColKey,
  team: string | null,
  outcome?: BracketOutcome,
  points?: BracketPoints
): CellScore | null {
  if (!team || !outcome || !points) return null;
  const def = KO_SCORE[col];
  if (!def.resolved(outcome)) return { earned: 0, resolved: false, hit: false };
  const hit = def.teams(outcome).some((t) => norm(t) === norm(team));
  return { earned: hit ? def.pts(points) : 0, resolved: true, hit };
}

function groupCellScore(
  groupCode: string,
  team: string | null,
  pos: number,
  outcome?: BracketOutcome,
  points?: BracketPoints
): CellScore | null {
  if (!team || !outcome || !points) return null;
  const actual = outcome.groups[groupCode];
  if (!actual) return { earned: 0, resolved: false, hit: false };
  let earned = 0;
  if (points.group_qualified > 0 && outcome.qualified.some((t) => norm(t) === norm(team))) {
    earned += points.group_qualified;
  }
  const atPos = pos === 0 ? actual.first : actual.second;
  if (points.group_position_exact > 0 && atPos && norm(atPos) === norm(team)) {
    earned += points.group_position_exact;
  }
  return { earned, resolved: true, hit: earned > 0 };
}

/** Badge "+N" verde quando acertou; vazio se errou/pendente. */
function PointsBadge({ score }: { score: CellScore | null }) {
  if (!score || !score.resolved || score.earned <= 0) return null;
  return (
    <span
      className="text-[10px] font-bold tabular-nums px-1 py-0.5 rounded-badge flex-shrink-0"
      style={{ background: "color-mix(in srgb, var(--color-success) 18%, transparent)", color: "var(--color-success)" }}
    >
      +{score.earned}
    </span>
  );
}

export default function BracketCompare({ allBrackets, currentUserId, groupTeams, outcome, bracketPoints }: Props) {
  const teamGroup = useMemo(() => teamGroupFromGroups(groupTeams), [groupTeams]);
  // Só mostra a coluna de pontos quando temos o resultado real + a tabela de pontos.
  const scoringOn = !!outcome && !!bracketPoints;

  // Você primeiro, depois alfabético.
  const options = useMemo(() => {
    return [...allBrackets]
      .sort((a, b) => {
        if (a.user_id === currentUserId) return -1;
        if (b.user_id === currentUserId) return 1;
        return a.name.localeCompare(b.name, "pt-BR");
      })
      .map((e) => ({
        id: e.user_id,
        label: e.user_id === currentUserId ? "Você" : e.name,
        payload: e.payload as unknown as KnockoutTreePayload,
      }));
  }, [allBrackets, currentUserId]);

  const [aId, setAId] = useState<string>(() => options[0]?.id ?? "");
  const [bId, setBId] = useState<string>(""); // "" = não comparar
  const [colFilter, setColFilter] = useState<ColKey | "all" | "groups">("all");
  const [viewMode, setViewMode] = useState<"arvore" | "tabela">("arvore");

  // Códigos de grupo presentes nos palpites (A, B, C, …), ordenados.
  const groupCodes = useMemo(() => {
    const set = new Set<string>();
    for (const o of options) {
      for (const g of Object.keys((o.payload.groups as Record<string, string[]>) ?? {})) set.add(g);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [options]);

  const a = options.find((o) => o.id === aId) ?? options[0];
  const b = bId ? options.find((o) => o.id === bId) ?? null : null;

  const aAlloc = useMemo(
    () => (a ? autoThirdAlloc(a.payload, teamGroup) : {}),
    [a, teamGroup]
  );
  const bAlloc = useMemo(
    () => (b ? autoThirdAlloc(b.payload, teamGroup) : {}),
    [b, teamGroup]
  );

  // Resumo de concordância por fase (só quando comparando).
  const agreement = useMemo(() => {
    if (!a || !b) return null;
    return COLUMNS.map((col) => {
      const aTeams = teamsAdvancing(col.phase, a.payload);
      const bTeams = teamsAdvancing(col.phase, b.payload);
      const shared = aTeams.filter((t) => bTeams.includes(t)).length;
      return { key: col.key, label: col.label, shared, total: aTeams.length };
    });
  }, [a, b]);

  if (options.length === 0 || !a) return null;

  const visibleCols = colFilter === "all" ? COLUMNS : COLUMNS.filter((c) => c.key === colFilter);
  // Tabela de grupos (classificação 1º/2º) aparece em "Todas as fases" no modo
  // tabela, ou sempre que o filtro "Grupos" estiver selecionado.
  const showGroupsTable =
    groupCodes.length > 0 &&
    (colFilter === "all" || colFilter === "groups") &&
    (viewMode === "tabela" || colFilter === "groups");

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-[15px] font-bold" style={{ color: "var(--color-text-primary)" }}>
          Árvore de cada um 🌳
        </h3>
        <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
          {viewMode === "arvore"
            ? "O caminho de mata-mata até o título. Escolha um competidor e, se quiser, compare com outro."
            : "Todo mundo lado a lado — uma coluna por participante. Inclui a classificação dos grupos (1º/2º) e cada fase do mata-mata."}
          {scoringOn && (
            <>
              {" "}
              <span style={{ color: "var(--color-success)", fontWeight: 600 }}>+N</span> = pontos que o acerto já rendeu.
            </>
          )}
        </p>
      </div>

      {/* Toggle de modo: 1×1 (árvore) vs todos (tabela) */}
      <div className="flex p-1 rounded-button self-start" style={{ background: "var(--color-bg-secondary)" }} role="tablist" aria-label="Modo de comparação">
        {(
          [
            ["arvore", "Árvore (1×1)"],
            ["tabela", "Tabela (todos)"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={viewMode === key}
            onClick={() => setViewMode(key)}
            className="px-3 py-1.5 rounded text-[12px] font-semibold transition-all"
            style={{
              background: viewMode === key ? "var(--color-bg-card)" : "transparent",
              color: viewMode === key ? "var(--color-accent)" : "var(--color-text-secondary)",
              boxShadow: viewMode === key ? "var(--shadow-card)" : "none",
              borderRadius: "6px",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Seletores de competidor (só no modo árvore) */}
      {viewMode === "arvore" && (
        <div className="flex flex-wrap items-center gap-2">
          <CompetitorSelect
            label="Ver"
            value={aId}
            options={options.filter((o) => o.id !== bId)}
            onChange={setAId}
          />
          <span className="text-[12px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
            comparar com
          </span>
          <CompetitorSelect
            label="—"
            value={bId}
            options={options.filter((o) => o.id !== aId)}
            onChange={setBId}
            allowNone
          />
        </div>
      )}

      {/* Resumo de concordância */}
      {viewMode === "arvore" && agreement && b && (
        <div
          className="flex flex-wrap gap-1.5 px-3 py-2 rounded-card"
          style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
        >
          <span className="text-[12px] font-semibold mr-1" style={{ color: "var(--color-text-secondary)" }}>
            {a.label} × {b.label}:
          </span>
          {agreement.map((g) => (
            <span
              key={g.key}
              className="text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded-badge"
              style={{
                background: "var(--color-bg-secondary)",
                color: g.shared === g.total && g.total > 0 ? "var(--color-success)" : "var(--color-text-secondary)",
              }}
              title={`Concordam em ${g.shared} de ${g.total} vagas nas ${g.label.toLowerCase()}`}
            >
              {g.label} {g.shared}/{g.total}
            </span>
          ))}
        </div>
      )}

      {/* Filtro de fase */}
      <div className="flex overflow-x-auto gap-1 pb-1" style={{ scrollbarWidth: "none" }} role="tablist" aria-label="Fase do mata-mata">
        {([
          ["all", viewMode === "tabela" ? "Todas as fases" : "Árvore inteira"] as const,
          ...(groupCodes.length > 0 ? ([["groups", "Grupos"]] as const) : []),
          ...COLUMNS.map((c) => [c.key, c.label] as const),
        ]).map(
          ([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={colFilter === key}
              onClick={() => setColFilter(key as ColKey | "all" | "groups")}
              className="flex-shrink-0 px-3 py-1.5 rounded-button text-[12px] font-semibold transition-all"
              style={{
                background: colFilter === key ? "var(--color-accent)" : "var(--color-bg-secondary)",
                color: colFilter === key ? "#fff" : "var(--color-text-secondary)",
                minHeight: "34px",
              }}
            >
              {label}
            </button>
          )
        )}
      </div>

      {/* Classificação dos grupos (1º/2º) — todos lado a lado */}
      {showGroupsTable && (
        <GroupsGrid
          options={options}
          groupCodes={groupCodes}
          currentUserId={currentUserId}
          outcome={outcome}
          bracketPoints={bracketPoints}
        />
      )}

      {/* Tabela — todos os participantes lado a lado */}
      {viewMode === "tabela" && visibleCols.length > 0 && (
        <CompareGrid
          options={options}
          teamGroup={teamGroup}
          cols={visibleCols}
          currentUserId={currentUserId}
          outcome={outcome}
          bracketPoints={bracketPoints}
        />
      )}

      {/* Árvore */}
      {viewMode === "arvore" && colFilter !== "groups" && (
      <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }} aria-label="Chaveamento comparativo">
        <div
          className="flex flex-row items-stretch"
          style={{ gap: "8px", minWidth: colFilter === "all" ? "1080px" : "auto" }}
        >
          {visibleCols.map((col) => {
            const confrontos = confrontosDaColuna(col.key, a.payload, aAlloc);
            const isFinal = col.key === "final";
            // Vencedor de B na MESMA vaga (mesmo jogo) — pra mostrar quem o outro colocou.
            const bWinnerByMatch = new Map<number, string | null>();
            if (b) {
              for (const bc of confrontosDaColuna(col.key, b.payload, bAlloc)) {
                bWinnerByMatch.set(bc.matchNum, winnerOf(bc, col.phase, b.payload));
              }
            }
            return (
              <div
                key={col.key}
                style={{
                  width: colFilter === "all" ? (isFinal ? "220px" : "208px") : "100%",
                  maxWidth: colFilter === "all" ? undefined : "420px",
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  margin: colFilter === "all" ? undefined : "0 auto",
                }}
              >
                <ColumnLabel label={col.label} />
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: col.key === "r32" ? "flex-start" : "space-around",
                    gap: col.key === "r32" || colFilter !== "all" ? "8px" : "0",
                    paddingTop: "4px",
                  }}
                >
                  {confrontos.map((c) => (
                    <ConfrontoCard
                      key={c.matchNum}
                      confronto={c}
                      phase={col.phase}
                      aPayload={a.payload}
                      bWinner={b ? bWinnerByMatch.get(c.matchNum) ?? null : undefined}
                      bLabel={b?.label ?? null}
                      isFinal={isFinal}
                      colKey={col.key}
                      outcome={outcome}
                      bracketPoints={bracketPoints}
                    />
                  ))}
                  {isFinal && a.payload.champion && (
                    <ChampionRow
                      champion={a.payload.champion}
                      score={koCellScore("final", a.payload.champion, outcome, bracketPoints)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </section>
  );
}

// ─── Tabela: todos os participantes lado a lado ───────────────

function CompareGrid({
  options,
  teamGroup,
  cols,
  currentUserId,
  outcome,
  bracketPoints,
}: {
  options: { id: string; label: string; payload: KnockoutTreePayload }[];
  teamGroup: Record<string, string>;
  cols: { key: ColKey; label: string; phase: Phase | "champion"; round: Round | null }[];
  currentUserId: string;
  outcome?: BracketOutcome;
  bracketPoints?: BracketPoints;
}) {
  // Vencedor de cada participante por (coluna, matchNum).
  const winnersByUser = useMemo(() => {
    return options.map((o) => {
      const alloc = autoThirdAlloc(o.payload, teamGroup);
      const byCol: Record<string, Map<number, string | null>> = {};
      for (const col of cols) {
        const m = new Map<number, string | null>();
        for (const c of confrontosDaColuna(col.key, o.payload, alloc)) {
          m.set(c.matchNum, winnerOf(c, col.phase, o.payload));
        }
        byCol[col.key] = m;
      }
      return { id: o.id, label: o.label, byCol };
    });
  }, [options, teamGroup, cols]);

  return (
    <div className="flex flex-col gap-4">
      {cols.map((col) => {
        const matchNums = confrontosDaColuna(col.key, options[0].payload, autoThirdAlloc(options[0].payload, teamGroup)).map(
          (c) => c.matchNum
        );
        return (
          <div key={col.key}>
            <ColumnLabel label={col.label} />
            <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
              <table className="border-separate" style={{ borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th
                      className="sticky left-0 z-10 text-left text-[10px] font-bold uppercase px-2 py-1.5"
                      style={{ background: "var(--color-bg-primary)", color: "var(--color-text-secondary)", minWidth: "56px" }}
                    >
                      {col.key === "final" ? "🏆" : "Jogo"}
                    </th>
                    {winnersByUser.map((u) => (
                      <th
                        key={u.id}
                        className="text-left text-[11px] font-bold px-2 py-1.5 whitespace-nowrap"
                        style={{ color: u.id === currentUserId ? "var(--color-accent)" : "var(--color-text-primary)", minWidth: "104px" }}
                      >
                        {u.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matchNums.map((mn) => {
                    // consenso da linha: time mais frequente
                    const picks = winnersByUser.map((u) => u.byCol[col.key]?.get(mn) ?? null);
                    const freq = new Map<string, number>();
                    for (const p of picks) if (p) freq.set(p, (freq.get(p) ?? 0) + 1);
                    let top: string | null = null;
                    let topN = 0;
                    for (const [t, n] of freq) if (n > topN) { top = t; topN = n; }
                    const allAgree = freq.size === 1 && picks.every(Boolean);
                    return (
                      <tr key={mn}>
                        <td
                          className="sticky left-0 z-10 text-[10px] font-semibold tabular-nums px-2 py-1.5"
                          style={{ background: "var(--color-bg-card)", color: "var(--color-text-secondary)", borderTop: "1px solid var(--border-subtle)" }}
                        >
                          {col.key === "final" ? "Campeão" : mn}
                        </td>
                        {winnersByUser.map((u) => {
                          const pick = u.byCol[col.key]?.get(mn) ?? null;
                          const isTop = pick !== null && pick === top;
                          const cellBg = allAgree
                            ? "color-mix(in srgb, var(--color-success) 10%, var(--color-bg-card))"
                            : pick && !isTop
                              ? "color-mix(in srgb, var(--color-warning, #C77700) 14%, var(--color-bg-card))"
                              : "var(--color-bg-card)";
                          return (
                            <td
                              key={u.id}
                              className="px-2 py-1.5"
                              style={{ background: cellBg, borderTop: "1px solid var(--border-subtle)" }}
                            >
                              {pick ? (
                                <span className="inline-flex items-center gap-1 text-[11px] whitespace-nowrap" style={{ color: "var(--color-text-primary)" }}>
                                  <span aria-hidden="true">{getFlag(pick)}</span>
                                  <span className="truncate" style={{ maxWidth: 88 }}>{pick}</span>
                                  <PointsBadge score={koCellScore(col.key, pick, outcome, bracketPoints)} />
                                </span>
                              ) : (
                                <span className="text-[11px]" style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}>—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Grupos: classificação 1º/2º de todos lado a lado ─────────

function GroupsGrid({
  options,
  groupCodes,
  currentUserId,
  outcome,
  bracketPoints,
}: {
  options: { id: string; label: string; payload: KnockoutTreePayload }[];
  groupCodes: string[];
  currentUserId: string;
  outcome?: BracketOutcome;
  bracketPoints?: BracketPoints;
}) {
  return (
    <div>
      <ColumnLabel label="Classificação dos grupos (1º e 2º)" />
      <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
        <table className="border-separate" style={{ borderSpacing: 0 }}>
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 text-left text-[10px] font-bold uppercase px-2 py-1.5"
                style={{ background: "var(--color-bg-primary)", color: "var(--color-text-secondary)", minWidth: "64px" }}
              >
                Grupo
              </th>
              {options.map((u) => (
                <th
                  key={u.id}
                  className="text-left text-[11px] font-bold px-2 py-1.5 whitespace-nowrap"
                  style={{ color: u.id === currentUserId ? "var(--color-accent)" : "var(--color-text-primary)", minWidth: "112px" }}
                >
                  {u.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupCodes.map((g) =>
              [0, 1].map((pos) => (
                <tr key={`${g}-${pos}`}>
                  <td
                    className="sticky left-0 z-10 text-[10px] font-semibold px-2 py-1.5 whitespace-nowrap"
                    style={{ background: "var(--color-bg-card)", color: "var(--color-text-secondary)", borderTop: "1px solid var(--border-subtle)" }}
                  >
                    {g} · {pos === 0 ? "1º" : "2º"}
                  </td>
                  {options.map((u) => {
                    const team = u.payload.groups?.[g]?.[pos] ?? null;
                    const sc = groupCellScore(g, team, pos, outcome, bracketPoints);
                    const cellBg =
                      sc && sc.resolved && sc.hit
                        ? "color-mix(in srgb, var(--color-success) 10%, var(--color-bg-card))"
                        : "var(--color-bg-card)";
                    return (
                      <td
                        key={u.id}
                        className="px-2 py-1.5"
                        style={{ background: cellBg, borderTop: "1px solid var(--border-subtle)" }}
                      >
                        {team ? (
                          <span className="inline-flex items-center gap-1 text-[11px] whitespace-nowrap" style={{ color: "var(--color-text-primary)" }}>
                            <span aria-hidden="true">{getFlag(team)}</span>
                            <span className="truncate" style={{ maxWidth: 92 }}>{team}</span>
                            <PointsBadge score={sc} />
                          </span>
                        ) : (
                          <span className="text-[11px]" style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Seletor de competidor ────────────────────────────────────

function CompetitorSelect({
  label,
  value,
  options,
  onChange,
  allowNone = false,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (v: string) => void;
  allowNone?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[13px] font-semibold rounded-button px-2.5 py-1.5"
      style={{
        background: "var(--color-bg-card)",
        color: value ? "var(--color-accent)" : "var(--color-text-secondary)",
        border: "1px solid var(--border-subtle)",
        minHeight: "38px",
      }}
      aria-label={label === "Ver" ? "Competidor a visualizar" : "Competidor para comparar"}
    >
      {allowNone && <option value="">— ninguém —</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ─── Rótulo de coluna ─────────────────────────────────────────

function ColumnLabel({ label }: { label: string }) {
  return (
    <div className="px-2 py-1.5 mb-1">
      <span
        className="text-[11px] font-bold uppercase tracking-[0.07em] block"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Card de confronto (read-only) ────────────────────────────

function ConfrontoCard({
  confronto,
  phase,
  aPayload,
  bWinner,
  bLabel,
  isFinal,
  colKey,
  outcome,
  bracketPoints,
}: {
  confronto: Confronto;
  phase: Phase | "champion";
  aPayload: KnockoutTreePayload;
  /** undefined = não comparando; null = comparando mas o outro não definiu; string = pick do outro. */
  bWinner?: string | null;
  bLabel: string | null;
  isFinal: boolean;
  colKey: ColKey;
  outcome?: BracketOutcome;
  bracketPoints?: BracketPoints;
}) {
  const winA = venceu(confronto.a, phase, aPayload);
  const winB = venceu(confronto.b, phase, aPayload);
  const winnerATeam = winA ? confronto.a : winB ? confronto.b : null;
  const comparing = bWinner !== undefined && bLabel !== null;
  const cellScore = koCellScore(colKey, winnerATeam, outcome, bracketPoints);

  return (
    <div
      className="rounded-card overflow-hidden mb-2"
      style={{
        background: "var(--color-bg-card)",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="px-2 pt-1 pb-0.5 flex items-center justify-between gap-1" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span className="text-[9px] font-bold tabular-nums" style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}>
          {isFinal ? "Final" : `Jogo ${confronto.matchNum}`}
        </span>
        <PointsBadge score={cellScore} />
      </div>
      <SlotRow
        team={confronto.a}
        label={confronto.labelA}
        isWinner={winA}
        isLoser={winB && !winA && confronto.a !== null}
      />
      <div className="mx-2 h-px" style={{ background: "var(--border-subtle)" }} aria-hidden="true" />
      <SlotRow
        team={confronto.b}
        label={confronto.labelB}
        isWinner={winB}
        isLoser={winA && !winB && confronto.b !== null}
      />
      {comparing && winnerATeam && (
        <CompareFooter winnerATeam={winnerATeam} bWinner={bWinner ?? null} bLabel={bLabel!} />
      )}
    </div>
  );
}

/** Rodapé do card: mostra QUEM o outro competidor colocou nesta vaga. */
function CompareFooter({
  winnerATeam,
  bWinner,
  bLabel,
}: {
  winnerATeam: string;
  bWinner: string | null;
  bLabel: string;
}) {
  const same = bWinner !== null && norm(bWinner) === norm(winnerATeam);
  const bg = same
    ? "color-mix(in srgb, var(--color-success) 16%, var(--color-bg-card))"
    : bWinner
      ? "color-mix(in srgb, var(--color-warning, #C77700) 18%, var(--color-bg-card))"
      : "var(--color-bg-secondary)";
  const fg = same ? "var(--color-success)" : bWinner ? "var(--color-warning, #C77700)" : "var(--color-text-secondary)";
  return (
    <div
      className="px-2 py-1 flex items-center gap-1 border-t"
      style={{ background: bg, borderColor: "var(--border-subtle)" }}
    >
      <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: fg }}>
        {bLabel}:
      </span>
      {same ? (
        <span className="text-[10px] font-bold" style={{ color: fg }}>✓ mesmo palpite</span>
      ) : bWinner ? (
        <span className="text-[10px] font-bold inline-flex items-center gap-1 min-w-0" style={{ color: fg }}>
          <span aria-hidden="true">{getFlag(bWinner)}</span>
          <span className="truncate">{bWinner}</span>
        </span>
      ) : (
        <span className="text-[10px]" style={{ color: fg }}>não definiu</span>
      )}
    </div>
  );
}

function SlotRow({
  team,
  label,
  isWinner,
  isLoser,
}: {
  team: string | null;
  label: string;
  isWinner: boolean;
  isLoser: boolean;
}) {
  const isEmpty = !team;
  const bg = isWinner ? "var(--color-accent)" : "transparent";
  const textColor = isWinner ? "#fff" : isEmpty ? "var(--color-text-secondary)" : isLoser ? "var(--color-text-secondary)" : "var(--color-text-primary)";

  return (
    <div
      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left"
      style={{ background: bg, color: textColor, opacity: isLoser ? 0.5 : 1, minHeight: "36px" }}
    >
      <span className="text-[13px] flex-shrink-0" aria-hidden="true" style={{ opacity: isEmpty ? 0.35 : 1 }}>
        {team ? getFlag(team) : "—"}
      </span>
      <span
        className="text-[11px] flex-1 min-w-0 truncate"
        style={{ fontWeight: isWinner ? 700 : 500, textDecoration: isLoser ? "line-through" : "none" }}
      >
        {team ?? <span style={{ opacity: 0.5 }}>{label}</span>}
      </span>
    </div>
  );
}

function norm(s: string): string {
  return s.trim().toLocaleLowerCase("pt-BR");
}

// ─── Campeão ──────────────────────────────────────────────────

function ChampionRow({ champion, score }: { champion: string; score?: CellScore | null }) {
  return (
    <div
      className="w-full rounded-card overflow-hidden mt-1"
      style={{ border: "2px solid var(--color-gold)", boxShadow: "var(--shadow-gold)" }}
    >
      <div className="px-2 py-1 flex items-center justify-between gap-1" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span className="text-[10px] font-bold uppercase tracking-[0.05em]" style={{ color: "var(--color-gold)" }}>
          🏆 Campeão
        </span>
        <PointsBadge score={score ?? null} />
      </div>
      <div className="w-full flex items-center gap-2 px-2 py-2" style={{ minHeight: "40px" }}>
        <span className="text-[14px]" aria-hidden="true">{getFlag(champion)}</span>
        <span className="text-[12px] font-bold flex-1" style={{ color: "var(--color-text-primary)" }}>
          {champion}
        </span>
      </div>
    </div>
  );
}

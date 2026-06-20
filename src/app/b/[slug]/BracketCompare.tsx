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
import type { BracketEntry } from "./MegaBracket";

interface Props {
  allBrackets: BracketEntry[];
  currentUserId: string;
  groupTeams: Record<string, string[]>;
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

/** O competidor B também colocou `team` avançando nesta fase? */
function bConcorda(team: string, phase: Phase | "champion", bp: KnockoutTreePayload): boolean {
  if (phase === "champion") return bp.champion === team;
  return bp[phase].includes(team);
}

function teamsAdvancing(phase: Phase | "champion", p: KnockoutTreePayload): string[] {
  if (phase === "champion") return p.champion ? [p.champion] : [];
  return p[phase];
}

export default function BracketCompare({ allBrackets, currentUserId, groupTeams }: Props) {
  const teamGroup = useMemo(() => teamGroupFromGroups(groupTeams), [groupTeams]);

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
  const [colFilter, setColFilter] = useState<ColKey | "all">("all");

  const a = options.find((o) => o.id === aId) ?? options[0];
  const b = bId ? options.find((o) => o.id === bId) ?? null : null;

  const aAlloc = useMemo(
    () => (a ? autoThirdAlloc(a.payload, teamGroup) : {}),
    [a, teamGroup]
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

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-[15px] font-bold" style={{ color: "var(--color-text-primary)" }}>
          Árvore de cada um 🌳
        </h3>
        <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
          O caminho de mata-mata até o título. Escolha um competidor e, se quiser, compare com outro.
        </p>
      </div>

      {/* Seletores de competidor */}
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

      {/* Resumo de concordância */}
      {agreement && b && (
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
        {([["all", "Árvore inteira"], ...COLUMNS.map((c) => [c.key, c.label] as const)] as const).map(
          ([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={colFilter === key}
              onClick={() => setColFilter(key as ColKey | "all")}
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

      {/* Árvore */}
      <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }} aria-label="Chaveamento comparativo">
        <div
          className="flex flex-row items-stretch"
          style={{ gap: "8px", minWidth: colFilter === "all" ? "1080px" : "auto" }}
        >
          {visibleCols.map((col) => {
            const confrontos = confrontosDaColuna(col.key, a.payload, aAlloc);
            const isFinal = col.key === "final";
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
                      bPayload={b?.payload ?? null}
                      bLabel={b?.label ?? null}
                      isFinal={isFinal}
                    />
                  ))}
                  {isFinal && a.payload.champion && (
                    <ChampionRow
                      champion={a.payload.champion}
                      bPayload={b?.payload ?? null}
                      bLabel={b?.label ?? null}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
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
  bPayload,
  bLabel,
  isFinal,
}: {
  confronto: Confronto;
  phase: Phase | "champion";
  aPayload: KnockoutTreePayload;
  bPayload: KnockoutTreePayload | null;
  bLabel: string | null;
  isFinal: boolean;
}) {
  const winA = venceu(confronto.a, phase, aPayload);
  const winB = venceu(confronto.b, phase, aPayload);

  return (
    <div
      className="rounded-card overflow-hidden mb-2"
      style={{
        background: "var(--color-bg-card)",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="px-2 pt-1 pb-0.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span className="text-[9px] font-bold tabular-nums" style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}>
          {isFinal ? "Final" : `Jogo ${confronto.matchNum}`}
        </span>
      </div>
      <SlotRow
        team={confronto.a}
        label={confronto.labelA}
        isWinner={winA}
        isLoser={winB && !winA && confronto.a !== null}
        phase={phase}
        bPayload={bPayload}
        bLabel={bLabel}
      />
      <div className="mx-2 h-px" style={{ background: "var(--border-subtle)" }} aria-hidden="true" />
      <SlotRow
        team={confronto.b}
        label={confronto.labelB}
        isWinner={winB}
        isLoser={winA && !winB && confronto.b !== null}
        phase={phase}
        bPayload={bPayload}
        bLabel={bLabel}
      />
    </div>
  );
}

function SlotRow({
  team,
  label,
  isWinner,
  isLoser,
  phase,
  bPayload,
  bLabel,
}: {
  team: string | null;
  label: string;
  isWinner: boolean;
  isLoser: boolean;
  phase: Phase | "champion";
  bPayload: KnockoutTreePayload | null;
  bLabel: string | null;
}) {
  const isEmpty = !team;
  const bg = isWinner ? "var(--color-accent)" : "transparent";
  const textColor = isWinner ? "#fff" : isEmpty ? "var(--color-text-secondary)" : isLoser ? "var(--color-text-secondary)" : "var(--color-text-primary)";

  // Marca de comparação: só no vencedor escolhido por A, quando comparando.
  const agree = isWinner && team && bPayload ? bConcorda(team, phase, bPayload) : null;

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
      {agree !== null && bLabel && (
        <span
          className="text-[9px] font-bold flex-shrink-0 px-1 py-0.5 rounded-badge tabular-nums"
          style={{
            background: agree ? "var(--color-success)" : "var(--color-warning, #C77700)",
            color: "#fff",
          }}
          title={agree ? `${bLabel} também levou ${team}` : `${bLabel} NÃO levou ${team} aqui`}
        >
          {agree ? `✓ ${bLabel}` : `✗ ${bLabel}`}
        </span>
      )}
    </div>
  );
}

// ─── Campeão ──────────────────────────────────────────────────

function ChampionRow({
  champion,
  bPayload,
  bLabel,
}: {
  champion: string;
  bPayload: KnockoutTreePayload | null;
  bLabel: string | null;
}) {
  const agree = bPayload ? bPayload.champion === champion : null;
  return (
    <div
      className="w-full rounded-card overflow-hidden mt-1"
      style={{ border: "2px solid var(--color-gold)", boxShadow: "var(--shadow-gold)" }}
    >
      <div className="px-2 py-1" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span className="text-[10px] font-bold uppercase tracking-[0.05em]" style={{ color: "var(--color-gold)" }}>
          🏆 Campeão
        </span>
      </div>
      <div className="w-full flex items-center gap-2 px-2 py-2" style={{ minHeight: "40px" }}>
        <span className="text-[14px]" aria-hidden="true">{getFlag(champion)}</span>
        <span className="text-[12px] font-bold flex-1" style={{ color: "var(--color-text-primary)" }}>
          {champion}
        </span>
        {agree !== null && bLabel && (
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-badge"
            style={{ background: agree ? "var(--color-success)" : "var(--color-warning, #C77700)", color: "#fff" }}
            title={agree ? `${bLabel} também crava ${champion} campeão` : `${bLabel} aposta em outro campeão`}
          >
            {agree ? `✓ ${bLabel}` : `✗ ${bLabel}`}
          </span>
        )}
      </div>
    </div>
  );
}

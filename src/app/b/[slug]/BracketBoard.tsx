"use client";

/**
 * BracketBoard — Visualização READ-ONLY do chaveamento completo da Copa 2026.
 *
 * Renderizado abaixo do formulário de palpite na aba Bracket.
 * Mostra: 12 grupos (A–L) · Melhores 3ºs · Árvore do mata-mata (r32→final).
 *
 * Distingue visualmente:
 *   - Palpite do usuário (accent outline)
 *   - Confirmado real (badge verde)
 *   - Acerto (destaque verde)
 *   - Erro (texto riscado, sem punição emocional)
 */

import type { Match } from "@/lib/types";
import { getFlag } from "@/lib/utils";
import {
  deriveBracketOutcome,
  type BracketPayload,
  type BracketMatchInput,
  type BracketOutcome,
} from "@/lib/scoring";

// ─── Props ────────────────────────────────────────────────────

interface BracketBoardProps {
  matches: Match[];
  myBracket: Record<string, unknown> | null;
  /** false quando o formulário editável está visível acima — evita repetir
      os 12 grupos na mesma página (o form já os mostra). */
  showGroups?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────

function parseBracketPayload(raw: Record<string, unknown> | null): BracketPayload {
  if (!raw) {
    return {
      groups: {},
      third_qualifiers: [],
      r32_winners: [],
      r16_winners: [],
      qf_winners: [],
      sf_winners: [],
      finalists: [],
      champion: "",
      third_place: "",
    };
  }
  return {
    groups: (raw.groups as Record<string, string[]>) ?? {},
    third_qualifiers: (raw.third_qualifiers as string[]) ?? [],
    r32_winners: (raw.r32_winners as string[]) ?? [],
    r16_winners: (raw.r16_winners as string[]) ?? [],
    qf_winners: (raw.qf_winners as string[]) ?? [],
    sf_winners: (raw.sf_winners as string[]) ?? [],
    finalists: (raw.finalists as string[]) ?? [],
    champion: (raw.champion as string) ?? "",
    third_place: (raw.third_place as string) ?? "",
  };
}

function toMatchInputs(matches: Match[]): BracketMatchInput[] {
  return matches.map((m) => ({
    id: m.id,
    stage: m.stage as BracketMatchInput["stage"],
    home_team: m.home_team,
    away_team: m.away_team,
    score_home_90: m.score_home_90,
    score_away_90: m.score_away_90,
    status: m.status,
    group_code: m.group_label ?? undefined,
  }));
}

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

// Estado de um slot: palpite, confirmado, acerto, erro, vazio
type SlotState = "empty" | "pick-only" | "confirmed-match" | "confirmed-hit" | "confirmed-miss";

function slotState(
  team: string | null | undefined,
  confirmedTeams: string[],
): SlotState {
  if (!team) return "empty";
  if (confirmedTeams.length === 0) return "pick-only";
  if (confirmedTeams.includes(team)) return "confirmed-hit";
  return "confirmed-miss";
}

// Verifica se o confronto real está definido (home/away != "A definir")
function isMatchReal(m: Match): boolean {
  return m.home_team !== "A definir" && m.away_team !== "A definir";
}

// ─── Componente principal ─────────────────────────────────────

export default function BracketBoard({ matches, myBracket, showGroups = true }: BracketBoardProps) {
  const payload = parseBracketPayload(myBracket);
  const outcome = deriveBracketOutcome(toMatchInputs(matches));

  // Grupos ativos (aparecem nos matches)
  const activeGroups = GROUPS.filter((g) => {
    return matches.some((m) => m.stage === "group" && m.group_label === g);
  });

  // Mata-mata por stage
  const stageMatches: Record<string, Match[]> = {};
  for (const m of matches) {
    if (m.stage !== "group") {
      if (!stageMatches[m.stage]) stageMatches[m.stage] = [];
      stageMatches[m.stage].push(m);
    }
  }

  return (
    <div
      className="flex flex-col gap-5"
      aria-label="Chaveamento da Copa 2026 — leitura"
    >
      {/* Legenda */}
      <BoardLegend />

      {/* Fase de Grupos — 4 colunas em desktop, 2-3 em tablet, 1 em mobile */}
      {showGroups && activeGroups.length > 0 && (
        <BoardSection title="Fase de Grupos">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {activeGroups.map((g) => (
              <GroupMiniCard
                key={g}
                groupCode={g}
                matches={matches.filter((m) => m.stage === "group" && m.group_label === g)}
                payload={payload}
                outcome={outcome}
              />
            ))}
          </div>
        </BoardSection>
      )}

      {/* Melhores 3ºs */}
      {(payload.third_qualifiers.length > 0 || outcome.qualified.length > 0) && (
        <BoardSection title="Melhores 3ºs classificados">
          <ThirdPlaceQualifiers payload={payload} outcome={outcome} />
        </BoardSection>
      )}

      {/* Mata-mata — só quando a FIFA já definiu pelo menos um confronto.
          Antes disso a árvore seria só "A definir" repetido: ruído puro. */}
      {matches.some((m) => m.stage !== "group" && isMatchReal(m)) ? (
        <BoardSection title="Mata-mata">
          <KnockoutTree
            matches={matches}
            payload={payload}
            outcome={outcome}
            stageMatches={stageMatches}
          />
        </BoardSection>
      ) : (
        <BoardSection title="Mata-mata">
          <p className="text-[13px] px-1" style={{ color: "var(--color-text-secondary)" }}>
            Os cruzamentos oficiais aparecem aqui assim que a FIFA confirmar o
            chaveamento (ao fim da fase de grupos) — aí dá pra comparar seu
            palpite com o que aconteceu de verdade, fase a fase.
          </p>
        </BoardSection>
      )}
    </div>
  );
}

// ─── BoardSection ─────────────────────────────────────────────

function BoardSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h3
          className="text-[13px] font-bold uppercase tracking-[0.06em] flex-shrink-0"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {title}
        </h3>
        <div
          className="flex-1 h-px"
          style={{ background: "var(--border-subtle)" }}
          aria-hidden="true"
        />
      </div>
      {children}
    </div>
  );
}

// ─── BoardLegend ──────────────────────────────────────────────

function BoardLegend() {
  return (
    <div
      className="flex flex-wrap gap-3 px-3 py-2 rounded-button"
      style={{ background: "var(--color-bg-secondary)" }}
      aria-label="Legenda do chaveamento"
    >
      {[
        { color: "var(--color-accent)", label: "Seu palpite" },
        { color: "var(--color-success)", label: "Confirmado" },
        { color: "var(--color-text-secondary)", label: "Aguardando" },
      ].map(({ color, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: color }}
            aria-hidden="true"
          />
          <span
            className="text-[11px] font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── GroupMiniCard ────────────────────────────────────────────

function GroupMiniCard({
  groupCode,
  matches,
  payload,
  outcome,
}: {
  groupCode: string;
  matches: Match[];
  payload: BracketPayload;
  outcome: BracketOutcome;
}) {
  // Times do grupo (únicos, excluindo "A definir")
  const teamsSet = new Set<string>();
  for (const m of matches) {
    if (m.home_team && m.home_team !== "A definir") teamsSet.add(m.home_team);
    if (m.away_team && m.away_team !== "A definir") teamsSet.add(m.away_team);
  }
  const teams = Array.from(teamsSet);

  // Palpites do usuário para este grupo
  const picks = payload.groups[groupCode] ?? [];
  const pick1 = picks[0] ?? null;
  const pick2 = picks[1] ?? null;

  // Resultado confirmado deste grupo (se disponível)
  const confirmed = outcome.groups[groupCode];

  return (
    <div
      className="rounded-card p-3 flex flex-col gap-2"
      style={{
        background: "var(--color-bg-card)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Header do grupo */}
      <div className="flex items-center justify-between">
        <span
          className="text-[12px] font-bold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Grupo {groupCode}
        </span>
        {confirmed && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-badge"
            style={{
              background: "var(--color-success)",
              color: "#fff",
            }}
          >
            OK
          </span>
        )}
      </div>

      {/* Lista de times */}
      <div className="flex flex-col gap-1">
        {teams.map((team, idx) => {
          // Posição de palpite
          const pickPos = pick1 === team ? 1 : pick2 === team ? 2 : null;
          // Estado confirmado
          const isConfirmedFirst = confirmed?.first === team;
          const isConfirmedSecond = confirmed?.second === team;
          const isConfirmedClassified = isConfirmedFirst || isConfirmedSecond;

          // Estado de acerto/erro
          let hitState: "hit" | "miss" | "pending" | "none" = "none";
          if (pickPos !== null && confirmed) {
            const confirmedAtPos = pickPos === 1 ? confirmed.first : confirmed.second;
            hitState = confirmedAtPos === team ? "hit" : "miss";
          } else if (pickPos !== null && !confirmed) {
            hitState = "pending";
          }

          return (
            <div
              key={team}
              className="flex items-center gap-2 px-2 py-1.5 rounded"
              style={{
                background:
                  pickPos !== null
                    ? "color-mix(in srgb, var(--color-accent) 8%, transparent)"
                    : "transparent",
                border:
                  pickPos !== null
                    ? "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)"
                    : "1px solid transparent",
              }}
            >
              {/* Posição palpitada */}
              <span
                className="text-[10px] font-bold tabular-nums w-4 text-center flex-shrink-0"
                style={{
                  color:
                    pickPos !== null
                      ? "var(--color-accent)"
                      : "var(--color-text-secondary)",
                  opacity: pickPos !== null ? 1 : 0.3,
                }}
                aria-label={pickPos ? `Palpite: ${pickPos}º` : `${idx + 1}º`}
              >
                {pickPos ?? idx + 1}°
              </span>

              {/* Bandeira */}
              <span className="text-sm flex-shrink-0" aria-hidden="true">
                {getFlag(team)}
              </span>

              {/* Nome */}
              <span
                className="text-[12px] font-medium flex-1 min-w-0 truncate"
                style={{
                  color:
                    hitState === "miss"
                      ? "var(--color-text-secondary)"
                      : "var(--color-text-primary)",
                  textDecoration: hitState === "miss" ? "line-through" : "none",
                  opacity: hitState === "miss" ? 0.55 : 1,
                }}
              >
                {team}
              </span>

              {/* Badge confirmado */}
              {isConfirmedClassified && (
                <span
                  className="text-[9px] font-bold px-1 py-0.5 rounded-badge flex-shrink-0"
                  style={{
                    background:
                      hitState === "hit"
                        ? "var(--color-success)"
                        : "var(--color-bg-secondary)",
                    color:
                      hitState === "hit"
                        ? "#fff"
                        : "var(--color-text-secondary)",
                  }}
                  aria-label={
                    isConfirmedFirst
                      ? "1º classificado real"
                      : "2º classificado real"
                  }
                >
                  {isConfirmedFirst ? "1°" : "2°"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ThirdPlaceQualifiers ─────────────────────────────────────

function ThirdPlaceQualifiers({
  payload,
  outcome,
}: {
  payload: BracketPayload;
  outcome: BracketOutcome;
}) {
  const picks = payload.third_qualifiers;
  // Os 8 melhores 3ºs classificados — derivado do outcome: times em qualified que
  // não são 1º/2º de nenhum grupo
  const confirmedFirstsSeconds = new Set<string>();
  for (const g of Object.values(outcome.groups)) {
    confirmedFirstsSeconds.add(g.first);
    confirmedFirstsSeconds.add(g.second);
  }
  // Terceiros confirmados: na qualified mas não em firsts/seconds
  const confirmedThirds = outcome.qualified.filter(
    (t) => !confirmedFirstsSeconds.has(t)
  );

  if (picks.length === 0 && confirmedThirds.length === 0) return null;

  const displayTeams = picks.length > 0 ? picks : Array.from({ length: 8 }).map(() => null);

  return (
    <div
      className="rounded-card p-3"
      style={{
        background: "var(--color-bg-card)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}
      >
        {displayTeams.map((team, i) => {
          if (!team) {
            return (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded"
                style={{
                  background: "var(--color-bg-secondary)",
                  border: "1px dashed var(--border-subtle)",
                }}
                aria-label="Slot vazio"
              >
                <span
                  className="text-[10px] font-medium"
                  style={{ color: "var(--color-text-secondary)", opacity: 0.4 }}
                >
                  —
                </span>
              </div>
            );
          }

          const isConfirmed = confirmedThirds.includes(team);
          const isHit = isConfirmed;
          const isMiss = confirmedThirds.length > 0 && !isConfirmed;

          return (
            <div
              key={team}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded"
              style={{
                background: "color-mix(in srgb, var(--color-accent) 8%, transparent)",
                border:
                  isHit
                    ? "1px solid var(--color-success)"
                    : "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)",
              }}
            >
              <span className="text-sm flex-shrink-0" aria-hidden="true">
                {getFlag(team)}
              </span>
              <span
                className="text-[11px] font-medium truncate"
                style={{
                  color: isMiss ? "var(--color-text-secondary)" : "var(--color-text-primary)",
                  textDecoration: isMiss ? "line-through" : "none",
                  opacity: isMiss ? 0.55 : 1,
                }}
              >
                {team}
              </span>
              {isHit && (
                <span
                  className="ml-auto text-[9px] font-bold px-1 py-0.5 rounded-badge flex-shrink-0"
                  style={{ background: "var(--color-success)", color: "#fff" }}
                  aria-label="Confirmado"
                >
                  ✓
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── KnockoutTree ─────────────────────────────────────────────

const KO_STAGES = [
  { key: "r32", label: "1ª fase mata-mata", short: "16-avos" },
  { key: "r16", label: "Oitavas de final", short: "Oitavas" },
  { key: "qf", label: "Quartas de final", short: "Quartas" },
  { key: "sf", label: "Semifinais", short: "Semis" },
  { key: "final", label: "Final", short: "Final" },
] as const;

const THIRD_STAGE = { key: "third", label: "3º lugar", short: "3º lugar" } as const;

function KnockoutTree({
  matches,
  payload,
  outcome,
  stageMatches,
}: {
  matches: Match[];
  payload: BracketPayload;
  outcome: BracketOutcome;
  stageMatches: Record<string, Match[]>;
}) {
  // Fases presentes nos dados
  const activeStages = KO_STAGES.filter((s) => stageMatches[s.key]?.length > 0);
  const hasThird = (stageMatches["third"]?.length ?? 0) > 0;

  if (activeStages.length === 0) {
    return (
      <div
        className="rounded-card p-6 flex flex-col items-center gap-2"
        style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
      >
        <span className="text-[28px]" aria-hidden="true">🏟</span>
        <p
          className="text-[13px] text-center"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Mata-mata disponível após a fase de grupos
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Wrapper: mobile = scroll horizontal; xl (>=1280px) = flex wrap sem scroll */}
      <div
        className="overflow-x-auto xl:overflow-x-visible pb-2 xl:pb-0"
        style={{ scrollbarWidth: "thin", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        aria-label="Fases do mata-mata — deslize para ver todas"
      >
        <div
          className="flex gap-3 xl:flex-wrap xl:gap-4"
          style={{ minWidth: "max-content" }}
        >
          {activeStages.map((stageInfo) => {
            const stageMatchList = stageMatches[stageInfo.key] ?? [];

            return (
              <div
                key={stageInfo.key}
                className="flex flex-col gap-2"
                style={{ width: "172px", flexShrink: 0 }}
              >
                {/* Cabeçalho da fase */}
                <div
                  className="px-2 py-1.5 rounded-button text-center"
                  style={{ background: "var(--color-bg-secondary)" }}
                >
                  <span
                    className="text-[11px] font-bold uppercase tracking-[0.05em]"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {stageInfo.short}
                  </span>
                </div>

                {/* Confrontos */}
                {stageMatchList.map((m) => (
                  <KoMatchSlot
                    key={m.id}
                    match={m}
                    payload={payload}
                    outcome={outcome}
                    stage={stageInfo.key}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Jogo do 3º lugar — separado abaixo da árvore */}
      {hasThird && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span
              className="text-[11px] font-bold uppercase tracking-[0.05em] flex-shrink-0"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Disputa de 3º lugar
            </span>
            <div
              className="flex-1 h-px"
              style={{ background: "var(--border-subtle)" }}
              aria-hidden="true"
            />
          </div>
          <div className="flex flex-col gap-2" style={{ maxWidth: "340px" }}>
            {(stageMatches["third"] ?? []).map((m) => (
              <KoMatchSlot
                key={m.id}
                match={m}
                payload={payload}
                outcome={outcome}
                stage="third"
              />
            ))}
          </div>
          {/* Palpite de 3º lugar */}
          {payload.third_place && (
            <ThirdPlaceRow
              pick={payload.third_place}
              confirmed={outcome.third_place}
            />
          )}
        </div>
      )}

      {/* Campeão e Vice */}
      {(payload.champion || outcome.champion) && (
        <ChampionPodium payload={payload} outcome={outcome} />
      )}
    </div>
  );
}

// ─── KoMatchSlot ──────────────────────────────────────────────

function KoMatchSlot({
  match,
  payload,
  outcome,
  stage,
}: {
  match: Match;
  payload: BracketPayload;
  outcome: BracketOutcome;
  stage: string;
}) {
  const real = isMatchReal(match);
  const isFinished = match.status === "finished";

  // Times reais do confronto (podem ser "A definir")
  const homeReal = real ? match.home_team : null;
  const awayReal = real ? match.away_team : null;

  // Vencedor real (se jogo encerrado)
  let realWinner: string | null = null;
  if (isFinished && match.score_home_90 !== null && match.score_away_90 !== null) {
    if (match.score_home_90 > match.score_away_90) realWinner = match.home_team;
    else if (match.score_away_90 > match.score_home_90) realWinner = match.away_team;
  }

  // Palpites para este confronto — derivado dos picks de fase
  // Para r32: payload.r32_winners contém os avançantes, mas o payload
  // não tem confronto-por-confronto — exibir times palpitados vs. times reais do confronto.
  // Lógica: marcar como "palpitado" qualquer time no slot que bate com o pick de avanço.
  function isPickedWinner(team: string): boolean {
    if (!team || team === "A definir") return false;
    switch (stage) {
      case "r32": return payload.r32_winners.includes(team);
      case "r16": return payload.r16_winners.includes(team);
      case "qf": return payload.qf_winners.includes(team);
      case "sf": return payload.sf_winners.includes(team);
      case "final": return payload.finalists.includes(team) || payload.champion === team;
      default: return false;
    }
  }

  return (
    <div
      className="rounded-card overflow-hidden"
      style={{
        background: "var(--color-bg-card)",
        boxShadow: "var(--shadow-card)",
        border: isFinished
          ? "1px solid color-mix(in srgb, var(--color-success) 30%, transparent)"
          : "1px solid transparent",
      }}
    >
      <MatchSlotRow
        team={homeReal}
        isPicked={homeReal ? isPickedWinner(homeReal) : false}
        isWinner={realWinner === homeReal}
        isFinished={isFinished}
        score={isFinished ? match.score_home_90 : null}
      />
      <div
        className="h-px mx-2"
        style={{ background: "var(--border-subtle)" }}
        aria-hidden="true"
      />
      <MatchSlotRow
        team={awayReal}
        isPicked={awayReal ? isPickedWinner(awayReal) : false}
        isWinner={realWinner === awayReal}
        isFinished={isFinished}
        score={isFinished ? match.score_away_90 : null}
      />
    </div>
  );
}

// ─── MatchSlotRow ─────────────────────────────────────────────

function MatchSlotRow({
  team,
  isPicked,
  isWinner,
  isFinished,
  score,
}: {
  team: string | null;
  isPicked: boolean;
  isWinner: boolean;
  isFinished: boolean;
  score: number | null;
}) {
  const isEmpty = !team;

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-2"
      style={{
        background:
          isWinner
            ? "color-mix(in srgb, var(--color-success) 10%, transparent)"
            : isPicked && !isFinished
            ? "color-mix(in srgb, var(--color-accent) 8%, transparent)"
            : "transparent",
      }}
    >
      {/* Indicador de palpite */}
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{
          background: isWinner
            ? "var(--color-success)"
            : isPicked
            ? "var(--color-accent)"
            : "var(--border-subtle)",
        }}
        aria-hidden="true"
      />

      {/* Bandeira */}
      <span
        className="text-[13px] flex-shrink-0"
        aria-hidden="true"
        style={{ opacity: isEmpty ? 0.25 : 1 }}
      >
        {team ? getFlag(team) : "🏴"}
      </span>

      {/* Nome */}
      <span
        className="text-[11px] font-medium flex-1 min-w-0 truncate"
        style={{
          color: isEmpty
            ? "var(--color-text-secondary)"
            : isWinner
            ? "var(--color-success)"
            : isPicked && !isFinished
            ? "var(--color-accent)"
            : "var(--color-text-primary)",
          opacity: isEmpty ? 0.4 : 1,
          fontWeight: isWinner ? 700 : isPicked ? 600 : 400,
        }}
        aria-label={team ? `${team}${isPicked ? ", seu palpite" : ""}${isWinner ? ", vencedor" : ""}` : "A definir"}
      >
        {team ?? "A definir"}
      </span>

      {/* Placar */}
      {isFinished && score !== null && (
        <span
          className="tabular-nums text-[12px] font-bold flex-shrink-0"
          style={{
            color: isWinner ? "var(--color-success)" : "var(--color-text-secondary)",
          }}
        >
          {score}
        </span>
      )}
    </div>
  );
}

// ─── ThirdPlaceRow ────────────────────────────────────────────

function ThirdPlaceRow({
  pick,
  confirmed,
}: {
  pick: string;
  confirmed: string | null;
}) {
  const isHit = confirmed !== null && confirmed === pick;
  const isMiss = confirmed !== null && confirmed !== pick;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-card"
      style={{
        background: "var(--color-bg-card)",
        boxShadow: "var(--shadow-card)",
        border: isHit
          ? "1px solid var(--color-success)"
          : isMiss
          ? "1px solid transparent"
          : "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)",
      }}
    >
      <span
        className="text-[11px] font-semibold flex-shrink-0"
        style={{ color: "var(--color-text-secondary)" }}
      >
        3º lugar
      </span>
      <span className="text-[15px]" aria-hidden="true">{getFlag(pick)}</span>
      <span
        className="text-[13px] font-semibold"
        style={{
          color: isHit
            ? "var(--color-success)"
            : isMiss
            ? "var(--color-text-secondary)"
            : "var(--color-accent)",
          textDecoration: isMiss ? "line-through" : "none",
          opacity: isMiss ? 0.6 : 1,
        }}
      >
        {pick}
      </span>
      {confirmed && (
        <>
          <span
            className="text-[11px]"
            style={{ color: "var(--color-text-secondary)" }}
            aria-hidden="true"
          >
            →
          </span>
          <span className="text-[15px]" aria-hidden="true">{getFlag(confirmed)}</span>
          <span
            className="text-[13px] font-semibold"
            style={{ color: "var(--color-success)" }}
          >
            {confirmed}
          </span>
        </>
      )}
    </div>
  );
}

// ─── ChampionPodium ───────────────────────────────────────────

function ChampionPodium({
  payload,
  outcome,
}: {
  payload: BracketPayload;
  outcome: BracketOutcome;
}) {
  const champPick = payload.champion;
  const vicePick = payload.finalists.find((t) => t !== champPick) ?? null;
  const champReal = outcome.champion;
  const viceReal = outcome.runner_up;

  const champHit = champPick && champReal && champPick === champReal;
  const viceHit = vicePick && viceReal && vicePick === viceReal;

  return (
    <div
      className="rounded-card p-4 flex flex-col gap-3"
      style={{
        background: "var(--color-bg-card)",
        boxShadow: champHit ? "var(--shadow-gold)" : "var(--shadow-card)",
        border: champHit
          ? "1px solid color-mix(in srgb, var(--color-gold) 60%, transparent)"
          : "1px solid transparent",
      }}
    >
      {/* Campeão */}
      <PodiumRow
        label="Campeão"
        pick={champPick}
        confirmed={champReal}
        isHit={!!champHit}
        isMiss={!!(champPick && champReal && !champHit)}
        gold
      />

      {/* Vice */}
      {(vicePick || viceReal) && (
        <PodiumRow
          label="Vice"
          pick={vicePick}
          confirmed={viceReal}
          isHit={!!viceHit}
          isMiss={!!(vicePick && viceReal && !viceHit)}
          gold={false}
        />
      )}
    </div>
  );
}

// ─── PodiumRow ────────────────────────────────────────────────

function PodiumRow({
  label,
  pick,
  confirmed,
  isHit,
  isMiss,
  gold,
}: {
  label: string;
  pick: string | null;
  confirmed: string | null;
  isHit: boolean;
  isMiss: boolean;
  gold: boolean;
}) {
  return (
    <div className="flex items-center gap-3 min-h-[36px]">
      {/* Label */}
      <span
        className="text-[11px] font-bold uppercase tracking-[0.05em] w-12 flex-shrink-0"
        style={{
          color: gold ? "var(--color-gold)" : "var(--color-text-secondary)",
        }}
      >
        {label}
      </span>

      {/* Palpite */}
      {pick ? (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-button flex-shrink-0"
          style={{
            background: isHit
              ? "color-mix(in srgb, var(--color-success) 12%, transparent)"
              : "color-mix(in srgb, var(--color-accent) 10%, transparent)",
            border: isHit
              ? "1px solid var(--color-success)"
              : "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)",
          }}
        >
          <span className="text-[15px]" aria-hidden="true">{getFlag(pick)}</span>
          <span
            className="text-[13px] font-semibold"
            style={{
              color: isHit
                ? "var(--color-success)"
                : isMiss
                ? "var(--color-text-secondary)"
                : "var(--color-accent)",
              textDecoration: isMiss ? "line-through" : "none",
              opacity: isMiss ? 0.55 : 1,
            }}
          >
            {pick}
          </span>
          {isHit && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-badge ml-0.5"
              style={{ background: "var(--color-success)", color: "#fff" }}
              aria-label="Acerto!"
            >
              ✓
            </span>
          )}
        </div>
      ) : (
        <span
          className="text-[13px]"
          style={{ color: "var(--color-text-secondary)", opacity: 0.4 }}
        >
          —
        </span>
      )}

      {/* Seta + confirmado (quando diferente do palpite e já definido) */}
      {confirmed && confirmed !== pick && (
        <>
          <span
            className="text-[11px]"
            style={{ color: "var(--color-text-secondary)" }}
            aria-hidden="true"
          >
            →
          </span>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-button"
            style={{
              background: "color-mix(in srgb, var(--color-success) 10%, transparent)",
              border: "1px solid var(--color-success)",
            }}
          >
            <span className="text-[15px]" aria-hidden="true">{getFlag(confirmed)}</span>
            <span
              className="text-[13px] font-semibold"
              style={{ color: "var(--color-success)" }}
            >
              {confirmed}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

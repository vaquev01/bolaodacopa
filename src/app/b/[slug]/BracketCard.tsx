"use client";

import { useState, useEffect, useMemo } from "react";
import type { Ruleset } from "@/lib/scoring";
import { deriveBracketOutcome, type BracketMatchInput } from "@/lib/scoring";
import {
  mapKnockoutByFifaNumber,
  stageOfFifaNumber,
  R32_MATCHES,
  R16_MATCHES,
  QF_MATCHES,
  SF_MATCHES,
} from "@/lib/scoring/wc26-pairings";
import type { Match } from "@/lib/types";
import { getFlag } from "@/lib/utils";
import BracketBoard from "./BracketBoard";
import KnockoutTreeEditor, { type ScoreBonusConfig } from "./KnockoutTreeEditor";

// ─── Types ───────────────────────────────────────────────────

interface BracketPayload {
  groups: Record<string, string[]>;        // { A: ["BRA","ARG"], ... }
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
  poolId: string;
  ruleset: Ruleset;
  teams: string[];
  groupTeams: Record<string, string[]>;
  myBracket: Record<string, unknown> | null;
  lockAt: string | null;
  locked: boolean;
  /** Todos os 104 jogos — alimenta o BracketBoard (chaveamento read-only). */
  matches?: Match[];
  /** Meus palpites de placar (match_id → {home, away}) — bônus na árvore. */
  scorePreds?: Record<string, { home: number; away: number }>;
  /** Grava palpite de placar de um jogo do mata-mata (bônus). */
  onSaveScore?: (matchId: string, home: number, away: number) => Promise<boolean>;
}

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

function emptyPayload(): BracketPayload {
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

function parseBracket(raw: Record<string, unknown> | null): BracketPayload {
  if (!raw) return emptyPayload();
  const p: BracketPayload = {
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
  // Migração: a 1ª versão da árvore (v1.6) gravava uma fase deslocada —
  // vencedores dos 16 avos iam pra r32_winners (que NÃO pontua). Se há
  // r32_winners, desloca tudo pra semântica que o scoring usa. Conservadora:
  // mantém champion/third_place como o usuário marcou (não adivinha campeão a
  // partir de finalists, o que corromperia o palpite).
  if (p.r32_winners.length > 0) {
    return {
      ...p,
      r32_winners: [],
      r16_winners: p.r32_winners,
      qf_winners: p.r16_winners,
      sf_winners: p.qf_winners,
      finalists: p.sf_winners,
      // champion e third_place preservados via spread acima
    };
  }
  return p;
}

/**
 * Lista de pendências que impedem o bracket de ser considerado completo.
 * Vazia = pronto pra salvar. Cada item é uma frase do que falta finalizar.
 */
function bracketGaps(
  payload: BracketPayload,
  activeGroups: readonly string[],
  thirdCandidates: string[]
): string[] {
  const gaps: string[] = [];

  // 1. Grupos — 1º, 2º e 3º de cada grupo ativo
  const incomplete = activeGroups.filter((g) => {
    const p = payload.groups[g] ?? [];
    return !(p[0] && p[1] && p[2]);
  });
  if (incomplete.length > 0) {
    gaps.push(
      `Marque 1º, 2º e 3º ${incomplete.length === 1 ? "do grupo" : "dos grupos"} ${incomplete.join(", ")}`
    );
  }

  // 2. Melhores terceiros — escolher 8 (só cobra quando há candidatos suficientes)
  if (thirdCandidates.length >= 8 && payload.third_qualifiers.length < 8) {
    gaps.push(`Escolha os 8 melhores terceiros (faltam ${8 - payload.third_qualifiers.length})`);
  }

  // 3. Mata-mata em cascata — só cobra a fase seguinte se a anterior fechou
  if (payload.r16_winners.length < R32_MATCHES.length) {
    gaps.push(`Defina quem vence nos 16 avos (faltam ${R32_MATCHES.length - payload.r16_winners.length} de ${R32_MATCHES.length})`);
  } else if (payload.qf_winners.length < R16_MATCHES.length) {
    gaps.push(`Defina quem vence nas oitavas (faltam ${R16_MATCHES.length - payload.qf_winners.length} de ${R16_MATCHES.length})`);
  } else if (payload.sf_winners.length < QF_MATCHES.length) {
    gaps.push(`Defina quem vence nas quartas (faltam ${QF_MATCHES.length - payload.sf_winners.length} de ${QF_MATCHES.length})`);
  } else if (payload.finalists.length < SF_MATCHES.length) {
    gaps.push(`Defina os finalistas (faltam ${SF_MATCHES.length - payload.finalists.length} de ${SF_MATCHES.length})`);
  } else if (!payload.champion) {
    gaps.push("Escolha o campeão");
  }

  // 4. 3º lugar — quando a final já está definida
  if (payload.champion && payload.finalists.length >= SF_MATCHES.length && !payload.third_place) {
    gaps.push("Escolha o 3º lugar (entre os perdedores das semis)");
  }

  return gaps;
}

function useCountdown(lockAt: string | null): { label: string; urgency: "ok" | "warning" | "danger" } {
  const [state, setState] = useState({ label: "", urgency: "ok" as "ok" | "warning" | "danger" });

  useEffect(() => {
    if (!lockAt) return;
    function update() {
      const diff = new Date(lockAt!).getTime() - Date.now();
      if (diff <= 0) { setState({ label: "", urgency: "ok" }); return; }
      const urgency: "ok" | "warning" | "danger" =
        diff < 60 * 60 * 1000 ? "danger"
        : diff < 24 * 60 * 60 * 1000 ? "warning"
        : "ok";
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      let label: string;
      if (h > 24) {
        label = `${Math.floor(h / 24)}d ${h % 24}h`;
      } else if (h > 0) {
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        const ss = String(s).padStart(2, "0");
        label = `${hh}:${mm}:${ss}`;
      } else {
        const mm = String(m).padStart(2, "0");
        const ss = String(s).padStart(2, "0");
        label = `${mm}:${ss}`;
      }
      setState({ label, urgency });
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lockAt]);

  return state;
}

// ─── Main Component ──────────────────────────────────────────

export default function BracketCard({
  poolId,
  ruleset,
  groupTeams,
  myBracket,
  lockAt,
  locked,
  matches = [],
  scorePreds,
  onSaveScore,
}: Props) {
  const [payload, setPayload] = useState<BracketPayload>(() => parseBracket(myBracket));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error" | "incomplete">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [showGaps, setShowGaps] = useState(false);
  const { label: countdownLabel, urgency: countdownUrgency } = useCountdown(lockAt);

  const pts = ruleset.advance_predictions?.points;
  const activeGroups = GROUPS.filter((g) => groupTeams[g]?.length > 0);

  // Mapa time → grupo (para KnockoutTreeEditor resolver slots de 3ºs)
  const teamGroupMap: Record<string, string> = {};
  for (const g of activeGroups) {
    for (const t of groupTeams[g] ?? []) {
      teamGroupMap[t] = g;
    }
  }

  // Progresso de grupos (1º + 2º + 3º)
  const completedGroups = activeGroups.filter((g) => {
    const p = payload.groups[g] ?? [];
    return p[0] && p[1] && p[2];
  }).length;

  // Candidatos a melhores 3ºs = o 3º marcado em cada grupo
  const thirdCandidates = activeGroups
    .map((g) => (payload.groups[g] ?? [])[2])
    .filter((t): t is string => Boolean(t));

  // Pendências ao vivo (atualizam conforme o usuário preenche)
  const liveGaps = bracketGaps(payload, activeGroups, thirdCandidates);

  // Derivar lista de qualificados: 1º e 2º de cada grupo + os 8 melhores 3ºs
  // escolhidos (groups[g][2] é o 3º do grupo — candidato, não classificado)
  const qualifiedFromGroups: string[] = [];
  for (const g of activeGroups) {
    const picks = (payload.groups[g] ?? []).slice(0, 2);
    for (const t of picks) {
      if (t && !qualifiedFromGroups.includes(t)) qualifiedFromGroups.push(t);
    }
  }
  for (const t of payload.third_qualifiers) {
    if (t && !qualifiedFromGroups.includes(t)) qualifiedFromGroups.push(t);
  }

  // ── Estado real do torneio + bônus de placar exato ───────────

  // Resultado real derivado dos jogos — liga os selos "✓ +X pts" na árvore
  const realOutcome = useMemo(() => {
    if (matches.length === 0) return null;
    const inputs: BracketMatchInput[] = matches.map((m) => ({
      id: m.id,
      stage: m.stage as BracketMatchInput["stage"],
      home_team: m.home_team,
      away_team: m.away_team,
      score_home_90: m.score_home_90,
      score_away_90: m.score_away_90,
      score_home_ft: m.score_home_ft,
      score_away_ft: m.score_away_ft,
      penalty_winner: m.penalty_winner,
      status: m.status,
      group_code: m.group_label ?? undefined,
    }));
    return deriveBracketOutcome(inputs);
  }, [matches]);

  // Bônus de placar exato nos jogos reais do mata-mata (nº FIFA → jogo do banco)
  const scoreBonusCfg: ScoreBonusConfig | null = useMemo(() => {
    if (!onSaveScore || !scorePreds) return null;
    if (ruleset.scoring.exact_score <= 0) return null;
    const matchByFifa = mapKnockoutByFifaNumber(matches.filter((m) => m.stage !== "group"));
    if (Object.keys(matchByFifa).length === 0) return null;
    const mult = ruleset.stage_multipliers as unknown as Record<string, number>;
    return {
      matchByFifa,
      preds: scorePreds,
      bonusFor: (n: number) => {
        const stage = stageOfFifaNumber(n);
        if (!stage) return 0;
        return Math.round(ruleset.scoring.exact_score * (mult[stage] ?? 1));
      },
      onSave: onSaveScore,
    };
  }, [matches, scorePreds, onSaveScore, ruleset]);

  // ── Handlers ─────────────────────────────────────────────────

  /** Tira dos picks do mata-mata qualquer time que deixou de estar classificado. */
  function pruneKO(p: BracketPayload): BracketPayload {
    const qualified = new Set<string>();
    for (const g of Object.values(p.groups)) {
      for (const t of g.slice(0, 2)) if (t) qualified.add(t);
    }
    for (const t of p.third_qualifiers) if (t) qualified.add(t);
    const keep = (arr: string[]) => arr.filter((t) => qualified.has(t));
    return {
      ...p,
      r16_winners: keep(p.r16_winners),
      qf_winners: keep(p.qf_winners),
      sf_winners: keep(p.sf_winners),
      finalists: keep(p.finalists),
      champion: qualified.has(p.champion) ? p.champion : "",
      third_place: qualified.has(p.third_place) ? p.third_place : "",
    };
  }

  function handleGroupChipTap(group: string, team: string) {
    setPayload((p) => {
      const cur = p.groups[group] ?? ["", "", ""];
      const [p1 = "", p2 = "", p3 = ""] = cur;
      let next: string[];
      // Tap em time marcado desmarca; em time livre ocupa a primeira posição
      // vaga (1º → 2º → 3º); com tudo cheio, substitui o 3º.
      if (p1 === team) next = ["", p2, p3];
      else if (p2 === team) next = [p1, "", p3];
      else if (p3 === team) next = [p1, p2, ""];
      else if (!p1) next = [team, p2, p3];
      else if (!p2) next = [p1, team, p3];
      else next = [p1, p2, team];

      const groups = { ...p.groups, [group]: next };
      // Melhores 3ºs só podem conter quem segue marcado como 3º de um grupo
      const validThirds = new Set(
        Object.values(groups).map((g) => g[2]).filter(Boolean)
      );
      return pruneKO({
        ...p,
        groups,
        third_qualifiers: p.third_qualifiers.filter((t) => validThirds.has(t)),
      });
    });
    setStatus("idle");
  }

  function toggleThirdQualifier(team: string) {
    setPayload((p) => {
      const cur = p.third_qualifiers;
      const next = cur.includes(team)
        ? cur.filter((t) => t !== team)
        : cur.length < 8
          ? [...cur, team]
          : cur; // máximo 8
      return pruneKO({ ...p, third_qualifiers: next });
    });
    setStatus("idle");
  }

  async function handleSave() {
    // Bloqueia salvar com algo em aberto — sinaliza exatamente o que falta
    if (liveGaps.length > 0) {
      setShowGaps(true);
      setStatus("incomplete");
      setErrorMsg("");
      return;
    }
    setShowGaps(false);
    setStatus("saving");
    setErrorMsg("");
    try {
      const r = await fetch("/api/brackets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool_id: poolId, payload }),
      });
      if (r.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        const d = await r.json();
        if (d.error === "bracket_locked") {
          setErrorMsg("Bracket travado — a Copa já começou.");
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

  // ── View pós-lock ─────────────────────────────────────────────────────────

  if (locked) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-card p-4" style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[17px] font-bold" style={{ color: "var(--color-text-primary)" }}>
              Meu Bracket
            </h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-badge"
              style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}>
              Travado
            </span>
          </div>

          {!myBracket ? (
            <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              O prazo encerrou antes de você preencher o bracket. Acompanhe o ranking para ver seu desempenho nos placares.
            </p>
          ) : (
            <BracketView payload={payload} />
          )}
        </div>

        {/* Chaveamento completo — read-only */}
        {matches.length > 0 && (
          <BracketBoard matches={matches} myBracket={myBracket} />
        )}
      </div>
    );
  }

  // ── Formulário de preenchimento ───────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho — compacto em desktop (flex row) */}
      <div className="rounded-card p-4" style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 lg:flex lg:items-center lg:gap-4">
            <div className="flex-shrink-0">
              <h2 className="text-[17px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                Bracket pré-Copa
              </h2>
              <p className="text-[13px] mt-0.5 lg:hidden" style={{ color: "var(--color-text-secondary)" }}>
                Escolha 1º, 2º e 3º de cada grupo, os 8 melhores terceiros — e o
                mata-mata se monta sozinho.
              </p>
            </div>
            {pts && (
              <div className="hidden lg:flex flex-wrap gap-1.5 mt-0">
                {[
                  ["Classificado", pts.group_qualified],
                  ["Posição exata", `+${pts.group_position_exact}`],
                  ["Oitavas", pts.r16],
                  ["Quartas", pts.qf],
                  ["Semis", pts.sf],
                  ["Final", pts.final],
                  ["3º lugar", pts.third_place],
                  ["Vice", pts.runner_up],
                  ["Campeão", pts.champion],
                ].map(([label, val]) => (
                  <span key={label as string}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-badge"
                    style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}>
                    {label}: {val}
                  </span>
                ))}
              </div>
            )}
          </div>
          {lockAt && countdownLabel && (
            <div className="flex flex-col items-end flex-shrink-0">
              <span className="text-[10px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                Trava em
              </span>
              <span
                className="tabular-nums text-[13px] font-bold"
                aria-live="polite"
                style={{
                  color: countdownUrgency === "danger"
                    ? "var(--color-danger)"
                    : countdownUrgency === "warning"
                      ? "var(--color-warning)"
                      : "var(--color-text-primary)",
                }}
              >
                {countdownLabel}
              </span>
            </div>
          )}
        </div>

        {pts && (
          <div className="flex flex-wrap gap-1.5 mt-3 lg:hidden">
            {[
              ["Classificado", pts.group_qualified],
              ["Posição exata", `+${pts.group_position_exact}`],
              ["Oitavas", pts.r16],
              ["Quartas", pts.qf],
              ["Semis", pts.sf],
              ["Final", pts.final],
              ["3º lugar", pts.third_place],
              ["Vice", pts.runner_up],
              ["Campeão", pts.champion],
            ].map(([label, val]) => (
              <span key={label as string}
                className="text-[11px] font-medium px-2 py-0.5 rounded-badge"
                style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}>
                {label}: {val}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Grupos */}
      {activeGroups.length > 0 && (
        <Section title="Grupos — 1º, 2º e 3º de cada grupo" progress={`${completedGroups}/${activeGroups.length}`}>
          {/* Desktop: 4 colunas (12 grupos = 3 linhas); tablet: 2-3 colunas; mobile: 1 coluna */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {activeGroups.map((g) => {
              const teamList = groupTeams[g] ?? [];
              const picks = payload.groups[g] ?? ["", "", ""];
              const [p1 = "", p2 = "", p3 = ""] = picks;
              return (
                <div
                  key={g}
                  className="rounded-card p-3 flex flex-col gap-2"
                  style={{ background: "var(--color-bg-secondary)" }}
                >
                  {/* Cabeçalho do grupo card — compacto */}
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                      Grupo {g}
                    </span>
                    {p1 && p2 && p3 ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-badge"
                        style={{ background: "var(--color-success)", color: "#fff" }}>
                        OK
                      </span>
                    ) : (p1 || p2 || p3) ? (
                      <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
                        falta {!p1 ? "1º" : !p2 ? "2º" : "3º"}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {teamList.map((team) => {
                      const chipState: "none" | "first" | "second" | "third" =
                        p1 === team ? "first" : p2 === team ? "second" : p3 === team ? "third" : "none";
                      return (
                        <GroupChip
                          key={team}
                          team={team}
                          state={chipState}
                          onClick={() => handleGroupChipTap(g, team)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Melhores 3ºs */}
      {thirdCandidates.length > 0 && (
        <Section
          title={`Melhores terceiros — ${pts?.group_qualified ?? 2} pts/seleção`}
          progress={`${payload.third_qualifiers.length}/8`}
        >
          <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Na Copa 2026, os 8 melhores terceiros também avançam. Quais dos seus
            terceiros vão pro mata-mata?
          </p>
          <TeamChips
            teams={thirdCandidates}
            selected={payload.third_qualifiers}
            onToggle={toggleThirdQualifier}
          />
          {payload.third_qualifiers.length === 8 && (
            <p className="text-[11px] font-semibold" style={{ color: "var(--color-success)" }}>
              8 escolhidos ✓
            </p>
          )}
        </Section>
      )}

      {/* Mata-mata — árvore de chaveamento interativa */}
      {qualifiedFromGroups.length > 0 && (
        <div
          className="rounded-card p-4"
          style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              Mata-mata
            </h3>
            {pts && (
              <div className="flex flex-wrap gap-1 justify-end">
                {[
                  ["Oitavas", pts.r16],
                  ["Quartas", pts.qf],
                  ["Semis", pts.sf],
                  ["Final", pts.final],
                  ["Campeão", pts.champion],
                ].map(([label, val]) => (
                  <span key={label as string}
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-badge"
                    style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}>
                    {label}: {val}
                  </span>
                ))}
              </div>
            )}
          </div>
          {/* Como pontua — explícito antes de palpitar */}
          {pts && (
            <p className="text-[12px] mb-3" style={{ color: "var(--color-text-secondary)" }}>
              Toque no time que avança. Cada acerto vale: oitavas{" "}
              <strong>+{pts.r16}</strong> · quartas <strong>+{pts.qf}</strong> · semis{" "}
              <strong>+{pts.sf}</strong> · final <strong>+{pts.final}</strong> · campeão{" "}
              <strong>+{pts.champion}</strong> · 3º lugar <strong>+{pts.third_place}</strong>
              {scoreBonusCfg
                ? " — e cravar o placar exato de um jogo dá bônus extra (valor mostrado em cada jogo)."
                : "."}
            </p>
          )}
          <KnockoutTreeEditor
            payload={payload}
            groupTeams={groupTeams}
            teamGroup={teamGroupMap}
            onChange={(newPayload) => {
              // 3º lugar não pode ser um finalista (o user promoveu o time depois)
              const clean =
                newPayload.third_place && newPayload.finalists.includes(newPayload.third_place)
                  ? { ...newPayload, third_place: "" }
                  : newPayload;
              setPayload(clean);
              setStatus("idle");
            }}
            locked={locked}
            points={pts ?? null}
            outcome={realOutcome}
            scoreBonus={scoreBonusCfg}
          />
        </div>
      )}

      {/* Botão salvar — sticky no rodapé da viewport: acompanha o usuário do
          primeiro grupo até o campeão sem cortar o fluxo no meio da página */}
      {errorMsg && (
        <p className="text-[13px]" style={{ color: "var(--color-danger)" }}>{errorMsg}</p>
      )}

      {/* Pendências — bloqueia o salvar e diz exatamente o que falta finalizar */}
      {showGaps && liveGaps.length > 0 && (
        <div
          role="alert"
          className="rounded-card p-4 flex flex-col gap-2"
          style={{
            background: "color-mix(in srgb, var(--color-warning) 12%, var(--color-bg-card))",
            border: "1px solid var(--color-warning)",
          }}
        >
          <p className="text-[14px] font-bold" style={{ color: "var(--color-text-primary)" }}>
            Falta finalizar pra salvar ({liveGaps.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {liveGaps.map((g) => (
              <li key={g} className="flex items-start gap-2 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                <span aria-hidden="true" style={{ color: "var(--color-warning)" }}>○</span>
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {showGaps && liveGaps.length === 0 && status !== "saved" && (
        <div
          role="status"
          className="rounded-card p-3 text-[13px] font-semibold"
          style={{
            background: "color-mix(in srgb, var(--color-success) 12%, var(--color-bg-card))",
            border: "1px solid var(--color-success)",
            color: "var(--color-text-primary)",
          }}
        >
          Tudo preenchido ✓ — toque em Salvar Bracket.
        </div>
      )}

      <div className="sticky bottom-4 z-10">
        <button
          onClick={handleSave}
          disabled={status === "saving"}
          className="w-full py-4 rounded-button text-white font-semibold text-[17px] transition-opacity disabled:opacity-60 shadow-lg"
          style={{
            background:
              status === "incomplete" && liveGaps.length > 0
                ? "var(--color-warning)"
                : "var(--color-accent)",
          }}
        >
          {status === "saving"
            ? "Salvando…"
            : status === "saved"
              ? "Salvo!"
              : status === "incomplete" && liveGaps.length > 0
                ? `Faltam ${liveGaps.length} — toque pra ver`
                : "Salvar Bracket"}
        </button>
      </div>

      {/* Chaveamento completo — read-only, referência visual abaixo do formulário */}
      {matches.length > 0 && (
        <div className="mt-2">
          <div className="flex items-center gap-3 mb-4">
            <h3
              className="text-[15px] font-bold flex-shrink-0"
              style={{ color: "var(--color-text-primary)" }}
            >
              Chaveamento da Copa
            </h3>
            <div
              className="flex-1 h-px"
              style={{ background: "var(--border-subtle)" }}
              aria-hidden="true"
            />
          </div>
          <BracketBoard matches={matches} myBracket={myBracket} showGroups={false} />
        </div>
      )}
    </div>
  );
}

// ─── BracketView (pós-lock, visualização somente-leitura) ─────

function BracketView({ payload }: { payload: BracketPayload }) {
  const vice = payload.finalists.find((t) => t !== payload.champion) || "—";
  const rows: Array<[string, string]> = [
    ["Campeão", payload.champion ? `${getFlag(payload.champion)} ${payload.champion}` : "—"],
    ["Vice", vice !== "—" ? `${getFlag(vice)} ${vice}` : "—"],
    ["3º lugar", payload.third_place ? `${getFlag(payload.third_place)} ${payload.third_place}` : "—"],
    ["Semifinalistas", payload.sf_winners.map((t) => `${getFlag(t)} ${t}`).join(", ") || "—"],
    ["Quartas", payload.qf_winners.map((t) => `${getFlag(t)} ${t}`).join(", ") || "—"],
    ["Oitavas", payload.r16_winners.slice(0, 4).map((t) => `${getFlag(t)} ${t}`).join(", ") + (payload.r16_winners.length > 4 ? "…" : "") || "—"],
  ];

  return (
    <div className="flex flex-col gap-3">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between items-start gap-3">
          <span className="text-[13px] flex-shrink-0" style={{ color: "var(--color-text-secondary)" }}>{label}</span>
          <span className="text-[13px] font-semibold text-right" style={{ color: "var(--color-text-primary)" }}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers de UI ────────────────────────────────────────────

function Section({
  title,
  progress,
  children,
}: {
  title: string;
  progress?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card p-4 flex flex-col gap-3"
      style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
          {title}
        </h3>
        {progress && (
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
            {progress}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// Chip para grupos (3 estados: none / first / second)
function GroupChip({
  team,
  state,
  onClick,
}: {
  team: string;
  state: "none" | "first" | "second" | "third";
  onClick: () => void;
}) {
  const flag = getFlag(team);

  const bg =
    state === "first" ? "var(--color-accent)"
    : state === "second" || state === "third" ? "transparent"
    : "var(--color-bg-secondary)";

  const border =
    state === "second" ? "1.5px solid var(--color-accent)"
    : state === "third" ? "1.5px dashed var(--color-accent)"
    : "1.5px solid transparent";

  const color =
    state === "first" ? "#fff"
    : state === "second" || state === "third" ? "var(--color-accent)"
    : "var(--color-text-secondary)";

  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-1.5 px-3 py-2 rounded-button text-[13px] font-semibold transition-all active:scale-95"
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
      {state !== "none" && (
        <span
          className="ml-0.5 text-[10px] font-bold px-1 py-0.5 rounded"
          style={{
            background: state === "first" ? "rgba(255,255,255,0.25)" : "var(--color-accent)",
            color: "#fff",
            lineHeight: 1,
          }}
        >
          {state === "first" ? "1º" : state === "second" ? "2º" : "3º"}
        </span>
      )}
    </button>
  );
}

// Chip simples para mata-mata (selecionado / não)
function TeamChips({
  teams,
  selected,
  onToggle,
}: {
  teams: string[];
  selected: string[];
  onToggle: (team: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {teams.map((t) => {
        const isSelected = selected.includes(t);
        return (
          <button
            key={t}
            onClick={() => onToggle(t)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-button text-[13px] font-semibold transition-all active:scale-95"
            style={{
              background: isSelected ? "var(--color-accent)" : "var(--color-bg-secondary)",
              color: isSelected ? "#fff" : "var(--color-text-secondary)",
              border: "1.5px solid transparent",
              transitionTimingFunction: "var(--ease-spring)",
              transitionDuration: "var(--duration-feedback)",
              minHeight: "44px",
            }}
            aria-pressed={isSelected}
          >
            <span aria-hidden="true">{getFlag(t)}</span>
            <span>{t}</span>
          </button>
        );
      })}
    </div>
  );
}


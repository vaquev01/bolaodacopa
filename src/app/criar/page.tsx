"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_RULESET } from "@/lib/scoring";
import type { Match } from "@/lib/types";
import { formatKickoff, stageLabel } from "@/lib/utils";
import { createClient } from "@/lib/supabase/browser";
import { slugify } from "@/lib/utils";

type ScopeType = "full" | "custom" | "specials_only";

interface WizardState {
  // Passo 1
  poolName: string;
  scopeType: ScopeType;
  selectedMatches: string[];
  // Passo 2
  predictionMode: "score" | "winner";
  winnerPickPoints: number;
  winnerExactBonus: number;
  exactScore: number;
  winnerOnly: number;
  winnerAndDiff: number;
  drawOnly: number;
  goalsOneTeam: number;
  deadlineMinutes: number;
  allowEdit: boolean;
  championEnabled: boolean;
  championPoints: number;
  qualifiersEnabled: boolean;
  qualifiersPoints: number;
  earlyBirdEnabled: boolean;
  earlyBirdPoints: number;
  // Bracket pré-Copa (v1.1)
  bracketEnabled: boolean;
  bracketPointsGroupQualified: number;
  bracketPointsGroupPositionExact: number;
  bracketPointsR16: number;
  bracketPointsQf: number;
  bracketPointsSf: number;
  bracketPointsFinal: number;
  bracketPointsThirdPlace: number;
  bracketPointsRunnerUp: number;
  bracketPointsChampion: number;
  // Dados user
  userName: string;
}

const DEADLINE_OPTIONS = [
  { label: "15 min antes", value: 15 },
  { label: "1 hora antes", value: 60 },
  { label: "1 dia antes", value: 1440 },
];

export default function CriarPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  const [state, setState] = useState<WizardState>({
    poolName: "",
    scopeType: "full",
    selectedMatches: [],
    predictionMode: "score",
    winnerPickPoints: DEFAULT_RULESET.scoring.winner_pick,
    winnerExactBonus: DEFAULT_RULESET.scoring.winner_exact_bonus,
    exactScore: DEFAULT_RULESET.scoring.exact_score,
    winnerOnly: DEFAULT_RULESET.scoring.winner_only,
    winnerAndDiff: DEFAULT_RULESET.scoring.winner_and_diff,
    drawOnly: DEFAULT_RULESET.scoring.draw_only,
    goalsOneTeam: DEFAULT_RULESET.scoring.goals_one_team,
    deadlineMinutes: DEFAULT_RULESET.deadline.minutes_before,
    allowEdit: true,
    championEnabled: DEFAULT_RULESET.special_bets.champion.enabled,
    championPoints: DEFAULT_RULESET.special_bets.champion.points,
    qualifiersEnabled: DEFAULT_RULESET.special_bets.qualifiers.enabled,
    qualifiersPoints: DEFAULT_RULESET.special_bets.qualifiers.points_per_team,
    earlyBirdEnabled: DEFAULT_RULESET.early_bird.enabled,
    earlyBirdPoints: DEFAULT_RULESET.early_bird.points,
    // Bracket pré-Copa — default off
    bracketEnabled: false,
    bracketPointsGroupQualified: DEFAULT_RULESET.advance_predictions.points.group_qualified,
    bracketPointsGroupPositionExact: DEFAULT_RULESET.advance_predictions.points.group_position_exact,
    bracketPointsR16: DEFAULT_RULESET.advance_predictions.points.r16,
    bracketPointsQf: DEFAULT_RULESET.advance_predictions.points.qf,
    bracketPointsSf: DEFAULT_RULESET.advance_predictions.points.sf,
    bracketPointsFinal: DEFAULT_RULESET.advance_predictions.points.final,
    bracketPointsThirdPlace: DEFAULT_RULESET.advance_predictions.points.third_place,
    bracketPointsRunnerUp: DEFAULT_RULESET.advance_predictions.points.runner_up,
    bracketPointsChampion: DEFAULT_RULESET.advance_predictions.points.champion,
    userName: "",
  });

  useEffect(() => {
    // Carregar jogos seedados
    const supabase = createClient();
    supabase
      .from("matches")
      .select("id, stage, group_label, home_team, away_team, kickoff_at, status")
      .order("kickoff_at", { ascending: true })
      .then(({ data }) => {
        if (data) setMatches(data as Match[]);
      });

    // Checar se tem sessão
    fetch("/api/session/check")
      .then((r) => r.json())
      .then((d) => setHasSession(!!d.userId))
      .catch(() => setHasSession(false));
  }, []);

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function toggleMatch(id: string) {
    setState((s) => ({
      ...s,
      selectedMatches: s.selectedMatches.includes(id)
        ? s.selectedMatches.filter((m) => m !== id)
        : [...s.selectedMatches, id],
    }));
  }

  function canAdvanceStep1() {
    if (state.poolName.trim().length < 2) return false;
    if (state.scopeType === "custom" && state.selectedMatches.length === 0) return false;
    return true;
  }

  // ── Prazo dos palpites pré-Copa (campeão/classificados/bracket) ──────────
  // Eles travam no início do 1º jogo do bolão (validado no servidor).
  // matches já vem ordenado por kickoff.
  const scopeMatches =
    state.scopeType === "custom" && state.selectedMatches.length > 0
      ? matches.filter((m) => state.selectedMatches.includes(m.id))
      : matches;
  const preCopaLockAt = scopeMatches.length > 0 ? scopeMatches[0].kickoff_at : null;
  const preCopaLocked = preCopaLockAt
    ? new Date(preCopaLockAt).getTime() <= Date.now()
    : false;
  const preCopaLockLabel = preCopaLockAt
    ? (() => {
        const { date, time } = formatKickoff(preCopaLockAt);
        return `${date} às ${time}`;
      })()
    : null;
  const deadlineLabel =
    DEADLINE_OPTIONS.find((o) => o.value === state.deadlineMinutes)?.label ?? "15 min antes";

  // ── "Só classificação" com a Copa em andamento ────────────────────────────
  // O servidor trava palpites pré-Copa no 1º jogo do ESCOPO do bolão. Para
  // liberar o modo classificação mesmo com a Copa rolando, o escopo passa a
  // ser "jogos depois de amanhã": o grupo ganha até o fim de amanhã para
  // palpitar, e o lock real vira o 1º jogo depois desse corte.
  const lateCutoffMs = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  })();
  const lateLockMatches = matches.filter(
    (m) => new Date(m.kickoff_at).getTime() > lateCutoffMs
  );
  const lateLockAt = lateLockMatches.length > 0 ? lateLockMatches[0].kickoff_at : null;
  const lateSpecials =
    preCopaLocked && state.scopeType === "specials_only" && lateLockAt !== null;
  // Lock efetivo exibido/aplicado nos palpites pré-Copa
  const effectivePreCopaLocked = lateSpecials ? false : preCopaLocked;
  const effectivePreCopaLockLabel = lateSpecials
    ? (() => {
        const { date, time } = formatKickoff(lateLockAt!);
        return `${date} às ${time}`;
      })()
    : preCopaLockLabel;

  async function handleCreate() {
    setError(null);
    setLoading(true);

    try {
      // Criar perfil se sem sessão
      if (!hasSession) {
        if (!state.userName.trim()) {
          setError("Digite seu nome para criar o bolão.");
          setLoading(false);
          return;
        }
        const r = await fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: state.userName.trim() }),
        });
        if (!r.ok) {
          const d = await r.json();
          setError(d.message ?? "Erro ao criar perfil.");
          setLoading(false);
          return;
        }
      }

      const specialsOnly = state.scopeType === "specials_only";
      // Pré-Copa travado (1º jogo do bolão já começou) → essas apostas não
      // podem mais ser preenchidas; criar o bolão com elas desligadas.
      // Exceção: "só classificação" com Copa em andamento usa escopo de jogos
      // futuros, que empurra o lock para depois de amanhã (lateSpecials).
      const preCopaAvailable = !effectivePreCopaLocked;
      const ruleset = {
        ...DEFAULT_RULESET,
        prediction_mode: state.predictionMode,
        scoring: {
          ...DEFAULT_RULESET.scoring,
          exact_score: state.exactScore,
          winner_only: state.winnerOnly,
          winner_and_diff: state.winnerAndDiff,
          draw_only: state.drawOnly,
          goals_one_team: state.goalsOneTeam,
          winner_pick: state.winnerPickPoints,
          winner_exact_bonus: state.winnerExactBonus,
        },
        deadline: {
          mode: "per_match",
          minutes_before: state.deadlineMinutes,
        },
        edits: { allowed: state.allowEdit },
        special_bets: {
          ...DEFAULT_RULESET.special_bets,
          champion: {
            enabled: preCopaAvailable && (specialsOnly || state.championEnabled),
            points: state.championPoints,
          },
          qualifiers: {
            ...DEFAULT_RULESET.special_bets.qualifiers,
            enabled: preCopaAvailable && (specialsOnly || state.qualifiersEnabled),
            points_per_team: state.qualifiersPoints,
          },
        },
        early_bird: {
          ...DEFAULT_RULESET.early_bird,
          enabled: state.earlyBirdEnabled,
          points: state.earlyBirdPoints,
        },
        advance_predictions: {
          enabled: preCopaAvailable && state.bracketEnabled,
          lock: "tournament_start",
          points: {
            group_qualified: state.bracketPointsGroupQualified,
            group_position_exact: state.bracketPointsGroupPositionExact,
            r16: state.bracketPointsR16,
            qf: state.bracketPointsQf,
            sf: state.bracketPointsSf,
            final: state.bracketPointsFinal,
            fourth_place: 4,
            third_place: state.bracketPointsThirdPlace,
            runner_up: state.bracketPointsRunnerUp,
            champion: state.bracketPointsChampion,
          },
        },
      };

      const scope =
        state.scopeType === "full"
          ? { type: "full" }
          : specialsOnly
            ? lateSpecials
              ? {
                  // Copa em andamento: escopo = jogos após o corte, só para
                  // definir o lock dos palpites no servidor. A UI trata
                  // variant === "specials_only" igual ao modo nativo.
                  type: "custom",
                  match_ids: lateLockMatches.map((m) => m.id),
                  variant: "specials_only",
                }
              : { type: "specials_only" }
            : { type: "custom", match_ids: state.selectedMatches };

      const slug =
        slugify(state.poolName) + "-" + Math.random().toString(36).slice(2, 7);

      const r = await fetch("/api/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.poolName.trim(),
          slug,
          ruleset,
          scope,
        }),
      });

      const d = await r.json();

      if (!r.ok) {
        setError(d.message ?? "Erro ao criar bolão.");
        setLoading(false);
        return;
      }

      router.push(`/b/${d.slug}/convite`);
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col" style={{ background: "var(--color-bg-primary)" }}>
      {/* Header */}
      <header className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button
          onClick={() => (step > 1 ? setStep(step - 1) : router.push("/"))}
          className="w-11 h-11 flex items-center justify-center rounded-full"
          style={{ background: "var(--color-bg-secondary)" }}
          aria-label="Voltar"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 15L7 10L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="flex-1">
          <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            Passo {step} de 3
          </p>
          <div className="flex gap-1 mt-1">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-1 flex-1 rounded-full transition-all"
                style={{
                  background: n <= step ? "var(--color-accent)" : "var(--color-bg-secondary)",
                  transitionTimingFunction: "var(--ease-spring)",
                  transitionDuration: "var(--duration-transition)",
                }}
              />
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 px-4 pt-4 pb-32 max-w-lg mx-auto w-full">
        {/* ─── PASSO 1 ─── */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-[22px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                Como vai se chamar?
              </h2>
              <p className="mt-1 text-[15px]" style={{ color: "var(--color-text-secondary)" }}>
                Dê um nome ao seu bolão e escolha o escopo.
              </p>
            </div>

            <div>
              <label className="block text-[13px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                Nome do bolão
              </label>
              <input
                type="text"
                value={state.poolName}
                onChange={(e) => update("poolName", e.target.value)}
                placeholder="Ex: Bolão do Escritório"
                maxLength={64}
                className="w-full px-4 py-3 rounded-button border text-[17px] outline-none focus-visible:ring-2 focus-visible:ring-[--color-accent]"
                style={{
                  background: "var(--color-bg-card)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>

            {/* Escopo */}
            <div>
              <label className="block text-[13px] font-medium mb-2" style={{ color: "var(--color-text-secondary)" }}>
                Escopo
              </label>
              <div className="flex flex-col gap-3">
                {[
                  {
                    id: "full" as const,
                    title: "Copa Inteira",
                    sub: preCopaLocked
                      ? "Todos os 104 jogos — os que já aconteceram ficam como histórico, sem pontuar"
                      : "Todos os 104 jogos do torneio",
                    icon: (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M2.5 10h15M10 2.5a12.5 12.5 0 010 15M10 2.5a12.5 12.5 0 000 15" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    ),
                  },
                  {
                    id: "custom" as const,
                    title: "Escolher jogos",
                    sub: "Selecione quais jogos entram no bolão",
                    icon: (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                        <rect x="11" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                        <rect x="3" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M14 11v6M11 14h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    ),
                  },
                  {
                    id: "specials_only" as const,
                    title: "Só classificação",
                    sub: preCopaLocked
                      ? "Classificados dos grupos e campeão — o grupo palpita até amanhã à noite"
                      : "Acertar classificados dos grupos e o campeão — sem placares",
                    icon: (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="M6 2.5h8M6 2.5C6 2.5 4 2.5 4 5c0 3 1.5 5.5 4 6.5V14H6.5a.75.75 0 000 1.5h7a.75.75 0 000-1.5H12v-2.5c2.5-1 4-3.5 4-6.5 0-2.5-2-2.5-2-2.5M8 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ),
                  },
                ].map((opt) => {
                  // "Só classificação" só fica indisponível se nem o corte de
                  // amanhã tiver jogos futuros (fim da Copa)
                  const disabled =
                    opt.id === "specials_only" && preCopaLocked && lateLockAt === null;
                  return (
                  <button
                    key={opt.id}
                    onClick={() => !disabled && update("scopeType", opt.id)}
                    disabled={disabled}
                    className="flex items-center gap-3 p-4 rounded-card text-left transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
                    style={{
                      background: state.scopeType === opt.id
                        ? "var(--color-accent)"
                        : "var(--color-bg-card)",
                      boxShadow: "var(--shadow-card)",
                      color: state.scopeType === opt.id ? "#fff" : "var(--color-text-primary)",
                      transitionTimingFunction: "var(--ease-spring)",
                      transitionDuration: "var(--duration-feedback)",
                    }}
                  >
                    <span
                      className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-button"
                      style={{
                        background: state.scopeType === opt.id
                          ? "rgba(255,255,255,0.2)"
                          : "var(--color-bg-secondary)",
                        color: state.scopeType === opt.id ? "#fff" : "var(--color-text-secondary)",
                      }}
                    >
                      {opt.icon}
                    </span>
                    <div>
                      <p className="font-semibold text-[15px]">{opt.title}</p>
                      <p className="text-[13px] opacity-70">{opt.sub}</p>
                    </div>
                  </button>
                  );
                })}
              </div>
            </div>

            {/* Lista de jogos para escopo custom */}
            {state.scopeType === "custom" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    Jogos selecionados ({state.selectedMatches.length})
                  </label>
                  <button
                    onClick={() => {
                      const selectable = matches
                        .filter((m) => new Date(m.kickoff_at).getTime() > Date.now())
                        .map((m) => m.id);
                      setState((s) => ({
                        ...s,
                        selectedMatches:
                          s.selectedMatches.length === selectable.length ? [] : selectable,
                      }));
                    }}
                    className="text-[13px] font-medium"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {state.selectedMatches.length > 0 &&
                    state.selectedMatches.length ===
                      matches.filter((m) => new Date(m.kickoff_at).getTime() > Date.now()).length
                      ? "Desmarcar tudo"
                      : "Marcar todos os jogos futuros"}
                  </button>
                </div>
                <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                  {matches.map((m) => {
                    const { date, time } = formatKickoff(m.kickoff_at);
                    const selected = state.selectedMatches.includes(m.id);
                    const started = new Date(m.kickoff_at).getTime() <= Date.now();
                    return (
                      <button
                        key={m.id}
                        onClick={() => !started && toggleMatch(m.id)}
                        disabled={started}
                        title={started ? "Jogo já começou — não dá mais para palpitar nele" : undefined}
                        className="flex items-center gap-3 p-3 rounded-card text-left disabled:opacity-45"
                        style={{
                          background: selected ? "#EAF2FF" : "var(--color-bg-card)",
                          border: selected ? "1.5px solid var(--color-accent)" : "1.5px solid transparent",
                          boxShadow: "var(--shadow-card)",
                        }}
                      >
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                          style={{
                            background: selected ? "var(--color-accent)" : "var(--color-bg-secondary)",
                          }}
                        >
                          {selected && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="white">
                              <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                            {m.home_team} × {m.away_team}
                          </p>
                          <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                            {date} • {time} • {stageLabel(m.stage)}{started ? " • já aconteceu" : ""}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── PASSO 2 ─── */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-[22px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                Regras do bolão
              </h2>
              <p className="mt-1 text-[15px]" style={{ color: "var(--color-text-secondary)" }}>
                Já vem tudo pronto com valores recomendados. Mude só se quiser.
              </p>
            </div>

            {/* Como funcionam os prazos */}
            <div className="p-4 rounded-card flex flex-col gap-2" style={{ background: "var(--color-bg-secondary)" }}>
              <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                📌 Até quando dá pra palpitar?
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                <strong>Palpite de jogo:</strong> abre agora e fecha {deadlineLabel.toLowerCase()} do
                início de cada jogo. Até lá, pode palpitar e mudar quantas vezes quiser.
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                <strong>Palpites de antes da Copa</strong> (campeão, classificados, bracket):{" "}
                {effectivePreCopaLocked
                  ? "ficam de fora deste bolão — eles fecham quando o 1º jogo começa, e a Copa já está em andamento."
                  : `todo mundo preenche até ${effectivePreCopaLockLabel}. Depois disso, trava para sempre.`}
              </p>
            </div>

            {/* Modo de palpite */}
            {state.scopeType !== "specials_only" && (
              <div className="p-4 rounded-card flex flex-col gap-3" style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    Como cada um vai palpitar?
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                    Vale para todos os jogos do bolão.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {[
                    {
                      id: "score" as const,
                      title: "Placar completo",
                      sub: "Cada um chuta o placar do jogo. Mais formas de pontuar: placar exato, vencedor + saldo, vencedor, empate.",
                    },
                    {
                      id: "winner" as const,
                      title: "Só o vencedor",
                      sub: "Cada um só escolhe quem ganha (ou empate). Rápido e simples — com bônus opcional pra quem cravar o placar.",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => update("predictionMode", opt.id)}
                      className="p-3 rounded-card text-left transition-all active:scale-[0.98]"
                      style={{
                        background: state.predictionMode === opt.id ? "var(--color-accent)" : "var(--color-bg-secondary)",
                        color: state.predictionMode === opt.id ? "#fff" : "var(--color-text-primary)",
                        transitionTimingFunction: "var(--ease-spring)",
                        transitionDuration: "var(--duration-feedback)",
                      }}
                    >
                      <p className="font-semibold text-[15px]">{opt.title}</p>
                      <p className="text-[13px] opacity-75">{opt.sub}</p>
                    </button>
                  ))}
                </div>
                {state.predictionMode === "winner" && (
                  <div className="flex flex-col gap-3 pt-2 border-t" style={{ borderColor: "var(--color-bg-secondary)" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                          Acertou quem ganha
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                          (recomendado: 3)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StepperButton onClick={() => update("winnerPickPoints", Math.max(1, state.winnerPickPoints - 1))} label="−" />
                        <span className="tabular-nums text-[17px] font-semibold w-8 text-center" style={{ color: "var(--color-text-primary)" }}>
                          {state.winnerPickPoints}
                        </span>
                        <StepperButton onClick={() => update("winnerPickPoints", Math.min(99, state.winnerPickPoints + 1))} label="+" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                          Bônus por cravar o placar
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                          Opcional para quem quiser arriscar (recomendado: 5 · 0 desliga)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StepperButton onClick={() => update("winnerExactBonus", Math.max(0, state.winnerExactBonus - 1))} label="−" />
                        <span className="tabular-nums text-[17px] font-semibold w-8 text-center" style={{ color: "var(--color-text-primary)" }}>
                          {state.winnerExactBonus}
                        </span>
                        <StepperButton onClick={() => update("winnerExactBonus", Math.min(99, state.winnerExactBonus + 1))} label="+" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Campeão */}
            <div className="p-4 rounded-card flex flex-col gap-3" style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    Acertar o campeão 🏆
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                    {effectivePreCopaLocked
                      ? "Indisponível: fecha no 1º jogo do bolão, que já aconteceu"
                      : `Cada um crava o campeão até ${effectivePreCopaLockLabel} (recomendado: 50)`}
                  </p>
                </div>
                {state.scopeType === "specials_only" ? (
                  <span className="text-[13px] font-semibold" style={{ color: "var(--color-accent)" }}>Sempre ativo</span>
                ) : (
                  <Toggle value={!effectivePreCopaLocked && state.championEnabled} onChange={(v) => update("championEnabled", v)} disabled={effectivePreCopaLocked} />
                )}
              </div>
              {(state.championEnabled || state.scopeType === "specials_only") && (
                <div className="flex items-center justify-between">
                  <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>Pontos</p>
                  <div className="flex items-center gap-2">
                    <StepperButton onClick={() => update("championPoints", Math.max(1, state.championPoints - 5))} label="−" />
                    <span className="tabular-nums text-[17px] font-semibold w-8 text-center" style={{ color: "var(--color-text-primary)" }}>
                      {state.championPoints}
                    </span>
                    <StepperButton onClick={() => update("championPoints", Math.min(500, state.championPoints + 5))} label="+" />
                  </div>
                </div>
              )}
            </div>

            {/* Classificados por grupo */}
            <div className="p-4 rounded-card flex flex-col gap-3" style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    Acertar os classificados
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                    {effectivePreCopaLocked
                      ? "Indisponível: fecha no 1º jogo do bolão, que já aconteceu"
                      : `1º e 2º de cada grupo, até ${effectivePreCopaLockLabel} (recomendado: 2 por time + 1 pela posição)`}
                  </p>
                </div>
                {state.scopeType === "specials_only" ? (
                  <span className="text-[13px] font-semibold" style={{ color: "var(--color-accent)" }}>Sempre ativo</span>
                ) : (
                  <Toggle value={!effectivePreCopaLocked && state.qualifiersEnabled} onChange={(v) => update("qualifiersEnabled", v)} disabled={effectivePreCopaLocked} />
                )}
              </div>
              {(state.qualifiersEnabled || state.scopeType === "specials_only") && (
                <div className="flex items-center justify-between">
                  <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>Pontos por time certo</p>
                  <div className="flex items-center gap-2">
                    <StepperButton onClick={() => update("qualifiersPoints", Math.max(1, state.qualifiersPoints - 1))} label="−" />
                    <span className="tabular-nums text-[17px] font-semibold w-8 text-center" style={{ color: "var(--color-text-primary)" }}>
                      {state.qualifiersPoints}
                    </span>
                    <StepperButton onClick={() => update("qualifiersPoints", Math.min(99, state.qualifiersPoints + 1))} label="+" />
                  </div>
                </div>
              )}
            </div>

            {/* Bracket pré-Copa */}
            <div className="p-4 rounded-card flex flex-col gap-3" style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 pr-3">
                  <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    Bracket pré-Copa
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                    {effectivePreCopaLocked
                      ? "Indisponível: o bracket fecha no 1º jogo do bolão, que já aconteceu"
                      : `Cada um preenche o chaveamento completo — de quem avança dos grupos até o campeão — até ${effectivePreCopaLockLabel}. Os pontos entram conforme a Copa confirma cada fase.`}
                  </p>
                </div>
                <Toggle value={!effectivePreCopaLocked && state.bracketEnabled} onChange={(v) => update("bracketEnabled", v)} disabled={effectivePreCopaLocked} />
              </div>

              {!effectivePreCopaLocked && state.bracketEnabled && (
                <div className="flex flex-col gap-3 pt-2 border-t" style={{ borderColor: "var(--color-bg-secondary)" }}>
                  {[
                    { key: "bracketPointsGroupQualified" as const, label: "Avançou da fase de grupos", desc: "por seleção que você indicou e passou", rec: 2 },
                    { key: "bracketPointsGroupPositionExact" as const, label: "Bônus: posição no grupo", desc: "acertou também se foi 1º ou 2º", rec: 1 },
                    { key: "bracketPointsR16" as const, label: "Chegou às oitavas", desc: "por seleção certa", rec: 2 },
                    { key: "bracketPointsQf" as const, label: "Chegou às quartas", desc: "por seleção certa", rec: 3 },
                    { key: "bracketPointsSf" as const, label: "Chegou às semifinais", desc: "por seleção certa", rec: 5 },
                    { key: "bracketPointsFinal" as const, label: "Chegou à final", desc: "por finalista certo", rec: 8 },
                    { key: "bracketPointsThirdPlace" as const, label: "3º lugar em cheio", desc: "acertou quem ficou em 3º", rec: 8 },
                    { key: "bracketPointsRunnerUp" as const, label: "Vice em cheio", desc: "acertou quem perdeu a final", rec: 10 },
                    { key: "bracketPointsChampion" as const, label: "Campeão em cheio", desc: "acertou o campeão do mundo", rec: 25 },
                  ].map(({ key, label, desc, rec }) => (
                    <div key={key} className="flex items-center justify-between">
                      <div className="pr-3">
                        <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{label}</p>
                        <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{desc} · recomendado: {rec}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StepperButton
                          onClick={() => update(key, Math.max(0, (state[key] as number) - 1))}
                          label="−"
                        />
                        <span className="tabular-nums text-[17px] font-semibold w-8 text-center" style={{ color: "var(--color-text-primary)" }}>
                          {state[key] as number}
                        </span>
                        <StepperButton
                          onClick={() => update(key, Math.min(99, (state[key] as number) + 1))}
                          label="+"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Regras de placar — não se aplicam ao modo "só classificação" */}
            {state.scopeType !== "specials_only" && (<>
            {state.predictionMode === "score" && (<>
            <div className="p-4 rounded-card" style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    Acerto de placar exato
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                    Ex: chutou 2×1, deu 2×1 (recomendado: 10)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StepperButton onClick={() => update("exactScore", Math.max(1, state.exactScore - 1))} label="−" />
                  <span className="tabular-nums text-[17px] font-semibold w-8 text-center" style={{ color: "var(--color-text-primary)" }}>
                    {state.exactScore}
                  </span>
                  <StepperButton onClick={() => update("exactScore", Math.min(99, state.exactScore + 1))} label="+" />
                </div>
              </div>
            </div>

            {/* Pontos por vencedor */}
            <div className="p-4 rounded-card" style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    Acertou o vencedor
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                    Cravou quem ganha (recomendado: 4)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StepperButton onClick={() => update("winnerOnly", Math.max(0, state.winnerOnly - 1))} label="−" />
                  <span className="tabular-nums text-[17px] font-semibold w-8 text-center" style={{ color: "var(--color-text-primary)" }}>
                    {state.winnerOnly}
                  </span>
                  <StepperButton onClick={() => update("winnerOnly", Math.min(99, state.winnerOnly + 1))} label="+" />
                </div>
              </div>
            </div>
            </>)}

            {/* Prazo */}
            <div className="p-4 rounded-card" style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
              <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Prazo para palpitar em cada jogo
              </p>
              <p className="text-[13px] mb-3" style={{ color: "var(--color-text-secondary)" }}>
                O palpite de um jogo fecha neste tempo antes do início dele (recomendado: 15 min)
              </p>
              <div className="flex gap-2">
                {DEADLINE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update("deadlineMinutes", opt.value)}
                    className="flex-1 py-2 rounded-button text-[13px] font-semibold transition-all"
                    style={{
                      background: state.deadlineMinutes === opt.value
                        ? "var(--color-accent)"
                        : "var(--color-bg-secondary)",
                      color: state.deadlineMinutes === opt.value ? "#fff" : "var(--color-text-secondary)",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Regras avançadas */}
            <button
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="flex items-center gap-2 text-[15px] font-medium"
              style={{ color: "var(--color-accent)" }}
            >
              <svg
                width="16" height="16" viewBox="0 0 16 16" fill="none"
                className="transition-transform"
                style={{ transform: advancedOpen ? "rotate(90deg)" : "none" }}
              >
                <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Regras avançadas
            </button>

            {advancedOpen && (
              <div className="p-4 rounded-card flex flex-col gap-4" style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
                {state.predictionMode === "score" && (<>
                {/* Vencedor + saldo de gols */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      Vencedor + saldo de gols
                    </p>
                    <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                      Ex: chutou 2×0, deu 3×1 (recomendado: 7)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StepperButton onClick={() => update("winnerAndDiff", Math.max(0, state.winnerAndDiff - 1))} label="−" />
                    <span className="tabular-nums text-[17px] font-semibold w-8 text-center" style={{ color: "var(--color-text-primary)" }}>
                      {state.winnerAndDiff}
                    </span>
                    <StepperButton onClick={() => update("winnerAndDiff", Math.min(99, state.winnerAndDiff + 1))} label="+" />
                  </div>
                </div>

                {/* Empate sem placar exato */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      Empate sem placar exato
                    </p>
                    <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                      Ex: chutou 1×1, deu 2×2 (recomendado: 4)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StepperButton onClick={() => update("drawOnly", Math.max(0, state.drawOnly - 1))} label="−" />
                    <span className="tabular-nums text-[17px] font-semibold w-8 text-center" style={{ color: "var(--color-text-primary)" }}>
                      {state.drawOnly}
                    </span>
                    <StepperButton onClick={() => update("drawOnly", Math.min(99, state.drawOnly + 1))} label="+" />
                  </div>
                </div>

                {/* Consolação: gols de um time */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      Acertou os gols de um time
                    </p>
                    <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                      Errou o vencedor, mas acertou os gols de um lado (recomendado: 1 · 0 desliga)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StepperButton onClick={() => update("goalsOneTeam", Math.max(0, state.goalsOneTeam - 1))} label="−" />
                    <span className="tabular-nums text-[17px] font-semibold w-8 text-center" style={{ color: "var(--color-text-primary)" }}>
                      {state.goalsOneTeam}
                    </span>
                    <StepperButton onClick={() => update("goalsOneTeam", Math.min(99, state.goalsOneTeam + 1))} label="+" />
                  </div>
                </div>
                </>)}

                {/* Edição de palpite */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      Permitir edição de palpite
                    </p>
                    <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                      Mudar o palpite já enviado, quantas vezes quiser, até o prazo do jogo fechar
                    </p>
                  </div>
                  <Toggle value={state.allowEdit} onChange={(v) => update("allowEdit", v)} />
                </div>

                {/* Bônus early bird */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      Bônus palpite antecipado
                    </p>
                    <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                      Palpitou 4+ dias antes do jogo e não mudou (recomendado: +2)
                    </p>
                  </div>
                  <Toggle value={state.earlyBirdEnabled} onChange={(v) => update("earlyBirdEnabled", v)} />
                </div>
                {state.earlyBirdEnabled && (
                  <div className="flex items-center justify-between">
                    <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>Pontos de bônus</p>
                    <div className="flex items-center gap-2">
                      <StepperButton onClick={() => update("earlyBirdPoints", Math.max(1, state.earlyBirdPoints - 1))} label="−" />
                      <span className="tabular-nums text-[17px] font-semibold w-8 text-center" style={{ color: "var(--color-text-primary)" }}>
                        {state.earlyBirdPoints}
                      </span>
                      <StepperButton onClick={() => update("earlyBirdPoints", Math.min(99, state.earlyBirdPoints + 1))} label="+" />
                    </div>
                  </div>
                )}

                {/* Resumo multiplicadores de fase */}
                <div>
                  <p className="text-[13px] font-medium mb-2" style={{ color: "var(--color-text-secondary)" }}>
                    Multiplicadores por fase
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(DEFAULT_RULESET.stage_multipliers).map(([stage, mult]) => (
                      <span key={stage} className="text-[11px] font-semibold px-2 py-1 rounded-badge"
                        style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}>
                        {stageLabel(stage)} ×{mult}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            </>)}
          </div>
        )}

        {/* ─── PASSO 3 ─── */}
        {step === 3 && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-[22px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                Tudo certo?
              </h2>
              <p className="mt-1 text-[15px]" style={{ color: "var(--color-text-secondary)" }}>
                Revise antes de criar.
              </p>
            </div>

            {/* Card revisão */}
            <div className="p-4 rounded-card flex flex-col gap-3" style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
              <ReviewRow label="Nome" value={state.poolName} />
              <ReviewRow
                label="Escopo"
                value={state.scopeType === "full"
                  ? "Copa Inteira"
                  : state.scopeType === "specials_only"
                    ? "Só classificação (grupos + campeão)"
                    : `${state.selectedMatches.length} jogo(s) selecionado(s)`}
              />
              <ReviewRow
                label="Campeão"
                value={effectivePreCopaLocked
                  ? "Indisponível (Copa em andamento)"
                  : state.championEnabled || state.scopeType === "specials_only"
                    ? `${state.championPoints} pts`
                    : "Desligada"}
              />
              <ReviewRow
                label="Classificados"
                value={effectivePreCopaLocked
                  ? "Indisponível (Copa em andamento)"
                  : state.qualifiersEnabled || state.scopeType === "specials_only"
                    ? `${state.qualifiersPoints} pts/time`
                    : "Desligada"}
              />
              <ReviewRow
                label="Bracket pré-Copa"
                value={effectivePreCopaLocked
                  ? "Indisponível (Copa em andamento)"
                  : state.bracketEnabled
                    ? `Campeão: ${state.bracketPointsChampion}pts · Oitavas: ${state.bracketPointsR16}pts`
                    : "Desligado"}
              />
              {state.scopeType !== "specials_only" && (<>
              <ReviewRow
                label="Palpite"
                value={state.predictionMode === "winner" ? "Só o vencedor" : "Placar completo"}
              />
              {state.predictionMode === "score" ? (<>
              <ReviewRow label="Placar exato" value={`${state.exactScore} pts`} />
              <ReviewRow label="Vencedor + saldo" value={`${state.winnerAndDiff} pts`} />
              <ReviewRow label="Vencedor certo" value={`${state.winnerOnly} pts`} />
              <ReviewRow label="Empate sem placar" value={`${state.drawOnly} pts`} />
              <ReviewRow
                label="Gols de um time"
                value={state.goalsOneTeam === 0 ? "Desligada" : `${state.goalsOneTeam} pt(s)`}
              />
              </>) : (<>
              <ReviewRow label="Acertou quem ganha" value={`${state.winnerPickPoints} pts`} />
              <ReviewRow
                label="Bônus placar cravado"
                value={state.winnerExactBonus === 0 ? "Desligado" : `+${state.winnerExactBonus} pts`}
              />
              </>)}
              <ReviewRow
                label="Bônus antecipado"
                value={state.earlyBirdEnabled ? `+${state.earlyBirdPoints} pts` : "Desligada"}
              />
              <ReviewRow label="Palpites fecham" value={`${deadlineLabel} de cada jogo`} />
              <ReviewRow label="Edição de palpite" value={state.allowEdit ? "Permitida até o prazo" : "Bloqueada"} />
              </>)}
              {!effectivePreCopaLocked && effectivePreCopaLockLabel &&
                (state.championEnabled || state.qualifiersEnabled || state.bracketEnabled || state.scopeType === "specials_only") && (
                <ReviewRow label="Pré-Copa trava em" value={effectivePreCopaLockLabel} />
              )}
            </div>

            {/* Campo de nome se sem sessão */}
            {hasSession === false && (
              <div>
                <label className="block text-[13px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                  Seu nome (organizador)
                </label>
                <input
                  type="text"
                  value={state.userName}
                  onChange={(e) => update("userName", e.target.value)}
                  placeholder="Como você quer ser chamado?"
                  maxLength={64}
                  className="w-full px-4 py-3 rounded-button border text-[17px] outline-none focus-visible:ring-2 focus-visible:ring-[--color-accent]"
                  style={{
                    background: "var(--color-bg-card)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </div>
            )}

            {error && (
              <p className="text-[13px] font-medium" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bottom action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 border-t"
        style={{ background: "var(--color-bg-primary)", borderColor: "var(--color-bg-secondary)" }}>
        <div className="max-w-lg mx-auto">
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !canAdvanceStep1()}
              className="w-full py-4 rounded-button text-white font-semibold text-[17px] transition-all active:scale-[0.98] disabled:opacity-40"
              style={{
                background: "var(--color-accent)",
                transitionTimingFunction: "var(--ease-spring)",
                transitionDuration: "var(--duration-feedback)",
              }}
            >
              Continuar
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-4 rounded-button text-white font-semibold text-[17px] transition-all active:scale-[0.98] disabled:opacity-60"
              style={{
                background: "var(--color-accent)",
                transitionTimingFunction: "var(--ease-spring)",
                transitionDuration: "var(--duration-feedback)",
              }}
            >
              {loading ? "Criando…" : "Criar bolão"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function StepperButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="w-11 h-11 rounded-button flex items-center justify-center font-semibold text-[20px] transition-opacity active:opacity-60"
      style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-primary)" }}
      aria-label={label}
    >
      {label}
    </button>
  );
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => !disabled && onChange(!value)}
      className="w-12 h-7 rounded-full relative transition-colors disabled:opacity-40"
      style={{ background: value ? "var(--color-accent)" : "var(--color-bg-secondary)" }}
    >
      <span
        className="absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform"
        style={{
          transform: value ? "translateX(22px)" : "translateX(2px)",
          transitionTimingFunction: "var(--ease-spring)",
        }}
      />
    </button>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span className="text-[15px] font-medium" style={{ color: "var(--color-text-primary)" }}>{value}</span>
    </div>
  );
}

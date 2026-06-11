"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_RULESET } from "@/lib/scoring";
import type { Match } from "@/lib/types";
import { formatKickoff, stageLabel } from "@/lib/utils";
import { createClient } from "@/lib/supabase/browser";
import { slugify } from "@/lib/utils";

type ScopeType = "full" | "custom";

interface WizardState {
  // Passo 1
  poolName: string;
  scopeType: ScopeType;
  selectedMatches: string[];
  // Passo 2
  exactScore: number;
  winnerOnly: number;
  deadlineMinutes: number;
  allowEdit: boolean;
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
    exactScore: DEFAULT_RULESET.scoring.exact_score,
    winnerOnly: DEFAULT_RULESET.scoring.winner_only,
    deadlineMinutes: DEFAULT_RULESET.deadline.minutes_before,
    allowEdit: true,
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

      const ruleset = {
        ...DEFAULT_RULESET,
        scoring: {
          ...DEFAULT_RULESET.scoring,
          exact_score: state.exactScore,
          winner_only: state.winnerOnly,
          draw_only: state.winnerOnly,
        },
        deadline: {
          mode: "per_match",
          minutes_before: state.deadlineMinutes,
        },
        edits: { allowed: state.allowEdit },
      };

      const scope =
        state.scopeType === "full"
          ? { type: "full" }
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
                className="w-full px-4 py-3 rounded-button border text-[17px] outline-none"
                style={{
                  background: "var(--color-bg-card)",
                  borderColor: "var(--color-bg-secondary)",
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
                    sub: "Todos os 104 jogos do torneio",
                    icon: "🌍",
                  },
                  {
                    id: "custom" as const,
                    title: "Escolher jogos",
                    sub: "Selecione quais jogos entram no bolão",
                    icon: "🎯",
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => update("scopeType", opt.id)}
                    className="flex items-center gap-3 p-4 rounded-card text-left transition-all"
                    style={{
                      background: state.scopeType === opt.id
                        ? "var(--color-accent)"
                        : "var(--color-bg-card)",
                      boxShadow: "var(--shadow-card)",
                      color: state.scopeType === opt.id ? "#fff" : "var(--color-text-primary)",
                    }}
                  >
                    <span className="text-2xl">{opt.icon}</span>
                    <div>
                      <p className="font-semibold text-[15px]">{opt.title}</p>
                      <p className="text-[13px] opacity-70">{opt.sub}</p>
                    </div>
                  </button>
                ))}
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
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        selectedMatches:
                          s.selectedMatches.length === matches.length
                            ? []
                            : matches.map((m) => m.id),
                      }))
                    }
                    className="text-[13px] font-medium"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {state.selectedMatches.length === matches.length ? "Desmarcar tudo" : "Marcar tudo"}
                  </button>
                </div>
                <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                  {matches.map((m) => {
                    const { date, time } = formatKickoff(m.kickoff_at);
                    const selected = state.selectedMatches.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => toggleMatch(m.id)}
                        className="flex items-center gap-3 p-3 rounded-card text-left"
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
                            {date} • {time} • {stageLabel(m.stage)}
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
                Defaults prontos para usar. Mude se quiser.
              </p>
            </div>

            {/* Pontos por placar exato */}
            <div className="p-4 rounded-card" style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    Acerto de placar exato
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                    Ex: chutou 2×1, deu 2×1
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
                    Cravou quem ganha (ou empate)
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

            {/* Prazo */}
            <div className="p-4 rounded-card" style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
              <p className="text-[15px] font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
                Prazo para palpitar
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
                {/* Edição de palpite */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      Permitir edição de palpite
                    </p>
                    <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                      Até o prazo fechar
                    </p>
                  </div>
                  <Toggle value={state.allowEdit} onChange={(v) => update("allowEdit", v)} />
                </div>

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
                  : `${state.selectedMatches.length} jogo(s) selecionado(s)`}
              />
              <ReviewRow label="Placar exato" value={`${state.exactScore} pts`} />
              <ReviewRow label="Vencedor certo" value={`${state.winnerOnly} pts`} />
              <ReviewRow
                label="Prazo"
                value={DEADLINE_OPTIONS.find((o) => o.value === state.deadlineMinutes)?.label ?? "—"}
              />
              <ReviewRow label="Edição de palpite" value={state.allowEdit ? "Permitida" : "Bloqueada"} />
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
                  className="w-full px-4 py-3 rounded-button border text-[17px] outline-none"
                  style={{
                    background: "var(--color-bg-card)",
                    borderColor: "var(--color-bg-secondary)",
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
              className="w-full py-4 rounded-button text-white font-semibold text-[17px] transition-opacity disabled:opacity-40"
              style={{ background: "var(--color-accent)" }}
            >
              Continuar
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-4 rounded-button text-white font-semibold text-[17px] transition-opacity disabled:opacity-60"
              style={{ background: "var(--color-accent)" }}
            >
              {loading ? "Criando..." : "Criar Bolão"}
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

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="w-12 h-7 rounded-full relative transition-colors"
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

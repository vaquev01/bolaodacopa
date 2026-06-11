"use client";

import { useState, useEffect } from "react";
import type { Ruleset } from "@/lib/scoring";
import { getFlag } from "@/lib/utils";

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
}: Props) {
  const [payload, setPayload] = useState<BracketPayload>(() => parseBracket(myBracket));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const { label: countdownLabel, urgency: countdownUrgency } = useCountdown(lockAt);

  const pts = ruleset.advance_predictions?.points;
  const activeGroups = GROUPS.filter((g) => groupTeams[g]?.length > 0);

  // Progresso de grupos
  const completedGroups = activeGroups.filter((g) => {
    const p = payload.groups[g] ?? [];
    return p[0] && p[1];
  }).length;

  // Derivar lista de qualificados a partir dos picks de grupo
  const qualifiedFromGroups: string[] = [];
  for (const g of activeGroups) {
    const picks = payload.groups[g] ?? [];
    for (const t of picks) {
      if (t && !qualifiedFromGroups.includes(t)) qualifiedFromGroups.push(t);
    }
  }
  for (const t of payload.third_qualifiers) {
    if (t && !qualifiedFromGroups.includes(t)) qualifiedFromGroups.push(t);
  }

  // ── Handlers ─────────────────────────────────────────────────

  function handleGroupChipTap(group: string, team: string) {
    setPayload((p) => {
      const cur = p.groups[group] ?? ["", ""];
      const [p1, p2] = cur;
      let next: string[];
      if (p1 === team) {
        next = [p2, ""];
      } else if (p2 === team) {
        next = [p1, ""];
      } else if (!p1) {
        next = [team, p2 === team ? "" : p2];
      } else if (!p2) {
        next = [p1, team];
      } else {
        next = [p1, team];
      }
      return { ...p, groups: { ...p.groups, [group]: next } };
    });
    setStatus("idle");
  }

  function toggleKO(
    phase: "r16_winners" | "qf_winners" | "sf_winners" | "finalists",
    team: string
  ) {
    setPayload((p) => {
      const cur = p[phase];
      const next = cur.includes(team) ? cur.filter((t) => t !== team) : [...cur, team];
      return { ...p, [phase]: next };
    });
    setStatus("idle");
  }

  function setChampion(team: string) {
    setPayload((p) => ({ ...p, champion: p.champion === team ? "" : team }));
    setStatus("idle");
  }

  function setThirdPlace(team: string) {
    setPayload((p) => ({ ...p, third_place: p.third_place === team ? "" : team }));
    setStatus("idle");
  }

  async function handleSave() {
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
      </div>
    );
  }

  // ── Formulário de preenchimento ───────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="rounded-card p-4" style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h2 className="text-[17px] font-bold mb-1" style={{ color: "var(--color-text-primary)" }}>
              Bracket pré-Copa
            </h2>
            <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              Escolha 1º e 2º de cada grupo — depois o mata-mata se monta.
            </p>
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
          <div className="flex flex-wrap gap-1.5 mt-3">
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
        <Section title="Grupos — 1º e 2º classificados" progress={`${completedGroups}/${activeGroups.length}`}>
          {activeGroups.map((g) => {
            const teamList = groupTeams[g] ?? [];
            const picks = payload.groups[g] ?? ["", ""];
            const [p1, p2] = picks;
            return (
              <div key={g} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                    Grupo {g}
                  </span>
                  {p1 && p2 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-badge"
                      style={{ background: "var(--color-success)", color: "#fff" }}>
                      OK
                    </span>
                  )}
                  {(p1 || p2) && !(p1 && p2) && (
                    <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
                      falta {!p1 ? "1º" : "2º"}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {teamList.map((team) => {
                    const chipState: "none" | "first" | "second" =
                      p1 === team ? "first" : p2 === team ? "second" : "none";
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
        </Section>
      )}

      {/* Oitavas */}
      {qualifiedFromGroups.length > 0 && (
        <Section title={`Oitavas de final — ${pts?.r16 ?? 2} pts/seleção`}>
          <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Quais seleções chegam às oitavas?
          </p>
          <TeamChips
            teams={qualifiedFromGroups}
            selected={payload.r16_winners}
            onToggle={(t) => toggleKO("r16_winners", t)}
          />
        </Section>
      )}

      {/* Quartas */}
      {payload.r16_winners.length > 0 && (
        <Section title={`Quartas de final — ${pts?.qf ?? 3} pts/seleção`}>
          <TeamChips
            teams={payload.r16_winners}
            selected={payload.qf_winners}
            onToggle={(t) => toggleKO("qf_winners", t)}
          />
        </Section>
      )}

      {/* Semis */}
      {payload.qf_winners.length > 0 && (
        <Section title={`Semifinais — ${pts?.sf ?? 5} pts/seleção`}>
          <TeamChips
            teams={payload.qf_winners}
            selected={payload.sf_winners}
            onToggle={(t) => toggleKO("sf_winners", t)}
          />
        </Section>
      )}

      {/* Finalistas */}
      {payload.sf_winners.length > 0 && (
        <Section title={`Finalistas — ${pts?.final ?? 8} pts/seleção`}>
          <TeamChips
            teams={payload.sf_winners}
            selected={payload.finalists}
            onToggle={(t) => toggleKO("finalists", t)}
          />
        </Section>
      )}

      {/* Campeão — destaque visual */}
      {payload.finalists.length > 0 && (
        <div
          className="rounded-card p-4 flex flex-col gap-3"
          style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-gold)" }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold" style={{ color: "var(--color-text-primary)" }}>
              Campeão
            </h3>
            <span className="text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-badge"
              style={{ background: "var(--color-gold)", color: "#1D1D1F" }}>
              {pts?.champion ?? 25} pts
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {payload.finalists.map((t) => (
              <PodiumChip
                key={t}
                team={t}
                selected={payload.champion === t}
                label="Campeão"
                onClick={() => setChampion(t)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 3º lugar */}
      {payload.sf_winners.length > 0 && (
        <Section title={`3º lugar — ${pts?.third_place ?? 8} pts`}>
          <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Quem vence o jogo do 3º lugar?
          </p>
          <TeamChips
            teams={
              payload.sf_winners.filter((t) => !payload.finalists.includes(t)).length > 0
                ? payload.sf_winners.filter((t) => !payload.finalists.includes(t))
                : payload.sf_winners
            }
            selected={payload.third_place ? [payload.third_place] : []}
            onToggle={setThirdPlace}
          />
        </Section>
      )}

      {/* Botão salvar */}
      {errorMsg && (
        <p className="text-[13px]" style={{ color: "var(--color-danger)" }}>{errorMsg}</p>
      )}
      <button
        onClick={handleSave}
        disabled={status === "saving"}
        className="w-full py-4 rounded-button text-white font-semibold text-[17px] transition-opacity disabled:opacity-60"
        style={{ background: "var(--color-accent)" }}
      >
        {status === "saving" ? "Salvando…" : status === "saved" ? "Salvo!" : "Salvar Bracket"}
      </button>
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
  state: "none" | "first" | "second";
  onClick: () => void;
}) {
  const flag = getFlag(team);

  const bg =
    state === "first" ? "var(--color-accent)"
    : state === "second" ? "transparent"
    : "var(--color-bg-secondary)";

  const border =
    state === "second" ? "1.5px solid var(--color-accent)" : "1.5px solid transparent";

  const color =
    state === "first" ? "#fff"
    : state === "second" ? "var(--color-accent)"
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
          {state === "first" ? "1º" : "2º"}
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

// Chip do pódio (campeão destacado com gold)
function PodiumChip({
  team,
  selected,
  label,
  onClick,
}: {
  team: string;
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-3 rounded-button text-[15px] font-bold transition-all active:scale-95"
      style={{
        background: selected ? "var(--color-accent)" : "var(--color-bg-secondary)",
        color: selected ? "#fff" : "var(--color-text-secondary)",
        border: selected ? "2px solid var(--color-gold)" : "2px solid transparent",
        boxShadow: selected ? "var(--shadow-gold)" : "none",
        transitionTimingFunction: "var(--ease-spring)",
        transitionDuration: "var(--duration-feedback)",
        minHeight: "52px",
      }}
      aria-pressed={selected}
      aria-label={`${label}: ${team}`}
    >
      <span className="text-xl" aria-hidden="true">{getFlag(team)}</span>
      <span>{team}</span>
      {selected && (
        <span
          className="ml-1 text-[11px] font-bold px-2 py-0.5 rounded-badge"
          style={{ background: "var(--color-gold)", color: "#1D1D1F" }}
        >
          {label}
        </span>
      )}
    </button>
  );
}

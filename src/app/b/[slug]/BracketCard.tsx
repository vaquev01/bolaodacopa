"use client";

import { useState, useEffect } from "react";
import type { Ruleset } from "@/lib/scoring";

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

function useCountdown(lockAt: string | null): string {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!lockAt) return;
    function update() {
      const diff = new Date(lockAt!).getTime() - Date.now();
      if (diff <= 0) { setLabel(""); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 24) {
        setLabel(`${Math.floor(h / 24)}d ${h % 24}h`);
      } else if (h > 0) {
        setLabel(`${h}h ${m}m`);
      } else {
        setLabel(`${m}m ${s}s`);
      }
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lockAt]);
  return label;
}

// ─── Main Component ──────────────────────────────────────────

export default function BracketCard({
  poolId,
  ruleset,
  teams,
  groupTeams,
  myBracket,
  lockAt,
  locked,
}: Props) {
  const [payload, setPayload] = useState<BracketPayload>(() => parseBracket(myBracket));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const countdown = useCountdown(lockAt);

  const pts = ruleset.advance_predictions?.points;
  const activeGroups = GROUPS.filter((g) => groupTeams[g]?.length > 0);

  // Derivar lista de qualificados a partir dos picks de grupo
  const qualifiedFromGroups: string[] = [];
  for (const g of activeGroups) {
    const picks = payload.groups[g] ?? [];
    for (const t of picks) {
      if (t && !qualifiedFromGroups.includes(t)) qualifiedFromGroups.push(t);
    }
  }
  // Adicionar third_qualifiers
  for (const t of payload.third_qualifiers) {
    if (t && !qualifiedFromGroups.includes(t)) qualifiedFromGroups.push(t);
  }

  function setGroupPick(group: string, pos: number, team: string) {
    setPayload((p) => {
      const cur = p.groups[group] ?? ["", ""];
      const updated = [...cur] as string[];
      updated[pos] = team;
      if (pos === 0 && updated[1] === team) updated[1] = "";
      if (pos === 1 && updated[0] === team) updated[0] = "";
      return { ...p, groups: { ...p.groups, [group]: updated } };
    });
  }

  function toggleKO(
    phase: "r16_winners" | "qf_winners" | "sf_winners" | "finalists",
    team: string
  ) {
    setPayload((p) => {
      const cur = p[phase];
      const next = cur.includes(team)
        ? cur.filter((t) => t !== team)
        : [...cur, team];
      return { ...p, [phase]: next };
    });
  }

  function setChampion(team: string) {
    setPayload((p) => ({ ...p, champion: p.champion === team ? "" : team }));
  }

  function setThirdPlace(team: string) {
    setPayload((p) => ({ ...p, third_place: p.third_place === team ? "" : team }));
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold" style={{ color: "var(--color-text-primary)" }}>
              Meu Bracket
            </h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-badge"
              style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}>
              Travado
            </span>
          </div>

          {!myBracket ? (
            <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              Você não preencheu o bracket antes do prazo.
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
        <h2 className="text-[15px] font-bold mb-1" style={{ color: "var(--color-text-primary)" }}>
          Bracket pré-Copa
        </h2>
        <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          Palpite de classificados, semifinalistas e campeão antes da Copa — pontos extras por fase.
        </p>
        {lockAt && countdown && (
          <p className="text-[13px] font-semibold mt-2" style={{ color: "var(--color-warning)" }}>
            Trava em {countdown}
          </p>
        )}
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
        <Section title="Grupos — 1º e 2º classificados">
          {activeGroups.map((g) => {
            const teamList = groupTeams[g] ?? [];
            const picks = payload.groups[g] ?? ["", ""];
            return (
              <div key={g} className="flex flex-col gap-1">
                <p className="text-[12px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                  Grupo {g}
                </p>
                <div className="flex gap-2">
                  <TeamSelect
                    value={picks[0] ?? ""}
                    options={teamList}
                    excluded={picks[1] ?? ""}
                    placeholder="1º..."
                    onChange={(t) => setGroupPick(g, 0, t)}
                    aria={`1º do grupo ${g}`}
                  />
                  <TeamSelect
                    value={picks[1] ?? ""}
                    options={teamList}
                    excluded={picks[0] ?? ""}
                    placeholder="2º..."
                    onChange={(t) => setGroupPick(g, 1, t)}
                    aria={`2º do grupo ${g}`}
                  />
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {/* Oitavas */}
      {qualifiedFromGroups.length > 0 && (
        <Section title={`Oitavas — ${pts?.r16 ?? 2} pts/seleção`}>
          <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Quais times chegam às oitavas?
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
        <Section title={`Quartas — ${pts?.qf ?? 3} pts/seleção`}>
          <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Quais times chegam às quartas?
          </p>
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

      {/* Campeão */}
      {payload.finalists.length > 0 && (
        <Section title={`Campeão — ${pts?.champion ?? 25} pts`}>
          <TeamChips
            teams={payload.finalists}
            selected={payload.champion ? [payload.champion] : []}
            onToggle={setChampion}
          />
        </Section>
      )}

      {/* 3º lugar — dos semifinalistas que não chegaram à final */}
      {payload.sf_winners.length > 0 && (
        <Section title={`3º lugar — ${pts?.third_place ?? 8} pts`}>
          <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Quem vence o jogo do 3º lugar?
          </p>
          <TeamChips
            teams={payload.sf_winners.filter((t) => !payload.finalists.includes(t)).length > 0
              ? payload.sf_winners.filter((t) => !payload.finalists.includes(t))
              : payload.sf_winners}
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
  const rows: Array<[string, string]> = [
    ["Campeão", payload.champion || "—"],
    ["Vice", payload.finalists.find((t) => t !== payload.champion) || "—"],
    ["3º lugar", payload.third_place || "—"],
    ["Finalistas", payload.finalists.join(" × ") || "—"],
    ["Semifinalistas", payload.sf_winners.join(", ") || "—"],
    ["Quartas", payload.qf_winners.join(", ") || "—"],
    ["Oitavas", payload.r16_winners.slice(0, 4).join(", ") + (payload.r16_winners.length > 4 ? "…" : "") || "—"],
  ];

  return (
    <div className="flex flex-col gap-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between">
          <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>{label}</span>
          <span className="text-[13px] font-semibold text-right" style={{ color: "var(--color-text-primary)", maxWidth: "60%" }}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers de UI ────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card p-4 flex flex-col gap-3"
      style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}>
      <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

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
            className="px-3 py-1.5 rounded-button text-[13px] font-semibold transition-all"
            style={{
              background: isSelected ? "var(--color-accent)" : "var(--color-bg-secondary)",
              color: isSelected ? "#fff" : "var(--color-text-secondary)",
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

function TeamSelect({
  value,
  options,
  excluded,
  placeholder,
  onChange,
  aria,
}: {
  value: string;
  options: string[];
  excluded: string;
  placeholder: string;
  onChange: (t: string) => void;
  aria: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 py-2 px-2 rounded-button text-[12px] outline-none"
      style={{
        background: "var(--color-bg-secondary)",
        color: value ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        border: "none",
      }}
      aria-label={aria}
    >
      <option value="">{placeholder}</option>
      {options.map((t) => (
        <option key={t} value={t} disabled={t === excluded}>{t}</option>
      ))}
    </select>
  );
}

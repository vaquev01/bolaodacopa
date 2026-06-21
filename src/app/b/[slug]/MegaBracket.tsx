"use client";

/**
 * MegaBracket — "o palpite de todo mundo": comparação dos brackets de TODOS os
 * participantes, lado a lado. Só aparece com o bolão FECHADO (os dados de
 * all_brackets só chegam do RPC get_pool_brackets quando locked = true).
 * Mostra o consenso do campeão + uma grade Campeão/Vice/Semifinalistas por pessoa.
 */

import { useMemo } from "react";
import { getFlag } from "@/lib/utils";
import type { BracketOutcome, BracketPoints } from "@/lib/scoring";
import BracketCompare from "./BracketCompare";

interface BracketPayload {
  champion?: string;
  finalists?: string[];
  sf_winners?: string[];
  qf_winners?: string[];
  [k: string]: unknown;
}

export interface BracketEntry {
  user_id: string;
  name: string;
  payload: BracketPayload;
  score?: number | null;
}

interface Props {
  allBrackets: BracketEntry[];
  currentUserId: string;
  groupTeams: Record<string, string[]>;
  /** Resultado real do torneio — habilita a pontuação por acerto no comparativo. */
  outcome?: BracketOutcome;
  /** Pontos por fase do ruleset — quanto vale cada acerto. */
  bracketPoints?: BracketPoints;
}

export default function MegaBracket({ allBrackets, currentUserId, groupTeams, outcome, bracketPoints }: Props) {
  // Você primeiro, depois alfabético.
  const entries = useMemo(() => {
    return [...allBrackets].sort((a, b) => {
      if (a.user_id === currentUserId) return -1;
      if (b.user_id === currentUserId) return 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [allBrackets, currentUserId]);

  // Consenso do campeão: seleção → quem apostou.
  const championConsensus = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of entries) {
      const champ = e.payload.champion;
      if (!champ) continue;
      const who = e.user_id === currentUserId ? "Você" : e.name;
      if (!map.has(champ)) map.set(champ, []);
      map.get(champ)!.push(who);
    }
    return Array.from(map.entries())
      .map(([team, people]) => ({ team, people }))
      .sort((a, b) => b.people.length - a.people.length || a.team.localeCompare(b.team, "pt-BR"));
  }, [entries, currentUserId]);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[17px] font-bold" style={{ color: "var(--color-text-primary)" }}>
          Mega chaveamento 🗺️
        </h2>
        <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          O palpite de mata-mata de todo mundo, agora que o bolão fechou. {entries.length}{" "}
          {entries.length === 1 ? "cartão" : "cartões"} preenchidos.
        </p>
      </div>

      {/* Consenso do campeão */}
      <section>
        <h3 className="text-[13px] font-semibold mb-2" style={{ color: "var(--color-text-secondary)" }}>
          🏆 Em quem cada um aposta o título
        </h3>
        <div className="flex flex-col gap-2">
          {championConsensus.map(({ team, people }) => (
            <div
              key={team}
              className="flex items-center gap-3 px-3 py-2 rounded-card"
              style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
            >
              <span className="text-[20px] flex-shrink-0" aria-hidden="true">{getFlag(team)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                  {team}
                </p>
                <p className="text-[12px] truncate" style={{ color: "var(--color-text-secondary)" }}>
                  {people.join(", ")}
                </p>
              </div>
              <span
                className="text-[13px] font-bold tabular-nums px-2 py-0.5 rounded-badge flex-shrink-0"
                style={{ background: "var(--color-bg-secondary)", color: "var(--color-accent)" }}
              >
                {people.length}×
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Árvore comparativa: caminho de cada um, com filtro de competidor e fase */}
      <BracketCompare
        allBrackets={allBrackets}
        currentUserId={currentUserId}
        groupTeams={groupTeams}
        outcome={outcome}
        bracketPoints={bracketPoints}
      />
    </div>
  );
}

"use client";

/**
 * MegaBracket — "o palpite de todo mundo": comparação dos brackets de TODOS os
 * participantes, lado a lado. Só aparece com o bolão FECHADO (os dados de
 * all_brackets só chegam do RPC get_pool_brackets quando locked = true).
 * Mostra o consenso do campeão + uma grade Campeão/Vice/Semifinalistas por pessoa.
 */

import { useMemo, useState } from "react";
import { getFlag } from "@/lib/utils";

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
}

function TeamChip({ team, strong = false }: { team?: string; strong?: boolean }) {
  if (!team || team === "A definir") {
    return <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span aria-hidden="true">{getFlag(team)}</span>
      <span
        className="text-[12px] truncate"
        style={{ color: "var(--color-text-primary)", fontWeight: strong ? 700 : 500, maxWidth: 88 }}
        title={team}
      >
        {team}
      </span>
    </span>
  );
}

export default function MegaBracket({ allBrackets, currentUserId }: Props) {
  const [showQF, setShowQF] = useState(false);

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

  const vice = (p: BracketPayload): string | undefined =>
    (p.finalists ?? []).find((t) => t !== p.champion);

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

      {/* Grade comparativa */}
      <section>
        <h3 className="text-[13px] font-semibold mb-2" style={{ color: "var(--color-text-secondary)" }}>
          Caminho de cada um até o título
        </h3>
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
            <thead>
              <tr>
                <th
                  className="sticky left-0 z-10 text-left text-[11px] font-semibold px-2 py-2"
                  style={{ background: "var(--color-bg-primary)", color: "var(--color-text-secondary)" }}
                >
                  Quem
                </th>
                <th className="text-left text-[11px] font-semibold px-2 py-2 whitespace-nowrap" style={{ color: "var(--color-text-secondary)" }}>🥇 Campeão</th>
                <th className="text-left text-[11px] font-semibold px-2 py-2 whitespace-nowrap" style={{ color: "var(--color-text-secondary)" }}>🥈 Vice</th>
                <th className="text-left text-[11px] font-semibold px-2 py-2 whitespace-nowrap" style={{ color: "var(--color-text-secondary)" }}>🏅 Semifinais</th>
                {showQF && (
                  <th className="text-left text-[11px] font-semibold px-2 py-2 whitespace-nowrap" style={{ color: "var(--color-text-secondary)" }}>⚔️ Quartas</th>
                )}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const mine = e.user_id === currentUserId;
                const semis = e.payload.sf_winners ?? [];
                const qfs = e.payload.qf_winners ?? [];
                return (
                  <tr key={e.user_id}>
                    <td
                      className="sticky left-0 z-10 px-2 py-2 text-[12px] font-semibold whitespace-nowrap"
                      style={{
                        background: mine ? "color-mix(in srgb, var(--color-accent) 10%, var(--color-bg-card))" : "var(--color-bg-card)",
                        color: mine ? "var(--color-accent)" : "var(--color-text-primary)",
                        borderTop: "1px solid var(--border-subtle)",
                      }}
                    >
                      {mine ? "Você" : e.name}
                    </td>
                    <td className="px-2 py-2" style={{ background: "var(--color-bg-card)", borderTop: "1px solid var(--border-subtle)" }}>
                      <TeamChip team={e.payload.champion} strong />
                    </td>
                    <td className="px-2 py-2" style={{ background: "var(--color-bg-card)", borderTop: "1px solid var(--border-subtle)" }}>
                      <TeamChip team={vice(e.payload)} />
                    </td>
                    <td className="px-2 py-2" style={{ background: "var(--color-bg-card)", borderTop: "1px solid var(--border-subtle)" }}>
                      <div className="flex flex-col gap-1">
                        {semis.length ? semis.map((t, i) => <TeamChip key={i} team={t} />) : <TeamChip />}
                      </div>
                    </td>
                    {showQF && (
                      <td className="px-2 py-2" style={{ background: "var(--color-bg-card)", borderTop: "1px solid var(--border-subtle)" }}>
                        <div className="flex flex-col gap-1">
                          {qfs.length ? qfs.map((t, i) => <TeamChip key={i} team={t} />) : <TeamChip />}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          onClick={() => setShowQF((v) => !v)}
          className="mt-2 text-[13px] font-semibold"
          style={{ color: "var(--color-accent)" }}
        >
          {showQF ? "Ocultar quartas de final" : "Mostrar também as quartas de final"}
        </button>
      </section>
    </div>
  );
}

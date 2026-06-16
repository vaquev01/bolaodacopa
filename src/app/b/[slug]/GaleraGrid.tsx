"use client";

/**
 * GaleraGrid — "Palpites da galera": grade jogo × pessoa que revela o que cada
 * um cravou DEPOIS que o jogo trava (a RLS de `predictions` só libera pós-kickoff,
 * então aqui nunca chega palpite de jogo aberto). Tocar no cabeçalho de um jogo
 * abre a comparação detalhada + a resenha daquele jogo.
 */

import { useEffect, useMemo, useState } from "react";
import type { Match, PoolMemberLite, RevealedPrediction, Comment } from "@/lib/types";
import type { Ruleset } from "@/lib/scoring";
import Comments from "./Comments";

/** Abreviação estável de time: 3 primeiras letras sem acento, maiúsculas. */
function abbr(name: string): string {
  if (!name || name === "A definir") return "?";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

/** Resultado real do jogo (FT com fallback 90), se já houver placar. */
function actualResult(m: Match): { h: number; a: number } | null {
  const h = m.score_home_ft ?? m.score_home_90;
  const a = m.score_away_ft ?? m.score_away_90;
  if (typeof h === "number" && typeof a === "number") return { h, a };
  return null;
}

/** Texto curto do palpite de uma pessoa. */
function pickLabel(p: RevealedPrediction["payload"]): string {
  if (typeof p.home === "number" && typeof p.away === "number") return `${p.home}×${p.away}`;
  if (p.winner === "home") return "Casa";
  if (p.winner === "away") return "Fora";
  if (p.winner === "draw") return "Empate";
  return "—";
}

interface Props {
  poolId: string;
  matches: Match[];
  members: PoolMemberLite[];
  revealedPredictions: RevealedPrediction[];
  comments: Comment[];
  currentUserId: string;
  ruleset: Ruleset;
}

export default function GaleraGrid({
  poolId,
  matches,
  members,
  revealedPredictions,
  comments,
  currentUserId,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  // Colunas = jogos revelados (têm ao menos 1 palpite liberado), em ordem de kickoff.
  const revealedMatchIds = useMemo(() => {
    const ids = new Set(revealedPredictions.map((r) => r.match_id));
    return Array.from(ids)
      .map((id) => matchById.get(id))
      .filter((m): m is Match => !!m)
      .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))
      .map((m) => m.id);
  }, [revealedPredictions, matchById]);

  // pick[matchId][userId] = palpite revelado
  const pickMap = useMemo(() => {
    const map = new Map<string, Map<string, RevealedPrediction>>();
    for (const r of revealedPredictions) {
      if (!map.has(r.match_id)) map.set(r.match_id, new Map());
      map.get(r.match_id)!.set(r.user_id, r);
    }
    return map;
  }, [revealedPredictions]);

  // Membros: você primeiro, depois ordem alfabética.
  const orderedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.user_id === currentUserId) return -1;
      if (b.user_id === currentUserId) return 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [members, currentUserId]);

  // Nº de resenhas por jogo (badge 💬 no cabeçalho).
  const matchCommentCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comments) {
      if (c.scope === "match" && c.match_id) m.set(c.match_id, (m.get(c.match_id) ?? 0) + 1);
    }
    return m;
  }, [comments]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (revealedMatchIds.length === 0) {
    return (
      <div className="max-w-lg mx-auto flex flex-col items-center justify-center py-16 gap-3 px-4">
        <p className="text-[34px]" aria-hidden="true">👀</p>
        <p className="text-[15px] text-center" style={{ color: "var(--color-text-secondary)" }}>
          Os palpites de todo mundo aparecem aqui assim que cada jogo começa.
          <br />
          Até lá, ninguém vê o seu — nem você vê o dos outros.
        </p>
      </div>
    );
  }

  const cellColor = (pts: number | null) =>
    pts == null
      ? "var(--color-text-primary)"
      : pts > 0
        ? "var(--color-success, #2e9e5b)"
        : "var(--color-text-secondary)";

  const selMatch = selected ? matchById.get(selected) ?? null : null;
  const selPicks = selected ? pickMap.get(selected) ?? new Map() : new Map();
  const selComments = selected ? comments.filter((c) => c.scope === "match" && c.match_id === selected) : [];

  return (
    <div className="px-4 py-3">
      <div className="max-w-lg lg:max-w-[1200px] mx-auto">
        <p className="text-[13px] mb-3" style={{ color: "var(--color-text-secondary)" }}>
          Toque num jogo pra ver os palpites lado a lado e a resenha. ✓ = pontuou.
        </p>

        {/* Grade rolável horizontal */}
        <div className="overflow-x-auto -mx-1 px-1 pb-2">
          <div
            className="inline-grid gap-px rounded-card overflow-hidden"
            style={{
              gridTemplateColumns: `116px repeat(${revealedMatchIds.length}, 60px)`,
              background: "var(--color-border, rgba(0,0,0,0.08))",
            }}
          >
            {/* Canto + cabeçalhos de jogo */}
            <div
              className="sticky left-0 z-10 px-2 py-2 text-[11px] font-semibold flex items-end"
              style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}
            >
              Jogo →
            </div>
            {revealedMatchIds.map((mid) => {
              const m = matchById.get(mid)!;
              const res = actualResult(m);
              const nComments = matchCommentCount.get(mid) ?? 0;
              return (
                <button
                  key={mid}
                  onClick={() => setSelected(mid)}
                  className="px-1 py-2 flex flex-col items-center justify-end gap-0.5"
                  style={{ background: "var(--color-bg-secondary)" }}
                  aria-label={`${m.home_team} contra ${m.away_team}`}
                >
                  <span className="text-[11px] font-bold leading-tight" style={{ color: "var(--color-text-primary)" }}>
                    {abbr(m.home_team)}
                  </span>
                  <span className="text-[11px] font-bold leading-tight" style={{ color: "var(--color-text-primary)" }}>
                    {abbr(m.away_team)}
                  </span>
                  <span
                    className="text-[11px] tabular-nums font-semibold mt-0.5 px-1 rounded-badge"
                    style={{ background: "var(--color-bg-card)", color: "var(--color-accent)" }}
                  >
                    {res ? `${res.h}×${res.a}` : "·"}
                  </span>
                  {nComments > 0 && (
                    <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
                      💬{nComments}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Linhas por pessoa */}
            {orderedMembers.map((mem) => {
              const mine = mem.user_id === currentUserId;
              return (
                <div key={mem.user_id} className="contents">
                  <div
                    className="sticky left-0 z-10 px-2 py-2 text-[12px] font-semibold truncate flex items-center"
                    style={{
                      background: mine ? "color-mix(in srgb, var(--color-accent) 10%, var(--color-bg-card))" : "var(--color-bg-card)",
                      color: mine ? "var(--color-accent)" : "var(--color-text-primary)",
                    }}
                    title={mem.name}
                  >
                    {mine ? "Você" : mem.name}
                  </div>
                  {revealedMatchIds.map((mid) => {
                    const pred = selPicksSafe(pickMap, mid, mem.user_id);
                    return (
                      <div
                        key={mid}
                        className="px-1 py-2 flex flex-col items-center justify-center"
                        style={{ background: "var(--color-bg-card)" }}
                      >
                        <span className="text-[12px] tabular-nums font-semibold" style={{ color: cellColor(pred?.points ?? null) }}>
                          {pred ? pickLabel(pred.payload) : "—"}
                        </span>
                        {pred && pred.points != null && pred.points > 0 && (
                          <span className="text-[10px]" style={{ color: "var(--color-success, #2e9e5b)" }}>
                            +{pred.points}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sheet de um jogo: comparação + resenha */}
      {selMatch && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => setSelected(null)} aria-hidden="true" />
          <div
            className="relative w-full max-w-lg max-h-[88dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
            style={{ background: "var(--color-bg-primary)", boxShadow: "var(--shadow-card)" }}
          >
            <div
              className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
              style={{ background: "var(--color-bg-primary)", borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div>
                <h2 className="text-[16px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                  {selMatch.home_team} × {selMatch.away_team}
                </h2>
                {actualResult(selMatch) && (
                  <p className="text-[13px]" style={{ color: "var(--color-accent)" }}>
                    Resultado: {actualResult(selMatch)!.h} × {actualResult(selMatch)!.a}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-5">
              {/* Palpites lado a lado */}
              <section>
                <h3 className="text-[13px] font-semibold mb-2" style={{ color: "var(--color-text-secondary)" }}>
                  Quem cravou o quê
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {orderedMembers.map((mem) => {
                    const pred = selPicks.get(mem.user_id) as RevealedPrediction | undefined;
                    const mine = mem.user_id === currentUserId;
                    return (
                      <li
                        key={mem.user_id}
                        className="flex items-center justify-between px-3 py-2 rounded-card"
                        style={{
                          background: mine ? "color-mix(in srgb, var(--color-accent) 8%, var(--color-bg-card))" : "var(--color-bg-card)",
                        }}
                      >
                        <span className="text-[14px] font-medium truncate" style={{ color: mine ? "var(--color-accent)" : "var(--color-text-primary)" }}>
                          {mine ? "Você" : mem.name}
                        </span>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[15px] tabular-nums font-bold" style={{ color: "var(--color-text-primary)" }}>
                            {pred ? pickLabel(pred.payload) : "—"}
                          </span>
                          {pred && pred.points != null && (
                            <span
                              className="text-[12px] font-bold tabular-nums px-1.5 py-0.5 rounded-badge"
                              style={{
                                background: "var(--color-bg-secondary)",
                                color: pred.points > 0 ? "var(--color-success, #2e9e5b)" : "var(--color-text-secondary)",
                              }}
                            >
                              {pred.points > 0 ? `+${pred.points}` : "0"}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* Resenha do jogo */}
              <section>
                <h3 className="text-[13px] font-semibold mb-2" style={{ color: "var(--color-text-secondary)" }}>
                  Resenha
                </h3>
                <Comments
                  poolId={poolId}
                  scope="match"
                  matchId={selMatch.id}
                  comments={selComments}
                  currentUserId={currentUserId}
                  placeholder="Comenta esse jogo…"
                  emptyLabel="Ninguém comentou esse jogo ainda."
                />
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function selPicksSafe(
  pickMap: Map<string, Map<string, RevealedPrediction>>,
  matchId: string,
  userId: string,
): RevealedPrediction | undefined {
  return pickMap.get(matchId)?.get(userId);
}

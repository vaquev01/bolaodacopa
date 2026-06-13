"use client";

/**
 * RulesSheet — painel "Como funciona este bolão", gerado do ruleset REAL do
 * pool. É a fonte única de regras para quem entra pelo link de convite e nunca
 * viu o wizard de criação. Linguagem de leigo, com os números configurados.
 */

import { useEffect } from "react";
import type { Ruleset } from "@/lib/scoring";

interface Props {
  poolName: string;
  ruleset: Ruleset;
  bracketEnabled: boolean;
  isClassification: boolean;
  onClose: () => void;
}

/** "15 min antes" → texto humano a partir de minutos. */
function deadlineLabel(minutes: number): string {
  if (minutes >= 1440) {
    const d = Math.round(minutes / 1440);
    return d === 1 ? "1 dia antes" : `${d} dias antes`;
  }
  if (minutes >= 60) {
    const h = Math.round(minutes / 60);
    return h === 1 ? "1 hora antes" : `${h} horas antes`;
  }
  return `${minutes} min antes`;
}

interface RuleRow {
  label: string;
  desc: string;
  pts: number;
}

export default function RulesSheet({
  poolName,
  ruleset,
  bracketEnabled,
  isClassification,
  onClose,
}: Props) {
  // Fecha no ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const s = ruleset.scoring;
  const isWinner = ruleset.prediction_mode === "winner";

  // ── Como você palpita ────────────────────────────────────────
  const howToPlay = isWinner
    ? "Você escolhe só quem ganha cada jogo — ou se vai dar empate. Rápido e simples. Se quiser arriscar mais, pode cravar o placar e ganhar um bônus."
    : "Você chuta o placar de cada jogo — por exemplo, Brasil 2 × 1 Argentina. Quanto mais perto do resultado real, mais pontos você faz.";

  // ── Tabela "quanto vale cada acerto" (só linhas com pontos > 0) ─
  const rows: RuleRow[] = [];
  if (isWinner) {
    if (s.winner_pick > 0)
      rows.push({ label: "Acertou quem ganhou", desc: "cravou o vencedor (ou o empate)", pts: s.winner_pick });
    if (s.winner_exact_bonus > 0)
      rows.push({ label: "Bônus de placar", desc: "além de acertar quem ganha, cravou o placar exato", pts: s.winner_exact_bonus });
  } else {
    if (s.exact_score > 0)
      rows.push({ label: "Placar exato", desc: "cravou o resultado em cheio (2×1, deu 2×1)", pts: s.exact_score });
    if (s.winner_and_diff > 0)
      rows.push({ label: "Vencedor + saldo", desc: "acertou quem ganhou E por quantos gols de diferença", pts: s.winner_and_diff });
    if (s.winner_only > 0)
      rows.push({ label: "Só o vencedor", desc: "acertou quem ganhou, mas errou o placar", pts: s.winner_only });
    if (s.draw_only > 0)
      rows.push({ label: "Empate", desc: "cravou que o jogo terminaria empatado", pts: s.draw_only });
    if (s.goals_one_team > 0)
      rows.push({ label: "Consolação", desc: "errou o vencedor, mas acertou os gols de um dos times", pts: s.goals_one_team });
  }

  // ── Fases que valem mais (multiplicadores != 1) ───────────────
  const mult = ruleset.stage_multipliers;
  const multRows: { label: string; x: number }[] = [];
  if (mult.r16 !== 1) multRows.push({ label: "Oitavas", x: mult.r16 });
  if (mult.qf !== 1) multRows.push({ label: "Quartas", x: mult.qf });
  if (mult.sf !== 1) multRows.push({ label: "Semifinais", x: mult.sf });
  if (mult.final !== 1) multRows.push({ label: "Final", x: mult.final });

  // ── Palpites de antes da Copa ─────────────────────────────────
  const champEnabled = ruleset.special_bets.champion.enabled;
  const qualEnabled = ruleset.special_bets.qualifiers.enabled;
  const bp = ruleset.advance_predictions.points;
  const hasPreCopa = champEnabled || qualEnabled || bracketEnabled;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Regras do bolão"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.45)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Painel */}
      <div
        className="relative w-full max-w-lg max-h-[88dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        style={{ background: "var(--color-bg-primary)", boxShadow: "var(--shadow-card)" }}
      >
        {/* Header sticky */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
          style={{
            background: "var(--color-bg-primary)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <h2 className="text-[18px] font-bold" style={{ color: "var(--color-text-primary)" }}>
            Como funciona
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5">
          {/* O jogo */}
          <RuleBlock title="O jogo">
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              No <strong style={{ color: "var(--color-text-primary)" }}>{poolName}</strong> você dá
              seu palpite antes de a bola rolar. Acertou, ganha pontos. Quem somar mais pontos ao
              longo da Copa vence. É de graça e não envolve dinheiro — é diversão entre amigos.
            </p>
          </RuleBlock>

          {/* Como você palpita */}
          <RuleBlock title="Como você palpita">
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              {howToPlay}
            </p>
          </RuleBlock>

          {/* Quanto vale cada acerto */}
          {rows.length > 0 && (
            <RuleBlock title="Quanto vale cada acerto">
              <div className="flex flex-col gap-2">
                {rows.map((r) => (
                  <div
                    key={r.label}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-card"
                    style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                        {r.label}
                      </p>
                      <p className="text-[12px] leading-snug" style={{ color: "var(--color-text-secondary)" }}>
                        {r.desc}
                      </p>
                    </div>
                    <span
                      className="text-[14px] font-bold tabular-nums flex-shrink-0 px-2 py-0.5 rounded-badge"
                      style={{ background: "var(--color-bg-secondary)", color: "var(--color-accent)" }}
                    >
                      +{r.pts}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[12px] mt-1" style={{ color: "var(--color-text-secondary)" }}>
                Vale o ganho mais alto em que você se encaixar — não soma um sobre o outro.
              </p>
            </RuleBlock>
          )}

          {/* Fases que valem mais */}
          {multRows.length > 0 && (
            <RuleBlock title="Jogos que valem mais">
              <p className="text-[14px] leading-relaxed mb-2" style={{ color: "var(--color-text-secondary)" }}>
                No mata-mata os pontos do jogo são multiplicados:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {multRows.map((m) => (
                  <span
                    key={m.label}
                    className="text-[12px] font-semibold px-2 py-1 rounded-badge tabular-nums"
                    style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-primary)" }}
                  >
                    {m.label} ×{m.x}
                  </span>
                ))}
              </div>
              {!isWinner && s.exact_score > 0 && mult.final !== 1 && (
                <p className="text-[12px] mt-2" style={{ color: "var(--color-text-secondary)" }}>
                  Exemplo: cravar o placar da final vale {s.exact_score} × {mult.final} ={" "}
                  <strong style={{ color: "var(--color-accent)" }}>
                    {Math.round(s.exact_score * mult.final)} pts
                  </strong>
                  .
                </p>
              )}
            </RuleBlock>
          )}

          {/* Palpites de antes da Copa */}
          {hasPreCopa && (
            <RuleBlock title="Palpites da Copa inteira">
              <div className="flex flex-col gap-2">
                {champEnabled && (
                  <PreCopaRow
                    label="Campeão"
                    desc="quem você acha que levanta a taça"
                    pts={ruleset.special_bets.champion.points}
                  />
                )}
                {qualEnabled && (
                  <PreCopaRow
                    label="Classificados"
                    desc="quem passa de cada grupo"
                    pts={ruleset.special_bets.qualifiers.points_per_team}
                    suffix="/seleção"
                  />
                )}
                {bracketEnabled && (
                  <div
                    className="px-3 py-2.5 rounded-card"
                    style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
                  >
                    <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      Chaveamento (bracket)
                    </p>
                    <p className="text-[12px] leading-snug mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                      Monte o caminho até o título. Cada fase que você cravar vale pontos:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        ["Oitavas", bp.r16],
                        ["Quartas", bp.qf],
                        ["Semis", bp.sf],
                        ["Final", bp.final],
                        ["3º lugar", bp.third_place],
                        ["Campeão", bp.champion],
                      ].map(([l, v]) => (
                        <span
                          key={l as string}
                          className="text-[11px] font-semibold px-1.5 py-0.5 rounded-badge tabular-nums"
                          style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}
                        >
                          {l}: +{v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <p className="text-[12px] mt-2" style={{ color: "var(--color-text-secondary)" }}>
                Esses palpites fecham quando o primeiro jogo do bolão começa — depois disso não dá
                mais para mudar.
              </p>
            </RuleBlock>
          )}

          {/* Prazos */}
          <RuleBlock title="Prazo para palpitar">
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              Cada palpite de jogo fecha{" "}
              <strong style={{ color: "var(--color-text-primary)" }}>
                {deadlineLabel(ruleset.deadline.minutes_before)}
              </strong>{" "}
              de a bola rolar. Até lá, pode mudar quantas vezes quiser. Jogos que já começaram ficam
              travados e não pontuam.
            </p>
          </RuleBlock>

          {/* Empate na pontuação */}
          <RuleBlock title="Empate na pontuação">
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              Se duas pessoas terminarem com os mesmos pontos, fica na frente quem tiver mais
              placares exatos.
            </p>
          </RuleBlock>

          {/* Acompanhar */}
          <RuleBlock title="Como acompanhar">
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              Os resultados entram sozinhos, assim que cada jogo termina. No jogo encerrado você vê
              quantos pontos fez e por quê. Sua posição fica sempre atualizada na aba{" "}
              <strong style={{ color: "var(--color-text-primary)" }}>Ranking</strong>
              {isClassification ? ", e seu chaveamento na aba Bracket" : ""}.
            </p>
          </RuleBlock>

          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-button text-white font-semibold text-[16px] mt-1"
            style={{ background: "var(--color-accent)" }}
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[13px] font-bold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-primary)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function PreCopaRow({
  label,
  desc,
  pts,
  suffix = "",
}: {
  label: string;
  desc: string;
  pts: number;
  suffix?: string;
}) {
  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 rounded-card"
      style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {label}
        </p>
        <p className="text-[12px] leading-snug" style={{ color: "var(--color-text-secondary)" }}>
          {desc}
        </p>
      </div>
      <span
        className="text-[14px] font-bold tabular-nums flex-shrink-0 px-2 py-0.5 rounded-badge"
        style={{ background: "var(--color-bg-secondary)", color: "var(--color-accent)" }}
      >
        +{pts}
        {suffix}
      </span>
    </div>
  );
}

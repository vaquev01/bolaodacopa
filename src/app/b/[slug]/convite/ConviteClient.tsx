"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Ruleset } from "@/lib/scoring";

interface Pool {
  id: string;
  name: string;
  slug: string;
}

/**
 * Resume as regras DESTE bolão em linhas curtas (puxadas do ruleset real) —
 * usado tanto na mensagem de convite quanto no card "Como funciona" da tela.
 */
function rulesetLines(ruleset: Ruleset): string[] {
  const lines: string[] = [];
  const adv = ruleset.advance_predictions;

  if (adv?.enabled) {
    const p = adv.points;
    lines.push(
      `🥇 Acertar QUEM PASSA vale mais: classificado +${p.group_qualified}, oitavas +${p.r16}, quartas +${p.qf}, semis +${p.sf}, final +${p.final}, campeão +${p.champion}`
    );
  } else if (ruleset.special_bets?.champion?.enabled) {
    lines.push(`🏆 Cravar o campeão vale +${ruleset.special_bets.champion.points}`);
  }

  if (ruleset.prediction_mode === "winner") {
    const bonus =
      ruleset.scoring.winner_exact_bonus > 0
        ? ` (e cravar o placar dá +${ruleset.scoring.winner_exact_bonus})`
        : "";
    lines.push(`✅ Acertar quem ganha cada jogo: +${ruleset.scoring.winner_pick}${bonus}`);
  } else {
    lines.push(
      `⚽ Placar dos jogos (bônus): placar exato +${ruleset.scoring.exact_score}, vencedor +${ruleset.scoring.winner_only}`
    );
  }

  lines.push(
    `⏰ Dá pra palpitar e editar até 15 min antes de cada jogo (os palpites de campeão/classificação fecham no 1º jogo da Copa).`
  );
  return lines;
}

export default function ConviteClient({ pool, ruleset }: { pool: Pool; ruleset: Ruleset }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/b/${pool.slug}/entrar`
      : `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://bolao-da-copa.up.railway.app"}/b/${pool.slug}/entrar`;

  const lines = rulesetLines(ruleset);

  const whatsappText = encodeURIComponent(
    `🏆 Bolão da Copa 2026 — "${pool.name}"\n\n` +
      `Monte seu palpite e dispute o ranking com a galera. De graça, sem cadastro, sem dinheiro.\n\n` +
      `📋 Como pontua neste bolão:\n` +
      lines.map((l) => `• ${l}`).join("\n") +
      `\n\nEntrar leva 1 minuto:\n${inviteUrl}`
  );
  const whatsappUrl = `https://wa.me/?text=${whatsappText}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback silencioso
    }
  }

  return (
    <main
      className="min-h-dvh flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--color-bg-primary)" }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-6">

        {/* Ícone de sucesso — SVG, sem emoji */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: copied ? "#E6F9EC" : "#E6F9EC" }}
          aria-hidden="true"
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <path
              d="M5 14l6 6L23 8"
              stroke="#30D158"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="text-center">
          <h1
            className="text-[22px] font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Bolão criado!
          </h1>
          <p
            className="mt-1 text-[17px] font-semibold"
            style={{ color: "var(--color-accent)" }}
          >
            {pool.name}
          </p>
          <p
            className="mt-2 text-[15px]"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Copie o link e mande no grupo.
          </p>
        </div>

        {/* Link copiável */}
        <button
          onClick={handleCopy}
          className="w-full p-4 rounded-card text-left transition-all active:scale-[0.98]"
          style={{
            background: "var(--color-bg-card)",
            boxShadow: copied ? "var(--shadow-gold)" : "var(--shadow-card)",
            border: copied ? "1.5px solid var(--color-gold)" : "1.5px solid transparent",
            transitionTimingFunction: "var(--ease-spring)",
            transitionDuration: "var(--duration-feedback)",
          }}
          aria-label="Copiar link do bolão"
        >
          <div className="flex items-center gap-3">
            {/* Ícone SVG (link ou check) */}
            <div
              className="w-8 h-8 rounded-button flex items-center justify-center flex-shrink-0"
              style={{
                background: copied ? "var(--color-success)" : "var(--color-bg-secondary)",
              }}
              aria-hidden="true"
            >
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3.5 3.5L13 4.5" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6.5 9.5a3 3 0 004.243 0l2-2a3 3 0 00-4.243-4.243L7.75 4" stroke="var(--color-text-secondary)" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M9.5 6.5a3 3 0 00-4.243 0l-2 2a3 3 0 004.243 4.243L8.25 12" stroke="var(--color-text-secondary)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-[11px] font-medium mb-0.5"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {copied ? "Copiado!" : "Toque para copiar"}
              </p>
              <p
                className="text-[13px] font-semibold truncate tabular-nums"
                style={{ color: "var(--color-text-primary)" }}
              >
                {inviteUrl}
              </p>
            </div>
          </div>
        </button>

        {/* Resumo do que vai junto no convite — regras DESTE bolão */}
        <div
          className="w-full p-4 rounded-card flex flex-col gap-2 text-left"
          style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-text-secondary)" }}>
            Vai junto no convite — como pontua
          </p>
          <ul className="flex flex-col gap-1.5">
            {lines.map((l) => (
              <li key={l} className="text-[13px] leading-snug" style={{ color: "var(--color-text-primary)" }}>
                {l}
              </li>
            ))}
          </ul>
        </div>

        {/* WhatsApp CTA primário */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-4 rounded-button flex items-center justify-center gap-2 font-semibold text-[17px] text-white transition-all active:scale-[0.98]"
          style={{
            background: "#25D366",
            transitionTimingFunction: "var(--ease-spring)",
            transitionDuration: "var(--duration-feedback)",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.08-1.34C8.47 21.51 10.2 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.64 0-3.17-.46-4.47-1.25l-.32-.19-3.02.79.82-2.94-.21-.34C3.86 14.87 3 13.52 3 12c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9z" />
          </svg>
          Enviar pelo WhatsApp
        </a>

        {/* Ir para o bolão */}
        <button
          onClick={() => router.push(`/b/${pool.slug}`)}
          className="w-full py-3 rounded-button font-medium text-[15px] transition-all active:scale-[0.98]"
          style={{
            background: "var(--color-bg-secondary)",
            color: "var(--color-text-secondary)",
            transitionTimingFunction: "var(--ease-spring)",
            transitionDuration: "var(--duration-feedback)",
          }}
        >
          Ir para o bolão
        </button>
      </div>
    </main>
  );
}

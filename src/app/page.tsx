"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [inviteInput, setInviteInput] = useState("");

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const val = inviteInput.trim();
    if (!val) return;
    const match = val.match(/\/b\/([a-z0-9-]+)/);
    const slug = match ? match[1] : val;
    router.push(`/b/${slug}/entrar`);
  }

  return (
    <main
      className="min-h-dvh flex flex-col items-center justify-center px-4 py-16"
      style={{ background: "var(--color-bg-primary)" }}
    >
      <div className="w-full max-w-md flex flex-col gap-8">
        {/* Badge */}
        <div className="flex justify-center">
          <span
            className="text-xs font-semibold tracking-widest uppercase px-3 py-1 rounded-badge text-white"
            style={{ background: "var(--color-accent)", letterSpacing: "0.08em" }}
          >
            Copa do Mundo 2026
          </span>
        </div>

        {/* Hero — ícone SVG + headline forte */}
        <div className="flex flex-col items-center gap-4 text-center">
          {/* SVG troféu — sem emoji, sem clipart */}
          <div
            className="w-14 h-14 flex items-center justify-center rounded-card"
            style={{ background: "var(--color-accent)" }}
            aria-hidden="true"
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <path
                d="M9 3h10M9 3C9 3 6 3 6 6c0 4 2 7 5 8.5V18H9a1 1 0 000 2h10a1 1 0 000-2h-2v-3.5C20 13 22 10 22 6c0-3-3-3-3-3M11 18h6M14 18v4M10 22h8"
                stroke="white"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div>
            <h1
              className="text-[38px] font-bold leading-none"
              style={{
                color: "var(--color-text-primary)",
                letterSpacing: "-0.025em",
              }}
            >
              Seu bolão,<br />suas regras.
            </h1>
            <p
              className="mt-3 text-[17px] leading-relaxed max-w-sm mx-auto"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Crie em 2 minutos. Convide pelo WhatsApp. Ranking ao vivo — sem planilha.
            </p>
          </div>
        </div>

        {/* CTA primário */}
        <button
          onClick={() => router.push("/criar")}
          className="w-full py-4 rounded-button text-white font-semibold text-[17px] transition-all active:scale-[0.97]"
          style={{
            background: "var(--color-accent)",
            minHeight: 52,
            transitionTimingFunction: "var(--ease-spring)",
            transitionDuration: "var(--duration-feedback)",
          }}
        >
          Criar meu bolão
        </button>

        {/* Divisor */}
        <div className="flex items-center gap-3">
          <div
            className="flex-1 h-px"
            style={{ background: "var(--border-subtle)" }}
          />
          <span
            className="text-[13px]"
            style={{ color: "var(--color-text-secondary)" }}
          >
            ou entrar com convite
          </span>
          <div
            className="flex-1 h-px"
            style={{ background: "var(--border-subtle)" }}
          />
        </div>

        {/* Campo convite */}
        <form onSubmit={handleInvite} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder="Cole o link ou slug do bolão"
              className="flex-1 px-4 py-3 rounded-button border text-[15px] outline-none"
              style={{
                background: "var(--color-bg-card)",
                borderColor: "var(--border-subtle)",
                color: "var(--color-text-primary)",
                minHeight: 44,
              }}
              aria-label="Link ou slug do bolão"
            />
            <button
              type="submit"
              className="px-5 py-3 rounded-button font-semibold text-[15px] text-white transition-all active:scale-[0.97]"
              style={{
                background: "var(--color-accent)",
                minHeight: 44,
                transitionTimingFunction: "var(--ease-spring)",
                transitionDuration: "var(--duration-feedback)",
              }}
            >
              Entrar
            </button>
          </div>
        </form>

        {/* Footer */}
        <p
          className="text-[11px] text-center px-4"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Entretenimento entre amigos. O site não processa valores financeiros.
        </p>
      </div>
    </main>
  );
}

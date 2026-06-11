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
    // Aceita URL completa ou slug direto
    const match = val.match(/\/b\/([a-z0-9-]+)/);
    const slug = match ? match[1] : val;
    router.push(`/b/${slug}/entrar`);
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--color-bg-primary)" }}>
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        {/* Badge */}
        <span className="text-xs font-semibold tracking-wide px-3 py-1 rounded-badge text-white"
          style={{ background: "var(--color-accent)" }}>
          Copa do Mundo 2026
        </span>

        {/* Trophy */}
        <div className="text-6xl select-none">🏆</div>

        {/* Headline */}
        <div className="text-center">
          <h1 className="text-[34px] font-bold leading-tight"
            style={{ color: "var(--color-text-primary)" }}>
            Bolão Copa 2026
          </h1>
          <p className="mt-2 text-[17px] leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}>
            Crie seu bolão em 2 minutos. Convide pelo WhatsApp. Ranking ao vivo.
          </p>
        </div>

        {/* CTA primário */}
        <button
          onClick={() => router.push("/criar")}
          className="w-full py-4 rounded-button text-white font-semibold text-[17px] transition-opacity active:opacity-80"
          style={{ background: "var(--color-accent)", minHeight: 52 }}
        >
          Criar meu bolão
        </button>

        {/* Divisor */}
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px" style={{ background: "var(--color-bg-secondary)" }} />
          <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            ou
          </span>
          <div className="flex-1 h-px" style={{ background: "var(--color-bg-secondary)" }} />
        </div>

        {/* Convite */}
        <form onSubmit={handleInvite} className="w-full flex flex-col gap-3">
          <label className="text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Tenho um convite
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder="Cole o link ou slug do bolão"
              className="flex-1 px-4 py-3 rounded-button border text-[15px] outline-none focus:ring-2"
              style={{
                background: "var(--color-bg-card)",
                borderColor: "var(--color-bg-secondary)",
                color: "var(--color-text-primary)",
              }}
            />
            <button
              type="submit"
              className="px-5 py-3 rounded-button font-semibold text-[15px] text-white transition-opacity active:opacity-80"
              style={{ background: "var(--color-accent)", minHeight: 44 }}
            >
              Entrar
            </button>
          </div>
        </form>

        {/* Footer */}
        <p className="text-[11px] text-center px-4" style={{ color: "var(--color-text-secondary)" }}>
          Entretenimento entre amigos. O site não processa valores financeiros.
        </p>
      </div>
    </main>
  );
}

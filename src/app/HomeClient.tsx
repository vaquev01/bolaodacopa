"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MyPool } from "@/app/api/pools/mine/route";

interface Props {
  name?: string;
  pools: MyPool[];
}

export default function HomeClient({ name, pools }: Props) {
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

  async function handleLogout() {
    await fetch("/api/session/logout", { method: "POST" });
    router.refresh();
  }

  // ── Estado: logado com bolões ────────────────────────────────────
  if (name && pools.length > 0) {
    return (
      <main
        className="min-h-dvh flex flex-col items-center justify-center px-4 py-16"
        style={{ background: "var(--color-bg-primary)" }}
      >
        <div className="w-full max-w-md flex flex-col gap-8">
          {/* Saudação */}
          <div className="flex items-center justify-between">
            <h1 className="text-[28px] font-bold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}>
              Olá, {name}
            </h1>
            <button
              onClick={handleLogout}
              className="text-[13px] font-medium px-3 py-1.5 rounded-button"
              style={{ color: "var(--color-text-secondary)", background: "var(--color-bg-secondary)" }}
            >
              Sair
            </button>
          </div>

          {/* Lista de bolões */}
          <div className="flex flex-col gap-3">
            <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              Seus bolões
            </p>
            {pools.map((p) => (
              <a
                key={p.slug}
                href={`/b/${p.slug}`}
                className="flex items-center justify-between p-4 rounded-card transition-all active:scale-[0.98]"
                style={{ background: "var(--color-bg-card)", boxShadow: "var(--shadow-card)", textDecoration: "none" }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[17px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                    {p.name}
                  </p>
                  <p className="text-[13px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                    {p.members} {p.members === 1 ? "participante" : "participantes"}
                    {(p.role === "owner" || p.role === "admin") && (
                      <span className="ml-2 font-semibold" style={{ color: "var(--color-accent)" }}>
                        organizador
                      </span>
                    )}
                  </p>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-shrink-0 ml-2">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ color: "var(--color-text-secondary)" }} />
                </svg>
              </a>
            ))}
          </div>

          {/* CTAs */}
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
            Criar outro bolão
          </button>

          {/* Divisor */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
            <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              ou entrar com convite
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
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
        </div>
      </main>
    );
  }

  // ── Estado: logado sem bolões ────────────────────────────────────
  if (name) {
    return (
      <main
        className="min-h-dvh flex flex-col items-center justify-center px-4 py-16"
        style={{ background: "var(--color-bg-primary)" }}
      >
        <div className="w-full max-w-md flex flex-col gap-8">
          <div className="flex items-center justify-between">
            <h1 className="text-[28px] font-bold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}>
              Olá, {name}
            </h1>
            <button
              onClick={handleLogout}
              className="text-[13px] font-medium px-3 py-1.5 rounded-button"
              style={{ color: "var(--color-text-secondary)", background: "var(--color-bg-secondary)" }}
            >
              Sair
            </button>
          </div>

          <p className="text-[17px]" style={{ color: "var(--color-text-secondary)" }}>
            Você ainda não participa de nenhum bolão.
          </p>

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
            <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
            <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              ou entrar com convite
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
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
        </div>
      </main>
    );
  }

  // ── Estado: deslogado (hero original) ───────────────────────────
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

        {/* Hero */}
        <div className="flex flex-col items-center gap-4 text-center">
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
              style={{ color: "var(--color-text-primary)", letterSpacing: "-0.025em" }}
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
          <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
          <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            ou entrar com convite
          </span>
          <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
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

        {/* Link para login com conta */}
        <p className="text-[13px] text-center" style={{ color: "var(--color-text-secondary)" }}>
          Já participa de um bolão?{" "}
          <a
            href="/entrar"
            className="font-semibold"
            style={{ color: "var(--color-accent)", textDecoration: "none" }}
          >
            Entrar com nome e senha
          </a>
        </p>

        {/* Footer */}
        <p className="text-[11px] text-center px-4" style={{ color: "var(--color-text-secondary)" }}>
          Entretenimento entre amigos. O site não processa valores financeiros.
        </p>
      </div>
    </main>
  );
}

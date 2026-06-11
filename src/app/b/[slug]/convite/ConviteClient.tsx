"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Pool {
  id: string;
  name: string;
  slug: string;
}

export default function ConviteClient({ pool }: { pool: Pool }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/b/${pool.slug}/entrar`
      : `https://bolao.app/b/${pool.slug}/entrar`;

  const whatsappText = encodeURIComponent(
    `Entrei no "${pool.name}", você também entra? 👊 ${inviteUrl}`
  );
  const whatsappUrl = `https://wa.me/?text=${whatsappText}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: selecionar
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--color-bg-primary)" }}>
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        {/* Ícone sucesso */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
          style={{ background: "#E6F9EC" }}
        >
          ✅
        </div>

        <div className="text-center">
          <h1 className="text-[22px] font-bold" style={{ color: "var(--color-text-primary)" }}>
            Bolão criado!
          </h1>
          <p className="mt-1 text-[17px] font-medium" style={{ color: "var(--color-accent)" }}>
            {pool.name}
          </p>
          <p className="mt-2 text-[15px]" style={{ color: "var(--color-text-secondary)" }}>
            Copie o link e mande no grupo.
          </p>
        </div>

        {/* Link copiável */}
        <button
          onClick={handleCopy}
          className="w-full p-4 rounded-card text-left transition-all active:scale-95"
          style={{
            background: "var(--color-bg-card)",
            boxShadow: copied ? "var(--shadow-gold)" : "var(--shadow-card)",
            border: copied ? "1.5px solid var(--color-gold)" : "1.5px solid transparent",
          }}
          aria-label="Copiar link do bolão"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{copied ? "✅" : "🔗"}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
                {copied ? "Copiado!" : "Toque para copiar"}
              </p>
              <p className="text-[13px] font-semibold truncate tabular-nums"
                style={{ color: "var(--color-text-primary)" }}>
                {inviteUrl}
              </p>
            </div>
          </div>
        </button>

        {/* WhatsApp */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-4 rounded-button flex items-center justify-center gap-2 font-semibold text-[17px] text-white transition-opacity active:opacity-80"
          style={{ background: "#25D366" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.08-1.34C8.47 21.51 10.2 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.64 0-3.17-.46-4.47-1.25l-.32-.19-3.02.79.82-2.94-.21-.34C3.86 14.87 3 13.52 3 12c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9z" />
          </svg>
          Enviar pelo WhatsApp
        </a>

        {/* Ir para os palpites */}
        <button
          onClick={() => router.push(`/b/${pool.slug}`)}
          className="w-full py-3 rounded-button font-medium text-[15px] transition-opacity active:opacity-80"
          style={{
            background: "var(--color-bg-secondary)",
            color: "var(--color-text-secondary)",
          }}
        >
          Ir para o bolão →
        </button>
      </div>
    </main>
  );
}

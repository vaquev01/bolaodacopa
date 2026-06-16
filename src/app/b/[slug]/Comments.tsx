"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Comment } from "@/lib/types";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

interface Props {
  poolId: string;
  scope: "match" | "pool";
  matchId?: string;
  comments: Comment[];
  currentUserId: string;
  /** Texto do placeholder do input (varia entre mural e resenha de jogo). */
  placeholder?: string;
  /** Estado vazio customizado. */
  emptyLabel?: string;
}

export default function Comments({
  poolId,
  scope,
  matchId,
  comments,
  currentUserId,
  placeholder = "Manda a real…",
  emptyLabel = "Seja o primeiro a comentar.",
}: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const body = text.trim();
    if (body.length < 1 || pending) return;
    setPending(true);
    setError(null);
    try {
      const r = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool_id: poolId, scope, match_id: matchId ?? null, body }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.message ?? "Não rolou enviar.");
        return;
      }
      setText("");
      router.refresh();
    } catch {
      setError("Sem conexão. Tenta de novo.");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    try {
      const r = await fetch("/api/comments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_id: id }),
      });
      if (r.ok) router.refresh();
    } catch {
      /* silencioso: se falhar, o comentário permanece */
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Lista */}
      {comments.length === 0 ? (
        <p className="text-[13px] py-2" style={{ color: "var(--color-text-secondary)" }}>
          {emptyLabel}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => {
            const mine = c.user_id === currentUserId;
            return (
              <li
                key={c.id}
                className="px-3 py-2 rounded-card"
                style={{
                  background: mine
                    ? "color-mix(in srgb, var(--color-accent) 8%, var(--color-bg-card))"
                    : "var(--color-bg-card)",
                  border: "1px solid var(--color-border, transparent)",
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="text-[13px] font-semibold truncate"
                    style={{ color: mine ? "var(--color-accent)" : "var(--color-text-primary)" }}
                  >
                    {mine ? "Você" : c.name}
                  </span>
                  <span className="text-[11px] flex-shrink-0" style={{ color: "var(--color-text-secondary)" }}>
                    {timeAgo(c.created_at)}
                    {c.can_delete && (
                      <button
                        onClick={() => remove(c.id)}
                        className="ml-2"
                        style={{ color: "var(--color-text-secondary)" }}
                        aria-label="Apagar comentário"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </div>
                <p
                  className="text-[14px] mt-0.5 whitespace-pre-wrap break-words"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {c.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {/* Input */}
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 280))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-button text-[14px] resize-none"
          style={{
            background: "var(--color-bg-secondary)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border, transparent)",
            minHeight: "40px",
            maxHeight: "120px",
          }}
        />
        <button
          onClick={submit}
          disabled={pending || text.trim().length === 0}
          className="px-4 py-2 rounded-button text-[14px] font-semibold flex-shrink-0"
          style={{
            background: text.trim().length === 0 || pending ? "var(--color-bg-secondary)" : "var(--color-accent)",
            color: text.trim().length === 0 || pending ? "var(--color-text-secondary)" : "#fff",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? "…" : "Enviar"}
        </button>
      </div>
      {error && (
        <p className="text-[12px]" style={{ color: "var(--color-danger, #e5484d)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

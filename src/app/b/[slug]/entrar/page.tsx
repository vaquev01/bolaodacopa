import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import EntrarClient from "./EntrarClient";
import { formatKickoff, getFlag } from "@/lib/utils";
import type { Match } from "@/lib/types";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function EntrarPage({ params }: Props) {
  const { slug } = await params;
  const session = await getSession();
  const supabase = await createServerClient();

  // Buscar pool
  const { data: pool } = await supabase
    .from("pools")
    .select("id, name, slug, scope")
    .eq("slug", slug)
    .single();

  if (!pool) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-4"
        style={{ background: "var(--color-bg-primary)" }}>
        <p style={{ color: "var(--color-text-secondary)" }}>Bolão não encontrado.</p>
      </main>
    );
  }

  // Se já tem sessão e já é membro, redirecionar
  if (session) {
    const { data: membership } = await supabase
      .from("pool_members")
      .select("status")
      .eq("pool_id", pool.id)
      .eq("user_id", session.userId)
      .single();

    if (membership?.status === "active") {
      redirect(`/b/${slug}`);
    }
  }

  // Contar membros
  const { count: membersCount } = await supabase
    .from("pool_members")
    .select("*", { count: "exact", head: true })
    .eq("pool_id", pool.id)
    .eq("status", "active");

  // Próximos 3 jogos do escopo
  const scope = pool.scope as { type: string; match_ids?: string[] };
  let matchQuery = supabase
    .from("matches")
    .select("id, stage, home_team, away_team, kickoff_at, status")
    .eq("status", "scheduled")
    .order("kickoff_at", { ascending: true })
    .limit(3);

  if (scope.type === "custom" && scope.match_ids?.length) {
    matchQuery = matchQuery.in("id", scope.match_ids);
  }

  const { data: nextMatches } = await matchQuery;

  // Formatar jogos para serialização
  const previewMatches = (nextMatches ?? []).map((m) => {
    const { date, time } = formatKickoff(m.kickoff_at as string);
    return {
      id: m.id,
      home_team: m.home_team,
      away_team: m.away_team,
      home_flag: getFlag(m.home_team as string),
      away_flag: getFlag(m.away_team as string),
      date,
      time,
    };
  });

  return (
    <EntrarClient
      pool={{ id: pool.id, name: pool.name, slug: pool.slug }}
      membersCount={membersCount ?? 0}
      previewMatches={previewMatches}
      alreadyHasSession={!!session}
      existingName={session?.name}
    />
  );
}

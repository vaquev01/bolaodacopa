import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { parseRuleset } from "@/lib/scoring";
import AdminClient from "./AdminClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AdminPage({ params }: Props) {
  const { slug } = await params;
  const session = await getSession();

  if (!session) {
    redirect(`/b/${slug}/entrar`);
  }

  const supabase = await createServerClient();

  // Buscar pool
  const { data: pool } = await supabase
    .from("pools")
    .select("id, name, slug, owner_id, scope, ruleset")
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

  // Checar owner
  if (pool.owner_id !== session.userId) {
    redirect(`/b/${slug}`);
  }

  const ruleset = parseRuleset(pool.ruleset);

  // Contar membros ativos
  const { count: memberCount } = await supabase
    .from("pool_members")
    .select("user_id", { count: "exact", head: true })
    .eq("pool_id", pool.id)
    .eq("status", "active");

  // Buscar jogos do escopo
  const scope = pool.scope as { type: string; match_ids?: string[] };
  let matchQuery = supabase
    .from("matches")
    .select("id, stage, group_label, home_team, away_team, kickoff_at, status, score_home_90, score_away_90, score_home_ft, score_away_ft, penalty_winner")
    .order("kickoff_at", { ascending: true });

  if (scope.type === "custom" && scope.match_ids?.length) {
    matchQuery = matchQuery.in("id", scope.match_ids);
  }

  const { data: matches } = await matchQuery;

  return (
    <AdminClient
      pool={{ id: pool.id, name: pool.name, slug: pool.slug }}
      matches={matches ?? []}
      ruleset={ruleset}
      memberCount={memberCount ?? 0}
    />
  );
}

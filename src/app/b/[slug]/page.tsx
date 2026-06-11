import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import BolaoClient from "./BolaoClient";
import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function BolaoPage({ params }: Props) {
  const { slug } = await params;
  const session = await getSession();

  if (!session) {
    redirect(`/b/${slug}/entrar`);
  }

  const supabase = await createServerClient();

  // Buscar pool
  const { data: pool } = await supabase
    .from("pools")
    .select("id, name, slug, owner_id, ruleset, scope, status")
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

  // Checar se é membro
  const { data: membership } = await supabase
    .from("pool_members")
    .select("role, status")
    .eq("pool_id", pool.id)
    .eq("user_id", session.userId)
    .single();

  if (!membership || membership.status !== "active") {
    redirect(`/b/${slug}/entrar`);
  }

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

  // Buscar palpites do usuário (só os próprios)
  const { data: predictions } = await supabase
    .from("predictions")
    .select("id, match_id, payload, submitted_at")
    .eq("pool_id", pool.id)
    .eq("user_id", session.userId);

  // Buscar pontuações
  const predictionIds = (predictions ?? []).map((p) => p.id);
  const { data: scores } = predictionIds.length
    ? await supabase
        .from("prediction_scores")
        .select("prediction_id, points, breakdown")
        .in("prediction_id", predictionIds)
    : { data: [] };

  // Ranking: agregar prediction_scores por usuário neste pool
  const { data: rankingRaw } = await supabase
    .from("predictions")
    .select("user_id, prediction_scores(points), profiles(name)")
    .eq("pool_id", pool.id);

  // Construir ranking agregado
  const rankMap = new Map<string, { name: string; points: number }>();
  for (const row of rankingRaw ?? []) {
    const uid = row.user_id as string;
    // Supabase join retorna array para relations
    const profilesRaw = row.profiles as unknown;
    const name = Array.isArray(profilesRaw)
      ? ((profilesRaw[0] as { name: string } | undefined)?.name ?? "—")
      : ((profilesRaw as { name: string } | null)?.name ?? "—");
    // prediction_scores pode ser array ou objeto
    const scoresRaw = row.prediction_scores as unknown;
    const pts = Array.isArray(scoresRaw)
      ? (scoresRaw as { points: number }[]).reduce((s, x) => s + (x.points ?? 0), 0)
      : ((scoresRaw as { points: number } | null)?.points ?? 0);

    const existing = rankMap.get(uid);
    rankMap.set(uid, { name, points: (existing?.points ?? 0) + pts });
  }

  const ranking = Array.from(rankMap.entries())
    .map(([user_id, { name, points }]) => ({ user_id, name, points }))
    .sort((a, b) => b.points - a.points)
    .map((r, i) => ({ ...r, position: i + 1 }));

  return (
    <BolaoClient
      pool={pool}
      matches={matches ?? []}
      predictions={predictions ?? []}
      scores={scores ?? []}
      ranking={ranking}
      currentUserId={session.userId}
      isOwner={membership.role === "owner"}
      deadlineMinutes={(pool.ruleset as { deadline?: { minutes_before?: number } })?.deadline?.minutes_before ?? 15}
    />
  );
}

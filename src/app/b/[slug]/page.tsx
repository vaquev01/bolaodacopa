import { createServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import BolaoClient from "./BolaoClient";
import { redirect } from "next/navigation";
import { parseRuleset } from "@/lib/scoring";
import { computeLiveBracketPoints } from "@/lib/bracket-live";

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

  const ruleset = parseRuleset(pool.ruleset);
  const scope = pool.scope as { type: string; match_ids?: string[]; variant?: string };
  // Variants de "só classificação":
  //  - "specials_only" (type ou variant): sem palpites de placar; em bolão
  //    criado com a Copa em andamento o escopo custom só define o lock.
  //  - "specials_plus": classificação + placar em cheio extra → a tab de
  //    jogos aparece (todos os jogos), e o lock continua vindo do escopo.
  const isClassification =
    scope.type === "specials_only" ||
    scope.variant === "specials_only" ||
    scope.variant === "specials_plus";
  const isSpecialsOnly = isClassification && scope.variant !== "specials_plus";

  // Buscar jogos do escopo (para specials_only ainda precisamos para derivar times/grupos e deadline)
  let matchQuery = supabase
    .from("matches")
    .select("id, stage, group_label, home_team, away_team, kickoff_at, status, score_home_90, score_away_90, score_home_ft, score_away_ft, penalty_winner")
    .order("kickoff_at", { ascending: true });

  if (scope.type === "custom" && scope.match_ids?.length && !isClassification) {
    matchQuery = matchQuery.in("id", scope.match_ids);
  }

  const { data: matches } = await matchQuery;
  const matchList = matches ?? [];

  // ── Dados especiais ───────────────────────────────────────────────────────

  // Meus palpites especiais (via route que chama RPC security definer)
  let initialSpecialBets: { bet_type: string; value: string; submitted_at: string }[] = [];
  if (ruleset.special_bets.champion.enabled || ruleset.special_bets.qualifiers.enabled) {
    const { data: specialBetsRaw } = await supabase.rpc("my_special_bets", {
      p_user: session.userId,
      p_secret: session.secret,
      p_pool: pool.id,
    });
    initialSpecialBets = (specialBetsRaw ?? []) as typeof initialSpecialBets;
  }

  // Resultados publicados (legíveis pelo anon após settlement)
  const { data: specialResultsRaw } = await supabase
    .from("pool_special_results")
    .select("bet_type, value, settled_at")
    .eq("pool_id", pool.id);
  const specialResults = (specialResultsRaw ?? []) as {
    bet_type: string;
    value: string;
    settled_at: string;
  }[];

  // Pontuação especial do usuário atual
  const { data: specialScoresRaw } = await supabase
    .from("special_bet_scores")
    .select("bet_type, points, breakdown")
    .eq("pool_id", pool.id)
    .eq("user_id", session.userId);
  const specialScores = (specialScoresRaw ?? []) as {
    bet_type: string;
    points: number;
    breakdown: Record<string, number>;
  }[];

  // ── Times e grupos (para o card de especiais) ────────────────────────────

  // Times únicos excluindo "A definir"
  const teamsSet = new Set<string>();
  const groupTeams: Record<string, string[]> = {};
  for (const m of matchList) {
    for (const t of [m.home_team, m.away_team]) {
      if (t && t !== "A definir") {
        teamsSet.add(t);
        if (m.group_label) {
          if (!groupTeams[m.group_label]) groupTeams[m.group_label] = [];
          if (!groupTeams[m.group_label].includes(t)) groupTeams[m.group_label].push(t);
        }
      }
    }
  }
  const teams = Array.from(teamsSet).sort((a, b) => a.localeCompare(b, "pt-BR"));

  // Deadline dos especiais = kickoff do primeiro jogo do escopo.
  // Em bolão de classificação criado durante a Copa (variant specials_only/
  // specials_plus), o escopo real são os match_ids — o lock é o 1º deles.
  const deadlineMatches =
    isClassification && scope.type === "custom" && scope.match_ids?.length
      ? matchList.filter((m) => scope.match_ids!.includes(m.id))
      : matchList;
  const deadlineAt = deadlineMatches.length > 0
    ? deadlineMatches.reduce((min, m) => m.kickoff_at < min ? m.kickoff_at : min, deadlineMatches[0].kickoff_at)
    : null;

  // ── Palpites de placar (só se não for specials_only) ─────────────────────

  const predictions = isSpecialsOnly ? [] : await (async () => {
    const { data } = await supabase
      .from("predictions")
      .select("id, match_id, payload, submitted_at")
      .eq("pool_id", pool.id)
      .eq("user_id", session.userId);
    return data ?? [];
  })();

  const predictionIds = predictions.map((p) => p.id);
  const scores = !isSpecialsOnly && predictionIds.length ? await (async () => {
    const { data } = await supabase
      .from("prediction_scores")
      .select("prediction_id, points, breakdown")
      .in("prediction_id", predictionIds);
    return data ?? [];
  })() : [];

  // ── Ranking: prediction_scores + special_bet_scores + bracket_scores ────

  // Pontos de palpites de placar por usuário
  const { data: rankingRaw } = await supabase
    .from("predictions")
    .select("user_id, prediction_scores(points), profiles(name)")
    .eq("pool_id", pool.id);

  // Pontos especiais por usuário neste pool
  const { data: allSpecialScoresRaw } = await supabase
    .from("special_bet_scores")
    .select("user_id, points")
    .eq("pool_id", pool.id);

  const specialPtsByUser = new Map<string, number>();
  for (const row of allSpecialScoresRaw ?? []) {
    const uid = row.user_id as string;
    const pts = (row.points as number) ?? 0;
    specialPtsByUser.set(uid, (specialPtsByUser.get(uid) ?? 0) + pts);
  }

  // Pontos de bracket por usuário, calculados live do estado atual dos jogos
  // (não dependem mais de bracket_scores persistido pelo owner)
  const bracketEnabled = ruleset.advance_predictions?.enabled === true;
  const bracketPtsByUser = new Map<string, number>();
  if (bracketEnabled) {
    const liveBracket = await computeLiveBracketPoints(supabase, pool.id, ruleset);
    for (const [uid, { points }] of Array.from(liveBracket.entries())) {
      bracketPtsByUser.set(uid, points);
    }
  }

  // Agregar prediction_scores por usuário
  const rankMap = new Map<string, { name: string; gamePoints: number; bracketPoints: number }>();
  for (const row of rankingRaw ?? []) {
    const uid = row.user_id as string;
    const profilesRaw = row.profiles as unknown;
    const name = Array.isArray(profilesRaw)
      ? ((profilesRaw[0] as { name: string } | undefined)?.name ?? "—")
      : ((profilesRaw as { name: string } | null)?.name ?? "—");
    const scoresRaw = row.prediction_scores as unknown;
    const pts = Array.isArray(scoresRaw)
      ? (scoresRaw as { points: number }[]).reduce((s, x) => s + (x.points ?? 0), 0)
      : ((scoresRaw as { points: number } | null)?.points ?? 0);

    const existing = rankMap.get(uid);
    rankMap.set(uid, { name, gamePoints: (existing?.gamePoints ?? 0) + pts, bracketPoints: existing?.bracketPoints ?? 0 });
  }

  // Adicionar pontos especiais ao rankMap
  for (const [uid, specialPts] of Array.from(specialPtsByUser.entries())) {
    const existing = rankMap.get(uid);
    if (existing) {
      rankMap.set(uid, { ...existing, gamePoints: existing.gamePoints + specialPts });
    }
  }

  // Adicionar pontos de bracket ao rankMap
  for (const [uid, bPts] of Array.from(bracketPtsByUser.entries())) {
    const existing = rankMap.get(uid);
    if (existing) {
      rankMap.set(uid, { ...existing, bracketPoints: bPts });
    }
  }

  const ranking = Array.from(rankMap.entries())
    .map(([user_id, { name, gamePoints, bracketPoints }]) => ({
      user_id,
      name,
      points: gamePoints + bracketPoints,
      game_points: gamePoints,
      bracket_points: bracketPoints,
    }))
    .sort((a, b) => b.points - a.points)
    .map((r, i) => ({ ...r, position: i + 1 }));

  // ── Bracket do usuário atual (se feature habilitada) ─────────────────────
  let myBracket: Record<string, unknown> | null = null;
  let bracketLockAt: string | null = null;
  let bracketLocked = false;

  if (bracketEnabled) {
    const { data: bracketRpc } = await supabase.rpc("get_pool_brackets", {
      p_user: session.userId,
      p_secret: session.secret,
      p_pool: pool.id,
    });
    if (bracketRpc) {
      const b = bracketRpc as {
        my_bracket?: { payload: Record<string, unknown> };
        lock_at?: string;
        locked?: boolean;
      };
      myBracket = b.my_bracket?.payload ?? null;
      bracketLockAt = b.lock_at ?? null;
      bracketLocked = b.locked ?? false;
    }
  }

  return (
    <BolaoClient
      pool={pool}
      ruleset={ruleset}
      matches={matchList}
      predictions={predictions}
      scores={scores}
      ranking={ranking}
      currentUserId={session.userId}
      isOwner={membership.role === "owner"}
      deadlineMinutes={ruleset.deadline.minutes_before}
      isSpecialsOnly={isSpecialsOnly}
      isClassification={isClassification}
      teams={teams}
      groupTeams={groupTeams}
      deadlineAt={deadlineAt}
      initialSpecialBets={initialSpecialBets}
      specialResults={specialResults}
      specialScores={specialScores}
      bracketEnabled={bracketEnabled}
      myBracket={myBracket}
      bracketLockAt={bracketLockAt}
      bracketLocked={bracketLocked}
    />
  );
}

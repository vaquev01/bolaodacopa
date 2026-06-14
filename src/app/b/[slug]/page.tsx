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

  // Todos os membros ativos — TODO participante aparece no ranking, mesmo quem
  // só preencheu o bracket (sem palpite de placar) ou ainda não pontuou.
  const { data: membersRaw } = await supabase
    .from("pool_members")
    .select("user_id, profiles(name)")
    .eq("pool_id", pool.id)
    .eq("status", "active");

  const memberNames = new Map<string, string>();
  for (const row of membersRaw ?? []) {
    const uid = row.user_id as string;
    const profilesRaw = row.profiles as unknown;
    const name = Array.isArray(profilesRaw)
      ? ((profilesRaw[0] as { name: string } | undefined)?.name ?? "—")
      : ((profilesRaw as { name: string } | null)?.name ?? "—");
    memberNames.set(uid, name);
  }

  // Pontos de palpites de placar por usuário (com breakdown p/ desempate por
  // exatos, e first_submitted_at p/ desempate por "quem fez antes").
  // first_submitted_at é IMUTÁVEL no banco — editar o palpite não melhora o
  // desempate (anti-roubo: não dá pra "fingir" que palpitou cedo).
  const { data: rankingRaw } = await supabase
    .from("predictions")
    .select("user_id, first_submitted_at, prediction_scores(points, breakdown), profiles(name)")
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

  // Agregar por usuário. Semeia com TODOS os membros ativos (zerados) para que
  // ninguém suma do ranking — depois soma placar, especiais e bracket.
  interface RankEntry {
    name: string;
    gamePoints: number;
    bracketPoints: number;
    exactCount: number; // desempate: nº de placares exatos
    lastPickAt: number; // desempate: quando registrou o ÚLTIMO palpite (ms); menor = fez antes
  }
  const rankMap = new Map<string, RankEntry>();
  for (const [uid, name] of Array.from(memberNames.entries())) {
    rankMap.set(uid, { name, gamePoints: 0, bracketPoints: 0, exactCount: 0, lastPickAt: 0 });
  }

  function ensure(uid: string, fallbackName: string): RankEntry {
    let e = rankMap.get(uid);
    if (!e) {
      e = { name: fallbackName, gamePoints: 0, bracketPoints: 0, exactCount: 0, lastPickAt: 0 };
      rankMap.set(uid, e);
    }
    return e;
  }

  for (const row of rankingRaw ?? []) {
    const uid = row.user_id as string;
    const profilesRaw = row.profiles as unknown;
    const name = Array.isArray(profilesRaw)
      ? ((profilesRaw[0] as { name: string } | undefined)?.name ?? "—")
      : ((profilesRaw as { name: string } | null)?.name ?? "—");
    const scoresRaw = row.prediction_scores as unknown;
    const scoreRows = Array.isArray(scoresRaw)
      ? (scoresRaw as { points: number; breakdown?: Record<string, number> }[])
      : scoresRaw
        ? [scoresRaw as { points: number; breakdown?: Record<string, number> }]
        : [];
    const pts = scoreRows.reduce((s, x) => s + (x.points ?? 0), 0);
    const exacts = scoreRows.reduce((s, x) => s + (x.breakdown?.exact_score ? 1 : 0), 0);

    const e = ensure(uid, name);
    if (e.name === "—") e.name = name;
    e.gamePoints += pts;
    e.exactCount += exacts;
    // "Fez antes" = quando registrou o último dos seus palpites (fechou o cartão).
    const submittedAt = row.first_submitted_at
      ? new Date(row.first_submitted_at as string).getTime()
      : 0;
    if (!Number.isNaN(submittedAt)) e.lastPickAt = Math.max(e.lastPickAt, submittedAt);
  }

  // Adicionar pontos especiais
  for (const [uid, specialPts] of Array.from(specialPtsByUser.entries())) {
    ensure(uid, "—").gamePoints += specialPts;
  }

  // Adicionar pontos de bracket
  for (const [uid, bPts] of Array.from(bracketPtsByUser.entries())) {
    ensure(uid, "—").bracketPoints = bPts;
  }

  // Garantir o nome do usuário atual a partir da sessão (RLS de profiles pode
  // não expor o nome via join pool_members; a sessão sempre tem o nome).
  const me = rankMap.get(session.userId);
  if (me && (me.name === "—" || !me.name)) me.name = session.name;

  // Ordenação DETERMINÍSTICA: pontos → mais placares exatos → quem fez antes
  // (menor lastPickAt) → nome (estável). lastPickAt=0 (nunca palpitou) vai por
  // último entre os empatados, não na frente.
  const ranking = Array.from(rankMap.entries())
    .map(([user_id, { name, gamePoints, bracketPoints, exactCount, lastPickAt }]) => ({
      user_id,
      name,
      points: gamePoints + bracketPoints,
      game_points: gamePoints,
      bracket_points: bracketPoints,
      exact_count: exactCount,
      last_pick_at: lastPickAt,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.exact_count !== a.exact_count) return b.exact_count - a.exact_count;
      // Quem fez antes ganha. 0 = sem palpite → tratar como +infinito (vai por último).
      const ta = a.last_pick_at || Number.POSITIVE_INFINITY;
      const tb = b.last_pick_at || Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name, "pt-BR");
    })
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

  const memberCount = (membersRaw ?? []).length;

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
      memberCount={memberCount}
    />
  );
}

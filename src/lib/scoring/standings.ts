// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type Tiebreaker =
  | "exact_scores"
  | "winners"
  | "knockout_points"
  | "champion_bet"
  | "lottery";

export interface PredictionRow {
  userId: string;
  userName: string;
  points: number;
  isExact: boolean;
  isWinnerHit: boolean;
  stage: string;
  hasChampionBetHit?: boolean;
}

export interface Standing {
  userId: string;
  userName: string;
  total: number;
  position: number;
  exactCount: number;
  winnerCount: number;
  knockoutPoints: number;
  championBetHit: boolean;
  needsLottery: boolean;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const KNOCKOUT_STAGES = new Set(["r32", "r16", "qf", "sf", "third", "final"]);

function isKnockout(stage: string): boolean {
  return KNOCKOUT_STAGES.has(stage);
}

// ────────────────────────────────────────────────────────────
// computeStandings
// ────────────────────────────────────────────────────────────

export function computeStandings(
  rows: PredictionRow[],
  tiebreakers: readonly Tiebreaker[]
): Standing[] {
  if (rows.length === 0) return [];

  // Aggregate rows per user
  const userMap = new Map<
    string,
    {
      userId: string;
      userName: string;
      total: number;
      exactCount: number;
      winnerCount: number;
      knockoutPoints: number;
      championBetHit: boolean;
    }
  >();

  for (const row of rows) {
    const existing = userMap.get(row.userId);
    if (!existing) {
      userMap.set(row.userId, {
        userId: row.userId,
        userName: row.userName,
        total: row.points,
        exactCount: row.isExact ? 1 : 0,
        winnerCount: row.isWinnerHit ? 1 : 0,
        knockoutPoints: isKnockout(row.stage) && row.isWinnerHit ? row.points : 0,
        championBetHit: row.hasChampionBetHit ?? false,
      });
    } else {
      existing.total += row.points;
      if (row.isExact) existing.exactCount += 1;
      if (row.isWinnerHit) existing.winnerCount += 1;
      if (isKnockout(row.stage) && row.isWinnerHit) existing.knockoutPoints += row.points;
      if (row.hasChampionBetHit) existing.championBetHit = true;
    }
  }

  const users = Array.from(userMap.values());

  // Sort comparator applying tiebreakers in chain
  function compare(
    a: (typeof users)[number],
    b: (typeof users)[number]
  ): number {
    // Primary: total points
    if (b.total !== a.total) return b.total - a.total;

    // Apply tiebreakers in order
    for (const tiebreaker of tiebreakers) {
      if (tiebreaker === "exact_scores") {
        if (b.exactCount !== a.exactCount) return b.exactCount - a.exactCount;
      } else if (tiebreaker === "winners") {
        if (b.winnerCount !== a.winnerCount) return b.winnerCount - a.winnerCount;
      } else if (tiebreaker === "knockout_points") {
        if (b.knockoutPoints !== a.knockoutPoints) return b.knockoutPoints - a.knockoutPoints;
      } else if (tiebreaker === "champion_bet") {
        const aChamp = a.championBetHit ? 1 : 0;
        const bChamp = b.championBetHit ? 1 : 0;
        if (bChamp !== aChamp) return bChamp - aChamp;
      }
      // "lottery" — cannot order, fall through
    }

    return 0; // fully tied → lottery
  }

  users.sort(compare);

  // Assign positions (tied players get same position; next position skips)
  const standings: Standing[] = [];

  let position = 1;
  for (let i = 0; i < users.length; i++) {
    if (i > 0) {
      const isFullyTied = compare(users[i - 1], users[i]) === 0;
      if (!isFullyTied) {
        position = i + 1;
      }
    }

    standings.push({
      ...users[i],
      position,
      needsLottery: false, // will be set in a second pass
    });
  }

  // Mark lottery groups: consecutive entries with same position
  const positionGroups = new Map<number, number[]>();
  for (let i = 0; i < standings.length; i++) {
    const pos = standings[i].position;
    if (!positionGroups.has(pos)) positionGroups.set(pos, []);
    positionGroups.get(pos)!.push(i);
  }

  positionGroups.forEach((indices) => {
    if (indices.length > 1) {
      // All entries in this group share the same position → lottery required
      for (const idx of indices) {
        standings[idx].needsLottery = true;
      }
    }
  });

  return standings;
}

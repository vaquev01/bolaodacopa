import { describe, it, expect } from "vitest";
import { computeStandings } from "./standings";

const defaultTiebreakers = [
  "exact_scores",
  "winners",
  "knockout_points",
  "champion_bet",
  "lottery",
] as const;

describe("computeStandings — basic ranking", () => {
  it("orders by total points descending", () => {
    const rows = [
      { userId: "b", userName: "Bob", points: 20, isExact: false, isWinnerHit: true, stage: "group" },
      { userId: "a", userName: "Alice", points: 30, isExact: true, isWinnerHit: true, stage: "group" },
      { userId: "c", userName: "Carol", points: 10, isExact: false, isWinnerHit: false, stage: "group" },
    ];
    const standings = computeStandings(rows, defaultTiebreakers);
    expect(standings[0].userId).toBe("a");
    expect(standings[0].position).toBe(1);
    expect(standings[1].userId).toBe("b");
    expect(standings[1].position).toBe(2);
    expect(standings[2].userId).toBe("c");
    expect(standings[2].position).toBe(3);
  });

  it("returns total points in each Standing", () => {
    const rows = [
      { userId: "a", userName: "Alice", points: 30, isExact: true, isWinnerHit: true, stage: "group" },
    ];
    const standings = computeStandings(rows, defaultTiebreakers);
    expect(standings[0].total).toBe(30);
    expect(standings[0].userName).toBe("Alice");
  });

  it("returns empty array for empty input", () => {
    const standings = computeStandings([], defaultTiebreakers);
    expect(standings).toEqual([]);
  });
});

describe("computeStandings — tiebreaker: exact_scores", () => {
  it("breaks tie by exact_scores count (more = better position)", () => {
    const rows = [
      { userId: "a", userName: "Alice", points: 20, isExact: true, isWinnerHit: true, stage: "group" },
      { userId: "b", userName: "Bob", points: 20, isExact: true, isWinnerHit: true, stage: "group" },
      { userId: "c", userName: "Carol", points: 20, isExact: false, isWinnerHit: true, stage: "group" },
    ];
    // a and b both have 1 exact, c has 0 exact
    const standings = computeStandings(rows, defaultTiebreakers);
    // c should be last since 0 exacts
    expect(standings[2].userId).toBe("c");
    expect(standings[2].position).toBe(3);
  });
});

describe("computeStandings — tiebreaker: winners", () => {
  it("breaks tie by winners count when exact_scores are equal", () => {
    const rows = [
      { userId: "a", userName: "Alice", points: 20, isExact: false, isWinnerHit: true, stage: "group" },
      { userId: "b", userName: "Bob", points: 20, isExact: false, isWinnerHit: false, stage: "group" },
    ];
    const standings = computeStandings(rows, defaultTiebreakers);
    expect(standings[0].userId).toBe("a"); // a has 1 winner, b has 0
    expect(standings[1].userId).toBe("b");
  });
});

describe("computeStandings — tiebreaker: knockout_points", () => {
  it("breaks tie by knockout points (non-group stages) when exacts and winners are equal", () => {
    const rows = [
      // same exact+winner counts but different stages
      { userId: "a", userName: "Alice", points: 20, isExact: false, isWinnerHit: true, stage: "r16" },
      { userId: "b", userName: "Bob", points: 20, isExact: false, isWinnerHit: true, stage: "group" },
    ];
    const standings = computeStandings(rows, defaultTiebreakers);
    // a has knockout point (r16), b does not → a wins tiebreak
    expect(standings[0].userId).toBe("a");
  });
});

describe("computeStandings — tiebreaker: champion_bet", () => {
  it("breaks tie using champion_bet flag when other criteria equal", () => {
    const rows = [
      { userId: "a", userName: "Alice", points: 20, isExact: false, isWinnerHit: true, stage: "group", hasChampionBetHit: false },
      { userId: "b", userName: "Bob", points: 20, isExact: false, isWinnerHit: true, stage: "group", hasChampionBetHit: true },
    ];
    const standings = computeStandings(rows, defaultTiebreakers);
    expect(standings[0].userId).toBe("b"); // b hit champion bet
  });
});

describe("computeStandings — persistent tie (lottery)", () => {
  it("marks persistent ties with needsLottery = true", () => {
    const rows = [
      { userId: "a", userName: "Alice", points: 20, isExact: true, isWinnerHit: true, stage: "r16", hasChampionBetHit: true },
      { userId: "b", userName: "Bob", points: 20, isExact: true, isWinnerHit: true, stage: "r16", hasChampionBetHit: true },
    ];
    const standings = computeStandings(rows, defaultTiebreakers);
    // Both tied on all criteria → lottery
    expect(standings[0].needsLottery).toBe(true);
    expect(standings[1].needsLottery).toBe(true);
    // Same position for tied players
    expect(standings[0].position).toBe(standings[1].position);
  });

  it("does not mark needsLottery for resolved ties", () => {
    const rows = [
      { userId: "a", userName: "Alice", points: 20, isExact: true, isWinnerHit: true, stage: "group" },
      { userId: "b", userName: "Bob", points: 20, isExact: false, isWinnerHit: true, stage: "group" },
    ];
    const standings = computeStandings(rows, defaultTiebreakers);
    expect(standings[0].needsLottery).toBe(false);
    expect(standings[1].needsLottery).toBe(false);
  });

  it("assigns same position for lottery-tied players", () => {
    const rows = [
      { userId: "a", userName: "Alice", points: 30, isExact: true, isWinnerHit: true, stage: "r16", hasChampionBetHit: true },
      { userId: "b", userName: "Bob", points: 30, isExact: true, isWinnerHit: true, stage: "r16", hasChampionBetHit: true },
      { userId: "c", userName: "Carol", points: 10, isExact: false, isWinnerHit: false, stage: "group" },
    ];
    const standings = computeStandings(rows, defaultTiebreakers);
    expect(standings[0].position).toBe(1);
    expect(standings[1].position).toBe(1); // tied first
    expect(standings[2].position).toBe(3); // skips position 2
  });
});

describe("computeStandings — aggregate multiple rows per user", () => {
  it("sums points across multiple rows for same user", () => {
    const rows = [
      { userId: "a", userName: "Alice", points: 10, isExact: true, isWinnerHit: true, stage: "group" },
      { userId: "a", userName: "Alice", points: 15, isExact: false, isWinnerHit: true, stage: "r16" },
      { userId: "b", userName: "Bob", points: 20, isExact: true, isWinnerHit: true, stage: "group" },
    ];
    const standings = computeStandings(rows, defaultTiebreakers);
    expect(standings).toHaveLength(2);
    const alice = standings.find((s) => s.userId === "a")!;
    expect(alice.total).toBe(25);
  });

  it("sums exact_scores and winners across rows", () => {
    const rows = [
      { userId: "a", userName: "Alice", points: 10, isExact: true, isWinnerHit: true, stage: "group" },
      { userId: "a", userName: "Alice", points: 5, isExact: false, isWinnerHit: true, stage: "group" },
      { userId: "b", userName: "Bob", points: 15, isExact: false, isWinnerHit: true, stage: "group" },
    ];
    const standings = computeStandings(rows, defaultTiebreakers);
    const alice = standings.find((s) => s.userId === "a")!;
    // Alice: 2 winners (both isWinnerHit=true), 1 exact; total 15
    expect(alice.total).toBe(15);
    const bob = standings.find((s) => s.userId === "b")!;
    // Both tied on total=15, alice has 1 exact, bob has 0 → alice wins
    expect(standings[0].userId).toBe("a");
  });
});

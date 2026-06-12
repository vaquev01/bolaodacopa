import { describe, it, expect } from "vitest";
import { normalizeFdMatch, type FdMatch } from "./fd";
import { planUpdates, type DbMatchRow } from "./plan";

function fd(partial: Partial<FdMatch> & { score?: Partial<FdMatch["score"]> }): FdMatch {
  return {
    id: 537327,
    status: "FINISHED",
    ...partial,
    score: {
      winner: "HOME_TEAM",
      duration: "REGULAR",
      fullTime: { home: 2, away: 0 },
      ...partial.score,
    } as FdMatch["score"],
  };
}

describe("normalizeFdMatch", () => {
  it("ignora jogos não encerrados", () => {
    expect(normalizeFdMatch(fd({ status: "TIMED" }))).toBeNull();
    expect(normalizeFdMatch(fd({ status: "IN_PLAY" }))).toBeNull();
  });

  it("ignora FINISHED com placar nulo (defensivo)", () => {
    expect(
      normalizeFdMatch(fd({ score: { fullTime: { home: null, away: null } } }))
    ).toBeNull();
  });

  it("jogo de 90 minutos: h90 = fullTime", () => {
    const r = normalizeFdMatch(fd({}));
    expect(r).toEqual({
      extId: "fd-537327",
      h90: 2,
      a90: 0,
      hft: 2,
      aft: 0,
      penWinner: null,
    });
  });

  it("prorrogação: h90 = regularTime, hft = fullTime", () => {
    const r = normalizeFdMatch(
      fd({
        score: {
          winner: "AWAY_TEAM",
          duration: "EXTRA_TIME",
          fullTime: { home: 1, away: 2 },
          regularTime: { home: 1, away: 1 },
        },
      })
    );
    expect(r).toMatchObject({ h90: 1, a90: 1, hft: 1, aft: 2, penWinner: null });
  });

  it("pênaltis: fullTime exclui shootout, penWinner do winner", () => {
    const r = normalizeFdMatch(
      fd({
        score: {
          winner: "AWAY_TEAM",
          duration: "PENALTY_SHOOTOUT",
          fullTime: { home: 1, away: 1 },
          regularTime: { home: 1, away: 1 },
          penalties: { home: 3, away: 5 },
        },
      })
    );
    expect(r).toMatchObject({ h90: 1, a90: 1, hft: 1, aft: 1, penWinner: "AWAY" });
  });
});

describe("planUpdates", () => {
  const dbRow = (partial: Partial<DbMatchRow> = {}): DbMatchRow => ({
    id: "uuid-1",
    ext_id: "fd-537327",
    home_team: "México",
    away_team: "África do Sul",
    status: "scheduled",
    score_home_90: null,
    score_away_90: null,
    score_home_ft: null,
    score_away_ft: null,
    penalty_winner: null,
    ...partial,
  });

  const official = [
    { extId: "fd-537327", h90: 2, a90: 0, hft: 2, aft: 0, penWinner: null as null },
  ];

  it("gera update para jogo sem resultado no banco", () => {
    const plan = planUpdates([dbRow()], official);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      matchId: "uuid-1",
      h90: 2,
      a90: 0,
      penWinner: null,
      label: "México 2x0 África do Sul",
    });
  });

  it("é idempotente: banco já atualizado → plano vazio", () => {
    const synced = dbRow({
      status: "finished",
      score_home_90: 2,
      score_away_90: 0,
      score_home_ft: 2,
      score_away_ft: 0,
    });
    expect(planUpdates([synced], official)).toHaveLength(0);
  });

  it("corrige placar divergente (vandalismo/erro manual)", () => {
    const wrong = dbRow({
      status: "finished",
      score_home_90: 1,
      score_away_90: 1,
      score_home_ft: 1,
      score_away_ft: 1,
    });
    expect(planUpdates([wrong], official)).toHaveLength(1);
  });

  it("resolve penWinner para o nome do time do banco", () => {
    const officialPen = [
      { extId: "fd-537327", h90: 1, a90: 1, hft: 1, aft: 1, penWinner: "AWAY" as const },
    ];
    const plan = planUpdates([dbRow()], officialPen);
    expect(plan[0].penWinner).toBe("África do Sul");
  });

  it("ignora matches do banco sem correspondência oficial", () => {
    expect(planUpdates([dbRow({ ext_id: "fd-999999" })], official)).toHaveLength(0);
    expect(planUpdates([dbRow({ ext_id: null })], official)).toHaveLength(0);
  });
});

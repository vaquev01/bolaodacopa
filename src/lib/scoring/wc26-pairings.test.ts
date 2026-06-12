import { describe, it, expect } from "vitest";
import {
  R32_MATCHES,
  THIRD_SLOTS,
  computeThirdAlloc,
  mapKnockoutByFifaNumber,
  KO_STAGE_FIRST_MATCH,
} from "./wc26-pairings";

describe("THIRD_SLOTS", () => {
  it("são exatamente 8 slots de melhor 3º (Copa de 48)", () => {
    expect(THIRD_SLOTS).toHaveLength(8);
    // Todos vêm de jogos distintos dos 16 avos
    const matchNums = THIRD_SLOTS.map((s) => s.match);
    expect(new Set(matchNums).size).toBe(8);
    for (const n of matchNums) {
      expect(R32_MATCHES.some((m) => m.match === n)).toBe(true);
    }
  });
});

describe("computeThirdAlloc", () => {
  // teamGroup sintético: "3C" → grupo C etc.
  const tg = (teams: string[]): Record<string, string> =>
    Object.fromEntries(teams.map((t) => [t, t.slice(1)]));

  it("vazio quando nenhum 3º foi escolhido", () => {
    expect(computeThirdAlloc([], {}, {})).toEqual({});
  });

  it("aloca cada 3º escolhido num slot elegível, sem repetir time nem slot", () => {
    const teams = ["3A", "3B", "3C", "3D", "3E", "3F", "3G", "3H"];
    const alloc = computeThirdAlloc(teams, tg(teams));
    const assigned = Object.values(alloc);
    expect(new Set(assigned).size).toBe(assigned.length);
    for (const [matchNum, team] of Object.entries(alloc)) {
      const slot = THIRD_SLOTS.find((s) => s.match === Number(matchNum))!;
      expect(slot.groups).toContain(team.slice(1));
    }
  });

  it("encaixa o máximo possível (matching, não guloso)", () => {
    // 8 terceiros de grupos variados — o matching deve alocar todos os 8
    const teams = ["3A", "3C", "3E", "3F", "3H", "3I", "3J", "3L"];
    const alloc = computeThirdAlloc(teams, tg(teams));
    expect(Object.keys(alloc)).toHaveLength(8);
  });

  it("reage à mudança dos qualificados (remove time desmarcado)", () => {
    const teams = ["3A", "3B", "3C", "3D", "3E", "3F", "3G", "3H"];
    const before = computeThirdAlloc(teams, tg(teams));
    expect(Object.values(before)).toContain("3A");

    const after = computeThirdAlloc(
      teams.filter((t) => t !== "3A"),
      tg(teams)
    );
    expect(Object.values(after)).not.toContain("3A");
  });

  it("respeita override manual válido e ignora inválido", () => {
    const teams = ["3C", "3E"];
    // Jogo 74 aceita 3º de A/B/C/D/F → "3C" é válido; "3E" não é
    const validManual = computeThirdAlloc(teams, tg(teams), { 74: "3C" });
    expect(validManual[74]).toBe("3C");

    const invalidManual = computeThirdAlloc(teams, tg(teams), { 74: "3E" });
    expect(invalidManual[74]).not.toBe("3E");
  });

  it("override manual de time não-qualificado é ignorado", () => {
    const alloc = computeThirdAlloc(["3C"], tg(["3C", "3D"]), { 74: "3D" });
    expect(Object.values(alloc)).not.toContain("3D");
  });
});

describe("mapKnockoutByFifaNumber", () => {
  const mk = (id: string, stage: string, kickoff: string) => ({
    id,
    stage,
    kickoff_at: kickoff,
  });

  it("numera cronologicamente dentro de cada fase a partir da base FIFA", () => {
    const matches = [
      mk("b", "r32", "2026-06-29T18:00:00Z"),
      mk("a", "r32", "2026-06-29T15:00:00Z"),
      mk("f", "final", "2026-07-19T19:00:00Z"),
      mk("t", "third", "2026-07-18T19:00:00Z"),
      mk("g", "group", "2026-06-11T19:00:00Z"),
    ];
    const map = mapKnockoutByFifaNumber(matches);
    expect(map[73].id).toBe("a");
    expect(map[74].id).toBe("b");
    expect(map[KO_STAGE_FIRST_MATCH.third].id).toBe("t");
    expect(map[KO_STAGE_FIRST_MATCH.final].id).toBe("f");
    // Jogos de grupo não entram
    expect(Object.values(map).some((m) => m.id === "g")).toBe(false);
  });

  it("desempata kickoffs simultâneos por id (determinístico)", () => {
    const matches = [
      mk("z", "sf", "2026-07-14T19:00:00Z"),
      mk("y", "sf", "2026-07-14T19:00:00Z"),
    ];
    const map = mapKnockoutByFifaNumber(matches);
    expect(map[101].id).toBe("y");
    expect(map[102].id).toBe("z");
  });
});

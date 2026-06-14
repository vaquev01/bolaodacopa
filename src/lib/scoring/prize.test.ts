import { describe, it, expect } from "vitest";
import { computePrizePool, splitsSum, formatPrize } from "./prize";
import { parseRuleset } from "./ruleset";

const prizeOn = (over: Partial<ReturnType<typeof parseRuleset>["prize"]> = {}) =>
  parseRuleset({ prize: { enabled: true, buy_in: 100, splits: [60, 25, 15], ...over } }).prize;

describe("computePrizePool — caso do Victor (R$100, 60/25/15)", () => {
  it("3 participantes → pote 300, 180/75/45", () => {
    const p = computePrizePool(prizeOn(), 3);
    expect(p.total).toBe(300);
    expect(p.shares.map((s) => s.amount)).toEqual([180, 75, 45]);
    expect(p.shares.map((s) => s.place)).toEqual([1, 2, 3]);
    expect(p.shares[0].label).toBe("1º lugar");
  });

  it("10 participantes → pote 1000, 600/250/150", () => {
    const p = computePrizePool(prizeOn(), 10);
    expect(p.total).toBe(1000);
    expect(p.shares.map((s) => s.amount)).toEqual([600, 250, 150]);
  });

  it("a soma das partes é SEMPRE igual ao pote (sobra vai pro 1º)", () => {
    for (const n of [1, 3, 7, 11, 13, 23, 100]) {
      const p = computePrizePool(prizeOn(), n);
      const sum = p.shares.reduce((a, s) => a + s.amount, 0);
      expect(Math.round(sum * 100)).toBe(Math.round(p.total * 100));
    }
  });

  it("7 participantes (split não-redondo) ainda fecha exato", () => {
    const p = computePrizePool(prizeOn(), 7); // pote 700
    expect(p.total).toBe(700);
    const sum = p.shares.reduce((a, s) => a + s.amount, 0);
    expect(sum).toBe(700);
    expect(p.shares[1].amount).toBe(175); // 25%
    expect(p.shares[2].amount).toBe(105); // 15%
    expect(p.shares[0].amount).toBe(420); // 60% (restante)
  });
});

describe("computePrizePool — desligado/edge", () => {
  it("enabled=false → sem shares, mas calcula o pote", () => {
    const prize = parseRuleset({ prize: { enabled: false, buy_in: 100 } }).prize;
    const p = computePrizePool(prize, 5);
    expect(p.enabled).toBe(false);
    expect(p.shares).toEqual([]);
  });

  it("buy_in 0 → desligado de fato", () => {
    const p = computePrizePool(prizeOn({ buy_in: 0 }), 5);
    expect(p.enabled).toBe(false);
    expect(p.total).toBe(0);
  });

  it("0 participantes → pote 0", () => {
    const p = computePrizePool(prizeOn(), 0);
    expect(p.total).toBe(0);
    expect(p.shares.map((s) => s.amount)).toEqual([0, 0, 0]);
  });
});

describe("ruleset.prize defaults (retrocompatível)", () => {
  it("pool sem prize → enabled false, splits 60/25/15", () => {
    const r = parseRuleset({});
    expect(r.prize.enabled).toBe(false);
    expect(r.prize.buy_in).toBe(0);
    expect(r.prize.splits).toEqual([60, 25, 15]);
  });

  it("prize parcial preenche defaults dos campos ausentes", () => {
    const r = parseRuleset({ prize: { enabled: true, buy_in: 50 } });
    expect(r.prize.enabled).toBe(true);
    expect(r.prize.buy_in).toBe(50);
    expect(r.prize.splits).toEqual([60, 25, 15]);
    expect(r.prize.currency).toBe("BRL");
  });
});

describe("helpers", () => {
  it("splitsSum", () => {
    expect(splitsSum([60, 25, 15])).toBe(100);
    expect(splitsSum([50, 30])).toBe(80);
  });

  it("formatPrize BRL", () => {
    expect(formatPrize(180)).toContain("180");
    expect(formatPrize(180)).toMatch(/R\$/);
  });
});

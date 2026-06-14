/**
 * Premiação INFORMATIVA — calcula o pote e quanto cada colocado leva.
 * O site não processa pagamentos; o grupo acerta por fora. Funções puras.
 */
import type { Ruleset } from "./ruleset";

export interface PrizeShare {
  place: number; // 1 = campeão
  label: string; // "1º lugar"
  pct: number;
  amount: number; // em unidades da moeda (ex: reais), 2 casas
}

export interface PrizePool {
  enabled: boolean;
  currency: string;
  buyIn: number;
  members: number;
  total: number;
  shares: PrizeShare[];
}

const ORDINAL = ["1º", "2º", "3º", "4º", "5º", "6º", "7º", "8º"];

function ordinalLabel(place: number): string {
  return `${ORDINAL[place - 1] ?? `${place}º`} lugar`;
}

/**
 * Divide o pote pelos percentuais de `splits` (do 1º colocado em diante).
 * Arredonda em centavos; a sobra de arredondamento vai para o 1º colocado,
 * garantindo que a soma das partes seja exatamente igual ao pote.
 */
export function computePrizePool(
  prize: Ruleset["prize"],
  members: number
): PrizePool {
  const currency = prize.currency || "BRL";
  const buyIn = Math.max(0, prize.buy_in || 0);
  const safeMembers = Math.max(0, Math.floor(members));
  const total = buyIn * safeMembers;

  if (!prize.enabled || buyIn <= 0 || prize.splits.length === 0) {
    return { enabled: false, currency, buyIn, members: safeMembers, total, shares: [] };
  }

  const totalCents = Math.round(total * 100);
  const splits = prize.splits;

  // Calcula todos menos o 1º; o 1º recebe o restante (absorve a sobra de arredondamento).
  const tailCents = splits
    .slice(1)
    .map((pct) => Math.round((totalCents * pct) / 100));
  const firstCents = totalCents - tailCents.reduce((a, b) => a + b, 0);
  const allCents = [firstCents, ...tailCents];

  const shares: PrizeShare[] = splits.map((pct, i) => ({
    place: i + 1,
    label: ordinalLabel(i + 1),
    pct,
    amount: allCents[i] / 100,
  }));

  return { enabled: true, currency, buyIn, members: safeMembers, total, shares };
}

/** Soma dos percentuais — a UI usa para avisar se não fecha 100%. */
export function splitsSum(splits: number[]): number {
  return splits.reduce((a, b) => a + b, 0);
}

/** Formata valor na moeda (default BRL). */
export function formatPrize(amount: number, currency = "BRL"): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `R$ ${amount.toFixed(2)}`;
  }
}

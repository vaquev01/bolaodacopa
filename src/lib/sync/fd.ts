/**
 * Client football-data.org v4 — Copa do Mundo 2026.
 *
 * O calendário no banco foi semeado desta mesma API com ext_id `fd-{id}`,
 * então o pareamento é por id — nunca por nome de time.
 */

export interface FdScoreSide {
  home: number | null;
  away: number | null;
}

export interface FdScore {
  winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
  fullTime: FdScoreSide;
  regularTime?: FdScoreSide | null;
  penalties?: FdScoreSide | null;
}

export interface FdMatch {
  id: number;
  status: string; // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | ...
  score: FdScore;
}

/** Resultado oficial normalizado para o vocabulário do banco. */
export interface OfficialResult {
  extId: string; // `fd-{id}`
  h90: number;
  a90: number;
  hft: number;
  aft: number;
  /** Lado vencedor nos pênaltis — resolvido para nome de time só no plano. */
  penWinner: "HOME" | "AWAY" | null;
}

/**
 * Converte um match da football-data em resultado oficial.
 * Retorna null para jogos não encerrados ou com placar incompleto.
 */
export function normalizeFdMatch(m: FdMatch): OfficialResult | null {
  if (m.status !== "FINISHED") return null;
  const ft = m.score.fullTime;
  if (ft.home == null || ft.away == null) return null;

  // fullTime inclui prorrogação, mas NÃO pênaltis; regularTime = só os 90min.
  const reg = m.score.regularTime;
  const is90 = m.score.duration === "REGULAR";
  const h90 = is90 ? ft.home : reg?.home ?? ft.home;
  const a90 = is90 ? ft.away : reg?.away ?? ft.away;

  let penWinner: OfficialResult["penWinner"] = null;
  if (m.score.duration === "PENALTY_SHOOTOUT") {
    if (m.score.winner === "HOME_TEAM") penWinner = "HOME";
    else if (m.score.winner === "AWAY_TEAM") penWinner = "AWAY";
  }

  return { extId: `fd-${m.id}`, h90, a90, hft: ft.home, aft: ft.away, penWinner };
}

const FD_URL = "https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED";

/** Busca todos os jogos encerrados da Copa na football-data. */
export async function fetchOfficialResults(token: string): Promise<OfficialResult[]> {
  const res = await fetch(FD_URL, {
    headers: { "X-Auth-Token": token },
    // Vercel/Next: nunca cachear — placar é dado vivo.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`football-data ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { matches?: FdMatch[] };
  return (body.matches ?? [])
    .map(normalizeFdMatch)
    .filter((r): r is OfficialResult => r !== null);
}

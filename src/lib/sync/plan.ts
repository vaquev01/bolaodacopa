import type { OfficialResult } from "./fd";

/** Linha mínima de `matches` necessária para o diff. */
export interface DbMatchRow {
  id: string;
  ext_id: string | null;
  home_team: string;
  away_team: string;
  status: string;
  score_home_90: number | null;
  score_away_90: number | null;
  score_home_ft: number | null;
  score_away_ft: number | null;
  penalty_winner: string | null;
}

/** Update a aplicar via RPC set_match_result. */
export interface MatchUpdate {
  matchId: string;
  extId: string;
  label: string; // "México 2x0 África do Sul" — para logs/relatório
  h90: number;
  a90: number;
  hft: number;
  aft: number;
  penWinner: string | null; // nome do time, vocabulário do banco
}

/**
 * Compara resultados oficiais com o banco e devolve só o que mudou.
 * Idempotente: rodar duas vezes seguidas produz plano vazio na segunda.
 */
export function planUpdates(
  dbRows: DbMatchRow[],
  official: OfficialResult[]
): MatchUpdate[] {
  const byExtId = new Map(official.map((o) => [o.extId, o]));
  const updates: MatchUpdate[] = [];

  for (const row of dbRows) {
    if (!row.ext_id) continue;
    const o = byExtId.get(row.ext_id);
    if (!o) continue;

    const penName =
      o.penWinner === "HOME" ? row.home_team : o.penWinner === "AWAY" ? row.away_team : null;

    const unchanged =
      row.status === "finished" &&
      row.score_home_90 === o.h90 &&
      row.score_away_90 === o.a90 &&
      row.score_home_ft === o.hft &&
      row.score_away_ft === o.aft &&
      (row.penalty_winner ?? null) === penName;

    if (unchanged) continue;

    updates.push({
      matchId: row.id,
      extId: row.ext_id,
      label: `${row.home_team} ${o.hft}x${o.aft} ${row.away_team}`,
      h90: o.h90,
      a90: o.a90,
      hft: o.hft,
      aft: o.aft,
      penWinner: penName,
    });
  }

  return updates;
}

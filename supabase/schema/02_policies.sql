-- RLS policies public do bolao-copa (via Management API 2026-06-14)

-- bracket_predictions.bracket_predictions_read [SELECT]
--   USING: (now() >= _pool_first_kickoff(pool_id))

-- bracket_scores.bracket_scores_read [SELECT]
--   USING: true

-- matches.matches_read [SELECT]
--   USING: true

-- pool_members.members_read [SELECT]
--   USING: true

-- pool_special_bets.special_bets_read [SELECT]
--   USING: (now() >= _pool_first_kickoff(pool_id))

-- pool_special_results.special_results_read [SELECT]
--   USING: true

-- pools.pools_read [SELECT]
--   USING: true

-- prediction_scores.scores_read [SELECT]
--   USING: true

-- predictions.predictions_read [SELECT]
--   USING: (EXISTS ( SELECT 1
   FROM matches m
  WHERE ((m.id = predictions.match_id) AND (m.kickoff_at <= now()))))

-- special_bet_scores.special_scores_read [SELECT]
--   USING: true

-- teams.teams_read [SELECT]
--   USING: true


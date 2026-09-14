-- Regras de negocio garantidas tambem no banco, e nao so na validacao Zod.

ALTER TABLE "PlayerProfile"
  ADD CONSTRAINT "PlayerProfile_stars_range" CHECK ("stars" IS NULL OR ("stars" >= 1 AND "stars" <= 5)),
  ADD CONSTRAINT "PlayerProfile_stars_half_step" CHECK ("stars" IS NULL OR ("stars" * 2) = floor("stars" * 2)),
  ADD CONSTRAINT "PlayerProfile_age_range" CHECK ("age" BETWEEN 14 AND 70),
  ADD CONSTRAINT "PlayerProfile_height_range" CHECK ("heightCm" BETWEEN 130 AND 230),
  ADD CONSTRAINT "PlayerProfile_weight_range" CHECK ("weightKg" BETWEEN 35 AND 200);

ALTER TABLE "GameDay"
  ADD CONSTRAINT "GameDay_price_non_negative" CHECK ("pricePerPlayerCents" >= 0),
  ADD CONSTRAINT "GameDay_duration_positive" CHECK ("matchDurationSec" BETWEEN 60 AND 3600),
  ADD CONSTRAINT "GameDay_goals_positive" CHECK ("goalsToWin" BETWEEN 1 AND 20),
  ADD CONSTRAINT "GameDay_team_size_range" CHECK ("teamSize" BETWEEN 3 AND 7),
  ADD CONSTRAINT "GameDay_max_players_range" CHECK ("maxPlayers" BETWEEN 10 AND 50);

ALTER TABLE "Match"
  ADD CONSTRAINT "Match_scores_non_negative" CHECK ("homeScore" >= 0 AND "awayScore" >= 0),
  ADD CONSTRAINT "Match_clock_non_negative" CHECK ("remainingMs" >= 0 AND "durationMs" > 0),
  ADD CONSTRAINT "Match_distinct_teams" CHECK ("homeTeamId" <> "awayTeamId");

ALTER TABLE "MatchEvent"
  ADD CONSTRAINT "MatchEvent_elapsed_non_negative" CHECK ("elapsedMs" >= 0);

ALTER TABLE "Registration"
  ADD CONSTRAINT "Registration_amount_non_negative" CHECK ("amountCents" >= 0);

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_queue_position_non_negative" CHECK ("queuePosition" IS NULL OR "queuePosition" >= 0);

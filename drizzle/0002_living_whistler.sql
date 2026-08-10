CREATE TABLE `season_narrative_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`league_id` text NOT NULL,
	`season` text NOT NULL,
	`week` integer NOT NULL,
	`playoff_probability` real,
	`roster_value_index` real,
	`injury_count` integer DEFAULT 0 NOT NULL,
	`record` text NOT NULL,
	`points_for` real DEFAULT 0 NOT NULL,
	`captured_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `season_narrative_user_league_season_week` ON `season_narrative_snapshots` (`user_id`,`league_id`,`season`,`week`);
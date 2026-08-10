CREATE TABLE `espn_league_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`league_id` text NOT NULL,
	`season` text NOT NULL,
	`payload_json` text NOT NULL,
	`synced_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `espn_league_snapshots_user_league_season` ON `espn_league_snapshots` (`user_id`,`league_id`,`season`);--> statement-breakpoint
CREATE TABLE `espn_sync_pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `espn_sync_pairings_code_hash` ON `espn_sync_pairings` (`code_hash`);
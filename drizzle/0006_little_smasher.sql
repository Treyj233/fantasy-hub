CREATE TABLE `league_data_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`league_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`refreshed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `league_data_snapshots_user_league` ON `league_data_snapshots` (`user_id`,`league_key`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`color_mode` text DEFAULT 'light' NOT NULL,
	`team_theme` text DEFAULT 'GB' NOT NULL,
	`badge_theme` text DEFAULT 'arcade' NOT NULL,
	`league_order_json` text DEFAULT '[]' NOT NULL,
	`onboarding_completed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `managed_leagues` ADD `league_meta_json` text DEFAULT '{}' NOT NULL;
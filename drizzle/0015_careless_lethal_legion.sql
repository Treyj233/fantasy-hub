CREATE TABLE `rivalry_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`league_id` text NOT NULL,
	`roster_ids_json` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rivalry_preferences_user_league` ON `rivalry_preferences` (`user_id`,`league_id`);
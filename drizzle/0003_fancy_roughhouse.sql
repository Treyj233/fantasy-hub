CREATE TABLE `decision_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`league_id` text NOT NULL,
	`week` integer NOT NULL,
	`category` text NOT NULL,
	`recommendation` text NOT NULL,
	`alternatives_json` text DEFAULT '[]' NOT NULL,
	`information_json` text DEFAULT '{}' NOT NULL,
	`confidence` real NOT NULL,
	`user_selection` text,
	`result_json` text,
	`process_grade` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decision_memory_user_league_id` ON `decision_memory` (`user_id`,`league_id`,`id`);
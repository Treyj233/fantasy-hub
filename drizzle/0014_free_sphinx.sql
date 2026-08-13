CREATE TABLE `push_alert_deliveries` (
	`event_key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`sent_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_alert_states` (
	`state_key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`league_key` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_alert_states_user_league` ON `push_alert_states` (`user_id`,`league_key`);
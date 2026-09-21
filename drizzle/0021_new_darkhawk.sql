CREATE TABLE `provider_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`blocked_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `refresh_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer DEFAULT 0 NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`token` text DEFAULT '' NOT NULL
);

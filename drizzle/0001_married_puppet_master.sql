CREATE TABLE `managed_leagues` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`identifier_type` text NOT NULL,
	`identifier` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `managed_leagues_user_provider_identifier` ON `managed_leagues` (`user_id`,`provider`,`identifier_type`,`identifier`);
CREATE TABLE `app_store_transactions` (
	`original_transaction_id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`environment` text NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_store_transactions_transaction_id` ON `app_store_transactions` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `push_devices` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text DEFAULT 'ios' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

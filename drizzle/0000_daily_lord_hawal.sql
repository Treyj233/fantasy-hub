CREATE TABLE `sleeper_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`sleeper_user_id` text NOT NULL,
	`sleeper_username` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
